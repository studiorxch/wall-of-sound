import type { Track, TrackSourceOwner, TrackArchiveStatus } from "../data/trackTypes";
import { normalizeTrackGenreTokens, normalizeTrackGenreIndexTokens } from "./genreTaxonomy";

export type LibraryTrackFilters = {
  search?: string;
  moodTags?: string[];
  grouping?: string;
  genre?: string;
  sourceOwner?: TrackSourceOwner | "any";
  minRating?: number;
  hasMood?: "any" | "mooded" | "unmooded";
  hasMoodSuggestions?: boolean;
  archiveStatus?: TrackArchiveStatus | "any";
  hasUnknownMetadata?: boolean;
  audioLinked?: boolean;
  noCover?: boolean;
};

export function isFiltersEmpty(f: LibraryTrackFilters): boolean {
  return (
    !f.search &&
    (!f.moodTags || f.moodTags.length === 0) &&
    !f.grouping &&
    !f.genre &&
    (!f.sourceOwner || f.sourceOwner === "any") &&
    (f.minRating == null || f.minRating <= 0) &&
    (!f.hasMood || f.hasMood === "any") &&
    !f.hasMoodSuggestions &&
    (!f.archiveStatus || f.archiveStatus === "any") &&
    !f.hasUnknownMetadata &&
    !f.noCover
  );
}

export function filterTracksByLibraryFilters(
  tracks: Track[],
  filters: LibraryTrackFilters,
): Track[] {
  if (isFiltersEmpty(filters)) return tracks;
  const searchLower = filters.search?.toLowerCase().trim();
  const moodSet = filters.moodTags?.length ? new Set(filters.moodTags.map((m) => m.toLowerCase())) : null;
  const groupingLower = filters.grouping?.toLowerCase().trim();
  const genreLower = filters.genre?.toLowerCase().trim();
  const ownerFilter = filters.sourceOwner && filters.sourceOwner !== "any" ? filters.sourceOwner : null;
  const minRating = filters.minRating ?? 0;

  return tracks.filter((t) => {
    // Search — matches title, artist, album, grouping, genre, moodTags
    if (searchLower) {
      const hay = [
        t.title, t.artist, t.albumTitle ?? "", t.grouping ?? "",
        ...normalizeTrackGenreTokens(t), ...(t.moodTags ?? []),
      ].join(" ").toLowerCase();
      if (!hay.includes(searchLower)) return false;
    }
    // Mood — any match
    if (moodSet) {
      const trackMoods = (t.moodTags ?? []).map((m) => m.toLowerCase());
      if (!trackMoods.some((m) => moodSet.has(m))) return false;
    }
    // Grouping — exact (case-insensitive)
    if (groupingLower) {
      if ((t.grouping ?? "").toLowerCase() !== groupingLower) return false;
    }
    // Genre — matches an exact normalized canonical Genre-index token
    if (genreLower) {
      const trackGenres = normalizeTrackGenreIndexTokens(t);
      if (!trackGenres.some((g) => g === genreLower)) return false;
    }
    // Source owner
    if (ownerFilter) {
      if ((t.sourceOwner ?? "unknown") !== ownerFilter) return false;
    }
    // Min rating
    if (minRating > 0) {
      if ((t.rating ?? 0) < minRating) return false;
    }
    // hasMood filter
    if (filters.hasMood === "mooded") {
      if ((t.moodTags?.length ?? 0) === 0) return false;
    } else if (filters.hasMood === "unmooded") {
      if ((t.moodTags?.length ?? 0) > 0) return false;
    }
    // hasMoodSuggestions filter
    if (filters.hasMoodSuggestions) {
      if ((t.moodSuggestions?.length ?? 0) === 0) return false;
    }
    // archive status filter
    if (filters.archiveStatus && filters.archiveStatus !== "any") {
      if ((t.archiveStatus ?? "library") !== filters.archiveStatus) return false;
    }
    // unknown metadata filter — tracks with missing/placeholder title or artist
    if (filters.hasUnknownMetadata) {
      const isUnknown = (v: string | undefined) => !v || v === "?" || v.toLowerCase() === "unknown";
      if (!isUnknown(t.title) && !isUnknown(t.artist)) return false;
    }
    // audio linked filter
    if (filters.audioLinked === true && !t.audioLinked) return false;
    if (filters.audioLinked === false && t.audioLinked) return false;
    // no cover filter
    if (filters.noCover && t.coverImagePath) return false;
    return true;
  });
}

// Build unique sorted option lists from the current library
export function buildFilterOptions(tracks: Track[]): {
  moods: string[];
  groupings: string[];
  genres: string[];
  owners: TrackSourceOwner[];
} {
  const moodSet = new Set<string>();
  const groupingSet = new Set<string>();
  const genreSet = new Set<string>();
  const ownerSet = new Set<TrackSourceOwner>();

  for (const t of tracks) {
    (t.moodTags ?? []).forEach((m) => m && moodSet.add(m));
    // grouping may be stored as string or string[] at runtime — handle both.
    const rawGrouping = t.grouping as unknown;
    if (Array.isArray(rawGrouping)) {
      (rawGrouping as string[]).forEach((g) => g && groupingSet.add(g));
    } else if (rawGrouping) {
      groupingSet.add(rawGrouping as string);
    }
    normalizeTrackGenreIndexTokens(t).forEach((g) => genreSet.add(g));
    if (t.sourceOwner) ownerSet.add(t.sourceOwner);
  }

  return {
    moods: [...moodSet].sort(),
    groupings: [...groupingSet].sort(),
    genres: [...genreSet].sort(),
    owners: [...ownerSet].sort() as TrackSourceOwner[],
  };
}
