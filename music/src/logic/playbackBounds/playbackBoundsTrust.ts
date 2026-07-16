// Track Playback Bounds — the one canonical trust helper (§18). Missing or
// untrusted bounds must never prevent playback — playback bounds are
// consumed neutrally until a future "Use Playback Bounds" mode exists.

import type { TrackPlaybackBounds, PlaybackBoundsWarningCode } from "../../data/playbackBoundsTypes";
import { PLAYBACK_BOUNDS_DETECTOR_VERSION } from "../../data/playbackBoundsTypes";

const CONFIDENCE_THRESHOLD = 0.5;
const MIN_SOURCE_DURATION_SECONDS = 8;

const BLOCKING_WARNINGS: ReadonlySet<PlaybackBoundsWarningCode> = new Set([
  "PLAYBACK_BOUNDS_MISSING",
  "PLAYBACK_BOUNDS_INVALID_ORDER",
  "PLAYBACK_BOUNDS_SOURCE_TOO_SHORT",
  "PLAYBACK_BOUNDS_EFFECTIVE_DURATION_SHORT",
  "PLAYBACK_BOUNDS_DETECTOR_STALE",
  "PLAYBACK_BOUNDS_LOW_CONFIDENCE",
  "PLAYBACK_BOUNDS_SOURCE_CHANGED",
]);

export function isBoundsOrderValid(bounds: Pick<TrackPlaybackBounds,
  "audibleStartSeconds" | "preferredStartSeconds" | "preferredEndSeconds" | "audibleEndSeconds" | "sourceDurationSeconds">): boolean {
  return (
    0 <= bounds.audibleStartSeconds &&
    bounds.audibleStartSeconds <= bounds.preferredStartSeconds &&
    bounds.preferredStartSeconds <= bounds.preferredEndSeconds &&
    bounds.preferredEndSeconds <= bounds.audibleEndSeconds &&
    bounds.audibleEndSeconds <= bounds.sourceDurationSeconds
  );
}

export function isPlaybackBoundsTrusted(bounds?: TrackPlaybackBounds): boolean {
  if (!bounds) return false;
  if (bounds.detectorVersion !== PLAYBACK_BOUNDS_DETECTOR_VERSION) return false;
  if (!isBoundsOrderValid(bounds)) return false;
  if (bounds.sourceDurationSeconds < MIN_SOURCE_DURATION_SECONDS) return false;
  if (bounds.overallConfidence < CONFIDENCE_THRESHOLD) return false;
  if (bounds.effectiveDurationSeconds <= 0) return false;
  if (bounds.warnings.some((w) => BLOCKING_WARNINGS.has(w))) return false;
  return true;
}
