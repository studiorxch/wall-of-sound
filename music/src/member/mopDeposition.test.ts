import { describe, expect, it } from "vitest";
import { resolveMopDabPlan, MOP_DAB_ALPHA_SCALE } from "./mopDeposition";

describe("Mop deposition dab plan", () => {
  it("produces one dab per recorded point, in the same order, with the mark's own coordinates", () => {
    const points = [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.1 }, { x: 0.3, y: 0.1 }];
    const plan = resolveMopDabPlan(points, 10);
    expect(plan).toHaveLength(3);
    expect(plan.map((dab) => ({ x: dab.x, y: dab.y }))).toEqual(points);
    expect(plan.every((dab) => dab.alphaScale === MOP_DAB_ALPHA_SCALE)).toBe(true);
  });

  it("is a pure, deterministic function of its inputs -- identical points and radius always replay to an identical plan", () => {
    const points = [{ x: 0.12, y: 0.4 }, { x: 0.18, y: 0.42 }, { x: 0.3, y: 0.5 }, { x: 0.31, y: 0.51 }];
    const first = resolveMopDabPlan(points, 17);
    const second = resolveMopDabPlan(points, 17);
    expect(first).toEqual(second);
  });

  it("gives closely-spaced (slow/dwelled) points a larger dab than widely-spaced (fast) points, in the same (pixel-scale) coordinate space as the base radius", () => {
    const dense = [{ x: 100, y: 100 }, { x: 101, y: 100 }, { x: 102, y: 100 }];
    const sparse = [{ x: 100, y: 100 }, { x: 140, y: 100 }, { x: 180, y: 100 }];
    const denseMid = resolveMopDabPlan(dense, 10)[1];
    const sparseMid = resolveMopDabPlan(sparse, 10)[1];
    expect(denseMid.radius).toBeGreaterThan(sparseMid.radius);
  });

  it("keeps every dab radius within a bounded, sane multiple of the base radius -- never collapses to zero or balloons unboundedly", () => {
    const wildlySpread = [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    const plan = resolveMopDabPlan(wildlySpread, 20);
    for (const dab of plan) {
      expect(dab.radius).toBeGreaterThanOrEqual(20 * 0.7);
      expect(dab.radius).toBeLessThanOrEqual(20 * 1.25);
    }
  });

  it("returns an empty plan for no points or a non-positive base radius, rather than throwing", () => {
    expect(resolveMopDabPlan([], 10)).toEqual([]);
    expect(resolveMopDabPlan([{ x: 0.1, y: 0.1 }], 0)).toEqual([]);
    expect(resolveMopDabPlan([{ x: 0.1, y: 0.1 }], -5)).toEqual([]);
  });
});
