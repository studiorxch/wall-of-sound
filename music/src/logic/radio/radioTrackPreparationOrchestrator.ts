// 0718B_RADIO_Web_Publication_Asset_Export_Bridge — the batch "Prepare
// assets…" workflow: a sequential, cancelable, failure-isolated loop over
// one server round trip (POST /radio-track-prepare) per eligible entry.
// Each request already runs its own full pipeline server-side (hash →
// decode → encode → probe → decode-verify → finalize, with rollback
// contained inside that single call — see radioTrackPackagePipeline.ts),
// so this orchestrator's only job is sequencing, cancellation, and
// failure isolation across MULTIPLE entries.
//
// The sequencing loop (runTrackPreparationBatch) takes an injected
// `prepareTrack` dependency and is unit-tested against it, exactly like
// sectionalRadioBridgeOrchestrator.ts injects onPromoteToRadio. The
// default fetch-based implementation (prepareTrackViaFetch) and the two
// other network helpers below are NOT unit-tested — fetch-dependent, same
// documented convention as radioPromotionOrchestrator.ts/radioManifestClient.ts.

import type { RadioTrackPackageManifest, RadioTrackPrepareRequest, RadioTrackPrepareResponse, RadioTrackVerifyResult } from "../../data/radioTrackPackageTypes";

export interface PrepareEntryTask {
  entryId: string;
  request: RadioTrackPrepareRequest;
}

export interface PrepareBatchDeps {
  prepareTrack: (request: RadioTrackPrepareRequest) => Promise<RadioTrackPrepareResponse>;
  onEntryStart?: (entryId: string) => void;
  onEntryComplete?: (entryId: string, response: RadioTrackPrepareResponse) => void;
  // Checked BETWEEN entries only — an in-flight entry's server call always
  // finishes and its finalized package is never discarded; only the
  // remaining queue is abandoned.
  signal?: AbortSignal;
}

export interface PrepareBatchResult {
  succeeded: string[]; // entryIds
  failed: string[]; // entryIds
  cancelled: boolean;
}

// Failure isolation: one failed entry never stops the batch — its
// entryId is recorded in `failed` and the loop continues to the next task.
export async function runTrackPreparationBatch(tasks: PrepareEntryTask[], deps: PrepareBatchDeps): Promise<PrepareBatchResult> {
  const succeeded: string[] = [];
  const failed: string[] = [];
  let cancelled = false;

  for (const task of tasks) {
    if (deps.signal?.aborted) {
      cancelled = true;
      break;
    }

    deps.onEntryStart?.(task.entryId);
    let response: RadioTrackPrepareResponse;
    try {
      response = await deps.prepareTrack(task.request);
    } catch (err) {
      response = {
        ok: false,
        reused: false,
        issues: [{ code: "RADIO_TRACK_PREPARE_NETWORK_ERROR", message: err instanceof Error ? err.message : "Network error while preparing this track", severity: "error" }],
      };
    }
    deps.onEntryComplete?.(task.entryId, response);
    (response.ok ? succeeded : failed).push(task.entryId);
  }

  return { succeeded, failed, cancelled };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const resp = await fetch(url, init);
    return (await resp.json()) as T;
  } catch {
    return null;
  }
}

// Network orchestration — not unit-tested (fetch-dependent).
export async function prepareTrackViaFetch(request: RadioTrackPrepareRequest): Promise<RadioTrackPrepareResponse> {
  const json = await fetchJson<RadioTrackPrepareResponse>("/radio-track-prepare", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request),
  });
  return json ?? { ok: false, reused: false, issues: [{ code: "RADIO_TRACK_PREPARE_UNREACHABLE", message: "Could not reach the RADIO track preparation route", severity: "error" }] };
}

// Network orchestration — not unit-tested (fetch-dependent). Used by the
// approval flow (curator approves ⇒ we must know the CURRENT source
// bytes' hash before stamping RadioEntryApproval.sourceAssetHash — never
// assumed from a stale value).
export async function fetchSourceAssetHash(audioRelPath: string): Promise<string | null> {
  const json = await fetchJson<{ ok: boolean; sourceAssetHash?: string }>("/radio-track-source-hash", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ audioRelPath }),
  });
  return json?.ok ? (json.sourceAssetHash ?? null) : null;
}

// Network orchestration — not unit-tested (fetch-dependent). One
// verification call per bound entry, run on prep-workspace/panel open (and
// after a batch completes) — never a UI-derived guess.
export async function verifyTrackBindingViaFetch(params: { radioTrackId: string; packageVersion: number; sourceAssetHash: string; packageManifestHash: string }): Promise<RadioTrackVerifyResult | null> {
  const query = new URLSearchParams({
    radioTrackId: params.radioTrackId,
    packageVersion: String(params.packageVersion),
    sourceAssetHash: params.sourceAssetHash,
    packageManifestHash: params.packageManifestHash,
  });
  return fetchJson<RadioTrackVerifyResult>(`/radio-track-verify?${query.toString()}`);
}

// Network orchestration — not unit-tested (fetch-dependent). The one
// source of real byteSize/duration/title/artist for a READY entry — the
// Web Bundle preflight (radioWebBundlePlan.ts) never invents these.
export async function fetchTrackPackageManifest(radioTrackId: string, packageVersion: number): Promise<RadioTrackPackageManifest | null> {
  const query = new URLSearchParams({ radioTrackId, packageVersion: String(packageVersion) });
  return fetchJson<RadioTrackPackageManifest>(`/radio-track-package?${query.toString()}`);
}
