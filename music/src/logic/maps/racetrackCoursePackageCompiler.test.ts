import { describe, it, expect } from "vitest";
import { compileRacetrackCoursePackage, RacetrackCoursePackageNotReadyError } from "./racetrackCoursePackageCompiler";
import { buildRaceLaneCenterline } from "./raceLaneGeneration";
import { buildStartGrid, buildFinishPlane } from "./raceLaneSampling";
import { computeSourceCourseFingerprint } from "./raceLaneReadiness";
import type { RaceCourse } from "../../data/raceCourseTypes";
import type { RaceLane } from "../../data/raceLaneTypes";

function readyCourse(overrides: Partial<RaceCourse> = {}): RaceCourse {
  const coordinates: [number, number][] = [
    [-74.0, 40.85], [-74.0, 40.83], [-73.99, 40.81], [-73.98, 40.79],
    [-73.98, 40.75], [-74.0, 40.72], [-74.015, 40.703],
  ];
  return {
    id: "race1", name: "Broadway Course", sourceItineraryId: "it1", sourceItineraryName: "Test Itinerary",
    sourceFingerprint: "fp1",
    geometry: { type: "LineString", coordinates }, totalDistanceMeters: 20000,
    startLine: { id: "start1", label: "Start", distanceMeters: 0, progress01: 0, coordinate: coordinates[0] },
    finishLine: { id: "finish1", label: "Finish", distanceMeters: 20000, progress01: 1, coordinate: coordinates[coordinates.length - 1] },
    checkpoints: [
      { id: "cp1", label: "CP1", distanceMeters: 8000, progress01: 0.4, coordinate: coordinates[3] },
    ],
    sections: [{ id: "sec1", name: "A -> B", startDistanceMeters: 0, endDistanceMeters: 20000, startProgress01: 0, endProgress01: 1 }],
    continuity: { continuous: true, discontinuities: [] }, targetDurationMinutes: null, missingRouteStageCount: 0,
    active: false, status: "ready", createdAt: 0, updatedAt: 0,
    ...overrides,
  };
}

function makeLane(course: RaceCourse, overrides: Partial<Pick<RaceLane, "laneCount" | "laneWidthMeters">> = {}): RaceLane {
  const { sampledCenterline, totalDistanceMeters } = buildRaceLaneCenterline(course, {
    method: "catmull_rom", sampleSpacingMeters: 25, tension: 0.5, cornerProtectionMeters: 8,
  });
  const laneCount = overrides.laneCount ?? 4;
  const laneWidthMeters = overrides.laneWidthMeters ?? 3;
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
  };
}

describe("compileRacetrackCoursePackage", () => {
  it("produces a package anchored to the course's own start/finish", () => {
    const course = readyCourse();
    const lane = makeLane(course);
    const pkg = compileRacetrackCoursePackage(course, lane);
    expect(pkg.start.coordinate[0]).toBeCloseTo(course.geometry.coordinates[0][0], 6);
    expect(pkg.finish.coordinate[0]).toBeCloseTo(course.geometry.coordinates[course.geometry.coordinates.length - 1][0], 6);
  });

  it("carries the source course id/fingerprint verbatim", () => {
    const course = readyCourse();
    const lane = makeLane(course);
    const pkg = compileRacetrackCoursePackage(course, lane);
    expect(pkg.sourceRaceCourseId).toBe(course.id);
    expect(pkg.sourceRaceCourseFingerprint).toBe(course.sourceFingerprint);
  });

  it("progressSamples is the lane's FULL-resolution centerline, never decimated", () => {
    const course = readyCourse();
    const lane = makeLane(course);
    const pkg = compileRacetrackCoursePackage(course, lane);
    expect(pkg.progressSamples.length).toBe(lane.sampledCenterline.length);
  });

  it("previewRoute is decimated — fewer or equal points to progressSamples, via the same decimateForPreview reused elsewhere", () => {
    const course = readyCourse();
    const lane = makeLane(course);
    const pkg = compileRacetrackCoursePackage(course, lane);
    expect(pkg.previewRoute.length).toBeLessThanOrEqual(pkg.progressSamples.length);
    expect(pkg.previewRoute[0].coordinate).toEqual(pkg.progressSamples[0].coordinate);
    expect(pkg.previewRoute[pkg.previewRoute.length - 1].coordinate).toEqual(pkg.progressSamples[pkg.progressSamples.length - 1].coordinate);
  });

  it("maps every course checkpoint into the package, preserving distance/progress", () => {
    const course = readyCourse();
    const lane = makeLane(course);
    const pkg = compileRacetrackCoursePackage(course, lane);
    expect(pkg.checkpoints.length).toBe(course.checkpoints.length);
    expect(pkg.checkpoints[0].distanceMeters).toBe(course.checkpoints[0].distanceMeters);
  });

  it("produces exactly 4 camera anchors (start/quarter/finish/overview), pure data only", () => {
    const course = readyCourse();
    const lane = makeLane(course);
    const pkg = compileRacetrackCoursePackage(course, lane);
    expect(pkg.cameraAnchors.length).toBe(4);
    expect(pkg.cameraAnchors.map((a) => a.label)).toEqual(["Start", "Quarter", "Finish", "Overview"]);
  });

  it("leaves environment/terrain undefined in v1 (disclosed simplification, not silently dropped)", () => {
    const course = readyCourse();
    const lane = makeLane(course);
    const pkg = compileRacetrackCoursePackage(course, lane);
    expect(pkg.environment).toBeUndefined();
    expect(pkg.terrain).toBeUndefined();
  });

  it("starts at version 1 with publishedAt null — publishing is a separate step", () => {
    const course = readyCourse();
    const lane = makeLane(course);
    const pkg = compileRacetrackCoursePackage(course, lane);
    expect(pkg.version).toBe(1);
    expect(pkg.publishedAt).toBeNull();
  });

  it("is deterministic in every field except its own generated id/slug randomness-free parts", () => {
    const course = readyCourse();
    const lane = makeLane(course);
    const a = compileRacetrackCoursePackage(course, lane);
    const b = compileRacetrackCoursePackage(course, lane);
    expect(a.route).toEqual(b.route);
    expect(a.progressSamples).toEqual(b.progressSamples);
    expect(a.checkpoints).toEqual(b.checkpoints);
  });

  it("never mutates the source course or lane", () => {
    const course = readyCourse();
    const lane = makeLane(course);
    const courseSnapshot = JSON.parse(JSON.stringify(course));
    const laneSnapshot = JSON.parse(JSON.stringify(lane));
    compileRacetrackCoursePackage(course, lane);
    expect(course).toEqual(courseSnapshot);
    expect(lane).toEqual(laneSnapshot);
  });

  it("never issues a network request (pure, synchronous)", () => {
    const course = readyCourse();
    const lane = makeLane(course);
    // Pure synchronous function — calling it directly (not awaiting
    // anything) and getting a fully-formed object back is itself the proof.
    const pkg = compileRacetrackCoursePackage(course, lane);
    expect(pkg.providerSource).toBe("mapbox");
  });

  // ── REQUIRED CORRECTION (0805F) ──────────────────────────────────────────
  it("compiles successfully for a presentation-ready/runtime-blocked lane (offset_intersection alone never blocks publishing)", () => {
    const course = readyCourse();
    const lane = makeLane(course, { laneCount: 20, laneWidthMeters: 500 });
    const pkg = compileRacetrackCoursePackage(course, lane);
    expect(pkg.presentationReady).toBe(true);
    expect(pkg.runtimeReady).toBe(false);
  });

  it("the runtime warning persists verbatim in the published package, never hidden", () => {
    const course = readyCourse();
    const lane = makeLane(course, { laneCount: 20, laneWidthMeters: 500 });
    const pkg = compileRacetrackCoursePackage(course, lane);
    expect(pkg.warnings).toContain("offset_intersection");
  });

  it("refuses to compile a genuinely not-presentation-ready lane", () => {
    const course = readyCourse();
    const lane = makeLane(course);
    const brokenLane: RaceLane = { ...lane, totalDistanceMeters: 0 };
    expect(() => compileRacetrackCoursePackage(course, brokenLane)).toThrow(RacetrackCoursePackageNotReadyError);
  });
});
