// Source-pool fill utility (0624A, updated 0624D).
// Builds playlist slots from a MusicSourcePool or LibraryTrackFilters.
// Simple ordered fill — no seeded shuffle yet. Not a recommendation engine.

import type { Track } from "../data/trackTypes";
import type { TrackSlot } from "../data/playlistTypes";
import type { MusicSourcePool } from "../data/sourcePoolTypes";
import { filterTracksByLibraryFilters, type LibraryTrackFilters } from "./libraryFilters";

function genSlotId(index: number): string {
  return `slot_${index}`;
}

/**
 * Build playlist slots from a source pool.
 *
 * Priority for selecting candidate tracks:
 *   1. sourcePool.trackIds — exact list; preserves order
 *   2. sourcePool.albumGroupIds — tracks matching any albumGroupId
 *   3. sourcePool.genreFilter + moodFilter — genre/mood match
 *   4. fallback: empty result
 *
 * Stops when targetTrackCount OR targetDurationMinutes is satisfied (whichever comes first).
 */
export function buildPlaylistSlotsFromSourcePool(args: {
  sourcePool: MusicSourcePool;
  tracks: Track[];
  targetDurationMinutes?: number;
  targetTrackCount?: number;
  templateSourceFilters?: LibraryTrackFilters;
}): TrackSlot[] {
  const { sourcePool, tracks, targetDurationMinutes, targetTrackCount, templateSourceFilters } = args;

  const tracksById = new Map(tracks.map((t) => [t.trackId, t]));

  // 1. Select candidates — priority order (0624D updated):
  //    a. explicit trackIds on the pool
  //    b. templateSourceFilters (LibraryTrackFilters — mood/grouping/genre/owner/rating)
  //    c. grouping match (pool.genreFilter used as grouping fallback)
  //    d. albumGroupIds
  //    e. genre/mood pool filters
  let candidates: Track[] = [];

  if (sourcePool.trackIds && sourcePool.trackIds.length > 0) {
    // Preserve pool order, skip missing tracks
    for (const id of sourcePool.trackIds) {
      const t = tracksById.get(id);
      if (t) candidates.push(t);
    }
  } else if (templateSourceFilters && Object.keys(templateSourceFilters).some((k) => !!(templateSourceFilters as Record<string, unknown>)[k])) {
    candidates = filterTracksByLibraryFilters(tracks, templateSourceFilters);
  } else if (sourcePool.albumGroupIds && sourcePool.albumGroupIds.length > 0) {
    const albumSet = new Set(sourcePool.albumGroupIds);
    candidates = tracks.filter((t) => t.albumGroupId && albumSet.has(t.albumGroupId));
  } else if (
    (sourcePool.genreFilter && sourcePool.genreFilter.length > 0) ||
    (sourcePool.moodFilter && sourcePool.moodFilter.length > 0)
  ) {
    const genres = new Set(sourcePool.genreFilter ?? []);
    const moods = new Set(sourcePool.moodFilter ?? []);
    candidates = tracks.filter((t) => {
      const trackGenres = [...(t.genres ?? []), ...(t.genre ? [t.genre] : [])];
      const trackMoods = t.moodTags ?? [];
      const genreMatch = genres.size === 0 || trackGenres.some((g) => genres.has(g));
      const moodMatch = moods.size === 0 || trackMoods.some((m) => moods.has(m));
      return genreMatch && moodMatch;
    });
  }

  if (candidates.length === 0) return [];

  // 2. Fill until target satisfied
  const maxCount = targetTrackCount ?? Infinity;
  const maxSeconds = targetDurationMinutes != null ? targetDurationMinutes * 60 : Infinity;

  const selected: Track[] = [];
  let totalSeconds = 0;

  for (const track of candidates) {
    if (selected.length >= maxCount) break;
    if (totalSeconds >= maxSeconds) break;
    selected.push(track);
    totalSeconds += track.durationSeconds ?? 0;
  }

  // 3. Build slots
  return selected.map((track, i): TrackSlot => ({
    slotId: genSlotId(i),
    slotIndex: i,
    startTimeSeconds: 0,
    assignedTrackId: track.trackId,
    targetEnergy: track.energy ?? 0.5,
    targetBpm: 0,
    warningLevel: "none",
    warningMessages: [],
  }));
}
