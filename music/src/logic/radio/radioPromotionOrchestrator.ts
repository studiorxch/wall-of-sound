// RadioLoop Library Foundation — client-side promotion pipeline (build
// spec §5.9). Composes eligibility validation, the lossless render, and
// the server round trips in the documented order:
//   resolve request → validate eligibility → create staging operation →
//   render lossless loop → encode core → (validate/write metadata/
//   finalize/rebuild manifest all happen server-side inside one
//   /radio-package-finalize call, see radioFinalizeOrchestrator.ts) →
//   report.
//
// Stems are not sourced from MUSIC in this build (no existing stem-asset
// UI/type to promote from) — "stems are optional" per §5.6, so this is a
// core-only promotion; the server-side stem contract still exists for a
// future build that adds stem assets.
//
// Not unit-tested — depends on Web Audio (AudioBuffer) and network, same
// documented convention as loopRenderService.ts's renderLoopToWav. Every
// pure step it composes IS unit-tested (radioEligibilityValidator.ts,
// radioLosslessRenderer.ts's underlying extraction/encoding).

import type { LoopAsset, LoopRevision } from "../../data/loopTypes";
import type { Track } from "../../data/trackTypes";
import type {
  RadioApprovalMetadata,
  RadioArrangementMetadata,
  RadioLoopSourceReference,
  RadioMusicalMetadata,
  RadioPromotionFormInput,
  RadioPromotionReport,
  RadioValidationIssue,
} from "../../data/radioLoopTypes";
import { resolveActiveLoopBoundsFrames } from "../loops/loopRevisions";
import { validateRadioEligibility, isEligibleForPromotion } from "./radioEligibilityValidator";
import { renderLosslessIntermediate } from "./radioLosslessRenderer";

export type RadioPromotionPhase =
  | "validating" | "creating_staging_operation" | "rendering_lossless"
  | "encoding_core" | "finalizing" | "complete" | "failed";

export interface PromoteLoopToRadioParams {
  loop: LoopAsset;
  track: Track;
  revisions: LoopRevision[];
  sourceBuffer: AudioBuffer;
  formInput: RadioPromotionFormInput;
  onProgress?: (phase: RadioPromotionPhase) => void;
}

export interface PromoteLoopToRadioResult {
  ok: boolean;
  radioLoopId?: string;
  packageVersion?: number;
  stemsOmitted?: boolean;
  stemsOmittedReason?: string;
  issues: RadioValidationIssue[];
  report?: RadioPromotionReport;
}

async function fetchLibraryWritable(): Promise<boolean> {
  try {
    const resp = await fetch("/radio-library-status");
    const json = await resp.json();
    return Boolean(json.writable);
  } catch {
    return false;
  }
}

export async function promoteLoopToRadio(params: PromoteLoopToRadioParams): Promise<PromoteLoopToRadioResult> {
  const { loop, track, revisions, sourceBuffer, formInput, onProgress } = params;

  onProgress?.("validating");
  const activeBounds = resolveActiveLoopBoundsFrames(loop, revisions, sourceBuffer.sampleRate);
  const libraryWritable = await fetchLibraryWritable();
  const issues = validateRadioEligibility({
    loop, track,
    sourceBufferAvailable: true,
    sourceDurationSeconds: sourceBuffer.duration,
    activeStartSeconds: activeBounds.startFrame / sourceBuffer.sampleRate,
    activeEndSeconds: activeBounds.endFrame / sourceBuffer.sampleRate,
    formInput,
    libraryWritable,
  });
  if (!isEligibleForPromotion(issues)) {
    onProgress?.("failed");
    return { ok: false, issues };
  }

  onProgress?.("creating_staging_operation");
  const stagingResp = await fetch("/radio-staging-create", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceTrackId: loop.sourceTrackId, sourceLoopId: loop.id }),
  });
  const stagingJson = await stagingResp.json();
  if (!stagingJson.ok) {
    onProgress?.("failed");
    return { ok: false, issues: [{ code: "RADIO_STAGING_CREATE_FAILED", message: stagingJson.error ?? "Failed to create staging operation", severity: "error" }] };
  }
  const { operationId, radioLoopId, packageVersion } = stagingJson as { operationId: string; radioLoopId: string; packageVersion: number };

  onProgress?.("rendering_lossless");
  let rendered;
  try {
    rendered = renderLosslessIntermediate(loop, revisions, sourceBuffer);
  } catch (err) {
    onProgress?.("failed");
    const message = err instanceof Error ? err.message : "render_failed";
    return { ok: false, radioLoopId, packageVersion, issues: [{ code: "RADIO_RENDER_FAILED", message, severity: "error" }] };
  }

  onProgress?.("encoding_core");
  const encodeResp = await fetch(`/radio-encode-opus?operationId=${encodeURIComponent(operationId)}&target=core`, {
    method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: rendered.wavBuffer,
  });
  const encodeJson = await encodeResp.json();
  if (!encodeJson.ok) {
    onProgress?.("failed");
    return {
      ok: false, radioLoopId, packageVersion,
      issues: encodeJson.issues ?? [{ code: "RADIO_ENCODE_FAILED", message: "Opus encoding failed", severity: "error" }],
    };
  }

  onProgress?.("finalizing");
  const sourceReference: RadioLoopSourceReference = {
    trackId: loop.sourceTrackId, loopId: loop.id, loopRevisionId: loop.activeRevisionId,
    audioRelPath: track.audioRelPath, startSeconds: rendered.startSeconds, endSeconds: rendered.endSeconds,
    resolvedAt: new Date().toISOString(),
  };
  const musical: RadioMusicalMetadata = { bpm: loop.bpm, key: loop.key, bars: loop.barCount };
  const arrangement: RadioArrangementMetadata = {
    roles: [formInput.arrangementRole],
    // 0717C_MUSIC_Complete_Song_Intelligence_and_Section_Map §3.4 — no
    // Compatibility Family is ever written for a new promotion.
    energy: formInput.energy, density: formInput.density, stability: formInput.stability,
    maximumConsecutiveRepeats: formInput.maximumConsecutiveRepeats, minimumRestCycles: formInput.minimumRestCycles,
  };
  const approval: RadioApprovalMetadata = { publicUseApproved: formInput.publicUseApproved, approvedAt: new Date().toISOString() };

  const finalizeResp = await fetch("/radio-package-finalize", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ operationId, radioLoopId, packageVersion, sourceReference, musical, arrangement, approval, startedAt: new Date().toISOString() }),
  });
  const finalizeJson = await finalizeResp.json();

  onProgress?.(finalizeJson.ok ? "complete" : "failed");
  return {
    ok: Boolean(finalizeJson.ok),
    radioLoopId, packageVersion,
    stemsOmitted: finalizeJson.stemsOmitted,
    stemsOmittedReason: finalizeJson.stemsOmittedReason,
    issues: finalizeJson.issues ?? [],
    report: finalizeJson.report,
  };
}
