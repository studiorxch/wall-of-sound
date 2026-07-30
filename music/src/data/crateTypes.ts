export type CrateMatchMode = "all_groups" | "any_signal";

export type CrateFilters = {
  search?: string;
  moodTags: string[];
  groupings: string[];
  genres: string[];
  // 0728G_MUSIC_Fast_Breaks_Identification — matches Track.genreClassification.
  // primaryGenreFamily, but ONLY when reviewStatus is "confirmed" (see
  // resolveCrate.ts) — a "suggested" candidate is never trusted as real
  // filter data. Optional so existing persisted crates need no migration.
  genreFamilies?: string[];
  minRating?: number;
  playableOnly?: boolean;
  matchMode: CrateMatchMode;
};

export type CrateKind = "manual" | "auto_mood" | "auto_source" | "system";

export type CrateRecord = {
  id: string;
  name: string;
  kind?: CrateKind;
  createdAt: string;
  updatedAt: string;
  // Only "studiorich" and "external" — reference never enters crates
  sourceOwners: Array<"studiorich" | "external">;
  filters: CrateFilters;
  description?: string;
  color?: string;
};

export function defaultCrateFilters(): CrateFilters {
  return {
    moodTags: [],
    groupings: [],
    genres: [],
    matchMode: "all_groups",
  };
}
