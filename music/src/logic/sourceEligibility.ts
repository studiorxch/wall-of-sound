// Source-group isolation (0621E).
// Automatic fill / regenerate / fill-gap must only pull tracks from the active
// playlist's own source group, unless the playlist explicitly opts into
// cross-group autofill. Manual placement (drag/add) is unaffected — it writes
// directly to a playlist's slots and never consults this helper.

import type { Track, TrackSourceOwner } from "../data/trackTypes";
import type { PlaylistRecord } from "../data/playProjectTypes";

/**
 * Is `track` eligible to be auto-pulled into `playlist`?
 *
 * Rules:
 *  - allowCrossGroupAutofill === true  → any track (opt-out of isolation)
 *  - track has no sourceGroupId        → legacy/unscoped, globally eligible
 *    (preserves the pre-0621E shared-library workflow with zero regression)
 *  - otherwise                         → groups must match exactly
 */
export function isTrackEligibleForPlaylist(params: {
  track: Track;
  playlist: Pick<PlaylistRecord, "sourceGroupId" | "allowCrossGroupAutofill" | "allowedSourceOwners">;
}): boolean {
  const { track, playlist } = params;

  // Source ownership policy check (0630C): if the playlist restricts owners, enforce it.
  if (playlist.allowedSourceOwners && playlist.allowedSourceOwners.length > 0) {
    const owner: TrackSourceOwner = track.sourceOwner ?? "unknown";
    if (!playlist.allowedSourceOwners.includes(owner)) return false;
  }

  // Source-group isolation (0621E)
  if (playlist.allowCrossGroupAutofill === true) return true;
  if (track.sourceGroupId == null) return true;
  return track.sourceGroupId === playlist.sourceGroupId;
}

export function filterTracksForPlaylist(params: {
  tracks: Track[];
  playlist: Pick<PlaylistRecord, "sourceGroupId" | "allowCrossGroupAutofill" | "allowedSourceOwners" | "playlistKind">;
  requirePlayablePath?: boolean;
}): Track[] {
  const { tracks, playlist, requirePlayablePath = true } = params;
  return tracks.filter((track) => {
    // Reference tracks are sampler-bank content only — never pulled into music playlists.
    if (
      track.sourceOwner === "reference" &&
      playlist.playlistKind !== "reference_overlay"
    ) return false;

    // Exclude tracks with no playable path when playlist is a music curve playlist.
    if (requirePlayablePath && playlist.playlistKind !== "reference_overlay") {
      const hasPath = !!(track.filePath || track.objectUrl);
      if (!hasPath) return false;
    }

    return isTrackEligibleForPlaylist({ track, playlist });
  });
}

/** Deterministic source-group id derived from a playlist id. */
export function sourceGroupIdFor(playlistId: string): string {
  return `source-${playlistId}`;
}
