import { describe, expect, it } from "vitest";
import { MOP_DAB_ALPHA_SCALE, MOP_MAX_EMISSION_POINTS, resolveMopDabPlan, resolveMopEmissionPoints } from "./mopDeposition";

describe("Mop deposition -- Revision 3 emission resampling", () => {
  it("a sparse raw path produces bounded, interpolated emission points -- not just the original points", () => {
    const sparse = [{ x: 0, y: 0 }, { x: 200, y: 0 }];
    const emissions = resolveMopEmissionPoints(sparse, 10);
    expect(emissions.length).toBeGreaterThan(sparse.length);
    expect(emissions.length).toBeLessThanOrEqual(MOP_MAX_EMISSION_POINTS);
  });

  it("keeps the maximum gap between consecutive emission points comfortably below one dab radius, guaranteeing overlap regardless of original spacing", () => {
    const fastDrag = [{ x: 0, y: 0 }, { x: 500, y: 0 }];
    const baseRadius = 10;
    const emissions = resolveMopEmissionPoints(fastDrag, baseRadius);
    let maxGap = 0;
    for (let i = 1; i < emissions.length; i += 1) {
      maxGap = Math.max(maxGap, Math.hypot(emissions[i].x - emissions[i - 1].x, emissions[i].y - emissions[i - 1].y));
    }
    expect(maxGap).toBeLessThanOrEqual(baseRadius * 0.45 + 1e-6);
    expect(maxGap).toBeLessThan(baseRadius); // below one full dab radius -- neighboring dabs always overlap
  });

  it("a fast/broad gesture across a large Map viewport still resolves to a bounded, overlap-guaranteed dab plan (no visible gaps)", () => {
    const broadGesture = [{ x: 0, y: 0 }, { x: 300, y: 40 }, { x: 620, y: -20 }];
    const plan = resolveMopDabPlan(broadGesture, 17);
    let maxGap = 0;
    for (let i = 1; i < plan.length; i += 1) {
      maxGap = Math.max(maxGap, Math.hypot(plan[i].x - plan[i - 1].x, plan[i].y - plan[i - 1].y));
    }
    expect(maxGap).toBeLessThan(17); // strictly below the smallest possible dab radius (17 * 0.7)
  });

  it("caps emission points (and therefore dab count) even for a very long path", () => {
    const longPath = Array.from({ length: 60 }, (_, i) => ({ x: i * 25, y: 0 }));
    const emissions = resolveMopEmissionPoints(longPath, 10);
    expect(emissions.length).toBeLessThanOrEqual(MOP_MAX_EMISSION_POINTS);
  });

  it("never truncates a long gesture -- the final authored point is always represented (Revision 4 regression, mirrors the Spray premature-termination fix)", () => {
    const gesture = Array.from({ length: 300 }, (_, i) => ({
      x: i * 14 + Math.sin(i * 0.3) * 8,
      y: Math.cos(i * 0.2) * 40,
    }));
    const emissions = resolveMopEmissionPoints(gesture, 17);
    const last = emissions[emissions.length - 1];
    const finalAuthored = gesture[gesture.length - 1];
    expect(last.x).toBeCloseTo(finalAuthored.x, 5);
    expect(last.y).toBeCloseTo(finalAuthored.y, 5);
    expect(resolveMopDabPlan(gesture, 17).length).toBeLessThanOrEqual(MOP_MAX_EMISSION_POINTS);
  });

  it("resampling is a pure, deterministic function of its inputs -- identical points and radius always replay to an identical plan", () => {
    const points = [{ x: 0.12, y: 0.4 }, { x: 0.18, y: 0.42 }, { x: 0.3, y: 0.5 }, { x: 0.31, y: 0.51 }];
    expect(resolveMopDabPlan(points, 17)).toEqual(resolveMopDabPlan(points, 17));
    expect(resolveMopEmissionPoints(points, 17)).toEqual(resolveMopEmissionPoints(points, 17));
  });

  it("a single recorded point (a tap/short mark) still resolves to a valid, non-empty dab", () => {
    const plan = resolveMopDabPlan([{ x: 50, y: 50 }], 12);
    expect(plan).toHaveLength(1);
    expect(plan[0]).toMatchObject({ x: 50, y: 50 });
    expect(plan[0].radius).toBeGreaterThan(0);
  });
});

describe("Mop deposition -- Width and speed response are preserved through resampling", () => {
  it("Width (base radius) still controls the dab footprint -- a larger base radius yields larger dabs", () => {
    const points = [{ x: 0, y: 0 }, { x: 40, y: 0 }];
    const narrow = resolveMopDabPlan(points, 8);
    const wide = resolveMopDabPlan(points, 30);
    expect(wide[0].radius).toBeGreaterThan(narrow[0].radius);
  });

  it("closely-spaced (slow/dwelled) ORIGINAL points still give a larger dab than widely-spaced (fast) ORIGINAL points at the same base radius -- the speed-response signal survives resampling", () => {
    const dense = [{ x: 100, y: 100 }, { x: 101, y: 100 }, { x: 102, y: 100 }];
    const sparse = [{ x: 100, y: 100 }, { x: 140, y: 100 }, { x: 180, y: 100 }];
    const denseAvg = resolveMopDabPlan(dense, 10).reduce((sum, dab) => sum + dab.radius, 0) / resolveMopDabPlan(dense, 10).length;
    const sparseAvg = resolveMopDabPlan(sparse, 10).reduce((sum, dab) => sum + dab.radius, 0) / resolveMopDabPlan(sparse, 10).length;
    expect(denseAvg).toBeGreaterThan(sparseAvg);
  });

  it("speed response remains deterministic and bounded -- radius never collapses to zero or balloons past the documented multiple", () => {
    const wildlySpread = [{ x: 0, y: 0 }, { x: 40, y: 40 }, { x: 0, y: 40 }];
    const plan = resolveMopDabPlan(wildlySpread, 20);
    for (const dab of plan) {
      expect(dab.radius).toBeGreaterThanOrEqual(20 * 0.7 - 1e-9);
      expect(dab.radius).toBeLessThanOrEqual(20 * 1.25 + 1e-9);
    }
  });

  it("every dab still carries the mark's own alpha scale", () => {
    const plan = resolveMopDabPlan([{ x: 0, y: 0 }, { x: 10, y: 0 }], 10);
    expect(plan.every((dab) => dab.alphaScale === MOP_DAB_ALPHA_SCALE)).toBe(true);
  });

  it("returns an empty plan for no points or a non-positive base radius, rather than throwing", () => {
    expect(resolveMopDabPlan([], 10)).toEqual([]);
    expect(resolveMopDabPlan([{ x: 0.1, y: 0.1 }], 0)).toEqual([]);
    expect(resolveMopDabPlan([{ x: 0.1, y: 0.1 }], -5)).toEqual([]);
    expect(resolveMopEmissionPoints([], 10)).toEqual([]);
  });
});

describe("Mop deposition -- Revision 8 (a long zigzag's late-stage direction changes survive)", () => {
  it("resolveMopEmissionPoints keeps real oscillation near each checkpoint throughout the path, not flattened after some point -- checked over a small window since gap-filling interpolation between preserved corners legitimately adds intermediate-x points", () => {
    const amplitude = 20;
    const points = Array.from({ length: 600 }, (_, i) => ({ x: i % 2 === 0 ? -amplitude : amplitude, y: i * 4 }));
    const emissions = resolveMopEmissionPoints(points, 17);
    const totalY = (points.length - 1) * 4;
    const checkpoints = [0.25, 0.5, 0.75, 0.9, 0.97];
    for (const fraction of checkpoints) {
      const targetY = fraction * totalY;
      const window = emissions.filter((e) => Math.abs(e.y - targetY) <= totalY * 0.05);
      expect(window.length).toBeGreaterThan(0);
      const maxAbsX = Math.max(...window.map((e) => Math.abs(e.x)));
      expect(maxAbsX).toBeGreaterThan(amplitude * 0.6);
    }
  });
});
