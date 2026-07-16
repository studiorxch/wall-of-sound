import type { Track } from "../data/trackTypes";
import type { PlaylistBuildRecipe } from "../data/playProjectTypes";

export function filterTracksByRecipe(tracks: Track[], recipe: PlaylistBuildRecipe): Track[] {
  const {
    sourceOwners,
    moodTags = [],
    groupings = [],
    genres = [],
    minRating = 0,
    search,
    matchMode = "all_groups",
  } = recipe;

  const searchLow = search?.toLowerCase().trim() ?? "";
  const hasSignalFilters = moodTags.length > 0 || groupings.length > 0 || genres.length > 0;

  return tracks.filter((t) => {
    if (sourceOwners?.length && !sourceOwners.includes(t.sourceOwner ?? "unknown")) return false;
    if (searchLow) {
      const hay = [t.title ?? "", t.artist ?? "", t.albumTitle ?? ""].join(" ").toLowerCase();
      if (!hay.includes(searchLow)) return false;
    }
    if (minRating > 0 && (t.rating ?? 0) < minRating) return false;
    if (!hasSignalFilters) return true;

    if (matchMode === "all_groups") {
      if (moodTags.length) {
        const tm = (t.moodTags ?? []).map((m) => m.toLowerCase());
        if (!moodTags.some((m) => tm.includes(m.toLowerCase()))) return false;
      }
      if (groupings.length && !groupings.includes(t.grouping ?? "")) return false;
      if (genres.length) {
        const tg = [...(t.genres ?? []), ...(t.genre ? [t.genre] : [])];
        if (!genres.some((g) => tg.includes(g))) return false;
      }
      return true;
    } else {
      // any_signal: track matches any selected value across all categories
      const trackMoods = (t.moodTags ?? []).map((m) => m.toLowerCase());
      const trackGenres = [...(t.genres ?? []), ...(t.genre ? [t.genre] : [])];
      const moodHit = moodTags.length > 0 && moodTags.some((m) => trackMoods.includes(m.toLowerCase()));
      const groupHit = groupings.length > 0 && groupings.includes(t.grouping ?? "");
      const genreHit = genres.length > 0 && genres.some((g) => trackGenres.includes(g));
      return moodHit || groupHit || genreHit;
    }
  });
}
