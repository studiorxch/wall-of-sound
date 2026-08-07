import type { Track } from "../data/trackTypes";
import type { CrateRecord, CrateFilters, CrateBpmFilter, CrateGroupFilter } from "../data/crateTypes";
import { resolveAuthoritativeBpm } from "./dspFeatureExtraction";

export type ResolvedCrate = {
  tracks: Track[];
  totalDurationSeconds: number;
  countByCat: number;
  countByExt: number;
  // 0804_MUSIC_Crate_BPM_Group_Filters §10 — the count of tracks that passed
  // every safety/search/rating gate AND the pre-existing mood/grouping/
  // genre/genreFamily signal filters, but were excluded specifically by the
  // NEW bpm/groups filters. Lets a caller (playlistShapeBuilder.ts) report
  // "outside_assigned_crate" distinctly from an unexplained rejection,
  // rather than the two being indistinguishable.
  excludedByBpmOrGroupFilters: number;
};

// 0804_MUSIC_Crate_BPM_Group_Filters §5/§8 — matches ONLY against the one
// authoritative BPM selector, never a raw/half/double-time DSP candidate or
// stale analysis output. No bounds set = filter inactive (everything
// passes, unresolved included regardless of includeUnresolved).
export function matchesCrateBpmFilter(track: Track, filter: CrateBpmFilter | undefined): boolean {
  if (!filter) return true;
  const { minimum, maximum, includeUnresolved } = filter;
  if (minimum == null && maximum == null) return true;
  const bpm = resolveAuthoritativeBpm(track);
  if (bpm == null) return includeUnresolved;
  if (minimum != null && bpm < minimum) return false;
  if (maximum != null && bpm > maximum) return false;
  return true;
}

// §6/§8. "any" (or an empty groupIds list, defensively — see §12 "malformed
// imported filters must normalize safely") never excludes anyone; the UI's
// validateCrateFilters is the separate gate that prevents SAVING an
// include/exclude mode with zero selected Groups in the first place — this
// pure matcher stays safe even if it's ever handed that state anyway (e.g.
// a malformed import).
export function matchesCrateGroupFilter(track: Track, filter: CrateGroupFilter | undefined): boolean {
  if (!filter || filter.mode === "any" || filter.groupIds.length === 0) return true;
  const trackGroup = typeof track.grouping === "string" ? track.grouping
    : Array.isArray(track.grouping) ? (track.grouping as string[])[0]
    : undefined;
  const inSelected = trackGroup != null && filter.groupIds.includes(trackGroup);
  return filter.mode === "include" ? inSelected : !inSelected;
}

// §8 "matchesCrateFilters must compose existing filters with the new
// filters through explicit AND logic." This composes ONLY the two new
// categories (bpm/groups) — the pre-existing mood/grouping/genre/
// genreFamily/matchMode logic lives inside resolveCrateTracks below,
// unchanged, since refactoring that pre-existing, already-tested logic into
// this same pure-per-category shape is not something this build's scope
// calls for.
export function matchesCrateFilters(track: Track, filters: CrateFilters): boolean {
  return matchesCrateBpmFilter(track, filters.bpm) && matchesCrateGroupFilter(track, filters.groups);
}

export type CrateFilterValidationResult = {
  valid: boolean;
  errors: string[];
};

// §5/§6 validation — "Prevent minimum > maximum" / "Show an inline
// validation error and prevent Save until corrected" / Include-or-Exclude
// mode with zero selected Groups must also block Save.
export function validateCrateFilters(filters: CrateFilters): CrateFilterValidationResult {
  const errors: string[] = [];
  const bpm = filters.bpm;
  if (bpm) {
    if (bpm.minimum != null && (!Number.isFinite(bpm.minimum) || bpm.minimum <= 0)) {
      errors.push("Minimum BPM must be a positive number.");
    }
    if (bpm.maximum != null && (!Number.isFinite(bpm.maximum) || bpm.maximum <= 0)) {
      errors.push("Maximum BPM must be a positive number.");
    }
    if (bpm.minimum != null && bpm.maximum != null && bpm.minimum > bpm.maximum) {
      errors.push("Minimum BPM cannot be greater than maximum BPM.");
    }
  }
  const groups = filters.groups;
  if (groups && groups.mode !== "any" && groups.groupIds.length === 0) {
    errors.push(`Group ${groups.mode} mode requires at least one selected Group.`);
  }
  return { valid: errors.length === 0, errors };
}

export function resolveCrateTracks(crate: CrateRecord, libraryTracks: Track[]): ResolvedCrate {
  const { sourceOwners, filters } = crate;
  const {
    search,
    moodTags,
    groupings,
    genres,
    genreFamilies,
    minRating,
    playableOnly,
    matchMode,
  } = filters;

  const searchLow = search?.toLowerCase().trim() ?? "";
  const hasFamilyFilter = (genreFamilies?.length ?? 0) > 0;
  const hasSignalFilters = moodTags.length > 0 || groupings.length > 0 || genres.length > 0 || hasFamilyFilter;

  let excludedByBpmOrGroupFilters = 0;

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

    const passesSignalFilters = (): boolean => {
      if (!hasSignalFilters) return true;
      const trackMoods = (t.moodTags ?? []).map((m) => m.toLowerCase());
      const trackGenres = [...(t.genres ?? []), ...(t.genre ? t.genre.split(",").map((g) => g.trim()) : [])];
      // 0728G_MUSIC_Fast_Breaks_Identification — only a CONFIRMED classification
      // counts as real filter data; a merely "suggested" candidate is never
      // trusted here, same doctrine as everywhere else this build touches.
      const trackFamily = t.genreClassification?.reviewStatus === "confirmed" ? t.genreClassification.primaryGenreFamily : null;

      if (matchMode === "all_groups") {
        if (moodTags.length && !moodTags.some((m) => trackMoods.includes(m.toLowerCase()))) return false;
        if (groupings.length && !groupings.includes(t.grouping ?? "")) return false;
        if (genres.length && !genres.some((g) => trackGenres.includes(g))) return false;
        if (genreFamilies?.length && !(trackFamily && genreFamilies.includes(trackFamily))) return false;
        return true;
      } else {
        // any_signal: match any selected value across all signal categories
        const moodHit = moodTags.length > 0 && moodTags.some((m) => trackMoods.includes(m.toLowerCase()));
        const groupHit = groupings.length > 0 && groupings.includes(t.grouping ?? "");
        const genreHit = genres.length > 0 && genres.some((g) => trackGenres.includes(g));
        const familyHit = (genreFamilies?.length ?? 0) > 0 && !!trackFamily && genreFamilies!.includes(trackFamily);
        return moodHit || groupHit || genreHit || familyHit;
      }
    };

    if (!passesSignalFilters()) return false;

    // 0804_MUSIC_Crate_BPM_Group_Filters §7 — BPM/Group are unconditionally
    // ANDed against everything else, regardless of matchMode (which only
    // governs how moodTags/groupings/genres/genreFamilies combine with each
    // other). Counted separately so playlistShapeBuilder.ts can report
    // "outside_assigned_crate" distinctly from an unexplained rejection.
    if (!matchesCrateFilters(t, filters)) {
      excludedByBpmOrGroupFilters++;
      return false;
    }
    return true;
  });

  const totalDurationSeconds = tracks.reduce((sum, t) => sum + (t.durationSeconds ?? 0), 0);
  const countByCat = tracks.filter((t) => t.sourceOwner === "studiorich").length;
  const countByExt = tracks.filter((t) => t.sourceOwner === "external").length;

  return { tracks, totalDurationSeconds, countByCat, countByExt, excludedByBpmOrGroupFilters };
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

// 0804_MUSIC_Crate_BPM_Group_Filters §9 "Preview" — staged deltas ("205
// total · 58 pass BPM · 42 pass BPM + Group"), computed from current
// library state, no Save required. Built by calling resolveCrateTracks
// itself (once with bpm/groups stripped, for the "existing filters" stage
// baseline; the bpm/groups matchers are then layered on top via the exact
// same pure functions resolveCrateTracks uses internally) — this can never
// disagree with the crate's real final membership, since it's the same
// composition, not a second hand-rolled filter pass (the pre-existing
// divergence between CrateDetail.tsx's own local preview logic and this
// function is exactly what this build's UI wiring removes — see
// CrateDetail.tsx).
export type CrateFilterPreview = {
  /** Passes every pre-existing filter category (source/playable/rating/search/mood/grouping/genre/genreFamily) — the baseline before BPM/Group. */
  totalConsidered: number;
  /** Additionally passes the BPM filter. */
  passBpm: number;
  /** Additionally passes the Group filter too — identical to resolveCrateTracks(crate, libraryTracks).tracks.length. */
  passBpmAndGroup: number;
};

export function computeCrateFilterPreview(crate: CrateRecord, libraryTracks: Track[]): CrateFilterPreview {
  const existingFiltersOnly: CrateRecord = { ...crate, filters: { ...crate.filters, bpm: undefined, groups: undefined } };
  const baseline = resolveCrateTracks(existingFiltersOnly, libraryTracks).tracks;
  const passBpm = baseline.filter((t) => matchesCrateBpmFilter(t, crate.filters.bpm));
  const passBpmAndGroup = passBpm.filter((t) => matchesCrateGroupFilter(t, crate.filters.groups));
  return { totalConsidered: baseline.length, passBpm: passBpm.length, passBpmAndGroup: passBpmAndGroup.length };
}
