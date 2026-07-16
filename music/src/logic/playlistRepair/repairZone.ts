// Playlist Local Repair — repair zone construction (§7). Every repair
// operates on previous → candidate → next, never the whole playlist.

import type { PlaylistIssue, PlaylistRepairZone } from "../../data/playlistRepairTypes";
import type { OrderedPlaylistEntry } from "../playlistAnalyzer/resolveOrder";

export function buildRepairZone(issue: PlaylistIssue, entries: OrderedPlaylistEntry[]): PlaylistRepairZone {
  const target = entries[issue.primaryPosition];
  const prev = entries[issue.primaryPosition - 1];
  const next = entries[issue.primaryPosition + 1];

  return {
    issueId: issue.issueId,
    sectionId: issue.sectionId,
    previousPosition: prev?.position,
    targetPosition: issue.primaryPosition,
    nextPosition: next?.position,
    previousTrackId: prev?.track.trackId,
    currentTrackId: target?.track.trackId,
    nextTrackId: next?.track.trackId,
    issueTypes: [issue.type],
    severity: issue.severity,
  };
}
