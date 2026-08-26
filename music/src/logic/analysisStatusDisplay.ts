// MUSIC P0 Clean Library Foundation — Step C: Analysis Status + File Health
// (0826B_MUSIC_P0_Clean_Library_Foundation_StepC).
//
// Track.analysisStatus already carries 8 internal values (trackTypes.ts) —
// this module does not add or remove any of them, it only normalizes the
// presentation down to the 6 states a user needs to distinguish. Internal
// nuance ("partial" vs "analyzed", "stale" vs "review_needed") stays on the
// Track record for anything that needs it; the display layer collapses it.
//
// Mapping rationale:
//  - "partial" tracks already carry usable BPM/key/energy (DSP has run —
//    see dspFeatureExtraction.ts) even when full mood-confidence or BPM/key
//    trust hasn't been reached. Bucketing it under "Needs review" would flag
//    the majority of a real library by default, which fails the "normal
//    state stays visually quiet" doctrine for data that's genuinely usable.
//    It buckets under Ready.
//  - "stale" (a human-flagged "this needs a fresh look") and "review_needed"
//    (a genuinely low-confidence analyzer result) both mean "look at this
//    again" from the user's point of view, so both bucket under Needs review.

import type { AnalysisStatus, Track } from "../data/trackTypes";

export type AnalysisDisplayState =
  | "not_analyzed"
  | "queued"
  | "analyzing"
  | "needs_review"
  | "ready"
  | "failed";

export const ANALYSIS_DISPLAY_LABELS: Record<AnalysisDisplayState, string> = {
  not_analyzed: "Not analyzed",
  queued: "Queued",
  analyzing: "Analyzing",
  needs_review: "Needs review",
  ready: "Ready",
  failed: "Failed",
};

const INTERNAL_TO_DISPLAY: Record<AnalysisStatus, AnalysisDisplayState> = {
  not_analyzed: "not_analyzed",
  queued: "queued",
  analyzing: "analyzing",
  review_needed: "needs_review",
  stale: "needs_review",
  partial: "ready",
  analyzed: "ready",
  failed: "failed",
};

export function getAnalysisDisplayState(track: Pick<Track, "analysisStatus">): AnalysisDisplayState {
  return INTERNAL_TO_DISPLAY[track.analysisStatus ?? "not_analyzed"] ?? "not_analyzed";
}

export function getAnalysisDisplayLabel(track: Pick<Track, "analysisStatus">): string {
  return ANALYSIS_DISPLAY_LABELS[getAnalysisDisplayState(track)];
}
