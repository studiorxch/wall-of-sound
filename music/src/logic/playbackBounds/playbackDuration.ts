// Track Playback Bounds — duration helpers (§23, §24). The ONE canonical
// place effective duration is computed — never derive it independently
// elsewhere.

import type { TrackPlaybackBounds, PlaylistContributionDuration } from "../../data/playbackBoundsTypes";

export function getEffectivePlaybackDuration(bounds: TrackPlaybackBounds): number {
  return +(bounds.preferredEndSeconds - bounds.preferredStartSeconds).toFixed(3);
}

// §24 — future-safe model. Overlap values stay at zero until transition
// planning exists (explicitly out of scope for this build, §36).
export function buildPlaylistContributionDuration(
  bounds: TrackPlaybackBounds,
  overlapInSeconds = 0,
  overlapOutSeconds = 0,
): PlaylistContributionDuration {
  const effectiveDurationSeconds = getEffectivePlaybackDuration(bounds);
  const contributionSeconds = Math.max(0, effectiveDurationSeconds - overlapInSeconds - overlapOutSeconds);
  return { effectiveDurationSeconds, overlapInSeconds, overlapOutSeconds, contributionSeconds };
}
