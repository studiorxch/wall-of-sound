// Track Playback Bounds — stable warning taxonomy (§19).

import type { PlaybackBoundsWarningCode, PlaybackBoundaryClassification } from "../../data/playbackBoundsTypes";

export const PLAYBACK_BOUNDS_WARNING_CODES: PlaybackBoundsWarningCode[] = [
  "PLAYBACK_BOUNDS_MISSING",
  "PLAYBACK_BOUNDS_LOW_CONFIDENCE",
  "PLAYBACK_BOUNDS_INVALID_ORDER",
  "PLAYBACK_BOUNDS_SOURCE_TOO_SHORT",
  "PLAYBACK_BOUNDS_LEADING_SILENCE_UNCERTAIN",
  "PLAYBACK_BOUNDS_TRAILING_SILENCE_UNCERTAIN",
  "PLAYBACK_BOUNDS_FADE_IN_DETECTED",
  "PLAYBACK_BOUNDS_FADE_OUT_DETECTED",
  "PLAYBACK_BOUNDS_PICKUP_DETECTED",
  "PLAYBACK_BOUNDS_COUNT_IN_DETECTED",
  "PLAYBACK_BOUNDS_NO_TRUSTED_BEAT_START",
  "PLAYBACK_BOUNDS_NO_TRUSTED_BEAT_END",
  "PLAYBACK_BOUNDS_EFFECTIVE_DURATION_SHORT",
  "PLAYBACK_BOUNDS_DETECTOR_STALE",
  "PLAYBACK_BOUNDS_SOURCE_CHANGED",
];

export interface PlaybackBoundsWarningInputs {
  sourceDurationSeconds: number;
  effectiveDurationSeconds: number;
  overallConfidence: number;
  startClassification: PlaybackBoundaryClassification;
  endClassification: PlaybackBoundaryClassification;
  hasTrustedBeatStart: boolean;
  hasTrustedBeatEnd: boolean;
  orderValid: boolean;
}

const MIN_SOURCE_DURATION_SECONDS = 8;
const MIN_EFFECTIVE_DURATION_SECONDS = 4;
const LOW_CONFIDENCE_THRESHOLD = 0.5;

export function assemblePlaybackBoundsWarnings(inputs: PlaybackBoundsWarningInputs): PlaybackBoundsWarningCode[] {
  const warnings: PlaybackBoundsWarningCode[] = [];

  if (!inputs.orderValid) warnings.push("PLAYBACK_BOUNDS_INVALID_ORDER");
  if (inputs.sourceDurationSeconds < MIN_SOURCE_DURATION_SECONDS) warnings.push("PLAYBACK_BOUNDS_SOURCE_TOO_SHORT");
  if (inputs.effectiveDurationSeconds < MIN_EFFECTIVE_DURATION_SECONDS) warnings.push("PLAYBACK_BOUNDS_EFFECTIVE_DURATION_SHORT");
  if (inputs.overallConfidence < LOW_CONFIDENCE_THRESHOLD) warnings.push("PLAYBACK_BOUNDS_LOW_CONFIDENCE");

  if (inputs.startClassification === "fade") warnings.push("PLAYBACK_BOUNDS_FADE_IN_DETECTED");
  if (inputs.endClassification === "fade") warnings.push("PLAYBACK_BOUNDS_FADE_OUT_DETECTED");
  if (inputs.startClassification === "pickup") warnings.push("PLAYBACK_BOUNDS_PICKUP_DETECTED");
  if (inputs.startClassification === "count_in") warnings.push("PLAYBACK_BOUNDS_COUNT_IN_DETECTED");
  if (inputs.startClassification === "room_tone") warnings.push("PLAYBACK_BOUNDS_LEADING_SILENCE_UNCERTAIN");
  if (inputs.endClassification === "reverb_tail") warnings.push("PLAYBACK_BOUNDS_TRAILING_SILENCE_UNCERTAIN");

  if (!inputs.hasTrustedBeatStart) warnings.push("PLAYBACK_BOUNDS_NO_TRUSTED_BEAT_START");
  if (!inputs.hasTrustedBeatEnd) warnings.push("PLAYBACK_BOUNDS_NO_TRUSTED_BEAT_END");

  return warnings;
}
