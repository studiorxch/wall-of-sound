// Playlist Transition Preparation (0714_MUSIC_Playlist_Transition_Preparation
// v1.0.0) — data model. Mirrors the spec's interfaces exactly. The beat map
// belongs to the track; the transition PLAN belongs to the ordered pair
// inside a specific playlist (§3) — never stored on the track record.

export type TempoRelationship = "direct" | "half_time" | "double_time" | "tempo_change" | "unknown";

export type PlaylistTransitionSyncMode =
  | "beat_sync"
  | "bar_sync"
  | "phrase_sync"
  | "timed_crossfade"
  | "gapless"
  | "hard_cut"
  | "unsynced";

export type PlaylistTransitionFallbackMode = "timed_crossfade" | "gapless" | "hard_cut";

export type PlaylistTransitionStatus = "ready" | "ready_with_fallback" | "needs_review" | "blocked";

export type PlaylistPlaybackReadiness =
  | "unprepared"
  | "prepared"
  | "ready"
  | "ready_with_fallbacks"
  | "needs_review"
  | "blocked";

export type PlaylistTransitionPlanWarningCode =
  | "TRANSITION_PLAN_MISSING_BEAT_MAP"
  | "TRANSITION_PLAN_MISSING_BAR_GRID"
  | "TRANSITION_PLAN_UNTRUSTED_PLAYBACK_BOUNDS"
  | "TRANSITION_PLAN_INSUFFICIENT_OUTRO"
  | "TRANSITION_PLAN_INSUFFICIENT_INTRO"
  | "TRANSITION_PLAN_BPM_MISMATCH"
  | "TRANSITION_PLAN_HALF_DOUBLE_AMBIGUITY"
  | "TRANSITION_PLAN_KEY_TENSION"
  | "TRANSITION_PLAN_ENERGY_DISCONTINUITY"
  | "TRANSITION_PLAN_PHRASE_UNCERTAIN"
  | "TRANSITION_PLAN_TIMED_FALLBACK"
  | "TRANSITION_PLAN_GAPLESS_FALLBACK"
  | "TRANSITION_PLAN_HARD_CUT_REQUIRED"
  | "TRANSITION_PLAN_BLOCKED"
  | "TRANSITION_PLAN_STALE";

export interface PlaylistTransitionEvidence {
  fromBeatMapTrusted: boolean;
  toBeatMapTrusted: boolean;

  fromBarGridTrusted: boolean;
  toBarGridTrusted: boolean;

  fromPlaybackBoundsTrusted: boolean;
  toPlaybackBoundsTrusted: boolean;

  fromOutroRegionAvailable: boolean;
  toIntroRegionAvailable: boolean;

  directBpmDelta?: number;
  effectiveBpmDelta?: number;
  camelotPenalty?: number;

  outgoingAvailableSeconds: number;
  incomingAvailableSeconds: number;

  selectedFromBoundary: "preferred_end" | "outro_region" | "audible_end" | "manual";
  selectedToBoundary: "preferred_start" | "intro_region" | "audible_start" | "manual";
}

export interface PlaylistTransitionPlan {
  transitionId: string;
  playlistId: string;

  fromSlotId: string;
  toSlotId: string;

  fromTrackId: string;
  toTrackId: string;

  fromPosition: number;
  toPosition: number;

  outgoingCueSeconds: number;
  outgoingEndSeconds: number;

  incomingCueSeconds: number;
  incomingFullLevelSeconds?: number;

  outgoingBarIndex?: number;
  incomingBarIndex?: number;

  transitionDurationSeconds: number;
  transitionBars?: number;

  tempoRelationship: TempoRelationship;
  syncMode: PlaylistTransitionSyncMode;
  fallbackMode?: PlaylistTransitionFallbackMode;

  bpmFit: number;
  keyFit: number;
  beatMapFit: number;
  playbackBoundsFit: number;
  phraseFit: number;
  energyContinuityFit: number;

  confidence: number;
  status: PlaylistTransitionStatus;

  warnings: PlaylistTransitionPlanWarningCode[];
  evidence: PlaylistTransitionEvidence;

  detectorVersion: string;
  preparedAt: string;
}

export interface PlaylistTransitionOverride {
  transitionId: string;

  outgoingCueSeconds?: number;
  incomingCueSeconds?: number;
  transitionDurationSeconds?: number;
  syncMode?: PlaylistTransitionSyncMode;

  note?: string;
  source: "manual";
}

export interface PlaylistPlaybackPreparation {
  playlistId: string;
  version: string;

  transitionPlans: PlaylistTransitionPlan[];

  readiness: PlaylistPlaybackReadiness;

  readyCount: number;
  fallbackCount: number;
  reviewCount: number;
  blockedCount: number;

  // Keyed by trackId → a cheap revision marker (analysis timestamps
  // concatenated) so staleness can be detected without re-decoding audio.
  sourceTrackRevisionMap: Record<string, string>;

  preparedAt: string;
  detectorVersion: string;
  warnings: string[];

  // Manual per-transition overrides, keyed by transitionId — kept separate
  // from detected recommendations (§20).
  overrides?: Record<string, PlaylistTransitionOverride>;
}

// §12 — informational-only preview of what the previous→candidate and
// candidate→next transitions would look like if a repair candidate were
// applied. Never persisted, never used to reorder or re-rank candidates.
export interface RepairCandidateTransitionPreview {
  candidateTrackId: string;

  previousPlanStatus?: PlaylistTransitionStatus;
  nextPlanStatus?: PlaylistTransitionStatus;

  previousSyncMode?: PlaylistTransitionSyncMode;
  nextSyncMode?: PlaylistTransitionSyncMode;

  previousConfidence?: number;
  nextConfidence?: number;

  warningCodes: string[];
}

// §28 — player contract. Defined, never executed, by this build.
export interface PreparedTransitionExecution {
  fromTrackId: string;
  toTrackId: string;

  outgoingCueSeconds: number;
  outgoingEndSeconds: number;

  incomingCueSeconds: number;
  transitionDurationSeconds: number;

  syncMode: PlaylistTransitionSyncMode;
  tempoRelationship: TempoRelationship;
}

export const PLAYLIST_TRANSITION_DETECTOR_VERSION = "playlist-transition-v1";
