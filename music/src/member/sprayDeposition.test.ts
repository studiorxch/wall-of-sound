import { describe, expect, it } from "vitest";
import {
  hashSeed,
  resolveSprayEmissionPoints,
  resolveSprayParticlePlan,
  STUDIORICH_STOCK_CAP,
  type SprayCapProfile,
} from "./sprayDeposition";

describe("Spray aerosol engine -- determinism", () => {
  it("produces an identical particle plan for identical points/radius/seed/cap -- no Math.random anywhere", () => {
    const points = [{ x: 100, y: 100 }, { x: 140, y: 110 }, { x: 180, y: 140 }];
    const first = resolveSprayParticlePlan(points, 20, hashSeed("mark-a"));
    const second = resolveSprayParticlePlan(points, 20, hashSeed("mark-a"));
    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThan(0);
  });

  it("gives different stable seeds (different Mark IDs) different particle patterns", () => {
    const points = [{ x: 100, y: 100 }, { x: 140, y: 110 }, { x: 180, y: 140 }];
    const a = resolveSprayParticlePlan(points, 20, hashSeed("mark-a"));
    const b = resolveSprayParticlePlan(points, 20, hashSeed("mark-b"));
    expect(a).not.toEqual(b);
  });

  it("hashSeed is a pure, deterministic function of its input string", () => {
    expect(hashSeed("same-id")).toBe(hashSeed("same-id"));
    expect(hashSeed("mark-1")).not.toBe(hashSeed("mark-2"));
  });
});

describe("Spray aerosol engine -- Stock Cap profile is separate from the engine", () => {
  it("STUDIORICH_STOCK_CAP is a plain data profile, not part of the engine functions' own code", () => {
    expect(STUDIORICH_STOCK_CAP.id).toBe("studiorich-stock");
    expect(STUDIORICH_STOCK_CAP.name).toBe("StudioRich Stock Cap");
  });

  it("a different cap profile passed to the SAME engine functions changes the result -- the engine is generic, not Stock-Cap-specific", () => {
    const points = [{ x: 100, y: 100 }, { x: 140, y: 110 }];
    const wideCap: SprayCapProfile = { ...STUDIORICH_STOCK_CAP, id: "test-wide", baseParticlesPerEmission: 1, maxParticlesPerEmission: 1 };
    const stock = resolveSprayParticlePlan(points, 20, hashSeed("mark-a"), STUDIORICH_STOCK_CAP);
    const wide = resolveSprayParticlePlan(points, 20, hashSeed("mark-a"), wideCap);
    expect(wide.length).toBeLessThan(stock.length);
  });
});

describe("Spray aerosol engine -- Width / footprint", () => {
  it("a larger base radius spreads particles further from the emission point on average", () => {
    const points = [{ x: 100, y: 100 }, { x: 100, y: 100 }];
    const narrow = resolveSprayParticlePlan(points, 10, hashSeed("mark-width"));
    const wide = resolveSprayParticlePlan(points, 40, hashSeed("mark-width"));
    const avgDistance = (plan: readonly { x: number; y: number }[]) =>
      plan.reduce((sum, p) => sum + Math.hypot(p.x - 100, p.y - 100), 0) / plan.length;
    expect(avgDistance(wide)).toBeGreaterThan(avgDistance(narrow));
  });

  it("particle radius itself also scales with the base (Width) radius", () => {
    const points = [{ x: 100, y: 100 }, { x: 100, y: 100 }];
    const narrow = resolveSprayParticlePlan(points, 10, hashSeed("mark-radius"));
    const wide = resolveSprayParticlePlan(points, 40, hashSeed("mark-radius"));
    expect(wide[0].radius).toBeGreaterThan(narrow[0].radius);
  });
});

describe("Spray aerosol engine -- density / dwell response", () => {
  it("closely-spaced (slow/dwelled) points produce a higher local density factor than widely-spaced (fast) points", () => {
    const dense = [{ x: 100, y: 100 }, { x: 102, y: 100 }, { x: 104, y: 100 }];
    const sparse = [{ x: 100, y: 100 }, { x: 140, y: 100 }, { x: 180, y: 100 }];
    const denseEmissions = resolveSprayEmissionPoints(dense, 10);
    const sparseEmissions = resolveSprayEmissionPoints(sparse, 10);
    const averageDensity = (list: readonly { densityFactor: number }[]) =>
      list.reduce((sum, e) => sum + e.densityFactor, 0) / list.length;
    expect(averageDensity(denseEmissions)).toBeGreaterThan(averageDensity(sparseEmissions));
  });
});

describe("Spray aerosol engine -- dot / tap behavior", () => {
  it("a short tap (two nearly identical points) still produces a non-empty particle cluster", () => {
    const tapPoints = [{ x: 100, y: 100 }, { x: 100.2, y: 100.1 }];
    const plan = resolveSprayParticlePlan(tapPoints, 15, hashSeed("tap-mark"));
    expect(plan.length).toBeGreaterThan(0);
    for (const particle of plan) {
      expect(Math.hypot(particle.x - 100, particle.y - 100)).toBeLessThan(15 + 1);
    }
  });

  it("a single recorded point still produces emission points and particles rather than an empty plan", () => {
    const emissions = resolveSprayEmissionPoints([{ x: 50, y: 50 }], 10);
    expect(emissions.length).toBeGreaterThan(0);
  });
});

describe("Spray aerosol engine -- continuity on fast movement", () => {
  it("keeps the maximum gap between consecutive emission points bounded regardless of how sparse the original points are", () => {
    const fastDrag = [{ x: 0, y: 0 }, { x: 500, y: 0 }];
    const emissions = resolveSprayEmissionPoints(fastDrag, 10);
    let maxGap = 0;
    for (let i = 1; i < emissions.length; i += 1) {
      maxGap = Math.max(maxGap, Math.hypot(emissions[i].x - emissions[i - 1].x, emissions[i].y - emissions[i - 1].y));
    }
    expect(maxGap).toBeLessThanOrEqual(10 * 0.35 + 1e-6);
  });

  it("handles a curved path and a direction reversal without throwing or producing zero emission points", () => {
    const curve = [{ x: 0, y: 0 }, { x: 20, y: 30 }, { x: 40, y: 10 }, { x: 20, y: -10 }, { x: 0, y: 0 }];
    const emissions = resolveSprayEmissionPoints(curve, 8);
    expect(emissions.length).toBeGreaterThan(0);
  });
});

describe("Spray aerosol engine -- bounded performance", () => {
  it("caps total emission points (and therefore particle count) even for a very long path, per the Stock Cap's maxEmissionPoints", () => {
    const longPath = Array.from({ length: 50 }, (_, i) => ({ x: i * 20, y: 0 }));
    const emissions = resolveSprayEmissionPoints(longPath, 10);
    expect(emissions.length).toBeLessThanOrEqual(STUDIORICH_STOCK_CAP.maxEmissionPoints);
  });

  it("caps total particle count for an ordinary stroke at a small, bounded multiple of maxEmissionPoints -- no pathological volume", () => {
    const longPath = Array.from({ length: 50 }, (_, i) => ({ x: i * 20, y: 0 }));
    const plan = resolveSprayParticlePlan(longPath, 10, hashSeed("long-mark"));
    expect(plan.length).toBeLessThanOrEqual(STUDIORICH_STOCK_CAP.maxEmissionPoints * STUDIORICH_STOCK_CAP.maxParticlesPerEmission);
  });

  it("returns an empty plan for a non-positive base radius, rather than throwing", () => {
    expect(resolveSprayParticlePlan([{ x: 0, y: 0 }, { x: 1, y: 1 }], 0, hashSeed("x"))).toEqual([]);
    expect(resolveSprayParticlePlan([{ x: 0, y: 0 }, { x: 1, y: 1 }], -5, hashSeed("x"))).toEqual([]);
  });
});
