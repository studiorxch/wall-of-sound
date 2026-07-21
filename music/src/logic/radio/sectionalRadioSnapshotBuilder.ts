// Sectional Looper Radio Export Bridge (0717B) — builds an immutable
// "reviewed selection at the moment RADIO was chosen" snapshot (spec §5.1,
// §7.2). Pure: no React, no fetch, no mutation. Bounds/duration always come
// from frame values already resolved by the caller (timelineSelection's own
// startFrame/endFrame, or the loop's active-revision frames) — never
// audible/silence/recommendation/viewport bounds.

import type { AlignmentMode } from "../../ui/sectionalLooper/AlignmentControl";
import type { LoopAsset } from "../../data/loopTypes";
import type { SectionalRadioBridgeIssue, SectionalRadioPromotionSnapshot } from "../../data/sectionalRadioBridgeTypes";

export interface BuildSectionalRadioPromotionSnapshotInput {
  trackId: string | undefined;
  // track.playbackBounds?.sourceFingerprint — the only accepted source
  // identity. No trackId fallback: absence is a rejection, not a
  // substitution (see the SECTIONAL_RADIO_MISSING_SOURCE case below).
  sourceFingerprint: string | undefined;
  startFrame: number | undefined;
  endFrame: number | undefined;
  sourceTotalFrames: number;
  sampleRate: number;
  alignmentMode: AlignmentMode;
  bpm?: number;
  key?: string;
  existingLoopId?: string;
  existingLoop?: LoopAsset;
  isSelectionStale: boolean;
  capturedAt: string;
}

export interface BuildSectionalRadioPromotionSnapshotResult {
  snapshot: SectionalRadioPromotionSnapshot | null;
  issues: SectionalRadioBridgeIssue[];
}

export function buildSectionalRadioPromotionSnapshot(
  input: BuildSectionalRadioPromotionSnapshotInput,
): BuildSectionalRadioPromotionSnapshotResult {
  const issues: SectionalRadioBridgeIssue[] = [];

  if (!input.trackId) {
    issues.push({ code: "SECTIONAL_RADIO_MISSING_SOURCE_TRACK", message: "No source track is selected.", severity: "error" });
  }
  if (!input.sourceFingerprint) {
    issues.push({ code: "SECTIONAL_RADIO_MISSING_SOURCE", message: "The source track has no stable media identity yet (playback bounds have not been computed for it).", severity: "error" });
  }
  if (input.startFrame == null || input.endFrame == null) {
    issues.push({ code: "SECTIONAL_RADIO_MISSING_SELECTION", message: "No selection is currently active.", severity: "error" });
  }
  if (input.isSelectionStale) {
    issues.push({ code: "SECTIONAL_RADIO_SELECTION_STALE", message: "Review the current selection before promoting it to RADIO.", severity: "error" });
  }
  if (input.existingLoopId && !input.existingLoop) {
    issues.push({ code: "SECTIONAL_RADIO_MISSING_LOOP_REFERENCE", message: "The selection references a loop that no longer exists.", severity: "error" });
  }

  let boundsOk = false;
  if (input.startFrame != null && input.endFrame != null) {
    if (!Number.isFinite(input.startFrame) || !Number.isFinite(input.endFrame)) {
      issues.push({ code: "SECTIONAL_RADIO_INVALID_BOUNDS", message: "Selection bounds are not finite.", severity: "error" });
    } else if (input.endFrame < input.startFrame) {
      issues.push({ code: "SECTIONAL_RADIO_INVALID_BOUNDS", message: "Selection bounds are reversed.", severity: "error" });
    } else if (input.endFrame === input.startFrame) {
      issues.push({ code: "SECTIONAL_RADIO_ZERO_DURATION", message: "Selection has zero duration.", severity: "error" });
    } else if (input.startFrame < 0 || input.endFrame > input.sourceTotalFrames) {
      issues.push({ code: "SECTIONAL_RADIO_BOUNDS_OUT_OF_RANGE", message: "Selection bounds fall outside the decoded track range.", severity: "error" });
    } else {
      boundsOk = true;
    }
  }

  const hasError = issues.some((i) => i.severity === "error");
  if (hasError || !boundsOk || !input.trackId || !input.sourceFingerprint || input.startFrame == null || input.endFrame == null) {
    return { snapshot: null, issues };
  }

  const snapshot: SectionalRadioPromotionSnapshot = {
    sourceTrackId: input.trackId,
    sourceMediaIdentity: input.sourceFingerprint,
    existingLoopId: input.existingLoop?.id,
    activeLoopRevisionId: input.existingLoop ? (input.existingLoop.activeRevisionId ?? null) : undefined,
    startFrame: input.startFrame,
    endFrame: input.endFrame,
    sampleRate: input.sampleRate,
    durationSeconds: (input.endFrame - input.startFrame) / input.sampleRate,
    alignmentMode: input.alignmentMode,
    bpm: input.bpm,
    key: input.key,
    barCount: input.existingLoop?.barCount,
    selectionReviewState: "reviewed",
    capturedAt: input.capturedAt,
  };

  return { snapshot, issues };
}
