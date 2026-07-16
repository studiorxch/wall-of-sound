// Playlist Transition Preparation — confidence composition and status
// classification (§14, §23). ONE centralized weight table.

import type { PlaylistTransitionStatus, PlaylistTransitionSyncMode, PlaylistTransitionPlanWarningCode } from "../../data/playlistTransitionTypes";
//
// The spec's §23 weight buckets (beat-map trust 25%, bar/downbeat trust
// 20%, playback-bounds trust 20%, BPM compatibility 15%, available
// transition region 10%, energy/key continuity 10%) don't map 1:1 onto the
// 6 named `*Fit` fields the §5 schema actually persists (bpmFit, keyFit,
// beatMapFit, playbackBoundsFit, phraseFit, energyContinuityFit) — there is
// no separate "bar trust" or "available region" field. This build folds
// bar/downbeat trust into `beatMapFit` (0.25+0.20=0.45) and available-region
// into `playbackBoundsFit` (0.20+0.10=0.30), keeping the total at 1.0.
// `phraseFit` carries zero weight and stays neutral (0.5) — no phrase
// evidence exists yet (0713D limitation), so it must not fabricate
// importance for evidence that isn't there.
export const TRANSITION_CONFIDENCE_WEIGHTS = {
  bpmFit: 0.15,
  keyFit: 0.05,
  beatMapFit: 0.45,
  playbackBoundsFit: 0.30,
  phraseFit: 0,
  energyContinuityFit: 0.05,
};

export interface TransitionFits {
  bpmFit: number;
  keyFit: number;
  beatMapFit: number;
  playbackBoundsFit: number;
  phraseFit: number;
  energyContinuityFit: number;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// §23 — critical cue-validity/available-duration failures override the
// composite score; a high weighted average must not hide zero usable
// transition region on either side.
export function composeTransitionConfidence(
  fits: TransitionFits,
  outgoingAvailableSeconds: number,
  incomingAvailableSeconds: number,
): number {
  const weights = TRANSITION_CONFIDENCE_WEIGHTS;
  const weightedSum =
    clamp01(fits.bpmFit) * weights.bpmFit +
    clamp01(fits.keyFit) * weights.keyFit +
    clamp01(fits.beatMapFit) * weights.beatMapFit +
    clamp01(fits.playbackBoundsFit) * weights.playbackBoundsFit +
    clamp01(fits.phraseFit) * weights.phraseFit +
    clamp01(fits.energyContinuityFit) * weights.energyContinuityFit;

  let composite = weightedSum;
  if (outgoingAvailableSeconds <= 0 || incomingAvailableSeconds <= 0) {
    composite = Math.min(composite, 0.3);
  }
  return +clamp01(composite).toFixed(3);
}

const BLOCKING_WARNINGS: ReadonlySet<PlaylistTransitionPlanWarningCode> = new Set([
  "TRANSITION_PLAN_BLOCKED",
  "TRANSITION_PLAN_STALE",
]);

// §14 — status classification. A "ready" plan requires trusted timing AND
// a synchronized (non-fallback) mode; a fallback-mode plan with otherwise
// healthy confidence is "ready_with_fallback," not "ready" — the mode
// itself IS the compromise being reported.
export function classifyTransitionStatus(
  syncMode: PlaylistTransitionSyncMode,
  confidence: number,
  warnings: PlaylistTransitionPlanWarningCode[],
): PlaylistTransitionStatus {
  if (syncMode === "unsynced" || warnings.some((w) => BLOCKING_WARNINGS.has(w))) return "blocked";

  const isSynchronized = syncMode === "bar_sync" || syncMode === "beat_sync" || syncMode === "phrase_sync";
  const isFallback = syncMode === "timed_crossfade" || syncMode === "gapless" || syncMode === "hard_cut";

  if (isSynchronized && confidence >= 0.7 && warnings.length === 0) return "ready";
  if (isFallback && confidence >= 0.4) return "ready_with_fallback";
  if (confidence < 0.25) return "blocked";
  return "needs_review";
}
