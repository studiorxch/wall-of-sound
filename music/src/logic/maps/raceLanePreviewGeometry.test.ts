import { describe, it, expect } from "vitest";
import { decimateForPreview, buildRaceLaneTrackPolygon } from "./raceLanePreviewGeometry";
import type { RaceLaneSample } from "../../data/raceLaneTypes";

function makeStraightSamples(n: number, sharpTurnIndex: number | null = null): RaceLaneSample[] {
  const samples: RaceLaneSample[] = [];
  for (let i = 0; i < n; i++) {
    const headingDeg = sharpTurnIndex != null && i >= sharpTurnIndex ? 90 : 0;
    samples.push({
      index: i,
      distanceMeters: i * 2,
      progress01: i / (n - 1),
      center: [-74 + i * 0.0001, 40.7],
      headingDeg,
      tangentEast: 1, tangentNorth: 0,
      normalEast: 0, normalNorth: 1,
    });
  }
  return samples;
}

describe("decimateForPreview", () => {
  it("returns the input unchanged when it's already under the target point count", () => {
    const samples = makeStraightSamples(100);
    const result = decimateForPreview(samples, { targetPointCount: 500 });
    expect(result.fullSampleCount).toBe(100);
    expect(result.previewPointCount).toBe(100);
    expect(result.points).toEqual(samples);
  });

  it("caps the rendered point count for a large input, reporting full vs preview counts separately", () => {
    const samples = makeStraightSamples(5000);
    const result = decimateForPreview(samples, { targetPointCount: 500 });
    expect(result.fullSampleCount).toBe(5000);
    expect(result.previewPointCount).toBeLessThan(5000);
    expect(result.previewPointCount).toBeLessThanOrEqual(520); // small slack for must-keep additions
    expect(result.points.length).toBe(result.previewPointCount);
  });

  it("always preserves the exact first and last sample", () => {
    const samples = makeStraightSamples(5000);
    const result = decimateForPreview(samples, { targetPointCount: 500 });
    expect(result.points[0]).toEqual(samples[0]);
    expect(result.points[result.points.length - 1]).toEqual(samples[samples.length - 1]);
  });

  it("never skips a real sharp turn even under aggressive decimation", () => {
    const sharpAt = 2500;
    const samples = makeStraightSamples(5000, sharpAt);
    const result = decimateForPreview(samples, { targetPointCount: 200 });
    const keptIndices = new Set(result.points.map((p) => p.index));
    expect(keptIndices.has(sharpAt)).toBe(true);
  });

  it("returns indices in ascending order (point order preserved)", () => {
    const samples = makeStraightSamples(3000, 1500);
    const result = decimateForPreview(samples, { targetPointCount: 300 });
    for (let i = 1; i < result.points.length; i++) {
      expect(result.points[i].index).toBeGreaterThan(result.points[i - 1].index);
    }
  });
});

describe("buildRaceLaneTrackPolygon", () => {
  it("returns null for fewer than 2 points", () => {
    expect(buildRaceLaneTrackPolygon([], 4, 3).polygon).toBeNull();
    expect(buildRaceLaneTrackPolygon(makeStraightSamples(1), 4, 3).polygon).toBeNull();
  });

  it("closes the ring back to its own start point and preserves point order for a simple straight lane", () => {
    const points = makeStraightSamples(10);
    const result = buildRaceLaneTrackPolygon(points, 4, 3);
    expect(result.selfIntersects).toBe(false);
    expect(result.polygon).not.toBeNull();
    const ring = result.polygon!.coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    // left edge (10 points) + right edge reversed (10 points) + closing point = 21
    expect(ring.length).toBe(21);
  });

  it("never touches the input samples (preview-only, no persisted-geometry mutation)", () => {
    const points = makeStraightSamples(10);
    const snapshot = JSON.parse(JSON.stringify(points));
    buildRaceLaneTrackPolygon(points, 4, 3);
    expect(points).toEqual(snapshot);
  });

  it("detects a self-intersecting offset band at a tight hairpin and falls back (polygon: null)", () => {
    // A path that goes east, then immediately doubles back west along
    // nearly the same line (a hairpin) — with a lane width far wider than
    // the hairpin's own tightness, the offset band on the outbound leg
    // and the offset band on the inbound leg cross each other.
    const points: RaceLaneSample[] = [
      { index: 0, distanceMeters: 0, progress01: 0, center: [-74.0, 40.7], headingDeg: 90, tangentEast: 1, tangentNorth: 0, normalEast: 0, normalNorth: 1 },
      { index: 1, distanceMeters: 50, progress01: 0.25, center: [-73.9995, 40.7], headingDeg: 90, tangentEast: 1, tangentNorth: 0, normalEast: 0, normalNorth: 1 },
      { index: 2, distanceMeters: 55, progress01: 0.5, center: [-73.99945, 40.70001], headingDeg: 270, tangentEast: -1, tangentNorth: 0, normalEast: 0, normalNorth: -1 },
      { index: 3, distanceMeters: 105, progress01: 0.75, center: [-73.9999, 40.70001], headingDeg: 270, tangentEast: -1, tangentNorth: 0, normalEast: 0, normalNorth: -1 },
      { index: 4, distanceMeters: 155, progress01: 1, center: [-74.00045, 40.70001], headingDeg: 270, tangentEast: -1, tangentNorth: 0, normalEast: 0, normalNorth: -1 },
    ];
    const result = buildRaceLaneTrackPolygon(points, 2, 4000);
    expect(result.selfIntersects).toBe(true);
    expect(result.polygon).toBeNull();
  });
});
