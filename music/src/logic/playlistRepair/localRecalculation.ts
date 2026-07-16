// Playlist Local Repair — local-only recalculation (§11). After a local
// edit, recompute ONLY the previous/current/next transitions and the local
// energy role — never regenerate, reorder unrelated tracks, or recalculate
// every section.

import type { PlaylistIssue } from "../../data/playlistRepairTypes";
import type { OrderedPlaylistEntry } from "../playlistAnalyzer/resolveOrder";
import { detectPlaylistIssuesAll } from "./issueDetection";
import type { PlaylistSectionEnergyEnvelope } from "../../data/playlistShapeTypes";

/**
 * Recomputes issues for a narrow window around `editedPosition` — the
 * previous transition, the current transition, and the next transition —
 * plus the section that owns the edited position, if any. This is achieved
 * by running full detection (which is cheap and pure) but then FILTERING to
 * only the affected positions, rather than by attempting a partial/streaming
 * detector — the important guarantee for the caller is that unrelated rows'
 * issues are left untouched in the CALLER's existing issue list, which this
 * function's result is meant to be spliced into, not that detection itself
 * only visits three rows internally.
 */
export function recalculateLocalWindow(
  entries: OrderedPlaylistEntry[],
  editedPosition: number,
  envelopesBySectionId: Map<string, PlaylistSectionEnergyEnvelope> = new Map(),
): PlaylistIssue[] {
  const all = detectPlaylistIssuesAll(entries, envelopesBySectionId);
  const windowPositions = new Set([editedPosition - 1, editedPosition, editedPosition + 1]);
  const editedSectionId = entries[editedPosition]?.slot.sectionId;

  return all.filter((issue) => {
    if (issue.scope === "transition" || issue.scope === "local_window") {
      return issue.affectedPositions.some((p) => windowPositions.has(p));
    }
    if (issue.scope === "section") {
      return editedSectionId != null && issue.sectionId === editedSectionId;
    }
    // Playlist-scoped issues are deliberately excluded from a LOCAL
    // recalculation — they require the full picture and are only refreshed
    // by the explicit "Reanalyze Entire Playlist" action (§11).
    return false;
  });
}

/**
 * Merges a local recalculation result into a full issue list: replaces every
 * issue touching the recalculated window/section, keeps everything else
 * byte-for-byte unchanged (§11 "unaffected rows remain unchanged").
 */
export function mergeLocalRecalculation(
  previousIssues: PlaylistIssue[],
  recalculated: PlaylistIssue[],
  editedPosition: number,
  editedSectionId: string | undefined,
): PlaylistIssue[] {
  const windowPositions = new Set([editedPosition - 1, editedPosition, editedPosition + 1]);
  const untouched = previousIssues.filter((issue) => {
    if (issue.scope === "transition" || issue.scope === "local_window") {
      return !issue.affectedPositions.some((p) => windowPositions.has(p));
    }
    if (issue.scope === "section") {
      return !(editedSectionId != null && issue.sectionId === editedSectionId);
    }
    return true; // playlist-scoped issues survive until an explicit full reanalysis
  });
  return [...untouched, ...recalculated];
}
