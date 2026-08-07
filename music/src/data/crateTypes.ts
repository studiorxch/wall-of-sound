export type CrateMatchMode = "all_groups" | "any_signal";

// 0804_MUSIC_Crate_BPM_Group_Filters — BPM range. `minimum`/`maximum` are
// inclusive bounds; null means that bound is unset. Matched ONLY against
// resolveAuthoritativeBpm(track) (dspFeatureExtraction.ts) — never a raw
// DSP candidate, half/double-time candidate, or stale analysis output. See
// resolveCrate.ts's matchesCrateBpmFilter for the actual matching logic.
export type CrateBpmFilter = {
  minimum: number | null;
  maximum: number | null;
  includeUnresolved: boolean;
};

// "any" = no Group filtering at all (groupIds ignored/should be empty).
// "include"/"exclude" require at least one selected Group — enforced by
// validateCrateFilters, not by this type itself.
export type CrateGroupMode = "any" | "include" | "exclude";

// A separate, ADDITIONAL filter category from the pre-existing `groupings`
// field below — `groupings` participates in matchMode's all_groups/
// any_signal cross-signal-category OR logic (unchanged, untouched by this
// build); `groups` is unconditionally ANDed against everything else,
// regardless of matchMode (spec §7), and adds include/exclude semantics
// `groupings` never had. No dedicated Group/Collection entity exists
// anywhere in this codebase (Track.grouping is a plain optional string) —
// `groupIds` holds those same raw grouping string values, since a string is
// the only stable identifier a "Group" has today; introducing a real
// Group-ID entity model is out of this build's scope (see spec's own
// "Excluded: Automatic Group creation, Group renaming").
export type CrateGroupFilter = {
  mode: CrateGroupMode;
  groupIds: string[];
};

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
  // 0804_MUSIC_Crate_BPM_Group_Filters — both optional, following the exact
  // same "no migration needed" precedent genreFamilies established: absent
  // means the category is inactive, everywhere it's read. No separate
  // migration/backfill function exists or is needed — every consumer treats
  // `undefined` identically to the spec's own stated defaults
  // ({ minimum: null, maximum: null, includeUnresolved: true } and
  // { mode: "any", groupIds: [] }) via optional-chaining, so existing crate
  // membership is preserved exactly without a load-time migration step.
  bpm?: CrateBpmFilter;
  groups?: CrateGroupFilter;
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
