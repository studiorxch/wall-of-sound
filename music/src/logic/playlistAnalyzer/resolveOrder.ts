// Playlist Analyzer Review — shared ordered-track resolution.
// Single place that turns TrackSlot[] + tracksById into the in-order,
// assigned-and-found sequence every other module in this folder walks —
// avoids each module re-deriving "skip empty/missing slots" independently.

import type { Track } from "../../data/trackTypes";
import type { TrackSlot } from "../../data/playlistTypes";
import { buildMoodAnalysisReviewRow, type MoodAnalysisReviewRow } from "../moodAnalysisReview";
import { classifyTrackAnalysisState } from "./coverage";
import type { PlaylistTrackAnalysisState } from "../../data/playlistAnalyzerTypes";

export interface OrderedPlaylistEntry {
  slot: TrackSlot;
  track: Track;
  row: MoodAnalysisReviewRow;
  analysisState: PlaylistTrackAnalysisState;
  /** position within the resolved sequence, 0-based — NOT slot.slotIndex */
  position: number;
}

/**
 * Real playlist slot order (spec §12.1) — always the actual `slots` array,
 * sorted by `slotIndex`. Slots with no assigned track, or whose track can't
 * be found in the library, are skipped rather than rendered as a synthetic
 * row (spec §5.5 / §18: "no synthetic track rows appear").
 */
export function resolvePlaylistOrder(slots: TrackSlot[], tracksById: Map<string, Track>): OrderedPlaylistEntry[] {
  const sorted = [...slots].sort((a, b) => a.slotIndex - b.slotIndex);
  const entries: OrderedPlaylistEntry[] = [];
  for (const slot of sorted) {
    if (!slot.assignedTrackId) continue;
    const track = tracksById.get(slot.assignedTrackId);
    if (!track) continue;
    entries.push({
      slot,
      track,
      row: buildMoodAnalysisReviewRow(track),
      analysisState: classifyTrackAnalysisState(track),
      position: entries.length,
    });
  }
  return entries;
}
