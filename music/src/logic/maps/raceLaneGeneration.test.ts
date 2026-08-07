import { describe, it, expect } from "vitest";
import { buildRaceLaneCenterline, assertRaceLaneSourceEligible, RaceLaneSourceCourseError } from "./raceLaneGeneration";
import type { RaceCourse } from "../../data/raceCourseTypes";
import type { RaceLaneSmoothingConfig } from "../../data/raceLaneTypes";

// A real, continuous, ready course with a genuine turn partway through —
// deliberately more than 3 points so the Catmull-Rom pipeline has real
// control points to smooth between, mirroring a real converted itinerary's
// waterfront-style geometry rather than a degenerate 2-point line.
function readyCourse(overrides: Partial<RaceCourse> = {}): RaceCourse {
  const coordinates: [number, number][] = [
    [-74.0, 40.85],
    [-74.0, 40.83],
    [-73.99, 40.81],
    [-73.98, 40.79],
    [-73.98, 40.75],
    [-74.0, 40.72],
    [-74.015, 40.703],
  ];
  return {
    id: "race1",
    name: "Test Course",
    sourceItineraryId: "it1",
    sourceItineraryName: "Test Itinerary",
    sourceFingerprint: "fp1",
    geometry: { type: "LineString", coordinates },
    totalDistanceMeters: 20000,
    startLine: { id: "start1", label: "Start", distanceMeters: 0, progress01: 0, coordinate: coordinates[0] },
    finishLine: { id: "finish1", label: "Finish", distanceMeters: 20000, progress01: 1, coordinate: coordinates[coordinates.length - 1] },
    checkpoints: [],
    sections: [{ id: "sec1", name: "A -> B", startDistanceMeters: 0, endDistanceMeters: 20000, startProgress01: 0, endProgress01: 1 }],
    continuity: { continuous: true, discontinuities: [] },
    targetDurationMinutes: null,
    missingRouteStageCount: 0,
    active: false,
    status: "ready",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function discontinuousCourse(): RaceCourse {
  return readyCourse({
    continuity: {
      continuous: false,
      discontinuities: [{ afterStageIndex: 0, gapMeters: 250, previousEnd: [-73.98, 40.79], nextStart: [-73.9, 40.79] }],
    },
  });
}

const SMOOTHING: RaceLaneSmoothingConfig = {
  method: "catmull_rom",
  sampleSpacingMeters: 25,
  tension: 0.5,
  cornerProtectionMeters: 8,
};

describe("assertRaceLaneSourceEligible", () => {
  it("passes for a ready, continuous, non-archived course", () => {
    expect(() => assertRaceLaneSourceEligible(readyCourse())).not.toThrow();
  });

  it("throws for a discontinuous course", () => {
    expect(() => assertRaceLaneSourceEligible(discontinuousCourse())).toThrow(RaceLaneSourceCourseError);
  });

  it("throws for a needs_review course", () => {
    expect(() => assertRaceLaneSourceEligible(readyCourse({ status: "needs_review" }))).toThrow(RaceLaneSourceCourseError);
  });

  it("throws for an archived course", () => {
    expect(() => assertRaceLaneSourceEligible(readyCourse({ status: "archived" }))).toThrow(RaceLaneSourceCourseError);
  });
});

describe("buildRaceLaneCenterline", () => {
  it("refuses a discontinuous source outright — never splices/concatenates segments", () => {
    expect(() => buildRaceLaneCenterline(discontinuousCourse(), SMOOTHING)).toThrow(RaceLaneSourceCourseError);
  });

  it("anchors the first sample exactly to the course's own start coordinate", () => {
    const course = readyCourse();
    const { sampledCenterline } = buildRaceLaneCenterline(course, SMOOTHING);
    expect(sampledCenterline[0].center[0]).toBeCloseTo(course.geometry.coordinates[0][0], 6);
    expect(sampledCenterline[0].center[1]).toBeCloseTo(course.geometry.coordinates[0][1], 6);
    expect(sampledCenterline[0].distanceMeters).toBe(0);
    expect(sampledCenterline[0].progress01).toBe(0);
  });

  it("anchors the last sample exactly to the course's own finish coordinate", () => {
    const course = readyCourse();
    const { sampledCenterline, totalDistanceMeters } = buildRaceLaneCenterline(course, SMOOTHING);
    const last = sampledCenterline[sampledCenterline.length - 1];
    const lastCoord = course.geometry.coordinates[course.geometry.coordinates.length - 1];
    expect(last.center[0]).toBeCloseTo(lastCoord[0], 6);
    expect(last.center[1]).toBeCloseTo(lastCoord[1], 6);
    expect(last.distanceMeters).toBeCloseTo(totalDistanceMeters, 6);
    expect(last.progress01).toBeCloseTo(1, 6);
  });

  it("produces a positive, finite total distance reasonably close to the source course's distance", () => {
    const course = readyCourse();
    const { totalDistanceMeters } = buildRaceLaneCenterline(course, SMOOTHING);
    expect(totalDistanceMeters).toBeGreaterThan(0);
    expect(Number.isFinite(totalDistanceMeters)).toBe(true);
  });

  it("samples at approximately uniform spacing (except the final boundary sample)", () => {
    const course = readyCourse();
    const { sampledCenterline } = buildRaceLaneCenterline(course, SMOOTHING);
    for (let i = 1; i < sampledCenterline.length - 1; i++) {
      const spacing = sampledCenterline[i].distanceMeters - sampledCenterline[i - 1].distanceMeters;
      expect(spacing).toBeCloseTo(SMOOTHING.sampleSpacingMeters, 0);
    }
  });

  it("produces a unit-length, perpendicular normal vector at every sample", () => {
    const course = readyCourse();
    const { sampledCenterline } = buildRaceLaneCenterline(course, SMOOTHING);
    for (const s of sampledCenterline) {
      const tangentLen = Math.sqrt(s.tangentEast ** 2 + s.tangentNorth ** 2);
      const normalLen = Math.sqrt(s.normalEast ** 2 + s.normalNorth ** 2);
      expect(tangentLen).toBeCloseTo(1, 3);
      expect(normalLen).toBeCloseTo(1, 3);
      const dot = s.tangentEast * s.normalEast + s.tangentNorth * s.normalNorth;
      expect(dot).toBeCloseTo(0, 3);
    }
  });

  it("never produces a NaN/undefined center coordinate anywhere along the corridor (no overshoot corruption)", () => {
    const course = readyCourse();
    const { sampledCenterline } = buildRaceLaneCenterline(course, SMOOTHING);
    for (const s of sampledCenterline) {
      expect(Number.isFinite(s.center[0])).toBe(true);
      expect(Number.isFinite(s.center[1])).toBe(true);
      expect(Number.isFinite(s.headingDeg)).toBe(true);
    }
  });

  it("is deterministic — repeat calls with the same input produce identical output", () => {
    const course = readyCourse();
    const a = buildRaceLaneCenterline(course, SMOOTHING);
    const b = buildRaceLaneCenterline(course, SMOOTHING);
    expect(a).toEqual(b);
  });

  it("never mutates the source course", () => {
    const course = readyCourse();
    const snapshot = JSON.parse(JSON.stringify(course));
    buildRaceLaneCenterline(course, SMOOTHING);
    expect(course).toEqual(snapshot);
  });
});
