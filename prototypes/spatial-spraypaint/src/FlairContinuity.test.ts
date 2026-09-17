import { describe, expect, it } from "vitest";
import { buildContinuousSegmentEnds, resampleTrackMarksFlairSegment } from "./FlairContinuity";
import type { StrokePoint } from "./types";

const near = (x: number, y: number): StrokePoint => ({
  x, y, timestamp: 0, velocity: 0.1, width: 28, opacity: 0.9,
});

describe("resampleTrackMarksFlairSegment -- the continuity fix", () => {
  it("returns just the target for a stroke's first point (no previous)", () => {
    const target = near(10, 10);
    expect(resampleTrackMarksFlairSegment(null, target)).toEqual([target]);
  });

  it("returns just the target when previous and target are the same point (zero-distance dwell)", () => {
    const point = near(5, 5);
    expect(resampleTrackMarksFlairSegment(point, { ...point })).toEqual([{ ...point }]);
  });

  it("produces a monotonically dense arclength walk between previous and target", () => {
    const previous = { ...near(0, 0), width: 28, opacity: 0.9 };
    const target = { ...near(100, 0), width: 90, opacity: 0.3 };
    const run = resampleTrackMarksFlairSegment(previous, target);
    expect(run.length).toBeGreaterThan(20); // a 100-wall-unit gap at ~1.2/step should produce dozens of samples
    expect(run[run.length - 1].x).toBeCloseTo(target.x, 6);
    expect(run[run.length - 1].width).toBeCloseTo(target.width, 6);
    expect(run[run.length - 1].opacity).toBeCloseTo(target.opacity, 6);
  });

  it("never exceeds a small fixed step between consecutive resampled x/y positions -- density is independent of the endpoints' width", () => {
    const previous = near(0, 0);
    const target = { ...near(200, 0), width: 100 }; // Wild's own extended max
    const run = resampleTrackMarksFlairSegment(previous, target);
    let prevPoint: StrokePoint = previous;
    for (const point of run) {
      const step = Math.hypot(point.x - prevPoint.x, point.y - prevPoint.y);
      expect(step).toBeLessThanOrEqual(1.21); // the fixed resample step, plus float slack
      prevPoint = point;
    }
  });

  it("width and opacity change smoothly and monotonically toward the target across the whole run (no jump)", () => {
    const previous = { ...near(0, 0), width: 28, opacity: 0.9 };
    const target = { ...near(50, 0), width: 90, opacity: 0.3 };
    const run = resampleTrackMarksFlairSegment(previous, target);
    let prevWidth = previous.width;
    let prevOpacity = previous.opacity;
    for (const point of run) {
      expect(point.width).toBeGreaterThanOrEqual(prevWidth - 1e-9);
      expect(point.opacity).toBeLessThanOrEqual(prevOpacity + 1e-9);
      prevWidth = point.width;
      prevOpacity = point.opacity;
    }
    // No single step covers more than a small fraction of the total delta.
    const totalWidthDelta = target.width - previous.width;
    let maxStepDelta = 0;
    prevWidth = previous.width;
    for (const point of run) {
      maxStepDelta = Math.max(maxStepDelta, point.width - prevWidth);
      prevWidth = point.width;
    }
    expect(maxStepDelta).toBeLessThan(totalWidthDelta * 0.2);
  });

  it("still reaches the TRUE target value exactly -- Flair range is never reduced by continuity resampling", () => {
    const previous = near(0, 0);
    const target = { ...near(10, 0), width: 100, opacity: 0.05 };
    const run = resampleTrackMarksFlairSegment(previous, target);
    const last = run[run.length - 1];
    expect(last.width).toBeCloseTo(100, 6);
    expect(last.opacity).toBeCloseTo(0.05, 6);
  });
});

describe("buildContinuousSegmentEnds -- gating and pass-through", () => {
  const rawSegmentEnds: StrokePoint[] = [near(0, 0), near(10, 0), near(20, 0)];

  it("Track Marks with an active Flair mode replaces the batch with a dense continuity resample", () => {
    const previous = near(-10, 0);
    const result = buildContinuousSegmentEnds(previous, rawSegmentEnds, "track-marks", "wall", 0.8);
    expect(result.length).toBeGreaterThan(rawSegmentEnds.length);
    const last = result[result.length - 1];
    // The final value is the last raw point's opacity, output-multiplied.
    expect(last.opacity).toBeCloseTo(rawSegmentEnds[rawSegmentEnds.length - 1].opacity * 0.8, 6);
  });

  it("Track Marks with Flair off is byte-identical to the raw output-multiplied (identity) segmentEnds", () => {
    const previous = near(-10, 0);
    const result = buildContinuousSegmentEnds(previous, rawSegmentEnds, "track-marks", "off", 0.5);
    expect(result).toEqual(rawSegmentEnds);
  });

  it("every other cap (Pink Dot Fat explicitly, plus a sample of others) is byte-identical, regardless of mode or multiplier", () => {
    const previous = near(-10, 0);
    for (const capId of ["pink-dot-fat", "new-york-fat", "astro-fat", "needle", "soft-fade"]) {
      for (const mode of ["off", "wall", "blackbook", "wild"] as const) {
        const result = buildContinuousSegmentEnds(previous, rawSegmentEnds, capId, mode, 0.01);
        expect(result).toEqual(rawSegmentEnds);
      }
    }
  });

  it("an empty batch stays empty regardless of gating", () => {
    expect(buildContinuousSegmentEnds(near(0, 0), [], "track-marks", "wild", 1)).toEqual([]);
  });
});
