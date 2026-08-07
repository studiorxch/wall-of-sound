import { describe, it, expect } from "vitest";
import { computeRaceLaneReadiness, computeSourceCourseFingerprint } from "./raceLaneReadiness";
import { buildRaceLaneCenterline } from "./raceLaneGeneration";
import { buildStartGrid, buildFinishPlane } from "./raceLaneSampling";
import type { RaceCourse } from "../../data/raceCourseTypes";
import type { RaceLane } from "../../data/raceLaneTypes";

function readyCourse(overrides: Partial<RaceCourse> = {}): RaceCourse {
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
    ...overrides,
  };
}

function readyLane(course: RaceCourse, overrides: Partial<RaceLane> = {}): RaceLane {
  const { sampledCenterline, totalDistanceMeters } = buildRaceLaneCenterline(course, {
    method: "catmull_rom", sampleSpacingMeters: 25, tension: 0.5, cornerProtectionMeters: 8,
  });
  const laneCount = 4;
  const laneWidthMeters = 3;
  return {
    id: "lane1", name: "Test Lane",
    sourceRaceCourseId: course.id, sourceRaceCourseName: course.name,
    sourceCourseFingerprint: computeSourceCourseFingerprint(course),
    laneCount, laneWidthMeters,
    centerlineSmoothing: { method: "catmull_rom", sampleSpacingMeters: 25, tension: 0.5, cornerProtectionMeters: 8 },
    sampledCenterline, totalDistanceMeters,
    startGrid: buildStartGrid({ sampledCenterline, laneCount, laneWidthMeters }),
    finishPlane: buildFinishPlane({ sampledCenterline, laneCount, laneWidthMeters, totalDistanceMeters }),
    previewMode: "guide", surfaceClearanceMeters: 1,
    readiness: { ready: true, presentationReady: true, runtimeReady: true, reasons: [], diagnostics: {
      sourceDistanceMeters: 0, sampledDistanceMeters: 0, distanceDeltaMeters: 0, sampleCount: 0,
      meanSampleSpacingMeters: 0, maxSampleSpacingMeters: 0, laneCount, totalLaneWidthMeters: 0,
      sharpestTurnRadiusMeters: null, offsetIntersectionCount: 0,
    } },
    createdAt: 0, updatedAt: 0,
    ...overrides,
  };
}

describe("computeRaceLaneReadiness", () => {
  it("is ready for a fully well-formed lane over its real source course", () => {
    const course = readyCourse();
    const lane = readyLane(course);
    const result = computeRaceLaneReadiness(lane, course);
    expect(result.ready).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("reports missing_source_course when the source course is null", () => {
    const course = readyCourse();
    const lane = readyLane(course);
    const result = computeRaceLaneReadiness(lane, null);
    expect(result.ready).toBe(false);
    expect(result.reasons).toContain("missing_source_course");
  });

  it("reports source_course_not_ready when the source course needs review", () => {
    const course = readyCourse();
    const lane = readyLane(course);
    const result = computeRaceLaneReadiness(lane, { ...course, status: "needs_review" });
    expect(result.reasons).toContain("source_course_not_ready");
  });

  it("HARD BLOCKS on source_discontinuous — ready is false whenever the source is discontinuous", () => {
    const course = readyCourse();
    const lane = readyLane(course);
    const discontinuous = {
      ...course,
      continuity: { continuous: false, discontinuities: [{ afterStageIndex: 0, gapMeters: 300, previousEnd: [-73.98, 40.79] as [number, number], nextStart: [-73.9, 40.79] as [number, number] }] },
    };
    const result = computeRaceLaneReadiness(lane, discontinuous);
    expect(result.ready).toBe(false);
    expect(result.reasons).toContain("source_discontinuous");
  });

  it("reports source_course_changed when the course's geometric fingerprint no longer matches", () => {
    const course = readyCourse();
    const lane = readyLane(course, { sourceCourseFingerprint: "stale-fingerprint" });
    const result = computeRaceLaneReadiness(lane, course);
    expect(result.reasons).toContain("source_course_changed");
  });

  it("reports missing_centerline for an empty sampledCenterline", () => {
    const course = readyCourse();
    const lane = readyLane(course, { sampledCenterline: [] });
    const result = computeRaceLaneReadiness(lane, course);
    expect(result.reasons).toContain("missing_centerline");
  });

  it("reports too_few_samples for a single-sample centerline", () => {
    const course = readyCourse();
    const lane = readyLane(course);
    const result = computeRaceLaneReadiness({ ...lane, sampledCenterline: [lane.sampledCenterline[0]] }, course);
    expect(result.reasons).toContain("too_few_samples");
  });

  it("reports invalid_sample for a non-finite sample coordinate", () => {
    const course = readyCourse();
    const lane = readyLane(course);
    const corrupted = lane.sampledCenterline.map((s, i) => (i === 1 ? { ...s, center: [NaN, NaN] as [number, number] } : s));
    const result = computeRaceLaneReadiness({ ...lane, sampledCenterline: corrupted }, course);
    expect(result.reasons).toContain("invalid_sample");
  });

  it("reports zero_distance when totalDistanceMeters is not positive despite real samples", () => {
    const course = readyCourse();
    const lane = readyLane(course, { totalDistanceMeters: 0 });
    const result = computeRaceLaneReadiness(lane, course);
    expect(result.reasons).toContain("zero_distance");
  });

  it("reports heading_invalid for a non-finite heading", () => {
    const course = readyCourse();
    const lane = readyLane(course);
    const corrupted = lane.sampledCenterline.map((s, i) => (i === 1 ? { ...s, headingDeg: NaN } : s));
    const result = computeRaceLaneReadiness({ ...lane, sampledCenterline: corrupted }, course);
    expect(result.reasons).toContain("heading_invalid");
  });

  it("reports offset_intersection when lanes are absurdly wide relative to the curve", () => {
    const course = readyCourse();
    const lane = readyLane(course, { laneCount: 20, laneWidthMeters: 500 });
    const result = computeRaceLaneReadiness(lane, course);
    expect(result.reasons).toContain("offset_intersection");
    expect(result.diagnostics.offsetIntersectionCount).toBeGreaterThan(0);
  });

  it("REQUIRED CORRECTION: offset_intersection blocks runtimeReady but NOT presentationReady, even alongside other runtime-only reasons", () => {
    const course = readyCourse();
    const lane = readyLane(course, { laneCount: 20, laneWidthMeters: 500 });
    const result = computeRaceLaneReadiness(lane, course);
    expect(result.reasons).toContain("offset_intersection");
    // Every reason this extreme fixture triggers must be runtime-only (never
    // a presentation blocker) for presentationReady to stay true below.
    expect(result.reasons.every((r) => r === "offset_intersection" || r === "start_grid_invalid")).toBe(true);
    expect(result.presentationReady).toBe(true);
    expect(result.runtimeReady).toBe(false);
    expect(result.ready).toBe(false); // ready stays an alias of runtimeReady
  });

  it("reports start_grid_invalid for a malformed start grid", () => {
    const course = readyCourse();
    const lane = readyLane(course);
    const result = computeRaceLaneReadiness({ ...lane, startGrid: { ...lane.startGrid, slots: [] } }, course);
    expect(result.reasons).toContain("start_grid_invalid");
  });

  it("REQUIRED CORRECTION: start_grid_invalid alone blocks runtimeReady but NOT presentationReady", () => {
    const course = readyCourse();
    const lane = readyLane(course);
    const result = computeRaceLaneReadiness({ ...lane, startGrid: { ...lane.startGrid, slots: [] } }, course);
    expect(result.reasons).toEqual(["start_grid_invalid"]);
    expect(result.presentationReady).toBe(true);
    expect(result.runtimeReady).toBe(false);
  });

  it("REQUIRED CORRECTION: a genuinely broken lane (zero_distance) blocks BOTH presentationReady and runtimeReady", () => {
    const course = readyCourse();
    const lane = readyLane(course, { totalDistanceMeters: 0 });
    const result = computeRaceLaneReadiness(lane, course);
    expect(result.reasons).toContain("zero_distance");
    expect(result.presentationReady).toBe(false);
    expect(result.runtimeReady).toBe(false);
  });

  it("a fully well-formed lane is both presentationReady and runtimeReady", () => {
    const course = readyCourse();
    const lane = readyLane(course);
    const result = computeRaceLaneReadiness(lane, course);
    expect(result.presentationReady).toBe(true);
    expect(result.runtimeReady).toBe(true);
  });

  it("reports finish_plane_invalid for a zero-width finish plane", () => {
    const course = readyCourse();
    const lane = readyLane(course);
    const result = computeRaceLaneReadiness({ ...lane, finishPlane: { ...lane.finishPlane, widthMeters: 0 } }, course);
    expect(result.reasons).toContain("finish_plane_invalid");
  });

  it("accumulates every applicable reason — never short-circuits to a single generic failure", () => {
    const course = readyCourse();
    const lane = readyLane(course, { sampledCenterline: [], totalDistanceMeters: 0, sourceCourseFingerprint: "stale" });
    const notReadyCourse = { ...course, status: "needs_review" as const };
    const result = computeRaceLaneReadiness(lane, notReadyCourse);
    expect(result.reasons).toContain("source_course_not_ready");
    expect(result.reasons).toContain("source_course_changed");
    expect(result.reasons).toContain("missing_centerline");
    expect(result.reasons.length).toBeGreaterThanOrEqual(3);
  });

  it("reports honest diagnostics (source vs sampled distance, sample count/spacing)", () => {
    const course = readyCourse();
    const lane = readyLane(course);
    const result = computeRaceLaneReadiness(lane, course);
    expect(result.diagnostics.sourceDistanceMeters).toBe(course.totalDistanceMeters);
    expect(result.diagnostics.sampledDistanceMeters).toBe(lane.totalDistanceMeters);
    expect(result.diagnostics.sampleCount).toBe(lane.sampledCenterline.length);
    expect(result.diagnostics.meanSampleSpacingMeters).toBeGreaterThan(0);
  });
});
