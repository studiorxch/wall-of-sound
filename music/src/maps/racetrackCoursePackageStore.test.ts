import { describe, it, expect } from "vitest";
import {
  compareRacetrackCoursePackagesNewestFirst,
  selectCurrentPublishedRacetrackCoursePackages,
} from "./racetrackCoursePackageStore";
import type { RacetrackCoursePackage } from "../data/racetrackCoursePackageTypes";

function makePackage(overrides: Partial<RacetrackCoursePackage> = {}): RacetrackCoursePackage {
  return {
    id: "pkg1", slug: "test", name: "Test Course", version: 1,
    sourceRaceCourseId: "race1", sourceRaceCourseFingerprint: "fp1",
    route: { type: "LineString", coordinates: [[-74, 40.7], [-74.01, 40.71]] },
    progressSamples: [], previewRoute: [],
    start: { distanceMeters: 0, coordinate: [-74, 40.7], headingDeg: 0 },
    finish: { distanceMeters: 100, coordinate: [-74.01, 40.71], headingDeg: 0 },
    checkpoints: [],
    routePresentation: { lineColor: "#ff6a3d", lineWidthPx: 3, previewMode: "guide" },
    cameraAnchors: [],
    presentationReady: true, runtimeReady: true, warnings: [],
    providerSource: "mapbox",
    createdAt: 0, publishedAt: 1000,
    ...overrides,
  };
}

describe("compareRacetrackCoursePackagesNewestFirst", () => {
  it("orders by publishedAt descending", () => {
    const older = makePackage({ id: "a", publishedAt: 1000 });
    const newer = makePackage({ id: "b", publishedAt: 2000 });
    expect(compareRacetrackCoursePackagesNewestFirst(newer, older)).toBeLessThan(0);
    expect(compareRacetrackCoursePackagesNewestFirst(older, newer)).toBeGreaterThan(0);
  });

  it("falls back to version descending when publishedAt ties", () => {
    const v1 = makePackage({ id: "a", publishedAt: 1000, version: 1 });
    const v2 = makePackage({ id: "b", publishedAt: 1000, version: 2 });
    expect(compareRacetrackCoursePackagesNewestFirst(v2, v1)).toBeLessThan(0);
    expect(compareRacetrackCoursePackagesNewestFirst(v1, v2)).toBeGreaterThan(0);
  });

  it("falls back to id ascending as the final decisive tiebreak", () => {
    const a = makePackage({ id: "a", publishedAt: 1000, version: 1 });
    const b = makePackage({ id: "b", publishedAt: 1000, version: 1 });
    expect(compareRacetrackCoursePackagesNewestFirst(a, b)).toBeLessThan(0);
    expect(compareRacetrackCoursePackagesNewestFirst(b, a)).toBeGreaterThan(0);
    expect(compareRacetrackCoursePackagesNewestFirst(a, a)).toBe(0);
  });
});

describe("selectCurrentPublishedRacetrackCoursePackages", () => {
  it("returns [] for empty input", () => {
    expect(selectCurrentPublishedRacetrackCoursePackages([])).toEqual([]);
  });

  it("excludes packages with publishedAt: null", () => {
    const unpublished = makePackage({ id: "a", publishedAt: null });
    expect(selectCurrentPublishedRacetrackCoursePackages([unpublished])).toEqual([]);
  });

  it("collapses multiple versions of the same sourceRaceCourseId to exactly one entry, chosen by the canonical comparator", () => {
    const v1 = makePackage({ id: "a", sourceRaceCourseId: "race1", publishedAt: 1000, version: 1 });
    const v2 = makePackage({ id: "b", sourceRaceCourseId: "race1", publishedAt: 2000, version: 2 });
    const v3 = makePackage({ id: "c", sourceRaceCourseId: "race1", publishedAt: 1500, version: 3 });
    const result = selectCurrentPublishedRacetrackCoursePackages([v1, v2, v3]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("b"); // newest publishedAt wins, not raw array order or highest version
  });

  it("shows different sourceRaceCourseIds each once, at their own current version, sorted newest-course-first", () => {
    const broadwayOld = makePackage({ id: "bw1", sourceRaceCourseId: "broadway", publishedAt: 1000, version: 1 });
    const broadwayNew = makePackage({ id: "bw2", sourceRaceCourseId: "broadway", publishedAt: 3000, version: 2 });
    const meridian = makePackage({ id: "mc1", sourceRaceCourseId: "meridian", publishedAt: 2000, version: 1 });
    const result = selectCurrentPublishedRacetrackCoursePackages([broadwayOld, meridian, broadwayNew]);
    expect(result.map((p) => p.id)).toEqual(["bw2", "mc1"]); // broadwayNew (3000) before meridian (2000)
  });

  it("does not mutate the input array", () => {
    const v1 = makePackage({ id: "a", publishedAt: 1000 });
    const v2 = makePackage({ id: "b", publishedAt: 2000 });
    const input = [v1, v2];
    const inputCopy = input.slice();
    selectCurrentPublishedRacetrackCoursePackages(input);
    expect(input).toEqual(inputCopy);
  });
});
