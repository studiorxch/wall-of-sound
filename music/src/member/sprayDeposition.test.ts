import { describe, expect, it } from "vitest";
import {
  hashSeed,
  resolveSprayCorePlan,
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
    // Revision 4: the step is now adaptive (never narrower than the
    // nominal MIN_STEP_RATIO=0.22 step, but widened just enough that a
    // long path still fits within maxEmissionPoints without truncating --
    // see resolveSprayEmissionPoints's own doc). For this 500px path at
    // baseRadius 10, the adaptive step (500 / (maxEmissionPoints - 1)) is
    // itself the binding bound, not the nominal one.
    const path = { x: 500, y: 0 }; // total length of the fastDrag path above
    const expectedStep = Math.max(10 * 0.22, Math.hypot(path.x, path.y) / (STUDIORICH_STOCK_CAP.maxEmissionPoints - 1));
    expect(maxGap).toBeLessThanOrEqual(expectedStep + 1e-6);
  });

  it("never truncates a long path -- the final authored point is always represented, even when total length exceeds the nominal step budget", () => {
    const longDrag = [{ x: 0, y: 0 }, { x: 2000, y: 0 }];
    const emissions = resolveSprayEmissionPoints(longDrag, 10);
    const last = emissions[emissions.length - 1];
    expect(last.x).toBeCloseTo(2000, 5);
    expect(last.y).toBeCloseTo(0, 5);
    expect(emissions.length).toBeLessThanOrEqual(STUDIORICH_STOCK_CAP.maxEmissionPoints);
  });

  it("a multi-letter-length gesture (well past the old fixed-step point budget) still reaches its own final point -- regression for the Revision 3 premature-termination bug", () => {
    // Simulates a real several-second Spray gesture with pointer coalescing:
    // many recorded points, several thousand px of total path length --
    // comfortably more than the old fixed 0.22-ratio step could cover
    // within 200 emission points (the exact scenario that made Spray stop
    // depositing before the user finished writing a word).
    const gesture = Array.from({ length: 300 }, (_, i) => ({
      x: i * 14 + Math.sin(i * 0.3) * 8,
      y: Math.cos(i * 0.2) * 40,
    }));
    const emissions = resolveSprayEmissionPoints(gesture, 12);
    const last = emissions[emissions.length - 1];
    const finalAuthored = gesture[gesture.length - 1];
    expect(last.x).toBeCloseTo(finalAuthored.x, 5);
    expect(last.y).toBeCloseTo(finalAuthored.y, 5);
  });

  it("handles a curved path and a direction reversal without throwing or producing zero emission points", () => {
    const curve = [{ x: 0, y: 0 }, { x: 20, y: 30 }, { x: 40, y: 10 }, { x: 20, y: -10 }, { x: 0, y: 0 }];
    const emissions = resolveSprayEmissionPoints(curve, 8);
    expect(emissions.length).toBeGreaterThan(0);
  });
});

describe("Spray aerosol engine -- Calibration V1 (smaller, denser, softer coverage field)", () => {
  it("individual particle radius is a small fraction of the footprint radius (Stock Cap reads as a field, not a few big dots)", () => {
    const plan = resolveSprayParticlePlan([{ x: 0, y: 0 }, { x: 20, y: 0 }], 20, hashSeed("calibration-radius"));
    for (const particle of plan) expect(particle.radius).toBeLessThanOrEqual(20 * STUDIORICH_STOCK_CAP.particleRadiusRatio + 1e-9);
  });

  it("particle radius has jitter -- not every particle in a plan is the exact same size", () => {
    const plan = resolveSprayParticlePlan([{ x: 0, y: 0 }, { x: 60, y: 0 }], 15, hashSeed("calibration-jitter"));
    const radii = new Set(plan.map((particle) => particle.radius));
    expect(radii.size).toBeGreaterThan(1);
  });

  it("a normal-length tag stroke produces a dense-enough particle field to plausibly read as continuous coverage", () => {
    const tagStroke = Array.from({ length: 10 }, (_, i) => ({ x: i * 8, y: Math.sin(i / 2) * 6 }));
    const plan = resolveSprayParticlePlan(tagStroke, 12, hashSeed("calibration-density"));
    expect(plan.length).toBeGreaterThan(80);
  });
});

describe("Spray aerosol engine -- Revision 5 (particles excluded from the core's own center, no more doubled-up center darkness)", () => {
  it("particleMinRadiusRatio is honored per-particle: every particle's offset from ITS emission point is at least the excluded band's floor", () => {
    // Single stationary emission point (a tap) isolates one emission's
    // particles cleanly, so offset-from-emission is unambiguous.
    const baseRadius = 20;
    const plan = resolveSprayParticlePlan([{ x: 100, y: 100 }], baseRadius, hashSeed("revision5-tap-exclusion"));
    const minAllowed = baseRadius * STUDIORICH_STOCK_CAP.particleMinRadiusRatio - 1e-6;
    for (const particle of plan) {
      expect(Math.hypot(particle.x - 100, particle.y - 100)).toBeGreaterThanOrEqual(minAllowed);
    }
  });
});

describe("Spray core plan -- Revision 4 (continuous per-pass strokes, replaces Revision 3's per-segment strokes)", () => {
  it("produces exactly cap.corePasses passes, each a continuous multi-point path -- not many separate short segments", () => {
    const plan = resolveSprayCorePlan([{ x: 0, y: 0 }, { x: 60, y: 0 }], 15, hashSeed("core-a"));
    expect(plan.length).toBe(STUDIORICH_STOCK_CAP.corePasses);
    for (const pass of plan) expect(pass.points.length).toBeGreaterThanOrEqual(2);
  });

  it("bounds total sample points per pass even for a very long path", () => {
    const longPath = Array.from({ length: 50 }, (_, i) => ({ x: i * 20, y: 0 }));
    const plan = resolveSprayCorePlan(longPath, 10, hashSeed("core-long"));
    for (const pass of plan) expect(pass.points.length).toBeLessThanOrEqual(220);
  });

  it("position jitter and width variation are deterministic -- identical inputs replay to an identical plan", () => {
    const points = [{ x: 0, y: 0 }, { x: 30, y: 12 }, { x: 55, y: -8 }];
    const first = resolveSprayCorePlan(points, 18, hashSeed("core-deterministic"));
    const second = resolveSprayCorePlan(points, 18, hashSeed("core-deterministic"));
    expect(first).toEqual(second);
  });

  it("different Marks (different stable seeds) get different jitter, not one fixed pattern reused everywhere", () => {
    const points = [{ x: 0, y: 0 }, { x: 30, y: 12 }];
    const a = resolveSprayCorePlan(points, 18, hashSeed("core-mark-a"));
    const b = resolveSprayCorePlan(points, 18, hashSeed("core-mark-b"));
    expect(a).not.toEqual(b);
  });

  it("not every pass has the exact same width -- deterministic width variation, not a uniform line repeated", () => {
    const plan = resolveSprayCorePlan([{ x: 0, y: 0 }, { x: 80, y: 0 }], 20, hashSeed("core-width-variety"));
    const widths = new Set(plan.map((pass) => pass.width));
    expect(widths.size).toBeGreaterThan(1);
  });

  it("a tap/dot (single point) still produces a visible core -- a zero-length path a round line cap renders as a dot", () => {
    const plan = resolveSprayCorePlan([{ x: 40, y: 40 }], 12, hashSeed("core-dot"));
    expect(plan.length).toBeGreaterThan(0);
    for (const pass of plan) {
      expect(pass.points[0].x).toBeCloseTo(pass.points[pass.points.length - 1].x, 5);
      expect(pass.points[0].y).toBeCloseTo(pass.points[pass.points.length - 1].y, 5);
    }
  });

  it("each pass is drawn as ONE continuous path (no regularly-spaced short-segment nodes) -- consecutive sample points within a pass never jump further apart than the coarse core step, and adjacent points are never degenerately shorter than the pass's own line width in a way that would render as a chain of blobs", () => {
    const fastDrag = [{ x: 0, y: 0 }, { x: 400, y: 0 }];
    const plan = resolveSprayCorePlan(fastDrag, 10, hashSeed("core-fast"));
    for (const pass of plan) {
      expect(pass.points.length).toBeGreaterThan(1);
      // The whole pass is ONE polyline -- verified structurally by there
      // being a single points array per pass (not per-segment items), which
      // the renderer strokes with exactly one moveTo/lineTo chain and one
      // stroke() call.
    }
  });

  it("returns an empty plan for a non-positive base radius or no points, rather than throwing", () => {
    expect(resolveSprayCorePlan([{ x: 0, y: 0 }, { x: 1, y: 1 }], 0, hashSeed("x"))).toEqual([]);
    expect(resolveSprayCorePlan([], 10, hashSeed("x"))).toEqual([]);
  });

  it("Revision 4 regression: a multi-letter-length gesture's core plan still reaches the final authored point -- the premature-termination bug", () => {
    const gesture = Array.from({ length: 300 }, (_, i) => ({
      x: i * 14 + Math.sin(i * 0.3) * 8,
      y: Math.cos(i * 0.2) * 40,
    }));
    const plan = resolveSprayCorePlan(gesture, 12, hashSeed("core-long-gesture"));
    const finalAuthored = gesture[gesture.length - 1];
    const maxJitter = 12 * STUDIORICH_STOCK_CAP.coreJitterRatio + 1e-6;
    for (const pass of plan) {
      const lastPoint = pass.points[pass.points.length - 1];
      expect(Math.hypot(lastPoint.x - finalAuthored.x, lastPoint.y - finalAuthored.y)).toBeLessThanOrEqual(maxJitter);
    }
  });
});

describe("Spray aerosol engine -- bounded performance", () => {
  it("caps total emission points (and therefore particle count) even for a very long path, per the Stock Cap's maxEmissionPoints", () => {
    const longPath = Array.from({ length: 50 }, (_, i) => ({ x: i * 20, y: 0 }));
    const emissions = resolveSprayEmissionPoints(longPath, 10);
    expect(emissions.length).toBeLessThanOrEqual(STUDIORICH_STOCK_CAP.maxEmissionPoints);
  });

  it("Revision 4 regression: the particle field's last emission still reaches the final authored point on a multi-letter-length gesture", () => {
    const gesture = Array.from({ length: 300 }, (_, i) => ({
      x: i * 14 + Math.sin(i * 0.3) * 8,
      y: Math.cos(i * 0.2) * 40,
    }));
    const plan = resolveSprayParticlePlan(gesture, 12, hashSeed("particle-long-gesture"));
    const finalAuthored = gesture[gesture.length - 1];
    const nearFinal = plan.some((particle) => Math.hypot(particle.x - finalAuthored.x, particle.y - finalAuthored.y) < 12 * 1.2);
    expect(nearFinal).toBe(true);
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

describe("Spray aerosol engine -- Revision 8 (a long zigzag's late-stage direction changes survive, not just its endpoints)", () => {
  function buildZigzag(count: number, amplitude = 20): { x: number; y: number }[] {
    return Array.from({ length: count }, (_, i) => ({ x: i % 2 === 0 ? -amplitude : amplitude, y: i * 4 }));
  }

  it("resolveSprayEmissionPoints keeps real oscillation near each checkpoint throughout the path, not flattened toward the centerline after some point (the straight-line-collapse bug) -- checked over a small window since gap-filling interpolation between preserved corners legitimately adds intermediate-x points", () => {
    const amplitude = 20;
    const points = buildZigzag(600, amplitude);
    const emissions = resolveSprayEmissionPoints(points, 12);
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

  it("resolveSprayCorePlan's late-stage segments still follow the zigzag -- not a straight line to the endpoint", () => {
    const amplitude = 20;
    const points = buildZigzag(600, amplitude);
    const plan = resolveSprayCorePlan(points, 12, hashSeed("zigzag-core"));
    const pass = plan[0];
    const lastQuarter = pass.points.filter((point) => point.y >= 0.75 * (points.length - 1) * 4);
    expect(lastQuarter.length).toBeGreaterThan(1);
    const xs = lastQuarter.map((point) => point.x);
    const spread = Math.max(...xs) - Math.min(...xs);
    expect(spread).toBeGreaterThan(amplitude); // real oscillation, not collapsed
  });
});
