// Playlist Transition Preparation — prepared playlist duration (§27). The
// ONE place prepared duration is computed; source and effective duration
// labels are never silently replaced.

import type { Track } from "../../data/trackTypes";
import type { TrackSlot } from "../../data/playlistTypes";
import type { PlaylistPlaybackPreparation } from "../../data/playlistTransitionTypes";
import { getEffectivePlaybackDuration } from "../playbackBounds/playbackDuration";

export interface PreparedPlaylistDuration {
  sourceTotalSeconds: number;
  effectiveTotalSeconds: number;
  preparedTotalSeconds: number;
}

export function computePreparedPlaylistDuration(
  slots: TrackSlot[],
  tracksById: Map<string, Track>,
  preparation?: PlaylistPlaybackPreparation,
): PreparedPlaylistDuration {
  const ordered = [...slots].sort((a, b) => a.slotIndex - b.slotIndex);
  const assignedTracks = ordered
    .filter((s) => s.assignedTrackId)
    .map((s) => tracksById.get(s.assignedTrackId as string))
    .filter((t): t is Track => !!t);

  const sourceTotalSeconds = assignedTracks.reduce((sum, t) => sum + (t.durationSeconds ?? 0), 0);
  const effectiveTotalSeconds = assignedTracks.reduce((sum, t) => {
    if (!t.playbackBounds) return sum + (t.durationSeconds ?? 0);
    return sum + getEffectivePlaybackDuration(t.playbackBounds);
  }, 0);

  // §27 — prepared duration = sum of effective durations minus transition
  // overlaps. Overlap for a given adjacency is the shared/blended window,
  // approximated here as the transition duration itself (the two tracks
  // sound simultaneously for that span) — capped by 0 when unsynced/hard-cut.
  const totalOverlapSeconds = preparation?.transitionPlans.reduce((sum, p) => sum + p.transitionDurationSeconds, 0) ?? 0;
  const preparedTotalSeconds = Math.max(0, effectiveTotalSeconds - totalOverlapSeconds);

  return {
    sourceTotalSeconds: +sourceTotalSeconds.toFixed(2),
    effectiveTotalSeconds: +effectiveTotalSeconds.toFixed(2),
    preparedTotalSeconds: +preparedTotalSeconds.toFixed(2),
  };
}
