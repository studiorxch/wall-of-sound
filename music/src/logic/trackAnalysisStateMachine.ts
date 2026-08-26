// MUSIC P0 Clean Library Foundation — Step C: Analysis Status + File Health
// (0826B_MUSIC_P0_Clean_Library_Foundation_StepC).
//
// Reuses the existing closed-enum + explicit-transition-table + boolean-
// guard doctrine already established for song-level analysis
// (songAnalysisTypes.ts's SongAnalysisStatus / isLegalSongAnalysisStateTransition)
// rather than inventing a second, independent transition system — applied
// here to the EXISTING Track.analysisStatus enum (trackTypes.ts), not a new
// type. As with that precedent, this isn't wired as a universal gate on
// every write site — a human's manual override via TrackInspector's
// Analysis dropdown is a deliberate choice, not a machine transition, and
// stays ungated. The guard is used at the one real automated-transition
// point: reconciling a track left in "queued"/"analyzing" by an interrupted
// batch (see playProjectStorage.ts's repairStoredProject).

import type { AnalysisStatus } from "../data/trackTypes";

const TRACK_ANALYSIS_STATE_TRANSITIONS: Record<AnalysisStatus, AnalysisStatus[]> = {
  not_analyzed: ["queued"],
  queued: ["analyzing", "not_analyzed"], // not_analyzed — an explicit cancel/reset, not a failure
  analyzing: ["analyzed", "partial", "failed", "review_needed", "not_analyzed"],
  analyzed: ["stale", "queued"],
  partial: ["queued"],
  stale: ["queued"],
  review_needed: ["queued"],
  failed: ["queued"],
};

export function isLegalTrackAnalysisStateTransition(from: AnalysisStatus, to: AnalysisStatus): boolean {
  return TRACK_ANALYSIS_STATE_TRANSITIONS[from]?.includes(to) ?? false;
}
