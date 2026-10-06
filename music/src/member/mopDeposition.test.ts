import { describe, expect, it } from "vitest";
import { MOP_DAB_ALPHA_SCALE, MOP_DOT_LIKE_DAB_THRESHOLD, MOP_MAX_EMISSION_POINTS, resolveMopDabPlan, resolveMopDripPlans, resolveMopEmissionPoints, type MopDab, type MopPoint } from "./mopDeposition";
import { MOP_DRIP_TUNING } from "./dripDeposition";

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

describe("BLACKBOOK Deterministic Drips β0.1 -- Mop's own drip seam (resolveMopDripPlans)", () => {
  it("an ordinary fast gesture produces no drips", () => {
    const fast = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 800, y: 0 }];
    expect(resolveMopDripPlans(fast, 17, 7)).toEqual([]);
  });

  it("a slow, tightly-dwelled gesture (closely-spaced points, well over Mop's own accumulation threshold) produces at least one bounded drip", () => {
    const dwelled = Array.from({ length: 40 }, (_, i) => ({ x: i * 0.5, y: 0 }));
    const plans = resolveMopDripPlans(dwelled, 17, 7);
    expect(plans.length).toBeGreaterThan(0);
    expect(plans.length).toBeLessThanOrEqual(MOP_DRIP_TUNING.maxDripsPerStroke);
    for (const plan of plans) expect(plan.points.length).toBeLessThanOrEqual(MOP_DRIP_TUNING.maxDripSteps + 1);
  });

  it("is deterministic -- the same stroke points, radius, and seed always replay to the identical drip plan", () => {
    const dwelled = Array.from({ length: 40 }, (_, i) => ({ x: i * 0.5, y: 0 }));
    expect(resolveMopDripPlans(dwelled, 17, 123)).toEqual(resolveMopDripPlans(dwelled, 17, 123));
  });

  it("a different seed (a different originating Mark id) produces different drip geometry, never Math.random()-style nondeterminism within one seed", () => {
    const dwelled = Array.from({ length: 40 }, (_, i) => ({ x: i * 0.5, y: 0 }));
    const a = resolveMopDripPlans(dwelled, 17, 1);
    const b = resolveMopDripPlans(dwelled, 17, 2);
    expect(a).not.toEqual(b);
  });

  it("returns no plans for no points or a non-positive base radius, rather than throwing", () => {
    expect(resolveMopDripPlans([], 17, 7)).toEqual([]);
    expect(resolveMopDripPlans([{ x: 0, y: 0 }], 0, 7)).toEqual([]);
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

/**
 * MOP/SPRAY POINTER-UP WYSIWYG V1 -- proves the actual defect recon found
 * (human acceptance): `isDotLike`/the lateral-scatter tangent used to be
 * recomputed from whatever `dabs` array a given CALL happened to receive,
 * so a live-preview WINDOW's own small array produced different rendering
 * decisions than the SAME dabs got once resolved as part of the complete
 * gesture. These tests simulate `advanceMopLivePreview`'s own windowing
 * (a trailing window with 1-point overlap, `dabOrdinalOffset` threaded
 * across windows exactly as blackbookRuntime.ts does) and assert the
 * result is IDENTICAL to one canonical `resolveMopDabPlan` call over the
 * complete gesture -- not merely similar.
 */
describe("MOP/SPRAY POINTER-UP WYSIWYG V1 -- live/canonical dab-rendering equivalence", () => {
  function zigZagStroke(count: number): MopPoint[] {
    const points: MopPoint[] = [];
    let x = 0;
    for (let i = 0; i < count; i += 1) {
      x += 3;
      points.push({ x, y: 25 * Math.sin(i / 5) });
    }
    return points;
  }

  /** Mirrors advanceMopLivePreview's own windowing + dabOrdinalOffset bookkeeping exactly, feeding it points.slice(0, end) windows of the given size. Returns the concatenated dabs with each window's own duplicated seam dab (the window's first dab) dropped, so the result lines up 1:1 against a canonical full-array call. */
  function simulateWindowedDabs(points: readonly MopPoint[], baseRadius: number, frameSize: number): MopDab[] {
    const result: MopDab[] = [];
    let dabOrdinalOffset = 0;
    let baked = 0;
    while (baked < points.length) {
      const nextBaked = Math.min(points.length, baked + frameSize);
      const windowStart = Math.max(0, baked - 1);
      const windowPoints = points.slice(windowStart, nextBaked);
      const isFirstWindow = baked === 0;
      baked = nextBaked;
      if (windowPoints.length < 2) continue;
      const dabs = resolveMopDabPlan(windowPoints, baseRadius, dabOrdinalOffset);
      result.push(...(isFirstWindow ? dabs : dabs.slice(1)));
      dabOrdinalOffset += dabs.length - (isFirstWindow ? 0 : 1);
    }
    return result;
  }

  it("a windowed, incrementally-produced dab plan is identical to one canonical call over the complete gesture -- positions, radii, perp vectors, and isDotLike all match", () => {
    const points = zigZagStroke(120);
    const baseRadius = 10;
    const canonical = resolveMopDabPlan(points, baseRadius);
    const windowed = simulateWindowedDabs(points, baseRadius, 5);
    expect(windowed).toEqual(canonical);
  });

  it("holds regardless of the window size chosen -- arbitrary chunk boundaries never change inclusion (isDotLike-gated) or lateral placement (perpX/perpY)", () => {
    const points = zigZagStroke(150);
    const baseRadius = 12;
    const canonical = resolveMopDabPlan(points, baseRadius);
    for (const frameSize of [2, 3, 7, 13, 40]) {
      const windowed = simulateWindowedDabs(points, baseRadius, frameSize);
      expect(windowed).toEqual(canonical);
    }
  });

  it("an early prefix's dabs, once resolved, are an EXACT, unaltered prefix of the complete gesture's dabs -- appending more points never retroactively changes an already-emitted dab's position, perp, or isDotLike", () => {
    const points = zigZagStroke(80);
    const baseRadius = 10;
    const earlyPrefix = points.slice(0, 20);
    const earlyDabs = resolveMopDabPlan(earlyPrefix, baseRadius);
    const fullDabs = resolveMopDabPlan(points, baseRadius);
    expect(fullDabs.slice(0, earlyDabs.length)).toEqual(earlyDabs);
  });

  it("a gesture that starts dot-like and grows into a long stroke keeps its first dabs dot-like forever -- never retroactively reclassified once the gesture is no longer short", () => {
    const points = zigZagStroke(80);
    const baseRadius = 10;
    const dabs = resolveMopDabPlan(points, baseRadius);
    expect(dabs.length).toBeGreaterThan(MOP_DOT_LIKE_DAB_THRESHOLD); // a genuinely long gesture
    for (let i = 0; i < MOP_DOT_LIKE_DAB_THRESHOLD; i += 1) expect(dabs[i].isDotLike).toBe(true);
    for (let i = MOP_DOT_LIKE_DAB_THRESHOLD; i < dabs.length; i += 1) expect(dabs[i].isDotLike).toBe(false);
  });

  it("a genuine dot/tap (very few total dabs) stays fully dot-like, matching the pre-existing single-call behavior exactly", () => {
    const tap: MopPoint[] = [{ x: 10, y: 10 }, { x: 11, y: 10.5 }];
    const dabs = resolveMopDabPlan(tap, 10);
    expect(dabs.length).toBeLessThanOrEqual(MOP_DOT_LIKE_DAB_THRESHOLD);
    for (const dab of dabs) {
      expect(dab.isDotLike).toBe(true);
    }
  });

  it("dabOrdinalOffset defaults to 0 -- byte-identical to every pre-existing caller (canonical commit, reload) that never passes it", () => {
    const points = zigZagStroke(30);
    const withDefault = resolveMopDabPlan(points, 10);
    const withExplicitZero = resolveMopDabPlan(points, 10, 0);
    expect(withDefault).toEqual(withExplicitZero);
  });

  /**
   * BLACKBOOK Presentation Readiness -- Mop Pointer-Up Live-Preview Catch-Up
   * V1. Mirrors `simulateWindowedDabs` above, but driven by an explicit
   * sequence of "baked up to" checkpoints instead of one uniform frame
   * size -- so an irregular cadence (ordinary small windows, then a single
   * large final jump) can be modeled directly. This is what
   * `blackbookRuntime.ts`'s `pointerup` handler now does: ordinary
   * `scheduleRender()`-driven windows advance `liveBakedPointCount` a
   * little at a time, then one explicit `advanceMopLivePreview()` call
   * (mirroring Spray's own `advanceSprayLivePreview()` catch-up) jumps
   * straight from wherever the live preview last got to, to the complete,
   * final point set -- simulating a `pointerup` that fires before the next
   * scheduled animation frame ever runs.
   */
  function simulateIrregularWindowedDabs(points: readonly MopPoint[], baseRadius: number, bakedCheckpoints: readonly number[]): MopDab[] {
    const result: MopDab[] = [];
    let dabOrdinalOffset = 0;
    let baked = 0;
    for (const nextBaked of bakedCheckpoints) {
      const windowStart = Math.max(0, baked - 1);
      const windowPoints = points.slice(windowStart, nextBaked);
      const isFirstWindow = baked === 0;
      baked = nextBaked;
      if (windowPoints.length < 2) continue;
      const dabs = resolveMopDabPlan(windowPoints, baseRadius, dabOrdinalOffset);
      result.push(...(isFirstWindow ? dabs : dabs.slice(1)));
      dabOrdinalOffset += dabs.length - (isFirstWindow ? 0 : 1);
    }
    return result;
  }

  it("a pointer-up catch-up (one large final window jumping straight to the complete point set, skipping the normal small-window cadence) never skips any pending source points -- identical to the canonical complete-gesture plan", () => {
    const points = zigZagStroke(120);
    const baseRadius = 10;
    const canonical = resolveMopDabPlan(points, baseRadius);
    // Ordinary small windows advance only partway (simulating however many
    // animation frames actually ran before release), THEN ONE final
    // checkpoint jumps straight to points.length -- exactly what calling
    // `advanceMopLivePreview()` once, synchronously, inside `pointerup`
    // does relative to whatever `liveBakedPointCount` was left at.
    const caughtUp = simulateIrregularWindowedDabs(points, baseRadius, [5, 10, 17, 23, 31, points.length]);
    expect(caughtUp).toEqual(canonical);
  });

  it("pointer-up catch-up from a cold start (no animation frame EVER ran for this gesture -- e.g. a very fast tap-and-release) still produces the complete, correct plan in one jump", () => {
    const points = zigZagStroke(40);
    const baseRadius = 10;
    const canonical = resolveMopDabPlan(points, baseRadius);
    const caughtUp = simulateIrregularWindowedDabs(points, baseRadius, [points.length]);
    expect(caughtUp).toEqual(canonical);
  });

  it("a catch-up call that finds nothing new (the live preview was already fully caught up) is a safe no-op -- matches advanceMopLivePreview's own early return when windowPoints.length < 2", () => {
    const points = zigZagStroke(60);
    const baseRadius = 10;
    // Already fully baked, then "catch up" is called again with the same endpoint.
    const alreadyCaughtUp = simulateIrregularWindowedDabs(points, baseRadius, [points.length, points.length]);
    const calledOnce = simulateIrregularWindowedDabs(points, baseRadius, [points.length]);
    expect(alreadyCaughtUp).toEqual(calledOnce);
  });

  it("perpX/perpY are a unit vector perpendicular to the dab's own originating segment direction, stable regardless of neighboring dabs", () => {
    const points: MopPoint[] = [{ x: 0, y: 0 }, { x: 100, y: 0 }]; // a pure horizontal segment
    const dabs = resolveMopDabPlan(points, 10);
    for (const dab of dabs) {
      // Perpendicular to a horizontal segment is vertical.
      expect(Math.abs(dab.perpX)).toBeLessThan(1e-6);
      expect(Math.abs(Math.abs(dab.perpY) - 1)).toBeLessThan(1e-6);
    }
  });
});
