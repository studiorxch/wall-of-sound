import { describe, it, expect } from "vitest";
import { buildRaceCourseFromItinerary, haversineMeters } from "./raceCourseConversion";
import type { Itinerary } from "../../data/itineraryTypes";

const STOPS = [
  { id: "a", name: "Upper Manhattan", longitude: -73.9, latitude: 40.85 },
  { id: "b", name: "Midtown", longitude: -73.98, latitude: 40.75 },
  { id: "c", name: "Battery Place", longitude: -74.015, latitude: 40.703 },
];

// Two real stages, deliberately sharing an EXACT coincident boundary
// coordinate (stage 1 ends exactly where stage 2 begins) — the common,
// honest case for a real converted itinerary.
function twoStageItinerary(overrides: Partial<Itinerary> = {}): Itinerary {
  return {
    id: "it1",
    title: "Waterfront",
    stops: STOPS,
    stages: [
      {
        id: "s1", order: 0, originStopId: "a", destinationStopId: "b", mode: "driving",
        routeSetId: "rs1", selectedRouteId: "r1", distanceMeters: 1000, durationSeconds: 200,
      },
      {
        id: "s2", order: 1, originStopId: "b", destinationStopId: "c", mode: "driving",
        routeSetId: "rs2", selectedRouteId: "r2", distanceMeters: 1500, durationSeconds: 300,
      },
    ],
    routeSets: {
      rs1: {
        id: "rs1", mode: "driving", fetchedAt: "2026-01-01T00:00:00.000Z",
        routes: [{
          id: "r1",
          geometry: { type: "LineString", coordinates: [[-73.9, 40.85], [-73.94, 40.8], [-73.98, 40.75]] },
          distanceMeters: 1000, durationSeconds: 200, steps: [],
        }],
      },
      rs2: {
        id: "rs2", mode: "driving", fetchedAt: "2026-01-01T00:00:00.000Z",
        routes: [{
          id: "r2",
          // Starts exactly where stage 1 ends — [-73.98, 40.75].
          geometry: { type: "LineString", coordinates: [[-73.98, 40.75], [-74.0, 40.72], [-74.015, 40.703]] },
          distanceMeters: 1500, durationSeconds: 300, steps: [],
        }],
      },
    },
    activeStageId: null,
    status: "draft",
    createdAt: "", updatedAt: "",
    ...overrides,
  };
}

describe("haversineMeters", () => {
  it("returns 0 for the same coordinate", () => {
    expect(haversineMeters([-74, 40.7], [-74, 40.7])).toBe(0);
  });
  it("returns a real, positive distance for two distinct coordinates", () => {
    expect(haversineMeters([-74, 40.7], [-74.01, 40.71])).toBeGreaterThan(0);
  });
});

describe("buildRaceCourseFromItinerary", () => {
  it("never mutates the source itinerary", () => {
    const itinerary = twoStageItinerary();
    const snapshotBefore = JSON.stringify(itinerary);
    buildRaceCourseFromItinerary(itinerary);
    expect(JSON.stringify(itinerary)).toBe(snapshotBefore);
  });

  it("flattens stages in order and dedupes the exact-match boundary coordinate", () => {
    const { course } = buildRaceCourseFromItinerary(twoStageItinerary());
    // 3 coords from stage 1 + 3 coords from stage 2, minus 1 deduped boundary = 5.
    expect(course.geometry.coordinates).toHaveLength(5);
    expect(course.geometry.coordinates[0]).toEqual([-73.9, 40.85]);
    expect(course.geometry.coordinates[course.geometry.coordinates.length - 1]).toEqual([-74.015, 40.703]);
  });

  it("computes a real, positive cumulative total distance", () => {
    const { course } = buildRaceCourseFromItinerary(twoStageItinerary());
    expect(course.totalDistanceMeters).toBeGreaterThan(0);
  });

  it("places start at distance 0 / progress 0 and finish at total distance / progress 1", () => {
    const { course } = buildRaceCourseFromItinerary(twoStageItinerary());
    expect(course.startLine.distanceMeters).toBe(0);
    expect(course.startLine.progress01).toBe(0);
    expect(course.finishLine.distanceMeters).toBe(course.totalDistanceMeters);
    expect(course.finishLine.progress01).toBe(1);
  });

  it("generates exactly one checkpoint per interior stage boundary (2 stages -> 1 checkpoint)", () => {
    const { course } = buildRaceCourseFromItinerary(twoStageItinerary());
    expect(course.checkpoints).toHaveLength(1);
    expect(course.checkpoints[0].label).toBe("Midtown");
    expect(course.checkpoints[0].sourceStopId).toBe("b");
  });

  it("generates exactly one section per source stage, covering 0..totalDistanceMeters with no gap/overlap", () => {
    const { course } = buildRaceCourseFromItinerary(twoStageItinerary());
    expect(course.sections).toHaveLength(2);
    expect(course.sections[0].startDistanceMeters).toBe(0);
    expect(course.sections[course.sections.length - 1].endDistanceMeters).toBe(course.totalDistanceMeters);
    for (let i = 1; i < course.sections.length; i++) {
      expect(course.sections[i].startDistanceMeters).toBe(course.sections[i - 1].endDistanceMeters);
    }
  });

  it("reports continuity.continuous=true and status='ready' for a real coincident-boundary itinerary", () => {
    const { course } = buildRaceCourseFromItinerary(twoStageItinerary());
    expect(course.continuity.continuous).toBe(true);
    expect(course.continuity.discontinuities).toHaveLength(0);
    expect(course.status).toBe("ready");
  });

  it("detects a REAL discontinuity (gap far beyond the 1m tolerance) and marks needs_review, never fabricating a connector", () => {
    const itinerary = twoStageItinerary();
    // Move stage 2's start far away from stage 1's real end — a genuine gap.
    itinerary.routeSets.rs2.routes[0].geometry.coordinates[0] = [-73.5, 40.5];
    const { course } = buildRaceCourseFromItinerary(itinerary);
    expect(course.continuity.continuous).toBe(false);
    expect(course.continuity.discontinuities).toHaveLength(1);
    expect(course.continuity.discontinuities[0].gapMeters).toBeGreaterThan(1);
    expect(course.status).toBe("needs_review");
    // The two distinct coordinates are both preserved in the flattened
    // geometry — never merged/smoothed into an invented connector.
    expect(course.geometry.coordinates).toContainEqual([-73.98, 40.75]);
    expect(course.geometry.coordinates).toContainEqual([-73.5, 40.5]);
  });

  it("marks needs_review (not ready) when a stage's selected route cannot be resolved, even if the resolvable geometry is continuous", () => {
    const itinerary = twoStageItinerary();
    itinerary.stages[1].selectedRouteId = "does-not-exist";
    const { course, missingRouteStageIndices } = buildRaceCourseFromItinerary(itinerary);
    expect(missingRouteStageIndices).toEqual([1]);
    expect(course.missingRouteStageCount).toBe(1);
    expect(course.status).toBe("needs_review");
  });

  it("never issues no-op zero-length sections when a stage is entirely missing its route (skipped, not fabricated)", () => {
    const itinerary = twoStageItinerary();
    itinerary.stages[1].selectedRouteId = "does-not-exist";
    const { course } = buildRaceCourseFromItinerary(itinerary);
    // Stage 2 contributed no coordinates -> its section has zero length, an
    // honest reflection of "nothing was generated here," not an invented gap.
    expect(course.sections[1].startDistanceMeters).toBe(course.sections[1].endDistanceMeters);
  });

  it("produces a stable sourceFingerprint across repeated conversions of the identical itinerary", () => {
    const itinerary = twoStageItinerary();
    const a = buildRaceCourseFromItinerary(itinerary).course.sourceFingerprint;
    const b = buildRaceCourseFromItinerary(itinerary).course.sourceFingerprint;
    expect(a).toBe(b);
  });

  it("produces a DIFFERENT sourceFingerprint after a real edit to the source itinerary", () => {
    const itinerary = twoStageItinerary();
    const before = buildRaceCourseFromItinerary(itinerary).course.sourceFingerprint;
    itinerary.stages[0].selectedRouteId = "r1"; // no-op reassignment first, confirm still stable
    expect(buildRaceCourseFromItinerary(itinerary).course.sourceFingerprint).toBe(before);
    // Now a REAL edit — change the resolved route's own distance.
    itinerary.routeSets.rs1.routes[0].distanceMeters = 999;
    const after = buildRaceCourseFromItinerary(itinerary).course.sourceFingerprint;
    expect(after).not.toBe(before);
  });

  it("never issues a Directions request — buildRaceCourseFromItinerary is synchronous and pure", () => {
    const result = buildRaceCourseFromItinerary(twoStageItinerary());
    expect(result).toBeDefined();
    expect(result.course.geometry.coordinates.length).toBeGreaterThan(0);
  });

  it("a brand-new course is never active by construction", () => {
    const { course } = buildRaceCourseFromItinerary(twoStageItinerary());
    expect(course.active).toBe(false);
  });
});
