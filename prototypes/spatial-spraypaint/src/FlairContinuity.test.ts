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

describe("smooth taper envelope (Flair Stabilization build brief, section A1)", () => {
  it("width does not ramp linearly -- early and late steps change less than the midpoint (ease-in-ease-out, not a straight ramp)", () => {
    const previous = { ...near(0, 0), width: 20, opacity: 0.9 };
    const target = { ...near(60, 0), width: 100, opacity: 0.9 };
    const run = resampleTrackMarksFlairSegment(previous, target);
    const firstStepDelta = run[0].width - previous.width;
    const midIndex = Math.floor(run.length / 2);
    const midStepDelta = run[midIndex].width - run[midIndex - 1].width;
    // A linear ramp would give every step the identical delta; smoothstep's
    // first step (near t=0, near-zero slope) must be clearly smaller than
    // its steepest, near-the-midpoint step.
    expect(firstStepDelta).toBeLessThan(midStepDelta);
  });

  it("still reaches the exact true endpoint values -- easing the path never reduces Flair's range", () => {
    const previous = { ...near(0, 0), width: 20, opacity: 0.9 };
    const target = { ...near(60, 0), width: 100, opacity: 0.1 };
    const run = resampleTrackMarksFlairSegment(previous, target);
    const last = run[run.length - 1];
    expect(last.width).toBeCloseTo(100, 6);
    expect(last.opacity).toBeCloseTo(0.1, 6);
  });

  it("position/timestamp/velocity stay physically linear along the path -- only width/opacity are eased", () => {
    const previous = { ...near(0, 0), timestamp: 0, velocity: 0.2 };
    const target = { ...near(60, 0), timestamp: 600, velocity: 1.2 };
    const run = resampleTrackMarksFlairSegment(previous, target);
    const steps = run.length;
    for (const [index, point] of run.entries()) {
      const t = (index + 1) / steps;
      expect(point.x).toBeCloseTo(previous.x + (target.x - previous.x) * t, 6);
      expect(point.timestamp).toBeCloseTo(previous.timestamp + (target.timestamp - previous.timestamp) * t, 6);
    }
  });
});

describe("aerosol mist -- bloom01 wiring (Real Spray Pass build brief, section 3)", () => {
  it("bloom01=0 (the default) is a complete no-op -- identical opacity to the pre-mist smooth taper", () => {
    const previous = { ...near(0, 0), width: 20, opacity: 0.9 };
    const target = { ...near(60, 0), width: 40, opacity: 0.5 };
    const withoutBloomArg = resampleTrackMarksFlairSegment(previous, target);
    const explicitZero = resampleTrackMarksFlairSegment(previous, target, 0);
    expect(withoutBloomArg).toEqual(explicitZero);
  });

  it("bloom01>0 dims and varies opacity -- never touches width (the smooth taper stays exactly as continuous as before)", () => {
    const previous = { ...near(0, 0), width: 20, opacity: 0.9 };
    const target = { ...near(60, 0), width: 40, opacity: 0.9 };
    const clean = resampleTrackMarksFlairSegment(previous, target, 0);
    const misty = resampleTrackMarksFlairSegment(previous, target, 0.8);
    for (let i = 0; i < clean.length; i += 1) {
      expect(misty[i].width).toBeCloseTo(clean[i].width, 10); // width UNCHANGED by mist
    }
    // At least one interior point must actually differ in opacity -- mist is visible, not a no-op.
    const anyOpacityDiffers = misty.some((point, i) => Math.abs(point.opacity - clean[i].opacity) > 1e-6);
    expect(anyOpacityDiffers).toBe(true);
  });

  it("higher bloom01 dims the average opacity further -- 'lighter/more translucent as it opens', not just noisier", () => {
    const previous = { ...near(0, 0), width: 20, opacity: 1 };
    const target = { ...near(80, 0), width: 20, opacity: 1 };
    const low = resampleTrackMarksFlairSegment(previous, target, 0.2);
    const high = resampleTrackMarksFlairSegment(previous, target, 0.9);
    const average = (points: typeof low) => points.reduce((sum, p) => sum + p.opacity, 0) / points.length;
    expect(average(high)).toBeLessThan(average(low));
  });

  it("mist never produces negative opacity even at bloom01=1 with an unlucky jitter draw", () => {
    const previous = { ...near(0, 0), width: 20, opacity: 0.05 };
    const target = { ...near(200, 0), width: 20, opacity: 0.05 };
    const run = resampleTrackMarksFlairSegment(previous, target, 1);
    expect(run.every((point) => point.opacity >= 0)).toBe(true);
  });

  it("mist is deterministic -- the exact same inputs always produce the exact same grain (live paint and replay must match)", () => {
    const previous = { ...near(3, 7), width: 20, opacity: 0.8 };
    const target = { ...near(90, 40), width: 55, opacity: 0.3 };
    const first = resampleTrackMarksFlairSegment(previous, target, 0.6);
    const second = resampleTrackMarksFlairSegment(previous, target, 0.6);
    expect(first).toEqual(second);
  });

  it("buildContinuousSegmentEnds defaults bloom01 to 0 when omitted -- every existing call site (and every non-Track-Marks/off case) is unaffected by this change", () => {
    const previous = near(-10, 0);
    const rawSegmentEnds = [near(0, 0), near(10, 0), near(20, 0)];
    const withDefault = buildContinuousSegmentEnds(previous, rawSegmentEnds, "track-marks", "wall", 1);
    const withExplicitZero = buildContinuousSegmentEnds(previous, rawSegmentEnds, "track-marks", "wall", 1, 0);
    expect(withDefault).toEqual(withExplicitZero);
  });
});
