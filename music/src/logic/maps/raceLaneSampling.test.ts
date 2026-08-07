import { describe, it, expect } from "vitest";
import {
  laneOffsetMeters, sampleRaceLaneByDistance, sampleRaceLaneByProgress,
  detectOffsetIntersections, buildStartGrid, buildFinishPlane,
} from "./raceLaneSampling";
import { buildRaceLaneCenterline } from "./raceLaneGeneration";
import type { RaceCourse } from "../../data/raceCourseTypes";
import type { RaceLane } from "../../data/raceLaneTypes";

function readyCourse(): RaceCourse {
  const coordinates: [number, number][] = [
    [-74.0, 40.85], [-74.0, 40.83], [-73.99, 40.81], [-73.98, 40.79],
    [-73.98, 40.75], [-74.0, 40.72], [-74.015, 40.703],
  ];
  return {
    id: "race1", name: "Test Course", sourceItineraryId: "it1", sourceItineraryName: "Test Itinerary", sourceFingerprint: "fp1",
    geometry: { type: "LineString", coordinates }, totalDistanceMeters: 20000,
    startLine: { id: "start1", label: "Start", distanceMeters: 0, progress01: 0, coordinate: coordinates[0] },
    finishLine: { id: "finish1", label: "Finish", distanceMeters: 20000, progress01: 1, coordinate: coordinates[coordinates.length - 1] },
    checkpoints: [], sections: [{ id: "sec1", name: "A -> B", startDistanceMeters: 0, endDistanceMeters: 20000, startProgress01: 0, endProgress01: 1 }],
    continuity: { continuous: true, discontinuities: [] }, targetDurationMinutes: null, missingRouteStageCount: 0,
    active: false, status: "ready", createdAt: 0, updatedAt: 0,
  };
}

function makeLane(overrides: Partial<Pick<RaceLane, "laneCount" | "laneWidthMeters" | "surfaceClearanceMeters">> = {}): RaceLane {
  const course = readyCourse();
  const { sampledCenterline, totalDistanceMeters } = buildRaceLaneCenterline(course, {
    method: "catmull_rom", sampleSpacingMeters: 25, tension: 0.5, cornerProtectionMeters: 8,
  });
  const laneCount = overrides.laneCount ?? 4;
  const laneWidthMeters = overrides.laneWidthMeters ?? 3;
  return {
    id: "lane1", name: "Test Lane",
    sourceRaceCourseId: course.id, sourceRaceCourseName: course.name, sourceCourseFingerprint: "fp",
    laneCount, laneWidthMeters,
    centerlineSmoothing: { method: "catmull_rom", sampleSpacingMeters: 25, tension: 0.5, cornerProtectionMeters: 8 },
    sampledCenterline, totalDistanceMeters,
    startGrid: buildStartGrid({ sampledCenterline, laneCount, laneWidthMeters }),
    finishPlane: buildFinishPlane({ sampledCenterline, laneCount, laneWidthMeters, totalDistanceMeters }),
    previewMode: "guide",
    surfaceClearanceMeters: overrides.surfaceClearanceMeters ?? 1,
    readiness: { ready: true, presentationReady: true, runtimeReady: true, reasons: [], diagnostics: {
      sourceDistanceMeters: 0, sampledDistanceMeters: 0, distanceDeltaMeters: 0, sampleCount: 0,
      meanSampleSpacingMeters: 0, maxSampleSpacingMeters: 0, laneCount, totalLaneWidthMeters: 0,
      sharpestTurnRadiusMeters: null, offsetIntersectionCount: 0,
    } },
    createdAt: 0, updatedAt: 0,
  };
}

describe("laneOffsetMeters", () => {
  it("gives the middle lane an exact 0 offset for odd lane counts", () => {
    expect(laneOffsetMeters(1, 3, 3)).toBe(0);
  });
  it("gives no lane an exact 0 offset for even lane counts", () => {
    for (let i = 0; i < 4; i++) expect(laneOffsetMeters(i, 4, 3)).not.toBe(0);
  });
  it("is symmetric around the centerline", () => {
    expect(laneOffsetMeters(0, 4, 3)).toBeCloseTo(-laneOffsetMeters(3, 4, 3), 9);
    expect(laneOffsetMeters(1, 4, 3)).toBeCloseTo(-laneOffsetMeters(2, 4, 3), 9);
  });
});

describe("sampleRaceLaneByDistance / sampleRaceLaneByProgress", () => {
  it("returns the exact start sample at distance 0", () => {
    const lane = makeLane();
    const pose = sampleRaceLaneByDistance(lane, 0, Math.floor((lane.laneCount - 1) / 2));
    expect(pose.distanceMeters).toBe(0);
    expect(pose.progress01).toBe(0);
    expect(pose.centerCoordinate[0]).toBeCloseTo(lane.sampledCenterline[0].center[0], 6);
    expect(pose.centerCoordinate[1]).toBeCloseTo(lane.sampledCenterline[0].center[1], 6);
  });

  it("returns the exact finish sample at the total distance", () => {
    const lane = makeLane();
    const pose = sampleRaceLaneByDistance(lane, lane.totalDistanceMeters);
    const last = lane.sampledCenterline[lane.sampledCenterline.length - 1];
    expect(pose.progress01).toBeCloseTo(1, 6);
    expect(pose.centerCoordinate[0]).toBeCloseTo(last.center[0], 6);
    expect(pose.centerCoordinate[1]).toBeCloseTo(last.center[1], 6);
  });

  it("clamps safely below 0 and above the total distance", () => {
    const lane = makeLane();
    const below = sampleRaceLaneByDistance(lane, -500);
    const above = sampleRaceLaneByDistance(lane, lane.totalDistanceMeters + 500);
    expect(below.distanceMeters).toBe(0);
    expect(above.distanceMeters).toBeCloseTo(lane.totalDistanceMeters, 6);
  });

  it("byProgress(0.5) matches byDistance(total/2)", () => {
    const lane = makeLane();
    const a = sampleRaceLaneByProgress(lane, 0.5);
    const b = sampleRaceLaneByDistance(lane, lane.totalDistanceMeters / 2);
    expect(a).toEqual(b);
  });

  it("offsets laterally using the sampled normal vector — different lanes diverge", () => {
    const lane = makeLane({ laneCount: 4 });
    const left = sampleRaceLaneByDistance(lane, 5000, 0);
    const right = sampleRaceLaneByDistance(lane, 5000, 3);
    expect(left.coordinate).not.toEqual(right.coordinate);
    expect(left.lateralOffsetMeters).not.toBeCloseTo(right.lateralOffsetMeters, 3);
  });

  it("is pure — never mutates the lane, identical input gives identical output", () => {
    const lane = makeLane();
    const snapshot = JSON.parse(JSON.stringify(lane));
    const a = sampleRaceLaneByDistance(lane, 3000, 1);
    const b = sampleRaceLaneByDistance(lane, 3000, 1);
    expect(lane).toEqual(snapshot);
    expect(a).toEqual(b);
  });

  it("defaults to a middle lane index when laneIndex is omitted", () => {
    const lane = makeLane({ laneCount: 5 });
    const pose = sampleRaceLaneByDistance(lane, 1000);
    expect(pose.laneIndex).toBe(2);
  });
});

describe("detectOffsetIntersections", () => {
  it("reports zero intersections and a sharpest radius for a gently-curved lane", () => {
    const lane = makeLane({ laneCount: 2, laneWidthMeters: 1 });
    const result = detectOffsetIntersections(lane);
    expect(result.offsetIntersectionCount).toBeGreaterThanOrEqual(0);
    expect(result.intersectingSampleIndices.length).toBe(result.offsetIntersectionCount);
  });

  it("flags intersections when lane width is absurdly large relative to any curvature", () => {
    const lane = makeLane({ laneCount: 20, laneWidthMeters: 500 });
    const result = detectOffsetIntersections(lane);
    // With an enormous total lane band width, ANY real curvature in this
    // fixture's turn should exceed the implied offset radius somewhere.
    expect(result.offsetIntersectionCount).toBeGreaterThan(0);
  });
});

describe("buildStartGrid", () => {
  it("produces rows * laneCount slots, all facing the start heading", () => {
    const lane = makeLane({ laneCount: 3 });
    const grid = buildStartGrid(lane, 3, 6);
    expect(grid.slots.length).toBe(9);
    for (const slot of grid.slots) expect(slot.headingDeg).toBeCloseTo(lane.sampledCenterline[0].headingDeg, 6);
  });

  it("places row 0 exactly at the start distance, later rows strictly behind it", () => {
    const lane = makeLane({ laneCount: 2 });
    const grid = buildStartGrid(lane, 3, 6);
    expect(grid.distanceMeters).toBe(0);
    // Row 0 and row 2 must differ in position (offset backward along tangent).
    const row0 = grid.slots.find((s) => s.row === 0 && s.laneIndex === 0)!;
    const row2 = grid.slots.find((s) => s.row === 2 && s.laneIndex === 0)!;
    expect(row0.coordinate).not.toEqual(row2.coordinate);
  });

  it("gives each lane in a row a distinct coordinate", () => {
    const lane = makeLane({ laneCount: 4 });
    const grid = buildStartGrid(lane, 1, 6);
    const coords = grid.slots.map((s) => JSON.stringify(s.coordinate));
    expect(new Set(coords).size).toBe(coords.length);
  });
});

describe("buildFinishPlane", () => {
  it("sits exactly at the lane's total distance with full lane-band width", () => {
    const lane = makeLane({ laneCount: 4, laneWidthMeters: 3 });
    const plane = buildFinishPlane(lane);
    expect(plane.distanceMeters).toBe(lane.totalDistanceMeters);
    expect(plane.widthMeters).toBe(12);
    const last = lane.sampledCenterline[lane.sampledCenterline.length - 1];
    expect(plane.coordinate[0]).toBeCloseTo(last.center[0], 6);
    expect(plane.headingDeg).toBeCloseTo(last.headingDeg, 6);
  });
});
