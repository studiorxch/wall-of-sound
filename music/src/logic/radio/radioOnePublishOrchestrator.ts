// 0723_RADIO_One_Action_Publish — the single application-layer `Publish`
// operation. Composes the EXISTING lower-level functions (approval,
// preparation, export) in the order the spec requires; invents no new
// hashing/encoding/export/persistence logic of its own (§5: "Do not
// duplicate hashing, approval, encoding, readiness, export, or persistence
// logic inside the interface component" — that logic already lives in
// radioEntryPreparation.ts/radioTrackPreparationOrchestrator.ts/
// radioWebBundlePlan.ts/radioWebBundleExportOrchestrator.ts; this file only
// sequences them).
//
// `runOnePublish` is pure sequencing over injected deps (same DI pattern as
// runTrackPreparationBatch) and is unit-tested against fake deps.
// `runOnePublishViaFetch` binds the real fetch-based implementations and is
// NOT unit-tested — fetch-dependent, same documented convention as every
// other *ViaFetch helper in this codebase.
//
// Failure isolation (§5.7/§6): one entry's rights/availability/preparation
// failure never blocks another independent entry — it's recorded in
// `failures` and the run continues. Only entries that actually succeed this
// run are included in the export plan, so a playlist with some blocked
// tracks still publishes the rest rather than failing the whole export.

import type { RadioPlaylist, RadioPlaylistEntry } from "../../data/radioPlaylistTypes";
import type { RadioInboxItem } from "../../data/radioInboxTypes";
import type { Track } from "../../data/trackTypes";
import type { CompleteSongAnalysis } from "../../data/songAnalysisTypes";
import type { RadioWebExportRecord } from "../../data/radioWebBundleTypes";
import { computeEntryPreparationState, buildApprovalPatch, buildTrackPrepareRequest } from "./radioEntryPreparation";
import { fetchSourceAssetHash, prepareTrackViaFetch, fetchTrackPackageManifest } from "./radioTrackPreparationOrchestrator";
import { buildWebBundlePlan, slugifyStationTitle, buildWebBundleExportRequest, type EntryPlanInput } from "./radioWebBundlePlan";
import { runWebBundleExport, exportWebBundleViaFetch } from "./radioWebBundleExportOrchestrator";
import { computePublishPatch } from "./radioPlaylistPublicationState";
import { isEntryRightsCleared } from "./radioPublishRightsGate";

export type PublishStage = "validating" | "preparing" | "exporting";

export type PublishFailureCategory =
  | "source_unavailable"
  | "not_portable"
  | "preparation_failed"
  | "no_publishable_tracks"
  | "export_failed"
  | "rights_unresolved";

// Exact user-facing reason categories from the spec (§6) — internal state
// labels (not_approved, hashes, package revisions, readiness gates) never
// surface as this primary error copy; they stay in the diagnostic surface.
export const PUBLISH_FAILURE_LABEL: Record<PublishFailureCategory, string> = {
  source_unavailable: "Source audio unavailable",
  not_portable: "Source audio is not portable",
  preparation_failed: "Audio preparation failed",
  no_publishable_tracks: "Playlist contains no publishable tracks",
  export_failed: "Web export failed",
  rights_unresolved: "Rights status requires user decision",
};

export interface PublishEntryFailure {
  entryId: string;
  title: string;
  category: PublishFailureCategory;
  message: string;
}

export interface OnePublishDeps {
  fetchSourceAssetHash: (audioRelPath: string) => Promise<string | null>;
  prepareTrack: typeof prepareTrackViaFetch;
  fetchPackageManifest: typeof fetchTrackPackageManifest;
  exportBundle: typeof exportWebBundleViaFetch;
  onProgress?: (stage: PublishStage) => void;
  // Fired immediately as each entry's approval/binding/error is resolved —
  // callers must persist this right away (not batch it to the end) so a
  // later failure never loses an earlier entry's real, successful work.
  onEntryPatch?: (entryId: string, patch: Partial<RadioPlaylistEntry>) => void;
}

export interface OnePublishResult {
  ok: boolean;
  failures: PublishEntryFailure[];
  exportRecord?: RadioWebExportRecord;
  playlistPatch?: Partial<Pick<RadioPlaylist, "state" | "publishedAt" | "unpublishedAt">>;
}

export interface OnePublishContext {
  playlist: RadioPlaylist;
  inboxItems: RadioInboxItem[];
  tracks: Track[];
  analyses: CompleteSongAnalysis[];
  allPlaylists: RadioPlaylist[];
}

export async function runOnePublish(ctx: OnePublishContext, deps: OnePublishDeps): Promise<OnePublishResult> {
  const failures: PublishEntryFailure[] = [];
  deps.onProgress?.("validating");

  const entries = ctx.playlist.entries.filter((e) => e.includedInPublish);
  const trackFor = (e: RadioPlaylistEntry): Track | undefined => {
    const item = ctx.inboxItems.find((i) => i.id === e.inboxItemId);
    return item?.sourceTrackId ? ctx.tracks.find((t) => t.trackId === item.sourceTrackId) : undefined;
  };
  const analysisFor = (t: Track | undefined) => (t ? ctx.analyses.find((a) => a.sourceTrackId === t.trackId) : undefined);

  // In-memory working copy this run mutates as it goes — later steps in
  // THIS run (preparation eligibility) must see a just-granted approval
  // immediately, without waiting for the caller's own state to re-render.
  // Real persistence happens via onEntryPatch, called the moment each
  // step resolves.
  const working = new Map<string, RadioPlaylistEntry>(entries.map((e) => [e.id, e]));
  const readyEntries: RadioPlaylistEntry[] = [];

  for (const entry of entries) {
    const track = trackFor(entry);
    const title = track?.title ?? entry.id;

    if (!track) {
      failures.push({ entryId: entry.id, title, category: "source_unavailable", message: "Source track could not be resolved." });
      continue;
    }
    if (!isEntryRightsCleared(track)) {
      failures.push({ entryId: entry.id, title, category: "rights_unresolved", message: `"${title}" has no confirmed StudioRich streaming authority on its source/platform-use metadata.` });
      continue;
    }
    if (!track.audioRelPath) {
      failures.push({ entryId: entry.id, title, category: "not_portable", message: `"${title}" has no portable source audio path.` });
      continue;
    }

    const currentHash = await deps.fetchSourceAssetHash(track.audioRelPath);
    if (!currentHash) {
      failures.push({ entryId: entry.id, title, category: "source_unavailable", message: `Could not read current source audio for "${title}".` });
      continue;
    }

    let current = working.get(entry.id)!;
    const needsApproval = !current.approval?.approved || current.approval.sourceAssetHash !== currentHash;
    if (needsApproval) {
      const patch: Partial<RadioPlaylistEntry> = { approval: buildApprovalPatch(currentHash, analysisFor(track)) };
      current = { ...current, ...patch };
      working.set(entry.id, current);
      deps.onEntryPatch?.(entry.id, patch);
    }

    const state = computeEntryPreparationState({ entry: current });
    if (state === "READY") {
      readyEntries.push(current);
      continue; // reuse — no re-encode, satisfies idempotence
    }

    deps.onProgress?.("preparing");
    const request = buildTrackPrepareRequest(track, analysisFor(track), current.approval);
    if (!request) {
      failures.push({ entryId: entry.id, title, category: "preparation_failed", message: `Could not build a preparation request for "${title}".` });
      continue;
    }
    const response = await deps.prepareTrack(request);
    if (response.ok && response.radioTrackId && response.packageVersion != null && response.sourceAssetHash && response.packageManifestHash) {
      const patch: Partial<RadioPlaylistEntry> = {
        trackBinding: {
          radioTrackId: response.radioTrackId, packageVersion: response.packageVersion,
          sourceTrackId: track.trackId, sourceAssetHash: response.sourceAssetHash,
          packageManifestHash: response.packageManifestHash, boundAt: new Date().toISOString(),
        },
        lastPreparationError: undefined,
      };
      current = { ...current, ...patch };
      working.set(entry.id, current);
      deps.onEntryPatch?.(entry.id, patch);
      readyEntries.push(current);
    } else {
      const issue = response.issues[0];
      const message = issue?.message ?? "Preparation failed";
      const patch: Partial<RadioPlaylistEntry> = { lastPreparationError: { code: issue?.code ?? "RADIO_TRACK_PREPARE_FAILED", message, at: new Date().toISOString() } };
      current = { ...current, ...patch };
      working.set(entry.id, current);
      deps.onEntryPatch?.(entry.id, patch);
      failures.push({ entryId: entry.id, title, category: "preparation_failed", message });
    }
  }

  if (readyEntries.length === 0) {
    if (failures.length === 0) {
      failures.push({ entryId: "", title: ctx.playlist.title, category: "no_publishable_tracks", message: "This playlist has no publishable tracks." });
    }
    return { ok: false, failures };
  }

  deps.onProgress?.("exporting");

  const manifestByEntryId = new Map<string, Awaited<ReturnType<typeof fetchTrackPackageManifest>>>();
  for (const e of readyEntries) {
    const b = e.trackBinding!;
    manifestByEntryId.set(e.id, await deps.fetchPackageManifest(b.radioTrackId, b.packageVersion));
  }
  // Only the entries that actually succeeded THIS run go into the export
  // plan — a rights-blocked or failed sibling never blocks these.
  const planInputs: EntryPlanInput[] = readyEntries.map((e) => ({
    entry: e, track: trackFor(e), state: "READY", packageManifest: manifestByEntryId.get(e.id) ?? null,
  }));
  const plan = buildWebBundlePlan(ctx.playlist, planInputs);
  if (!plan.canExport) {
    for (const b of plan.blockers) {
      failures.push({ entryId: b.entryId ?? "", title: ctx.playlist.title, category: "export_failed", message: b.message });
    }
    return { ok: false, failures };
  }

  const slug = slugifyStationTitle(ctx.playlist.title);
  const artworkDataUrl = ctx.playlist.coverImage?.src?.startsWith("data:") ? ctx.playlist.coverImage.src : undefined;
  const request = buildWebBundleExportRequest(plan, slug, artworkDataUrl);
  const outcome = await runWebBundleExport(request, ctx.playlist.id, { exportBundle: deps.exportBundle });

  if (!outcome.ok && !outcome.unchanged) {
    const message = outcome.response.issues.map((i) => i.message).join("; ") || "Web export failed.";
    failures.push({ entryId: "", title: ctx.playlist.title, category: "export_failed", message });
    return { ok: false, failures };
  }

  const { targetPatch } = computePublishPatch(ctx.playlist, ctx.allPlaylists);
  return { ok: true, failures, exportRecord: outcome.record, playlistPatch: targetPatch };
}

// Network-bound composition — not unit-tested (fetch-dependent), same
// documented convention as every other *ViaFetch helper in this codebase.
export function runOnePublishViaFetch(ctx: OnePublishContext, callbacks: Pick<OnePublishDeps, "onProgress" | "onEntryPatch">): Promise<OnePublishResult> {
  return runOnePublish(ctx, {
    fetchSourceAssetHash, prepareTrack: prepareTrackViaFetch, fetchPackageManifest: fetchTrackPackageManifest,
    exportBundle: exportWebBundleViaFetch, ...callbacks,
  });
}
