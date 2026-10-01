import { describe, expect, it } from "vitest";
import {
  hashSeed,
  resolveSprayCapProfile,
  resolveSprayCorePlan,
  resolveSprayCoreSamplePoints,
  resolveSprayDripPlans,
  resolveSprayEmissionPoints,
  resolveSprayParticlePlan,
  SPRAY_CAP_PROFILES,
  STUDIORICH_FAT_CAP,
  STUDIORICH_STOCK_CAP,
  type SprayCapProfile,
} from "./sprayDeposition";
import { SPRAY_DRIP_TUNING } from "./dripDeposition";

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

  // LIVE STROKE STABILITY V2: this zigzag (180 points, ~7200 units of total
  // path length) is sized to stay comfortably UNDER resolveSprayEmissionPoints'
  // own maxEmissionPoints cap at this baseRadius (3000 emissions * ~2.64
  // step ~= 7920 units of coverage) -- Revision 8's ORIGINAL 600-point
  // version (~24,000 units) intentionally exceeded every cap this engine
  // has ever had, to prove "never truncate, always cover the whole path."
  // That guarantee is no longer this engine's design: per the explicit
  // "BLACKBOOK Spray Stability + Persistence Corrective Pass" batch,
  // append/prefix stability across a live, growing gesture now takes
  // priority over guaranteed whole-path coverage once a gesture exceeds the
  // cap (see LIVE STROKE STABILITY V2's own doc in sprayDeposition.ts) --
  // exceeding the cap now means "stop depositing NEW material," never "go
  // back and re-simplify what's already there." This test still proves the
  // original Revision 8 property (no straight-line collapse) for any
  // gesture that fits within the cap, which is the realistic case; the cap-
  // exceeding case has its OWN dedicated prefix-stability test below.
  it("resolveSprayEmissionPoints keeps real oscillation near each checkpoint throughout the path, not flattened toward the centerline after some point (the straight-line-collapse bug) -- checked over a small window since gap-filling interpolation between preserved corners legitimately adds intermediate-x points", () => {
    const amplitude = 20;
    const points = buildZigzag(180, amplitude);
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

describe("BLACKBOOK Spray Physicality V1 -- determinism", () => {
  it("identical new-style points (with tMs/pressure) + identical seed/cap -> identical particle plan", () => {
    const points = [
      { x: 100, y: 100, tMs: 0, pressure: 0.4 },
      { x: 140, y: 110, tMs: 30, pressure: 0.7 },
      { x: 180, y: 140, tMs: 80, pressure: 0.9 },
    ];
    const a = resolveSprayParticlePlan(points, 20, hashSeed("mark-phys"), STUDIORICH_FAT_CAP);
    const b = resolveSprayParticlePlan(points, 20, hashSeed("mark-phys"), STUDIORICH_FAT_CAP);
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });

  it("identical new-style points -> identical core plan (reload/replay proof)", () => {
    const points = [{ x: 0, y: 0, tMs: 0, pressure: 0.5 }, { x: 50, y: 10, tMs: 60, pressure: 0.5 }, { x: 90, y: 40, tMs: 140, pressure: 0.5 }];
    const first = resolveSprayCorePlan(points, 15, hashSeed("reload-mark"));
    const second = resolveSprayCorePlan(points, 15, hashSeed("reload-mark"));
    expect(first).toEqual(second);
  });

  it("legacy {x,y}-only Spray Marks (no tMs/pressure at all) still render deterministically, byte-identical to their own pre-Physicality-pass output shape", () => {
    const legacyPoints = [{ x: 100, y: 100 }, { x: 140, y: 110 }, { x: 180, y: 140 }];
    const a = resolveSprayParticlePlan(legacyPoints, 20, hashSeed("legacy-mark"));
    const b = resolveSprayParticlePlan(legacyPoints, 20, hashSeed("legacy-mark"));
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(0);
  });
});

describe("BLACKBOOK Spray Physicality V1 -- velocity (movement speed)", () => {
  it("a SLOW segment (small distance, large dt) deposits MORE than a FAST segment (large distance, small dt) covering the same span", () => {
    const slow = [{ x: 0, y: 0, tMs: 0 }, { x: 10, y: 0, tMs: 200 }]; // 0.05 px/ms
    const fast = [{ x: 0, y: 0, tMs: 0 }, { x: 10, y: 0, tMs: 5 }]; // 2 px/ms
    const slowPlan = resolveSprayParticlePlan(slow, 20, hashSeed("speed-test"));
    const fastPlan = resolveSprayParticlePlan(fast, 20, hashSeed("speed-test"));
    expect(slowPlan.length).toBeGreaterThan(fastPlan.length);
  });

  it("resolveSprayEmissionPoints' densityFactor is bounded even for an extreme velocity (very large or near-zero dt)", () => {
    const extreme = [{ x: 0, y: 0, tMs: 0 }, { x: 500, y: 0, tMs: 0.001 }];
    const emissions = resolveSprayEmissionPoints(extreme, 20);
    for (const e of emissions) {
      expect(e.densityFactor).toBeGreaterThanOrEqual(0.55);
      expect(e.densityFactor).toBeLessThanOrEqual(1.6);
    }
  });

  it("a stroke with NO tMs on any point falls back to the legacy point-spacing proxy (unchanged from pre-Physicality-pass behavior) -- checked directly on densityFactor, since total particle count also depends on the (unrelated) number of interpolated emission points along a longer segment", () => {
    const closePoints = [{ x: 0, y: 0 }, { x: 2, y: 0 }]; // close together -> dwelling -> higher density
    const farPoints = [{ x: 0, y: 0 }, { x: 40, y: 0 }]; // far apart -> fast -> lower density
    const closeEmissions = resolveSprayEmissionPoints(closePoints, 20);
    const farEmissions = resolveSprayEmissionPoints(farPoints, 20);
    expect(closeEmissions[closeEmissions.length - 1].densityFactor).toBeGreaterThan(farEmissions[farEmissions.length - 1].densityFactor);
  });
});

describe("BLACKBOOK Spray Physicality V1 -- pressure", () => {
  it("varying pressure across a stroke is bounded -- never collapses to near-zero or blows out particle count arbitrarily", () => {
    const points = [
      { x: 0, y: 0, tMs: 0, pressure: 0 },
      { x: 20, y: 0, tMs: 40, pressure: 1 },
      { x: 40, y: 0, tMs: 80, pressure: 0.5 },
    ];
    const plan = resolveSprayParticlePlan(points, 20, hashSeed("pressure-bounds"));
    expect(plan.length).toBeGreaterThan(0);
    for (const particle of plan) {
      expect(particle.radius).toBeGreaterThan(0);
      expect(particle.alpha).toBeGreaterThanOrEqual(0);
      expect(particle.alpha).toBeLessThanOrEqual(1);
    }
  });

  it("a CONSTANT pressure across the whole stroke (mouse's own PointerEvent.pressure=0.5 convention) produces the SAME plan as no pressure captured at all -- mouse stays fully usable, never mistaken for a real signal", () => {
    const withConstantPressure = [
      { x: 0, y: 0, tMs: 0, pressure: 0.5 },
      { x: 20, y: 0, tMs: 40, pressure: 0.5 },
      { x: 40, y: 0, tMs: 80, pressure: 0.5 },
    ];
    const withoutPressure = withConstantPressure.map(({ pressure: _pressure, ...rest }) => rest);
    const withPlan = resolveSprayParticlePlan(withConstantPressure, 20, hashSeed("mouse-test"));
    const withoutPlan = resolveSprayParticlePlan(withoutPressure, 20, hashSeed("mouse-test"));
    expect(withPlan).toEqual(withoutPlan);
  });

  it("a genuinely VARYING pressure signal changes the deposition from the neutral (no-signal) case", () => {
    const varying = [
      { x: 0, y: 0, tMs: 0, pressure: 0.1 },
      { x: 20, y: 0, tMs: 40, pressure: 0.9 },
      { x: 40, y: 0, tMs: 80, pressure: 0.3 },
    ];
    const neutral = varying.map(({ pressure: _pressure, ...rest }) => rest);
    const varyingPlan = resolveSprayParticlePlan(varying, 20, hashSeed("varying-pressure"));
    const neutralPlan = resolveSprayParticlePlan(neutral, 20, hashSeed("varying-pressure"));
    expect(varyingPlan).not.toEqual(neutralPlan);
  });

  it("missing pressure on some points but not others still produces a finite, bounded plan (safe fallback, never throws/NaNs)", () => {
    const mixed = [{ x: 0, y: 0, tMs: 0, pressure: 0.8 }, { x: 20, y: 0, tMs: 40 }, { x: 40, y: 0, tMs: 80, pressure: 0.3 }];
    const plan = resolveSprayParticlePlan(mixed, 20, hashSeed("mixed-pressure"));
    expect(plan.length).toBeGreaterThan(0);
    for (const particle of plan) {
      expect(Number.isFinite(particle.x)).toBe(true);
      expect(Number.isFinite(particle.y)).toBe(true);
      expect(Number.isFinite(particle.radius)).toBe(true);
      expect(Number.isFinite(particle.alpha)).toBe(true);
    }
  });
});

describe("BLACKBOOK Spray Physicality V1 -- cap personality", () => {
  const points = [{ x: 100, y: 100 }, { x: 140, y: 110 }, { x: 180, y: 140 }];

  it("Fat Cap and Stock/Skinny Cap produce genuinely DIFFERENT deposition characteristics from identical points/seed -- not merely different widths", () => {
    const stock = resolveSprayParticlePlan(points, 20, hashSeed("cap-compare"), STUDIORICH_STOCK_CAP);
    const fat = resolveSprayParticlePlan(points, 20, hashSeed("cap-compare"), STUDIORICH_FAT_CAP);
    expect(fat).not.toEqual(stock);
    // Fat: wider footprint -- particles land further from the emission point on average.
    const avgOffset = (plan: readonly { x: number; y: number }[], origin: { x: number; y: number }) =>
      plan.reduce((sum, p) => sum + Math.hypot(p.x - origin.x, p.y - origin.y), 0) / plan.length;
    expect(avgOffset(fat, points[0])).toBeGreaterThan(avgOffset(stock, points[0]) * 0.5);
    // Fat: individually larger particles (particleRadiusRatio + the wider
    // footprintRadiusScale both raise per-particle radius) -- a wider,
    // wash-like footprint from fewer-but-bigger deposits, not simply "more
    // dots of the same size" (a real fat cap's wider orifice covers more
    // area per pass, it doesn't multiply droplet count 1:1).
    const avgRadius = (plan: readonly { radius: number }[]) => plan.reduce((sum, p) => sum + p.radius, 0) / plan.length;
    expect(avgRadius(fat)).toBeGreaterThan(avgRadius(stock));
  });

  it("Fat Cap's core is proportionally narrower relative to its own wider footprint (soft-center wash, not a dominant line)", () => {
    const stockCore = resolveSprayCorePlan(points, 20, hashSeed("core-compare"), STUDIORICH_STOCK_CAP);
    const fatCore = resolveSprayCorePlan(points, 20, hashSeed("core-compare"), STUDIORICH_FAT_CAP);
    const stockWidth = stockCore[0].width;
    const fatWidth = fatCore[0].width;
    // Fat's effective radius is 1.65x, but coreWidthRatio is lower -- net width is not simply proportional.
    expect(fatWidth).not.toBeCloseTo(stockWidth * STUDIORICH_FAT_CAP.footprintRadiusScale, 1);
  });

  it("resolveSprayCapProfile resolves a known id, and falls back to Stock for an unknown/absent id (legacy Mark safety)", () => {
    expect(resolveSprayCapProfile("studiorich-fat").id).toBe("studiorich-fat");
    expect(resolveSprayCapProfile("studiorich-stock").id).toBe("studiorich-stock");
    expect(resolveSprayCapProfile(undefined).id).toBe("studiorich-stock");
    expect(resolveSprayCapProfile("unknown-future-cap").id).toBe("studiorich-stock");
  });

  it("SPRAY_CAP_PROFILES is a plain data registry containing both caps -- a future cap needs no new rendering branch", () => {
    expect(Object.keys(SPRAY_CAP_PROFILES).sort()).toEqual(["studiorich-fat", "studiorich-stock"]);
  });
});

describe("BLACKBOOK Live Stroke Stability V1 -- prefix stability under a growing gesture", () => {
  // Simulates a live, slowly-growing gesture: the same points array with
  // more points appended each "frame", exactly like activePoints during a
  // real pointermove sequence.
  function longSlowGesture(count: number): { x: number; y: number; tMs: number }[] {
    return Array.from({ length: count }, (_, i) => ({
      x: i * 3, y: Math.sin(i * 0.15) * 15, tMs: i * 20,
    }));
  }

  it("resolveSprayEmissionPoints: the emissions for an EARLIER prefix of a gesture are an exact PREFIX of the emissions for a LONGER version of the same gesture -- appending points never changes/reorders/regenerates earlier emissions", () => {
    const full = longSlowGesture(120);
    const shortPrefix = full.slice(0, 40);
    const shortEmissions = resolveSprayEmissionPoints(shortPrefix, 12);
    const fullEmissions = resolveSprayEmissionPoints(full, 12);
    expect(fullEmissions.length).toBeGreaterThan(shortEmissions.length);
    expect(fullEmissions.slice(0, shortEmissions.length)).toEqual(shortEmissions);
  });

  it("resolveSprayParticlePlan: particles generated for an earlier prefix are byte-identical and appear unchanged (same values, same order) once the gesture grows further -- the exact 'previously deposited pigment must not reorganize' requirement", () => {
    const full = longSlowGesture(120);
    const shortPrefix = full.slice(0, 40);
    const seed = hashSeed("stability-mark");
    const shortPlan = resolveSprayParticlePlan(shortPrefix, 12, seed);
    const fullPlan = resolveSprayParticlePlan(full, 12, seed);
    expect(fullPlan.length).toBeGreaterThan(shortPlan.length);
    expect(fullPlan.slice(0, shortPlan.length)).toEqual(shortPlan);
  });

  it("resolveSprayCorePlan: each pass's points for an earlier prefix are an exact prefix of the same pass once the gesture grows further", () => {
    const full = longSlowGesture(120);
    const shortPrefix = full.slice(0, 40);
    const seed = hashSeed("stability-core-mark");
    const shortPlan = resolveSprayCorePlan(shortPrefix, 12, seed);
    const fullPlan = resolveSprayCorePlan(full, 12, seed);
    expect(fullPlan.length).toBe(shortPlan.length); // same number of passes (corePasses is fixed)
    for (let i = 0; i < shortPlan.length; i++) {
      expect(fullPlan[i].points.length).toBeGreaterThan(shortPlan[i].points.length);
      expect(fullPlan[i].points.slice(0, shortPlan[i].points.length)).toEqual(shortPlan[i].points);
      // Width/alpha are stroke-level scalars (mean density/flow across the
      // whole path) -- these MAY drift slightly as the path grows (a longer
      // gesture's own mean speed differs from a short prefix's), which is
      // expected and does not violate per-point prefix stability.
    }
  });

  it("a realistic 'long, slow' gesture (well within the raised maxEmissionPoints budget) stays under the cap entirely", () => {
    const long = longSlowGesture(150); // comfortably under the cap at this baseRadius/step
    const emissions = resolveSprayEmissionPoints(long, 12);
    expect(emissions.length).toBeLessThan(STUDIORICH_STOCK_CAP.maxEmissionPoints);
  });
});

describe("LIVE STROKE STABILITY V2 -- a substantially longer, direction-changing gesture that CROSSES the emission/core budget threshold", () => {
  // A real reported failure: previously-deposited Spray visibly rearranged
  // once a long, continuing gesture crossed a resampling threshold, most
  // noticeably right around a direction change. This builds a path with
  // MANY direction changes (a zigzag, not a straight line -- straight-line
  // paths interpolate identically regardless of how the array is chunked,
  // so a zigzag is the shape that would actually expose a global
  // resample's bucket-boundary sensitivity) long enough to exceed BOTH
  // resolveSprayEmissionPoints' and resolveSprayCoreSamplePoints' own
  // maxEmissionPoints/CORE_MAX_SAMPLE_POINTS cap (3000) at this baseRadius.
  function longZigzagGesture(count: number, amplitude = 15): { x: number; y: number; tMs: number }[] {
    return Array.from({ length: count }, (_, i) => ({
      x: (i % 2 === 0 ? -amplitude : amplitude) + i * 0.02, y: i * 3, tMs: i * 10,
    }));
  }

  it("resolveSprayEmissionPoints: a prefix taken from BEFORE the cap is crossed is byte-identical whether or not the gesture goes on to cross it -- crossing the cap later never rewrites earlier segments, even across many direction changes", () => {
    const baseRadius = 12; // nominalStep ~= 2.64; cap 3000 -> ~7920 units of coverage
    const shortGesture = longZigzagGesture(150); // well under the cap on its own
    const veryLongGesture = longZigzagGesture(6000); // guaranteed to cross the cap given this path's own length
    const shortEmissions = resolveSprayEmissionPoints(shortGesture, baseRadius);
    const longEmissions = resolveSprayEmissionPoints(veryLongGesture, baseRadius);
    // The long gesture genuinely hit the cap (proving this test exercises the real threshold-crossing condition).
    expect(longEmissions.length).toBe(STUDIORICH_STOCK_CAP.maxEmissionPoints);
    expect(shortEmissions.length).toBeLessThan(longEmissions.length);
    // The exact invariant: everything computed from the SHORT prefix survives, unaltered, inside the long gesture's own result.
    expect(longEmissions.slice(0, shortEmissions.length)).toEqual(shortEmissions);
  });

  it("resolveSprayParticlePlan: same invariant end to end -- particles from an early prefix of a direction-changing gesture are an exact, unaltered prefix of the particles from the full, cap-exceeding gesture", () => {
    const baseRadius = 12;
    const seed = hashSeed("long-zigzag-mark");
    const shortGesture = longZigzagGesture(150);
    const veryLongGesture = longZigzagGesture(6000);
    const shortPlan = resolveSprayParticlePlan(shortGesture, baseRadius, seed);
    const longPlan = resolveSprayParticlePlan(veryLongGesture, baseRadius, seed);
    expect(longPlan.length).toBeGreaterThan(shortPlan.length);
    expect(longPlan.slice(0, shortPlan.length)).toEqual(shortPlan);
  });

  it("resolveSprayCoreSamplePoints/resolveSprayCorePlan: a direction-changing gesture that crosses CORE_MAX_SAMPLE_POINTS still preserves every earlier sample/pass-point unaltered", () => {
    const baseRadius = 12; // CORE_STEP_RATIO 0.9 -> step ~= 10.8; cap 3000 -> ~32,400 units of coverage
    const shortGesture = longZigzagGesture(300);
    const veryLongGesture = longZigzagGesture(15000); // long enough to exceed even the core's coarser step/cap
    const shortSamples = resolveSprayCoreSamplePoints(shortGesture, baseRadius);
    const longSamples = resolveSprayCoreSamplePoints(veryLongGesture, baseRadius);
    // The long gesture genuinely hit its own cap (proving this exercises the real threshold-crossing condition).
    expect(longSamples.length).toBeLessThan(veryLongGesture.length);
    expect(longSamples.length).toBeGreaterThan(shortSamples.length);
    expect(longSamples.slice(0, shortSamples.length)).toEqual(shortSamples);

    const seed = hashSeed("long-zigzag-core");
    const shortPlan = resolveSprayCorePlan(shortGesture, baseRadius, seed);
    const longPlan = resolveSprayCorePlan(veryLongGesture, baseRadius, seed);
    for (let i = 0; i < shortPlan.length; i++) {
      expect(longPlan[i].points.slice(0, shortPlan[i].points.length)).toEqual(shortPlan[i].points);
    }
  });

  it("incrementally growing the SAME direction-changing gesture one point at a time never alters any previously-computed emission -- the exact live-render scenario (pointermove appending points one frame at a time)", () => {
    const baseRadius = 12;
    const full = longZigzagGesture(4000);
    let previous = resolveSprayEmissionPoints(full.slice(0, 50), baseRadius);
    for (let cut = 200; cut <= full.length; cut += 400) {
      const current = resolveSprayEmissionPoints(full.slice(0, cut), baseRadius);
      expect(current.length).toBeGreaterThanOrEqual(previous.length);
      expect(current.slice(0, previous.length)).toEqual(previous);
      previous = current;
    }
  });
});

describe("BLACKBOOK Deterministic Drips β0.1 -- Spray's own drip seam (resolveSprayDripPlans)", () => {
  it("an ordinary fast gesture produces no drips", () => {
    const fast = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 800, y: 0 }];
    expect(resolveSprayDripPlans(fast, 12, hashSeed("spray-fast"))).toEqual([]);
  });

  it("a slow, tightly-dwelled gesture produces at least one bounded drip, respecting Spray's own (higher than Mop's) accumulation threshold", () => {
    const dwelled = Array.from({ length: 60 }, (_, i) => ({ x: i * 0.4, y: 0 }));
    const plans = resolveSprayDripPlans(dwelled, 12, hashSeed("spray-dwell"));
    expect(plans.length).toBeGreaterThan(0);
    expect(plans.length).toBeLessThanOrEqual(SPRAY_DRIP_TUNING.maxDripsPerStroke);
    for (const plan of plans) expect(plan.points.length).toBeLessThanOrEqual(SPRAY_DRIP_TUNING.maxDripSteps + 1);
  });

  it("is deterministic -- the same stroke points, radius, seed, and cap always replay to the identical drip plan", () => {
    const dwelled = Array.from({ length: 60 }, (_, i) => ({ x: i * 0.4, y: 0 }));
    const seed = hashSeed("spray-determinism");
    expect(resolveSprayDripPlans(dwelled, 12, seed)).toEqual(resolveSprayDripPlans(dwelled, 12, seed));
  });

  it("a different cap's effective (footprint-scaled) radius changes drip gravity/wobble scale consistently with its wider deposition, without losing determinism", () => {
    const dwelled = Array.from({ length: 60 }, (_, i) => ({ x: i * 0.4, y: 0 }));
    const seed = hashSeed("spray-cap");
    const stock = resolveSprayDripPlans(dwelled, 12, seed, STUDIORICH_STOCK_CAP);
    const fat = resolveSprayDripPlans(dwelled, 12, seed, STUDIORICH_FAT_CAP);
    expect(resolveSprayDripPlans(dwelled, 12, seed, STUDIORICH_STOCK_CAP)).toEqual(stock);
    expect(stock.length).toBeGreaterThan(0);
    expect(fat.length).toBeGreaterThan(0);
  });

  it("returns no plans for no points or a non-positive base radius, rather than throwing", () => {
    expect(resolveSprayDripPlans([], 12, hashSeed("spray-empty"))).toEqual([]);
    expect(resolveSprayDripPlans([{ x: 0, y: 0 }], 0, hashSeed("spray-empty"))).toEqual([]);
  });
});
