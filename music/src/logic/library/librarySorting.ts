// Shared Library data-grid column sorting — used identically by Catalog,
// External, and Sounds. Pure — no DOM, no Node. Single-key ("ordinary
// click") and multi-key ("Option/Alt-click") both funnel through the one
// `applyLibrarySort` comparator so the two entry points can never disagree
// about tie-breaking or null handling.

import type { Track } from "../../data/trackTypes";
import type { LibraryColumnId, LibrarySortKey } from "../../data/libraryGridTypes";
import { normalizeTrackGenreTokens } from "../genreTaxonomy";

// Mood/Suggested/Mechanical are intentionally absent — tag-list cells have
// no single canonical ordering value.
function getSortValue(track: Track, columnId: LibraryColumnId): string | number | null {
  switch (columnId) {
    case "title": return track.title || null;
    case "artist": return track.artist || null;
    case "grouping": return track.grouping || null;
    case "genre": return normalizeTrackGenreTokens(track)[0] || null;
    case "key": return track.camelotKey || null;
    case "status": return track.archiveStatus ?? "library";
    case "bpm": return typeof track.bpm === "number" ? track.bpm : null;
    case "energy": return typeof track.energy === "number" ? track.energy : null;
    case "duration": return typeof track.durationSeconds === "number" ? track.durationSeconds : null;
    case "rating": return track.rating ?? 0;
    case "plays": return track.playCount ?? 0;
    case "lastPlayed": return track.lastPlayedAt ? new Date(track.lastPlayedAt).getTime() : null;
    // Comments: presence-first-then-alphabetical falls straight out of
    // "nulls always last, strings compare case-insensitively" below — never
    // comment length.
    case "comments": return track.notes && track.notes.trim().length > 0 ? track.notes.trim().toLowerCase() : null;
    default: return null;
  }
}

// Null/empty values are ALWAYS ordered last, regardless of direction —
// must remain grouped consistently and must not alternate position across
// renders. Direction only affects ordering WITHIN the non-null group.
function compareSortValues(a: string | number | null, b: string | number | null, direction: 1 | -1): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "string" && typeof b === "string") return direction * a.localeCompare(b);
  return direction * ((a as number) - (b as number));
}

// The ONE authoritative multi-key sort. `sortKeys: []` is the canonical
// default — returns tracks in their given (insertion) order, unchanged.
// A stable trackId tie-break (then original index) means equal values
// never flicker between renders.
export function applyLibrarySort(tracks: Track[], sortKeys: LibrarySortKey[]): Track[] {
  if (sortKeys.length === 0) return tracks;
  const withIndex = tracks.map((t, i) => ({ t, i }));
  withIndex.sort((x, y) => {
    for (const key of sortKeys) {
      const direction: 1 | -1 = key.direction === "asc" ? 1 : -1;
      const cmp = compareSortValues(getSortValue(x.t, key.columnId), getSortValue(y.t, key.columnId), direction);
      if (cmp !== 0) return cmp;
    }
    if (x.t.trackId < y.t.trackId) return -1;
    if (x.t.trackId > y.t.trackId) return 1;
    return x.i - y.i;
  });
  return withIndex.map((x) => x.t);
}

// Ordinary header click — single-column mode, always REPLACES whatever
// sort (including any multi-sort) was active: unsorted→asc→desc→unsorted
// (canonical default order restored on the third click).
export function cycleSingleColumnSort(sortKeys: LibrarySortKey[], columnId: LibraryColumnId): LibrarySortKey[] {
  const onlyKey = sortKeys.length === 1 ? sortKeys[0] : null;
  if (!onlyKey || onlyKey.columnId !== columnId) return [{ columnId, direction: "asc" }];
  if (onlyKey.direction === "asc") return [{ columnId, direction: "desc" }];
  return [];
}

// Option/Alt-click header — multi-column mode: adds this column at the
// next priority if absent, reverses it if ascending, removes it if
// descending — WITHOUT touching any other active sort key.
export function cycleMultiColumnSort(sortKeys: LibrarySortKey[], columnId: LibraryColumnId): LibrarySortKey[] {
  const idx = sortKeys.findIndex((k) => k.columnId === columnId);
  if (idx === -1) return [...sortKeys, { columnId, direction: "asc" }];
  const existing = sortKeys[idx];
  if (existing.direction === "asc") {
    const next = sortKeys.slice();
    next[idx] = { columnId, direction: "desc" };
    return next;
  }
  return sortKeys.filter((k) => k.columnId !== columnId);
}

// 1-based priority for the small indicator numbers next to active
// multi-sort headers; undefined when the column isn't an active sort key.
export function sortPriorityForColumn(sortKeys: LibrarySortKey[], columnId: LibraryColumnId): number | undefined {
  const idx = sortKeys.findIndex((k) => k.columnId === columnId);
  return idx === -1 ? undefined : idx + 1;
}
