// Track Playback Bounds (0714_MUSIC_Track_Playback_Bounds_v1.0.0) —
// canonical, non-destructive playback-bounds data model (§4). The source
// audio file is NEVER modified; this model only stores reusable playback
// instructions.

export type PlaybackBoundaryClassification =
  | "technical_silence"
  | "encoder_delay"
  | "room_tone"
  | "fade"
  | "pickup"
  | "count_in"
  | "musical_intro"
  | "musical_outro"
  | "reverb_tail"
  | "abrupt_start"
  | "abrupt_end"
  | "manual"
  | "unknown";

export type PlaybackBoundsSource = "detected" | "manual" | "imported";

export type PlaybackBoundsWarningCode =
  | "PLAYBACK_BOUNDS_MISSING"
  | "PLAYBACK_BOUNDS_LOW_CONFIDENCE"
  | "PLAYBACK_BOUNDS_INVALID_ORDER"
  | "PLAYBACK_BOUNDS_SOURCE_TOO_SHORT"
  | "PLAYBACK_BOUNDS_LEADING_SILENCE_UNCERTAIN"
  | "PLAYBACK_BOUNDS_TRAILING_SILENCE_UNCERTAIN"
  | "PLAYBACK_BOUNDS_FADE_IN_DETECTED"
  | "PLAYBACK_BOUNDS_FADE_OUT_DETECTED"
  | "PLAYBACK_BOUNDS_PICKUP_DETECTED"
  | "PLAYBACK_BOUNDS_COUNT_IN_DETECTED"
  | "PLAYBACK_BOUNDS_NO_TRUSTED_BEAT_START"
  | "PLAYBACK_BOUNDS_NO_TRUSTED_BEAT_END"
  | "PLAYBACK_BOUNDS_EFFECTIVE_DURATION_SHORT"
  | "PLAYBACK_BOUNDS_DETECTOR_STALE"
  | "PLAYBACK_BOUNDS_SOURCE_CHANGED";

export interface FadeEvidence {
  startSeconds: number;
  endSeconds: number;
  direction: "in" | "out";
  monotonicity: number;
  confidence: number;
}

export interface TrackPlaybackBounds {
  version: string;

  sourceDurationSeconds: number;

  audibleStartSeconds: number;
  preferredStartSeconds: number;

  preferredEndSeconds: number;
  audibleEndSeconds: number;

  leadingSilenceSeconds: number;
  trailingSilenceSeconds: number;

  effectiveDurationSeconds: number;

  startClassification: PlaybackBoundaryClassification;
  endClassification: PlaybackBoundaryClassification;

  startConfidence: number;
  endConfidence: number;
  overallConfidence: number;

  source: PlaybackBoundsSource;
  detectorVersion: string;
  analyzedAt: string;

  warnings: PlaybackBoundsWarningCode[];

  // §22 — source-identity reference for stale detection. Duration + path is
  // what's actually available on Track today (no file-size/mtime/hash
  // plumbing exists yet) — an honest, scoped fingerprint, not a full
  // content hash.
  sourceFingerprint?: string;

  // §17 — manual override, applied on top of detected bounds without
  // erasing them.
  override?: TrackPlaybackBoundsOverride;
}

export interface TrackPlaybackBoundsOverride {
  preferredStartSeconds?: number;
  preferredEndSeconds?: number;
  startClassification?: "manual";
  endClassification?: "manual";
  note?: string;
}

export interface PlaylistContributionDuration {
  effectiveDurationSeconds: number;
  overlapInSeconds: number;
  overlapOutSeconds: number;
  contributionSeconds: number;
}

export const PLAYBACK_BOUNDS_DETECTOR_VERSION = "playback-bounds-v1";
