import { describe, it, expect } from "vitest";
import { resolveCrateTracks } from "./resolveCrate";
import type { Track } from "../data/trackTypes";
import type { CrateRecord } from "../data/crateTypes";
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
