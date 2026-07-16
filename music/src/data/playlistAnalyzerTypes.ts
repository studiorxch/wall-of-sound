// Playlist Analyzer Review data model (0712_MUSIC_Playlist_Analyzer_Review_v1.0.0).
//
// Every value here is one of three kinds — never blend them silently:
//   Measured    — read directly off Track/TrackSlot (bpm, key, duration, energy, DSP)
//   Inferred    — derived by this module's own logic (mood, texture, density,
//                 valence, track role, transition type) — always carries `confidence`
//   Interpreted — creative language built from the inferred/measured layers
//                 (narrative arc, theme, visual language, motion direction)
// Missing measured data stays `undefined`/`null` — this module never fabricates
// BPM, energy, mood, key, or texture to fill a gap.

export type PlaylistTrackAnalysisState =
  | "complete"
  | "partial"
  | "missing"
  | "failed"
  | "stale"
  | "analyzing";

export interface PlaylistAnalysisCoverage {
  trackCount: number;
  completeCount: number;
  partialCount: number;
  missingCount: number;
  failedCount: number;
  staleCount: number;
  /** completeCount / trackCount — 0 when trackCount is 0 */
  coverageRatio: number;
}

export type EmotionalTemperature = "cool" | "neutral" | "warm";

export interface PlaylistIdentitySummary {
  primaryMoods: string[];
  secondaryMoods: string[];
  emotionalTemperature?: EmotionalTemperature;
  energyRange?: [number, number];
  bpmRange?: [number, number];
  tonalCharacter?: string;
  rhythmicCharacter?: string;
  texture?: string;
  brightness?: string;
  density?: string;
  movement?: string;
  contrast?: string;
  resolution?: string;
  /** 0-1 — reflects analysis coverage + how much weighting agreement there was */
  confidence: number;
}

export type PlaylistArcPhaseName = "opening" | "development" | "peak" | "release" | "closer";

export interface PlaylistArcPhase {
  phase: PlaylistArcPhaseName;
  /** Real section labels this phase maps to, when sections exist */
  sectionIds: string[];
  startSlotIndex: number;
  endSlotIndex: number;
  dominantMoods: string[];
  energyMovement: string;
  tempoMovement: string;
  tonalCharacter?: string;
  texture?: string;
  density?: string;
  narrativeFunction: string;
  entryBehavior: string;
  exitBehavior: string;
  confidence: number;
}

export interface PlaylistArcSummary {
  /** true when every phase maps 1:1 onto real playlist sections */
  derivedFromRealSections: boolean;
  phases: PlaylistArcPhase[];
}

export interface PlaylistSectionReview {
  sectionId: string;
  sectionLabel: string;
  /** false when this section was inferred (no real section data existed) */
  isRealSection: boolean;
  startSlotIndex: number;
  endSlotIndex: number;
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  trackCount: number;
  dominantMoods: string[];
  averageEnergy: number | null;
  energyRange: [number, number] | null;
  bpmRange: [number, number] | null;
  tonalConcentration?: string;
  texture?: string;
  contrast?: string;
  role: string;
  entryTransition?: string;
  exitTransition?: string;
  warningCodes: string[];
}

export type PlaylistTrackRole =
  | "opener"
  | "establishing"
  | "continuation"
  | "bridge"
  | "lift"
  | "peak"
  | "contrast"
  | "release"
  | "reset"
  | "closer"
  | "outlier"
  | "support";

export interface PlaylistTrackReview {
  slotId: string;
  trackId: string;
  position: number;
  sectionId?: string;

  // Measured — passthrough for display convenience, never fabricated
  title: string;
  artist?: string;
  durationSeconds?: number;
  bpm?: number;
  camelotKey?: string;
  energy?: number;

  // Inferred
  primaryMoods: string[];
  role: PlaylistTrackRole;
  contribution: string;

  transitionInId?: string;
  transitionOutId?: string;

  analysisState: PlaylistTrackAnalysisState;
  confidence: number;
  warningCodes: string[];

  // Track Beat Map Foundation (0713_MUSIC_Track_Beat_Map_Foundation §20) —
  // passthrough only, never re-derived here. Undefined when no trusted map
  // exists — never treated as a red error, only blue uncertainty.
  beatMapTrusted?: boolean;
  beatMapFirstBeatSeconds?: number;
  beatMapFirstDownbeatSeconds?: number;
  beatMapBarCount?: number;
  beatMapTempoStable?: boolean;
  beatMapIntroCleanBars?: number;
  beatMapOutroCleanBars?: number;
  beatMapWarningCodes?: import("./beatMapTypes").BeatMapWarningCode[];

  // Track Playback Bounds (0714_MUSIC_Track_Playback_Bounds §29) —
  // passthrough only. Missing bounds are blue uncertainty, never a red
  // playlist defect.
  playbackBoundsTrusted?: boolean;
  playbackBoundsAudibleStartSeconds?: number;
  playbackBoundsPreferredStartSeconds?: number;
  playbackBoundsPreferredEndSeconds?: number;
  playbackBoundsAudibleEndSeconds?: number;
  playbackBoundsEffectiveDurationSeconds?: number;
  playbackBoundsStartClassification?: import("./playbackBoundsTypes").PlaybackBoundaryClassification;
  playbackBoundsEndClassification?: import("./playbackBoundsTypes").PlaybackBoundaryClassification;
  playbackBoundsWarningCodes?: import("./playbackBoundsTypes").PlaybackBoundsWarningCode[];
}

export type PlaylistTransitionType =
  | "smooth_continuation"
  | "gentle_lift"
  | "gradual_release"
  | "intentional_contrast"
  | "hard_interruption"
  | "reset"
  | "uncertain";

export interface PlaylistTransitionReview {
  id: string;
  fromTrackId: string;
  toTrackId: string;
  fromPosition: number;
  toPosition: number;

  bpmDelta?: number;
  energyDelta?: number;
  keyRelationship?: string;
  moodContinuity?: number;
  brightnessDelta?: number;
  densityDelta?: number;

  // 0713_MUSIC_Playlist_BPM_Key_Sequencing §18 — exposed via the SAME shared
  // helpers generation uses (logic/playlistSequencing/), not re-derived here.
  effectiveBpmDelta?: number;
  bpmRelationship?: "direct" | "half_time" | "double_time" | "unknown";
  keyPenalty?: number;
  sequencingScore?: number;
  sequencingWarningCodes?: string[];

  transitionType: PlaylistTransitionType;
  narrativeEffect: string;
  confidence: number;
  warningCodes: string[];

  // Track Beat Map Foundation (§20) — trust state of the neighboring
  // tracks' beat maps for this transition; not used to alter transitionType.
  beatMapEvidenceAvailable?: boolean;
}

// ── Warning taxonomy (spec §13) ────────────────────────────────────────────────

export type PlaylistReviewWarningCode =
  | "PLAYLIST_ANALYSIS_MISSING_TRACK_DATA"
  | "PLAYLIST_ANALYSIS_PARTIAL_TRACK_DATA"
  | "PLAYLIST_ANALYSIS_STALE_TRACK_DATA"
  | "PLAYLIST_TRANSITION_ABRUPT_ENERGY"
  | "PLAYLIST_TRANSITION_ABRUPT_TEMPO"
  | "PLAYLIST_TRANSITION_HARMONIC_TENSION"
  | "PLAYLIST_SECTION_LOW_MOVEMENT"
  | "PLAYLIST_SECTION_DUPLICATE_ROLE"
  | "PLAYLIST_TRACK_OUTLIER"
  | "PLAYLIST_CLOSER_WEAK_RESOLUTION"
  | "PLAYLIST_CREATIVE_EXPORT_LOW_CONFIDENCE";

export type PlaylistReviewWarningSeverity = "info" | "advisory" | "attention";

export interface PlaylistReviewException {
  code: PlaylistReviewWarningCode;
  severity: PlaylistReviewWarningSeverity;
  explanation: string;
  affectedPositions: number[];
  actionRequired: boolean;
}

// ── Creative export (§9) ───────────────────────────────────────────────────────

export interface PlaylistCreativeExport {
  themeSummary: string;
  descriptionDraft: string;
  visualConcept: string;
  motionDirection: string[];
  materials: string[];
  colorCharacter: string[];
  spatialCharacter: string[];
  avoid: string[];
  imagePromptDraft: string;
  /** 0-1 — lowest confidence among the identity/arc inputs this was built from */
  confidence: number;
}

// ── Root ────────────────────────────────────────────────────────────────────────

export const PLAYLIST_ANALYZER_VERSION = "playlist-analyzer-v1.0.0";

export interface PlaylistAnalyzerReview {
  playlistId: string;
  playlistTitle: string;
  generatedAt: string;
  analysisVersion: string;

  trackCount: number;
  totalDurationSeconds: number;

  coverage: PlaylistAnalysisCoverage;
  identity: PlaylistIdentitySummary;
  arc: PlaylistArcSummary;
  sections: PlaylistSectionReview[];
  tracks: PlaylistTrackReview[];
  transitions: PlaylistTransitionReview[];
  exceptions: PlaylistReviewException[];
  creativeExport: PlaylistCreativeExport;
}
