import { describe, it, expect } from "vitest";
import { computeRaceCourseReadiness } from "./raceCourseReadiness";
import type { RaceCourse } from "../../data/raceCourseTypes";

function readyCourse(overrides: Partial<RaceCourse> = {}): RaceCourse {
  return {
    id: "race1",
    name: "Test Course",
    sourceItineraryId: "it1",
    sourceItineraryName: "Test Itinerary",
    sourceFingerprint: "fp1",
    geometry: { type: "LineString", coordinates: [[-74, 40.7], [-74.01, 40.71], [-74.02, 40.72]] },
    totalDistanceMeters: 1000,
    startLine: { id: "start1", label: "Start", distanceMeters: 0, progress01: 0, coordinate: [-74, 40.7] },
    finishLine: { id: "finish1", label: "Finish", distanceMeters: 1000, progress01: 1, coordinate: [-74.02, 40.72] },
    checkpoints: [
      { id: "cp1", label: "CP1", distanceMeters: 500, progress01: 0.5, coordinate: [-74.01, 40.71] },
    ],
    sections: [
      { id: "sec1", name: "A -> B", startDistanceMeters: 0, endDistanceMeters: 500, startProgress01: 0, endProgress01: 0.5 },
      { id: "sec2", name: "B -> C", startDistanceMeters: 500, endDistanceMeters: 1000, startProgress01: 0.5, endProgress01: 1 },
    ],
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

describe("computeRaceCourseReadiness", () => {
  it("is ready for a fully well-formed course", () => {
    expect(computeRaceCourseReadiness(readyCourse())).toEqual({ ready: true, reasons: [] });
  });

  it("reports missing_geometry for empty coordinates", () => {
    const result = computeRaceCourseReadiness(readyCourse({ geometry: { type: "LineString", coordinates: [] } }));
    expect(result.ready).toBe(false);
    expect(result.reasons).toContain("missing_geometry");
  });

  it("reports too_few_coordinates for a single-point geometry", () => {
    const result = computeRaceCourseReadiness(readyCourse({ geometry: { type: "LineString", coordinates: [[-74, 40.7]] } }));
    expect(result.reasons).toContain("too_few_coordinates");
  });

  it("reports invalid_coordinate for a non-finite coordinate", () => {
    const result = computeRaceCourseReadiness(
      readyCourse({ geometry: { type: "LineString", coordinates: [[-74, 40.7], [NaN, 40.71]] } }),
    );
    expect(result.reasons).toContain("invalid_coordinate");
  });

  it("reports zero_distance when totalDistanceMeters is not positive despite real geometry", () => {
    const result = computeRaceCourseReadiness(readyCourse({ totalDistanceMeters: 0 }));
    expect(result.reasons).toContain("zero_distance");
  });

  it("reports missing_start when startLine's coordinate is invalid", () => {
    const result = computeRaceCourseReadiness(
      readyCourse({ startLine: { id: "s", label: "Start", distanceMeters: 0, progress01: 0, coordinate: [NaN, NaN] } }),
    );
    expect(result.reasons).toContain("missing_start");
  });

  it("reports missing_finish when finishLine's coordinate is invalid", () => {
    const result = computeRaceCourseReadiness(
      readyCourse({ finishLine: { id: "f", label: "Finish", distanceMeters: 1000, progress01: 1, coordinate: [NaN, NaN] } }),
    );
    expect(result.reasons).toContain("missing_finish");
  });

  it("reports checkpoint_out_of_order for a checkpoint that decreases in distance", () => {
    const result = computeRaceCourseReadiness(
      readyCourse({
        checkpoints: [
          { id: "cp1", label: "CP1", distanceMeters: 700, progress01: 0.7, coordinate: [-74.01, 40.71] },
          { id: "cp2", label: "CP2", distanceMeters: 300, progress01: 0.3, coordinate: [-74.015, 40.715] },
        ],
      }),
    );
    expect(result.reasons).toContain("checkpoint_out_of_order");
  });

  it("reports checkpoint_out_of_order for a checkpoint distance outside [0, total]", () => {
    const result = computeRaceCourseReadiness(
      readyCourse({
        checkpoints: [{ id: "cp1", label: "CP1", distanceMeters: 5000, progress01: 5, coordinate: [-74.01, 40.71] }],
      }),
    );
    expect(result.reasons).toContain("checkpoint_out_of_order");
  });

  it("reports section_gap when sections don't start at 0", () => {
    const result = computeRaceCourseReadiness(
      readyCourse({
        sections: [
          { id: "sec1", name: "A -> B", startDistanceMeters: 100, endDistanceMeters: 500, startProgress01: 0.1, endProgress01: 0.5 },
          { id: "sec2", name: "B -> C", startDistanceMeters: 500, endDistanceMeters: 1000, startProgress01: 0.5, endProgress01: 1 },
        ],
      }),
    );
    expect(result.reasons).toContain("section_gap");
  });

  it("reports section_gap when sections don't reach totalDistanceMeters", () => {
    const result = computeRaceCourseReadiness(
      readyCourse({
        sections: [
          { id: "sec1", name: "A -> B", startDistanceMeters: 0, endDistanceMeters: 500, startProgress01: 0, endProgress01: 0.5 },
          { id: "sec2", name: "B -> C", startDistanceMeters: 500, endDistanceMeters: 900, startProgress01: 0.5, endProgress01: 0.9 },
        ],
      }),
    );
    expect(result.reasons).toContain("section_gap");
  });

  it("reports section_gap for a real gap between two consecutive sections", () => {
    const result = computeRaceCourseReadiness(
      readyCourse({
        sections: [
          { id: "sec1", name: "A -> B", startDistanceMeters: 0, endDistanceMeters: 400, startProgress01: 0, endProgress01: 0.4 },
          { id: "sec2", name: "B -> C", startDistanceMeters: 500, endDistanceMeters: 1000, startProgress01: 0.5, endProgress01: 1 },
        ],
      }),
    );
    expect(result.reasons).toContain("section_gap");
  });

  it("reports section_overlap for two overlapping sections", () => {
    const result = computeRaceCourseReadiness(
      readyCourse({
        sections: [
          { id: "sec1", name: "A -> B", startDistanceMeters: 0, endDistanceMeters: 600, startProgress01: 0, endProgress01: 0.6 },
          { id: "sec2", name: "B -> C", startDistanceMeters: 500, endDistanceMeters: 1000, startProgress01: 0.5, endProgress01: 1 },
        ],
      }),
    );
    expect(result.reasons).toContain("section_overlap");
  });

  it("reports disconnected_geometry when continuity.continuous is false", () => {
    const result = computeRaceCourseReadiness(
      readyCourse({
        continuity: {
          continuous: false,
          discontinuities: [{ afterStageIndex: 0, gapMeters: 500, previousEnd: [-74, 40.7], nextStart: [-73.9, 40.8] }],
        },
      }),
    );
    expect(result.reasons).toContain("disconnected_geometry");
  });

  it("reports missing_source_route when missingRouteStageCount > 0", () => {
    const result = computeRaceCourseReadiness(readyCourse({ missingRouteStageCount: 1 }));
    expect(result.reasons).toContain("missing_source_route");
  });

  it("never collapses multiple simultaneous problems into one generic reason", () => {
    const result = computeRaceCourseReadiness(
      readyCourse({ totalDistanceMeters: 0, missingRouteStageCount: 2 }),
    );
    expect(result.reasons).toContain("zero_distance");
    expect(result.reasons).toContain("missing_source_route");
    expect(result.reasons.length).toBeGreaterThanOrEqual(2);
  });
});
