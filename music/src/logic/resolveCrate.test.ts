import { describe, it, expect } from "vitest";
import { resolveCrateTracks, matchesCrateBpmFilter, matchesCrateGroupFilter, matchesCrateFilters, validateCrateFilters, computeCrateFilterPreview } from "./resolveCrate";
import type { Track } from "../data/trackTypes";
import type { CrateRecord, CrateBpmFilter, CrateGroupFilter } from "../data/crateTypes";
import { defaultCrateFilters } from "../data/crateTypes";

function track(overrides: Partial<Track> & { trackId: string }): Track {
  return {
    title: "T", artist: "A", durationSeconds: 100, energy: 0.5, energySource: "manual",
    sourceOwner: "studiorich",
    ...overrides,
  } as Track;
}

function crate(overrides: Partial<CrateRecord> & { id: string }): CrateRecord {
  return {
    name: "Crate", createdAt: "2026-07-28T00:00:00.000Z", updatedAt: "2026-07-28T00:00:00.000Z",
    sourceOwners: ["studiorich", "external"], filters: defaultCrateFilters(),
    ...overrides,
  } as CrateRecord;
}

describe("resolveCrateTracks — genreFamilies filter (0728G)", () => {
  it("matches a track whose genre family is CONFIRMED as fast_breaks", () => {
    const t = track({
      trackId: "t1",
      genreClassification: { primaryGenreFamily: "fast_breaks", detailedGenres: [], blendTraits: [], source: "manual", confidence: 1, reason: null, reviewedAt: null, reviewStatus: "confirmed" },
    });
    const c = crate({ id: "c1", filters: { ...defaultCrateFilters(), genreFamilies: ["fast_breaks"] } });
    expect(resolveCrateTracks(c, [t]).tracks.map((x) => x.trackId)).toEqual(["t1"]);
  });

  it("does NOT match a track whose genre family is merely SUGGESTED, not confirmed — never trusted as real filter data", () => {
    const t = track({
      trackId: "t1",
      genreClassification: { primaryGenreFamily: "fast_breaks", detailedGenres: [], blendTraits: [], source: "derived", confidence: 0.8, reason: "x", reviewedAt: null, reviewStatus: "suggested" },
    });
    const c = crate({ id: "c1", filters: { ...defaultCrateFilters(), genreFamilies: ["fast_breaks"] } });
    expect(resolveCrateTracks(c, [t]).tracks).toEqual([]);
  });

  it("required safeguard (§10): an Ambient-mood track confirmed as fast_breaks is NOT treated as ambient-family-compatible", () => {
    const t = track({
      trackId: "t1", moodTags: ["Ambient"],
      genreClassification: { primaryGenreFamily: "fast_breaks", detailedGenres: ["Atmospheric Jungle"], blendTraits: [], source: "manual", confidence: 1, reason: null, reviewedAt: null, reviewStatus: "confirmed" },
    });
    const ambientFamilyCrate = crate({ id: "c1", filters: { ...defaultCrateFilters(), genreFamilies: ["ambient"] } });
    expect(resolveCrateTracks(ambientFamilyCrate, [t]).tracks).toEqual([]);

    // ...but a plain mood-based ambient crate is untouched by this build — still matches on mood alone, unchanged.
    const ambientMoodCrate = crate({ id: "c2", filters: { ...defaultCrateFilters(), moodTags: ["Ambient"] } });
    expect(resolveCrateTracks(ambientMoodCrate, [t]).tracks.map((x) => x.trackId)).toEqual(["t1"]);
  });

  it("a crate with no genreFamilies filter is completely unaffected by this build (backward compatible)", () => {
    const t = track({ trackId: "t1", moodTags: ["Chill"] });
    const c = crate({ id: "c1", filters: { ...defaultCrateFilters(), moodTags: ["Chill"] } });
    expect(resolveCrateTracks(c, [t]).tracks.map((x) => x.trackId)).toEqual(["t1"]);
  });
});

// 0804_MUSIC_Crate_BPM_Group_Filters — §13 required tests, numbered in each
// test name where applicable.
describe("matchesCrateBpmFilter (0804H)", () => {
  it("[test 1] a crate with no bpm field set (undefined) preserves membership exactly — no migration needed", () => {
    const t = track({ trackId: "t1", bpm: 200, bpmSource: "manual" }); // would fail a 100-150 range if active
    const c = crate({ id: "c1", filters: { ...defaultCrateFilters() } }); // filters.bpm intentionally absent
    expect(resolveCrateTracks(c, [t]).tracks.map((x) => x.trackId)).toEqual(["t1"]);
  });

  it("[test 2] empty bounds (both null) apply no BPM filtering at all", () => {
    const filter: CrateBpmFilter = { minimum: null, maximum: null, includeUnresolved: true };
    expect(matchesCrateBpmFilter(track({ trackId: "t1", bpm: 999 }), filter)).toBe(true);
    expect(matchesCrateBpmFilter(track({ trackId: "t2" }), filter)).toBe(true); // unresolved too
  });

  it("[test 3] minimum-only filter is inclusive at the boundary", () => {
    const filter: CrateBpmFilter = { minimum: 118, maximum: null, includeUnresolved: true };
    expect(matchesCrateBpmFilter(track({ trackId: "t1", bpm: 118 }), filter)).toBe(true); // exactly at bound
    expect(matchesCrateBpmFilter(track({ trackId: "t2", bpm: 117.99 }), filter)).toBe(false);
    expect(matchesCrateBpmFilter(track({ trackId: "t3", bpm: 200 }), filter)).toBe(true);
  });

  it("[test 4] maximum-only filter is inclusive at the boundary", () => {
    const filter: CrateBpmFilter = { minimum: null, maximum: 132, includeUnresolved: true };
    expect(matchesCrateBpmFilter(track({ trackId: "t1", bpm: 132 }), filter)).toBe(true); // exactly at bound
    expect(matchesCrateBpmFilter(track({ trackId: "t2", bpm: 132.01 }), filter)).toBe(false);
    expect(matchesCrateBpmFilter(track({ trackId: "t3", bpm: 60 }), filter)).toBe(true);
  });

  it("[test 5] a two-sided range is inclusive on both ends", () => {
    const filter: CrateBpmFilter = { minimum: 118, maximum: 132, includeUnresolved: true };
    expect(matchesCrateBpmFilter(track({ trackId: "t1", bpm: 118 }), filter)).toBe(true);
    expect(matchesCrateBpmFilter(track({ trackId: "t2", bpm: 132 }), filter)).toBe(true);
    expect(matchesCrateBpmFilter(track({ trackId: "t3", bpm: 125 }), filter)).toBe(true);
    expect(matchesCrateBpmFilter(track({ trackId: "t4", bpm: 117.9 }), filter)).toBe(false);
    expect(matchesCrateBpmFilter(track({ trackId: "t5", bpm: 132.1 }), filter)).toBe(false);
  });

  it("[test 6] unresolved BPM passes when includeUnresolved is true and a range is active", () => {
    const filter: CrateBpmFilter = { minimum: 118, maximum: 132, includeUnresolved: true };
    expect(matchesCrateBpmFilter(track({ trackId: "t1" }), filter)).toBe(true); // no bpm at all
  });

  it("[test 7] unresolved BPM fails when includeUnresolved is false and a range is active", () => {
    const filter: CrateBpmFilter = { minimum: 118, maximum: 132, includeUnresolved: false };
    expect(matchesCrateBpmFilter(track({ trackId: "t1" }), filter)).toBe(false);
  });

  it("[test 8] unresolved BPM always passes when no bounds are active, regardless of includeUnresolved", () => {
    const filter: CrateBpmFilter = { minimum: null, maximum: null, includeUnresolved: false };
    expect(matchesCrateBpmFilter(track({ trackId: "t1" }), filter)).toBe(true);
  });

  it("[test 9] a raw DSP candidate does not satisfy the filter without an authoritative (accepted/resolved) BPM", () => {
    const filter: CrateBpmFilter = { minimum: 118, maximum: 132, includeUnresolved: false };
    const t = track({
      trackId: "t1", bpm: undefined,
      audioAnalysis: { bpmCandidate: 125 } as Track["audioAnalysis"], // sits in the 118-132 range, but never accepted
    });
    expect(matchesCrateBpmFilter(t, filter)).toBe(false); // resolveAuthoritativeBpm(t) is null — treated as unresolved
  });

  it("only matches through resolveAuthoritativeBpm — an accepted (bpmSource:manual) value in-range passes", () => {
    const filter: CrateBpmFilter = { minimum: 118, maximum: 132, includeUnresolved: false };
    const t = track({ trackId: "t1", bpm: 125, bpmSource: "manual" });
    expect(matchesCrateBpmFilter(t, filter)).toBe(true);
  });
});

describe("matchesCrateGroupFilter (0804H)", () => {
  it("[test 10] mode 'any' applies no Group filtering, regardless of groupIds", () => {
    const filter: CrateGroupFilter = { mode: "any", groupIds: ["Collection 02 - House"] };
    expect(matchesCrateGroupFilter(track({ trackId: "t1", grouping: "Some Other Group" }), filter)).toBe(true);
  });

  it("[test 11] Include mode matches when the track belongs to ANY selected Group (OR)", () => {
    const filter: CrateGroupFilter = { mode: "include", groupIds: ["Group A", "Group B"] };
    expect(matchesCrateGroupFilter(track({ trackId: "t1", grouping: "Group B" }), filter)).toBe(true);
    expect(matchesCrateGroupFilter(track({ trackId: "t2", grouping: "Group C" }), filter)).toBe(false);
  });

  it("[test 12] Exclude mode rejects a track belonging to ANY selected Group (NOT ... AND NOT ...)", () => {
    const filter: CrateGroupFilter = { mode: "exclude", groupIds: ["Group A", "Group B"] };
    expect(matchesCrateGroupFilter(track({ trackId: "t1", grouping: "Group A" }), filter)).toBe(false);
    expect(matchesCrateGroupFilter(track({ trackId: "t2", grouping: "Group B" }), filter)).toBe(false);
    expect(matchesCrateGroupFilter(track({ trackId: "t3", grouping: "Group C" }), filter)).toBe(true);
  });

  it("[test 16] an unrecognized/deleted Group ID never crashes evaluation — just never matches", () => {
    const filter: CrateGroupFilter = { mode: "include", groupIds: ["deleted-group-id-xyz"] };
    expect(() => matchesCrateGroupFilter(track({ trackId: "t1", grouping: "Real Group" }), filter)).not.toThrow();
    expect(matchesCrateGroupFilter(track({ trackId: "t1", grouping: "Real Group" }), filter)).toBe(false);
  });

  it("defensively treats an empty groupIds list as no-op-safe (never hard-excludes), even for include/exclude — validateCrateFilters is the separate Save-blocking gate", () => {
    expect(matchesCrateGroupFilter(track({ trackId: "t1" }), { mode: "include", groupIds: [] })).toBe(true);
    expect(matchesCrateGroupFilter(track({ trackId: "t1" }), { mode: "exclude", groupIds: [] })).toBe(true);
  });
});

describe("validateCrateFilters (0804H)", () => {
  it("[test 13] Include mode with zero selected Groups is invalid", () => {
    const result = validateCrateFilters({ ...defaultCrateFilters(), groups: { mode: "include", groupIds: [] } });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /include/i.test(e))).toBe(true);
  });

  it("[test 14] Exclude mode with zero selected Groups is invalid", () => {
    const result = validateCrateFilters({ ...defaultCrateFilters(), groups: { mode: "exclude", groupIds: [] } });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /exclude/i.test(e))).toBe(true);
  });

  it("'Any' mode with an empty list is always valid", () => {
    const result = validateCrateFilters({ ...defaultCrateFilters(), groups: { mode: "any", groupIds: [] } });
    expect(result.valid).toBe(true);
  });

  it("minimum > maximum is invalid", () => {
    const result = validateCrateFilters({ ...defaultCrateFilters(), bpm: { minimum: 140, maximum: 120, includeUnresolved: true } });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => /minimum.*maximum/i.test(e))).toBe(true);
  });

  it("non-positive or non-finite bounds are invalid", () => {
    expect(validateCrateFilters({ ...defaultCrateFilters(), bpm: { minimum: 0, maximum: null, includeUnresolved: true } }).valid).toBe(false);
    expect(validateCrateFilters({ ...defaultCrateFilters(), bpm: { minimum: -5, maximum: null, includeUnresolved: true } }).valid).toBe(false);
    expect(validateCrateFilters({ ...defaultCrateFilters(), bpm: { minimum: Infinity, maximum: null, includeUnresolved: true } }).valid).toBe(false);
  });

  it("a valid two-sided range and a valid include selection both pass", () => {
    const result = validateCrateFilters({
      ...defaultCrateFilters(),
      bpm: { minimum: 118, maximum: 132, includeUnresolved: true },
      groups: { mode: "include", groupIds: ["Collection 02 - House"] },
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe("matchesCrateFilters — cross-category AND (0804H)", () => {
  it("[test 15] BPM and Group both must pass — AND, not OR", () => {
    const filters = {
      ...defaultCrateFilters(),
      bpm: { minimum: 118, maximum: 132, includeUnresolved: false },
      groups: { mode: "include" as const, groupIds: ["Collection 02 - House"] },
    };
    const bothPass = track({ trackId: "t1", bpm: 125, bpmSource: "manual", grouping: "Collection 02 - House" });
    const onlyBpm = track({ trackId: "t2", bpm: 125, bpmSource: "manual", grouping: "Something Else" });
    const onlyGroup = track({ trackId: "t3", bpm: 200, bpmSource: "manual", grouping: "Collection 02 - House" });
    const neither = track({ trackId: "t4", bpm: 200, bpmSource: "manual", grouping: "Something Else" });

    expect(matchesCrateFilters(bothPass, filters)).toBe(true);
    expect(matchesCrateFilters(onlyBpm, filters)).toBe(false);
    expect(matchesCrateFilters(onlyGroup, filters)).toBe(false);
    expect(matchesCrateFilters(neither, filters)).toBe(false);
  });

  it("BPM/Group are unconditionally ANDed regardless of matchMode — an any_signal crate still requires both", () => {
    const c = crate({
      id: "c1",
      filters: {
        ...defaultCrateFilters(),
        matchMode: "any_signal",
        moodTags: ["Chill"], // present, but irrelevant to this track
        bpm: { minimum: 118, maximum: 132, includeUnresolved: false },
        groups: { mode: "include", groupIds: ["Collection 02 - House"] },
      },
    });
    // Would match under any_signal on nothing (no mood match), but must still fail BPM/Group's unconditional AND.
    const t = track({ trackId: "t1", bpm: 200, bpmSource: "manual", grouping: "Something Else", moodTags: [] });
    expect(resolveCrateTracks(c, [t]).tracks).toEqual([]);
  });
});

describe("resolveCrateTracks — excludedByBpmOrGroupFilters diagnostic count (0804H §10)", () => {
  it("counts tracks that pass every other gate but fail BPM/Group specifically, for the outside_assigned_crate signal", () => {
    const c = crate({
      id: "c1",
      filters: { ...defaultCrateFilters(), bpm: { minimum: 118, maximum: 132, includeUnresolved: false } },
    });
    const passes = track({ trackId: "t1", bpm: 125, bpmSource: "manual" });
    const failsBpmOnly = track({ trackId: "t2", bpm: 200, bpmSource: "manual" });
    const result = resolveCrateTracks(c, [passes, failsBpmOnly]);
    expect(result.tracks.map((t) => t.trackId)).toEqual(["t1"]);
    expect(result.excludedByBpmOrGroupFilters).toBe(1);
  });

  it("does not count a track excluded by an unrelated gate (e.g. rating) as excludedByBpmOrGroupFilters", () => {
    const c = crate({
      id: "c1",
      filters: { ...defaultCrateFilters(), minRating: 4, bpm: { minimum: 118, maximum: 132, includeUnresolved: true } },
    });
    const t = track({ trackId: "t1", bpm: 125, bpmSource: "manual", rating: 2 }); // fails rating, never reaches bpm check
    const result = resolveCrateTracks(c, [t]);
    expect(result.tracks).toEqual([]);
    expect(result.excludedByBpmOrGroupFilters).toBe(0);
  });
});

describe("computeCrateFilterPreview (0804H §9, test 17)", () => {
  it("[test 17] staged deltas reflect current library state without needing Save — totalConsidered / passBpm / passBpmAndGroup", () => {
    const c = crate({
      id: "c1",
      filters: {
        ...defaultCrateFilters(),
        bpm: { minimum: 118, maximum: 132, includeUnresolved: false },
        groups: { mode: "include", groupIds: ["House"] },
      },
    });
    const tracks = [
      track({ trackId: "t1", bpm: 125, bpmSource: "manual", grouping: "House" }), // passes both
      track({ trackId: "t2", bpm: 125, bpmSource: "manual", grouping: "Techno" }), // passes bpm only
      track({ trackId: "t3", bpm: 200, bpmSource: "manual", grouping: "House" }), // fails bpm
    ];
    const preview = computeCrateFilterPreview(c, tracks);
    expect(preview.totalConsidered).toBe(3);
    expect(preview.passBpm).toBe(2);
    expect(preview.passBpmAndGroup).toBe(1);
    // Must never disagree with the real final membership.
    expect(resolveCrateTracks(c, tracks).tracks.length).toBe(preview.passBpmAndGroup);
  });

  it("preview counts update live from current library state — a bpm change on the same track object is reflected on the next call, no caching", () => {
    const c = crate({ id: "c1", filters: { ...defaultCrateFilters(), bpm: { minimum: 118, maximum: 132, includeUnresolved: false } } });
    const t = track({ trackId: "t1", bpm: 200, bpmSource: "manual" });
    expect(computeCrateFilterPreview(c, [t]).passBpm).toBe(0);
    // [test 20] simulates an accepted BPM change updating crate membership immediately.
    const updated = { ...t, bpm: 125 };
    expect(computeCrateFilterPreview(c, [updated]).passBpm).toBe(1);
  });
});

describe("Accepted BPM changes update crate membership (0804H, test 20)", () => {
  it("resolveCrateTracks reflects a track's current bpm/bpmSource on every call — no stale caching", () => {
    const c = crate({ id: "c1", filters: { ...defaultCrateFilters(), bpm: { minimum: 118, maximum: 132, includeUnresolved: false } } });
    const before = track({ trackId: "t1", bpm: undefined });
    expect(resolveCrateTracks(c, [before]).tracks).toEqual([]);
    const afterAccept = track({ trackId: "t1", bpm: 125, bpmSource: "manual" }); // simulates the BPM Authority Repair accept flow
    expect(resolveCrateTracks(c, [afterAccept]).tracks.map((t) => t.trackId)).toEqual(["t1"]);
  });
});

describe("Export/import round-trip preserves new filter fields (0804H, test 19)", () => {
  it("a plain JSON round-trip (matching how PlayProject/crates are actually serialized) preserves bpm and groups filters exactly", () => {
    const c = crate({
      id: "c1",
      filters: {
        ...defaultCrateFilters(),
        bpm: { minimum: 118, maximum: 132, includeUnresolved: false },
        groups: { mode: "exclude", groupIds: ["Group A", "Group B"] },
      },
    });
    const roundTripped = JSON.parse(JSON.stringify(c)) as CrateRecord;
    expect(roundTripped.filters.bpm).toEqual(c.filters.bpm);
    expect(roundTripped.filters.groups).toEqual(c.filters.groups);
  });

  it("a crate with no bpm/groups fields round-trips with them still absent (no fabricated defaults)", () => {
    const c = crate({ id: "c1" });
    const roundTripped = JSON.parse(JSON.stringify(c)) as CrateRecord;
    expect(roundTripped.filters.bpm).toBeUndefined();
    expect(roundTripped.filters.groups).toBeUndefined();
  });
});
