import { describe, expect, it } from "vitest";
import type { Track } from "../data/trackTypes";
import { buildFilterOptions, filterTracksByLibraryFilters, isFiltersEmpty } from "./libraryFilters";

// MUSIC P0 Clean Library Foundation — Step D. No prior test coverage
// existed for this module. Covers the new `labels` filter — deliberately
// mirrors the existing moodTags any-match pattern exactly, so these tests
// mirror what an equivalent moodTags test would assert.

function track(overrides: Partial<Track>): Track {
  return {
    trackId: "t1", title: "Track", artist: "Artist", durationSeconds: 200,
    energy: 0.5, energySource: "estimated", sourceOwner: "studiorich",
    ...overrides,
  } as Track;
}

describe("labels filter", () => {
  const tracks = [
    track({ trackId: "t1", title: "Late Drift", labels: ["Episode 2", "Strong bassline"] }),
    track({ trackId: "t2", title: "Warm Circuit", labels: ["Podcast"] }),
    track({ trackId: "t3", title: "Unlabeled Track" }),
  ];

  it("is empty by default (no filter applied)", () => {
    expect(isFiltersEmpty({})).toBe(true);
    expect(isFiltersEmpty({ labels: [] })).toBe(true);
  });

  it("is not empty once a label filter is set", () => {
    expect(isFiltersEmpty({ labels: ["Episode 2"] })).toBe(false);
  });

  it("filters to tracks with a matching label (any-match, case-insensitive)", () => {
    const result = filterTracksByLibraryFilters(tracks, { labels: ["episode 2"] });
    expect(result.map((t) => t.trackId)).toEqual(["t1"]);
  });

  it("excludes tracks with no labels", () => {
    const result = filterTracksByLibraryFilters(tracks, { labels: ["Podcast"] });
    expect(result.map((t) => t.trackId)).toEqual(["t2"]);
  });

  it("search also matches against labels", () => {
    const result = filterTracksByLibraryFilters(tracks, { search: "bassline" });
    expect(result.map((t) => t.trackId)).toEqual(["t1"]);
  });

  it("buildFilterOptions returns the unique sorted set of real labels in use", () => {
    const options = buildFilterOptions(tracks);
    expect(options.labels).toEqual(["Episode 2", "Podcast", "Strong bassline"]);
  });

  it("buildFilterOptions returns an empty labels list when no track has any", () => {
    const options = buildFilterOptions([track({ trackId: "t1" })]);
    expect(options.labels).toEqual([]);
  });
});
