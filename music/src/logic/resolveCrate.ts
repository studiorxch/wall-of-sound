import type { Track } from "../data/trackTypes";
import type { CrateRecord } from "../data/crateTypes";

export type ResolvedCrate = {
  tracks: Track[];
  totalDurationSeconds: number;
  countByCat: number;
  countByExt: number;
};

export function resolveCrateTracks(crate: CrateRecord, libraryTracks: Track[]): ResolvedCrate {
  const { sourceOwners, filters } = crate;
  const {
    search,
    moodTags,
    groupings,
    genres,
    minRating,
    playableOnly,
    matchMode,
  } = filters;

  const searchLow = search?.toLowerCase().trim() ?? "";
  const hasSignalFilters = moodTags.length > 0 || groupings.length > 0 || genres.length > 0;

  const tracks = libraryTracks.filter((t) => {
    // Reference never enters crates
    if (t.sourceOwner === "reference" || t.sourceOwner === "unknown") return false;
    // Source pool filter
    if (!sourceOwners.includes(t.sourceOwner as "studiorich" | "external")) return false;
    // Playable path required
    if (playableOnly && !t.filePath && !t.objectUrl) return false;
    // Search
    if (searchLow) {
      const hay = [t.title ?? "", t.artist ?? "", t.albumTitle ?? ""].join(" ").toLowerCase();
      if (!hay.includes(searchLow)) return false;
    }
    // Rating
    if (minRating && minRating > 0 && (t.rating ?? 0) < minRating) return false;
    // Signal filters
    if (!hasSignalFilters) return true;

    const trackMoods = (t.moodTags ?? []).map((m) => m.toLowerCase());
    const trackGenres = [...(t.genres ?? []), ...(t.genre ? t.genre.split(",").map((g) => g.trim()) : [])];

    if (matchMode === "all_groups") {
      if (moodTags.length && !moodTags.some((m) => trackMoods.includes(m.toLowerCase()))) return false;
      if (groupings.length && !groupings.includes(t.grouping ?? "")) return false;
      if (genres.length && !genres.some((g) => trackGenres.includes(g))) return false;
      return true;
    } else {
      // any_signal: match any selected value across all signal categories
      const moodHit = moodTags.length > 0 && moodTags.some((m) => trackMoods.includes(m.toLowerCase()));
      const groupHit = groupings.length > 0 && groupings.includes(t.grouping ?? "");
      const genreHit = genres.length > 0 && genres.some((g) => trackGenres.includes(g));
      return moodHit || groupHit || genreHit;
    }
  });

  const totalDurationSeconds = tracks.reduce((sum, t) => sum + (t.durationSeconds ?? 0), 0);
  const countByCat = tracks.filter((t) => t.sourceOwner === "studiorich").length;
  const countByExt = tracks.filter((t) => t.sourceOwner === "external").length;

  return { tracks, totalDurationSeconds, countByCat, countByExt };
}

/** Merge tracks from multiple crates, deduplicating by trackId. */
export function resolveCratePool(crateIds: string[], cratesById: Map<string, CrateRecord>, libraryTracks: Track[]): Track[] {
  const seen = new Set<string>();
  const result: Track[] = [];
  for (const id of crateIds) {
    const crate = cratesById.get(id);
    if (!crate) continue;
    for (const t of resolveCrateTracks(crate, libraryTracks).tracks) {
      if (!seen.has(t.trackId)) {
        seen.add(t.trackId);
        result.push(t);
      }
    }
  }
  return result;
}
