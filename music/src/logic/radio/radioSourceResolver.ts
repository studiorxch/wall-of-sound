// RadioLoop Library Workspace (0717A) — source resolution (decision 6).
// Pure, client-side, against already-loaded MUSIC state — no new server
// route needed since the browser already holds everything required
// (App.tsx's libraryTracksRef/loopsRef, the same arrays LoopLibraryView
// already receives). Never throws; an unresolved source keeps the
// RadioLoop row visible with source navigation disabled and a reason.

import type { Track } from "../../data/trackTypes";
import type { LoopAsset } from "../../data/loopTypes";
import type { RadioLoopSourceSummary } from "../../data/radioWorkspaceTypes";

export function resolveRadioLoopSource(
  sourceTrackId: string,
  sourceLoopId: string,
  libraryTracks: readonly Track[],
  loops: readonly LoopAsset[],
): RadioLoopSourceSummary {
  const track = libraryTracks.find((t) => t.trackId === sourceTrackId);
  const loop = loops.find((l) => l.id === sourceLoopId);

  if (!track && !loop) {
    return { sourceTrackId, sourceLoopId, resolved: false, unresolvedReason: "source_track_and_loop_not_found" };
  }
  if (!track) {
    return { sourceTrackId, sourceLoopId, resolved: false, unresolvedReason: "source_track_not_found" };
  }
  if (!loop) {
    return { sourceTrackId, sourceLoopId, resolved: false, unresolvedReason: "source_loop_not_found" };
  }

  const displayName = loop.sourceArtist ? `${loop.sourceTitle} — ${loop.sourceArtist}` : loop.sourceTitle;
  return { sourceTrackId, sourceLoopId, resolved: true, displayName };
}
