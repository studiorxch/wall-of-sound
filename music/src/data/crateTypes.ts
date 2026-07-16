export type CrateMatchMode = "all_groups" | "any_signal";

export type CrateFilters = {
  search?: string;
  moodTags: string[];
  groupings: string[];
  genres: string[];
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
