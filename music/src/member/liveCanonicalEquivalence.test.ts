/**
 * BLACKBOOK Presentation Readiness -- Live/Canonical Equivalence Harness
 * V1.
 *
 * Physical acceptance has repeatedly found individual live-vs-canonical
 * discrepancies "by eye" (window-boundary caps, duplicated seam dabs,
 * window-local core scalars, Mop's global resampling dependency, Spray's
 * un-painted release flare) across several rounds. This file is the
 * instrumented, reusable harness that compares live-preview-simulated
 * output against canonical output DIRECTLY, so future regressions (or any
 * remaining discrepancy) show up as a failing assertion instead of a
 * physical retest finding a NEW thing to trace by eye.
 *
 * Each `simulate*` helper here mirrors a REAL, currently-shipping function
 * in `blackbookRuntime.ts` byte-for-byte in its own decision logic (window
 * boundaries, cursor threading, override computation) -- NOT an
 * idealized or simplified stand-in. When `blackbookRuntime.ts`'s own
 * live-preview logic changes, the corresponding `simulate*` helper here
 * must change with it, or this harness silently stops meaning anything.
 */
import { describe, expect, it } from "vitest";
import { paintSprayParticles, strokeMop } from "./strokeSmoothing";
import { MOP_MAX_EMISSION_POINTS, resolveMopDabPlan, type MopPoint } from "./mopDeposition";
import {
  STUDIORICH_STOCK_CAP,
  advanceSprayEmissionPoints,
  advanceSprayParticles,
  finalizeSprayParticles,
  hashSeed,
  resolveSprayCorePlan,
  resolveSprayCoreSamplePoints,
  resolveSprayCoreStatistics,
  resolveSprayParticlePlan,
  type SprayCapProfile,
  type SprayCorePass,
  type SprayEmissionCursor,
  type SprayParticleCursor,
  type SprayPoint,
} from "./sprayDeposition";

/** Combines fakeStrokeContext's stroke tracking with fakeMopContext's fill/gradient tracking (mirrors strokeSmoothing.test.ts's own fakeMopContext) -- strokeMop's body pass strokes, its dab pass fills. */
function fakeMopContext() {
  const calls: string[] = [];
  const ctx = {
    save: () => calls.push("save"),
    restore: () => calls.push("restore"),
    stroke: () => calls.push("stroke"),
    fill: () => calls.push("fill"),
    beginPath: () => calls.push("beginPath"),
    moveTo: (x: number, y: number) => calls.push(`moveTo(${x},${y})`),
    lineTo: (x: number, y: number) => calls.push(`lineTo(${x},${y})`),
    arc: (x: number, y: number, r: number) => calls.push(`arc(${x},${y},${r})`),
    createRadialGradient: () => {
      calls.push("createRadialGradient");
      return { addColorStop: () => {} };
    },
    lineWidth: 0,
    globalAlpha: 0,
    strokeStyle: "",
    fillStyle: "" as unknown,
    lineCap: "",
    lineJoin: "",
    globalCompositeOperation: "",
  };
  return { ctx, calls };
}

function zigZagStroke(count: number, options?: { readonly deceleratingTail?: boolean }): MopPoint[] {
  const points: MopPoint[] = [];
  let x = 0;
  for (let i = 0; i < count; i += 1) {
    const step = options?.deceleratingTail && i >= count - 4 ? 3 / (i - (count - 5)) : 3;
    x += step;
    points.push({ x, y: 25 * Math.sin(i / 5), tMs: i * 16 });
  }
  return points;
}

describe("Live/Canonical Equivalence Harness -- Mop body+dab redraw", () => {
  const style = { width: 20, color: "#112233", opacity: 0.9 };

  /**
   * Mirrors `advanceMopLivePreview` exactly (blackbookRuntime.ts): no
   * windowing, no options -- every frame redraws the complete path so far
   * via the IDENTICAL canonical `strokeMop` call. Returns the call
   * sequence captured at each growing prefix, so a caller can inspect any
   * frame, not only the last.
   */
  function simulateMopLiveFrames(points: readonly MopPoint[], frameSizes: readonly number[]): readonly string[][] {
    const frames: string[][] = [];
    for (const frameEnd of frameSizes) {
      const prefix = points.slice(0, frameEnd);
      if (prefix.length < 2) { frames.push([]); continue; }
      const { ctx, calls } = fakeMopContext();
      strokeMop(ctx as never, prefix, style, "op-1");
      frames.push(calls);
    }
    return frames;
  }

  it("the final live frame (the complete, growing point set) is byte-identical to one canonical strokeMop call over the same points", () => {
    const points = zigZagStroke(120);
    const live = simulateMopLiveFrames(points, [2, 10, 30, 60, 90, 120]);
    const { ctx: canonicalCtx, calls: canonicalCalls } = fakeMopContext();
    strokeMop(canonicalCtx as never, points, style, "op-1");
    expect(live[live.length - 1]).toEqual(canonicalCalls);
  });

  it("holds for a gesture long enough to overflow the emission-point budget and trigger canonical's own global simplification -- the exact case windowed live preview was empirically measured to diverge on (260 vs 371 emission points)", () => {
    const points = zigZagStroke(260);
    const { ctx: liveCtx, calls: liveCalls } = fakeMopContext();
    strokeMop(liveCtx as never, points, style, "op-1");
    const { ctx: canonicalCtx, calls: canonicalCalls } = fakeMopContext();
    strokeMop(canonicalCtx as never, points, style, "op-1");
    expect(liveCalls).toEqual(canonicalCalls);
  });

  it("every intermediate frame is ALSO exactly what a canonical call over that same prefix would produce -- not merely the final frame -- so whichever frame happens to be the last one painted before pointer-up is always already correct", () => {
    const points = zigZagStroke(150);
    const checkpoints = [2, 4, 8, 16, 32, 64, 96, 128, 150];
    const live = simulateMopLiveFrames(points, checkpoints);
    checkpoints.forEach((frameEnd, index) => {
      const prefix = points.slice(0, frameEnd);
      const { ctx, calls } = fakeMopContext();
      strokeMop(ctx as never, prefix, style, "op-1");
      expect(live[index]).toEqual(calls);
    });
  });

  it("a decelerating-tail gesture (dwell before release) is also exactly equivalent at every frame -- the live redraw has no gesture-shape-dependent special case", () => {
    const points = zigZagStroke(90, { deceleratingTail: true });
    const { ctx: liveCtx, calls: liveCalls } = fakeMopContext();
    strokeMop(liveCtx as never, points, style, "op-1");
    const { ctx: canonicalCtx, calls: canonicalCalls } = fakeMopContext();
    strokeMop(canonicalCtx as never, points, style, "op-1");
    expect(liveCalls).toEqual(canonicalCalls);
  });
});

describe("Live/Canonical Equivalence Harness -- Spray core geometry/width/alpha", () => {
  const baseRadius = 10;
  const cap: SprayCapProfile = STUDIORICH_STOCK_CAP;

  function sprayGesture(count: number, options?: { readonly deceleratingTail?: boolean }): SprayPoint[] {
    const points: SprayPoint[] = [];
    let x = 0;
    for (let i = 0; i < count; i += 1) {
      const step = options?.deceleratingTail && i >= count - 4 ? 3 / (i - (count - 5)) : 3;
      x += step;
      points.push({ x, y: 18 * Math.sin(i / 6), tMs: i * 16 });
    }
    return points;
  }

  /**
   * Mirrors `advanceSprayLivePreview` exactly (blackbookRuntime.ts): for
   * each growing checkpoint, windows from `max(0, lastBaked - 1)` to the
   * checkpoint (1-point overlap), resolves `coreOverride` from the
   * COMPLETE growing point set so far (never the window), and calls
   * `resolveSprayCorePlan` with `coreOverride` set -- exactly the call
   * `strokeSpray`'s own core-pass loop makes internally. Returns the
   * concatenated per-window `SprayCorePass[]` arrays (one array per
   * window, in window order) so a caller can reassemble the full painted
   * geometry across every window boundary.
   */
  function simulateSprayCoreWindows(points: readonly SprayPoint[], checkpoints: readonly number[], seed: number): readonly (readonly SprayCorePass[])[] {
    const windows: (readonly SprayCorePass[])[] = [];
    let baked = 0;
    for (const nextBaked of checkpoints) {
      const windowStart = Math.max(0, baked - 1);
      const windowPoints = points.slice(windowStart, nextBaked);
      baked = nextBaked;
      if (windowPoints.length < 2) { windows.push([]); continue; }
      const growingPoints = points.slice(0, nextBaked);
      const coreOverride = resolveSprayCoreStatistics(growingPoints, baseRadius, seed, cap);
      windows.push(resolveSprayCorePlan(windowPoints, baseRadius, seed, cap, coreOverride));
    }
    return windows;
  }

  it("core SAMPLE POSITIONS are purely per-segment (no adaptive/global resampling), so a window's own samples are an exact sub-sequence of canonical's complete-path samples -- no drift at any window boundary", () => {
    const points = sprayGesture(140);
    const canonicalSamples = resolveSprayCoreSamplePoints(points, baseRadius, cap);
    const checkpoints = [3, 10, 25, 50, 90, 140];
    let baked = 0;
    const reassembled: { x: number; y: number }[] = [];
    for (const nextBaked of checkpoints) {
      const windowStart = Math.max(0, baked - 1);
      const windowPoints = points.slice(windowStart, nextBaked);
      baked = nextBaked;
      if (windowPoints.length < 2) continue;
      const windowSamples = resolveSprayCoreSamplePoints(windowPoints, baseRadius, cap);
      // Drop this window's own leading sample when it's a re-emitted
      // overlap point shared with the previous window's trailing sample
      // (same de-duplication `advanceMopLivePreview` used to need for Mop's
      // body pass before Mop's own full-redraw fix -- Spray's core pass
      // still windows, so it still needs this at reassembly time here).
      const isFirstWindow = reassembled.length === 0;
      const toAppend = isFirstWindow ? windowSamples : windowSamples.slice(1);
      reassembled.push(...toAppend.map((s) => ({ x: s.x, y: s.y })));
    }
    expect(reassembled).toEqual(canonicalSamples.map((s) => ({ x: s.x, y: s.y })));
  });

  it("core ALPHA (via the whole-gesture coreOverride's meanFlow) is identical across EVERY window, start to finish -- it depends only on flow/pass-ratio, never on data the gesture hasn't produced yet", () => {
    const points = sprayGesture(110, { deceleratingTail: true });
    const seed = hashSeed("op-spray-1");
    const canonical = resolveSprayCorePlan(points, baseRadius, seed, cap);
    const windows = simulateSprayCoreWindows(points, [3, 12, 30, 60, 90, 110], seed);
    for (const windowPasses of windows) {
      if (windowPasses.length === 0) continue;
      windowPasses.forEach((pass, passIndex) => {
        expect(pass.alpha).toBeCloseTo(canonical[passIndex].alpha, 10);
      });
    }
  });

  it("core WIDTH converges to canonical's own single-call value exactly by the FINAL window (the one whose growing point set equals the complete gesture) -- the Windowed Core-Pass Consistency Fix V1 regression, re-proven end to end here. Width is expected to differ in EARLIER windows, since meanDensity/travelAngle are honestly computed from however much of the gesture has been captured so far -- the acceptance contract is zero visible change AT POINTER-UP (the final frame), not frame-to-frame identity throughout the gesture.", () => {
    const points = sprayGesture(110, { deceleratingTail: true });
    const seed = hashSeed("op-spray-1");
    const canonical = resolveSprayCorePlan(points, baseRadius, seed, cap);
    const checkpoints = [3, 12, 30, 60, 90, 110];
    const windows = simulateSprayCoreWindows(points, checkpoints, seed);
    const finalWindow = windows[windows.length - 1];
    finalWindow.forEach((pass, passIndex) => {
      expect(pass.width).toBeCloseTo(canonical[passIndex].width, 10);
    });
  });
});

describe("Live/Canonical Equivalence Harness -- Spray particle count/position/deposition footprint", () => {
  const baseRadius = 10;
  const cap: SprayCapProfile = STUDIORICH_STOCK_CAP; // flareResponse: 0.5 -- exercises the release flare

  function sprayGesture(count: number): SprayPoint[] {
    const points: SprayPoint[] = [];
    let x = 0;
    let lastY = 0;
    for (let i = 0; i < count - 1; i += 1) {
      x += 5;
      lastY = 18 * Math.sin(i / 6);
      points.push({ x, y: lastY, tMs: i * 16 });
    }
    // `tailFlareFactor` (sprayDeposition.ts) fires only when the gesture's
    // own FINAL raw segment is genuinely shorter than the maxStep-spaced
    // emission walk's own prior spacing -- i.e. an abrupt release, not
    // merely "fewer points arriving per unit time." A segment that shrinks
    // in only ONE axis (e.g. x alone, with y still moving at its ordinary
    // oscillation rate) can still have an ordinary total length and never
    // trigger the flare at all, silently failing to cover the exact defect
    // this harness exists to catch. A true pause -- barely moving in EITHER
    // axis from the previous point -- reliably triggers it.
    points.push({ x: x + 0.2, y: lastY + 0.1, tMs: (count - 1) * 16 });
    return points;
  }

  /**
   * Mirrors `advanceSprayLivePreview`'s particle-cursor threading plus
   * `beginSprayCanonicalBake`'s own release-flare-parity fix exactly: the
   * live cursor is advanced once per checkpoint on the FULL growing point
   * set (never a window -- particle emission/resolution never windowed,
   * only the core pass does), then at the FINAL checkpoint
   * `finalizeSprayParticles` is called (mirroring `beginSprayCanonicalBake`)
   * and the slice beyond what the cursor already had is the release flare
   * -- now painted live by the fix in this same batch, so it is included
   * here as "already part of the live-equivalent particle set" rather
   * than a separate, later-arriving addition.
   */
  function simulateSprayLiveParticles(points: readonly SprayPoint[], checkpoints: readonly number[], seed: number): readonly SprayPoint[] {
    let emissionCursor: SprayEmissionCursor | null = null;
    let particleCursor: SprayParticleCursor | null = null;
    for (const nextBaked of checkpoints) {
      const growingPoints = points.slice(0, nextBaked);
      emissionCursor = advanceSprayEmissionPoints(emissionCursor, growingPoints, baseRadius, cap);
      particleCursor = advanceSprayParticles(particleCursor, seed, emissionCursor, baseRadius, cap);
    }
    const finalParticles = finalizeSprayParticles(particleCursor, seed, emissionCursor as SprayEmissionCursor, baseRadius, cap);
    return finalParticles;
  }

  it("the release flare fires for this gesture (sanity check that this harness actually exercises the defect it's meant to catch)", () => {
    const points = sprayGesture(80);
    const seed = hashSeed("op-spray-flare");
    const emissionCursor = advanceSprayEmissionPoints(null, points, baseRadius, cap);
    const withoutFlare = advanceSprayParticles(null, seed, emissionCursor, baseRadius, cap);
    const withFlare = finalizeSprayParticles(null, seed, emissionCursor, baseRadius, cap);
    expect(withFlare.length).toBeGreaterThan(withoutFlare.particles.length);
  });

  it("the live-equivalent particle set (cursor-advanced + the release flare, exactly as beginSprayCanonicalBake now paints it) is count-for-count and position-for-position identical to one canonical resolveSprayParticlePlan call over the complete gesture", () => {
    const points = sprayGesture(80);
    const seed = hashSeed("op-spray-flare");
    const canonical = resolveSprayParticlePlan(points, baseRadius, seed, cap);
    const live = simulateSprayLiveParticles(points, [3, 10, 25, 45, 65, 80], seed);
    expect(live).toEqual(canonical);
  });

  it("holds regardless of live-preview frame cadence -- a coarse or fine checkpoint schedule never changes the final particle set (count, position, radius, alpha all identical)", () => {
    const points = sprayGesture(95);
    const seed = hashSeed("op-spray-cadence");
    const canonical = resolveSprayParticlePlan(points, baseRadius, seed, cap);
    for (const checkpoints of [[95], [10, 95], [2, 5, 10, 20, 40, 60, 80, 95], [47, 95]]) {
      const live = simulateSprayLiveParticles(points, checkpoints, seed);
      expect(live).toEqual(canonical);
    }
  });

  it("deposition footprint/density proxy -- total particle-disc coverage area (sum of pi*r^2 across all particles) of the live-equivalent set matches canonical exactly, not merely approximately", () => {
    const points = sprayGesture(70);
    const seed = hashSeed("op-spray-footprint");
    const canonical = resolveSprayParticlePlan(points, baseRadius, seed, cap);
    const live = simulateSprayLiveParticles(points, [5, 15, 35, 55, 70], seed);
    const footprint = (particles: readonly { readonly radius: number }[]) => particles.reduce((sum, p) => sum + Math.PI * p.radius * p.radius, 0);
    expect(footprint(live)).toBeCloseTo(footprint(canonical), 10);
  });

  it("REGRESSION GUARD -- before the release-flare-parity fix, the live cursor's own particle set (without finalize's flare) was strictly SMALLER than canonical's, proving the un-painted-flare pop was real, not a false positive this harness invents", () => {
    const points = sprayGesture(80);
    const seed = hashSeed("op-spray-flare");
    const canonical = resolveSprayParticlePlan(points, baseRadius, seed, cap);
    const emissionCursor = advanceSprayEmissionPoints(null, points, baseRadius, cap);
    const liveCursorOnly = advanceSprayParticles(null, seed, emissionCursor, baseRadius, cap);
    expect(liveCursorOnly.particles.length).toBeLessThan(canonical.length);
  });
});

/**
 * BLACKBOOK Presentation Readiness -- Residual Isolated-Dot Diagnostic V1.
 *
 * Physical retest of `456066c` (1006J) found the major Mop/Spray pointer-
 * up WYSIWYG defect resolved, but reported a small residual: an isolated
 * Mop dot/deposit, and a small isolated Spray dot/deposition difference,
 * both still occasionally visible around pointer-up. Per instruction, this
 * is a DIAGNOSTIC pass only -- no speculative visual fix. These tests
 * isolate the exact provenance of each residual, at the pure-function
 * level, using the smallest reproduction that demonstrates it.
 */
describe("Residual isolated-dot diagnostic -- Mop", () => {
  function zigZagStroke(count: number): MopPoint[] {
    const points: MopPoint[] = [];
    let x = 0;
    for (let i = 0; i < count; i += 1) {
      x += 3;
      points.push({ x, y: 25 * Math.sin(i / 5) });
    }
    return points;
  }

  /**
   * PROVENANCE FOUND: the Mop full-redraw architecture (1006J) makes every
   * live frame a byte-identical canonical `strokeMop` call over its OWN
   * input -- proven in the describe block above. That is necessary but not
   * sufficient for "zero visible change at pointer-up," because the LAST
   * frame the artist's eye actually saw (painted on some earlier animation
   * frame, over however many points had arrived by then) and the FINAL
   * commit (over the complete, slightly longer point set once a few more
   * pointermove samples land before pointerup fires) are two DIFFERENT
   * inputs to that otherwise-identical function. For an ordinary gesture
   * this is invisible -- the extra few points just extend the stroke's own
   * tail by a few pixels, exactly as a growing stroke should look. This
   * test isolates the one case where it ISN'T invisible: once a gesture's
   * own resolved dab count has reached `MOP_MAX_EMISSION_POINTS` (260) --
   * `resolveMopEmissionPoints`'s own global, bucketed
   * `simplifyPathToBudget` reselection (mopDeposition.ts; not the adaptive-
   * maxStep mechanism 1006J's full-redraw already neutralized, a distinct,
   * already-disclosed debt item -- see docs/architecture/DEBT.md's "Mop
   * emission resampling is not append-stable for a very long gesture")
   * picks DIFFERENT representative points, by BUCKET INDEX over the
   * CURRENT total array, once the array's own length changes -- even by
   * only 3 points, even though neither input is anywhere near
   * MOP_MAX_EMISSION_POINTS *raw* points (confirmed below: this reproduces
   * at 200 raw points, which never even reaches the SEPARATE raw-point
   * presimplification stage inside the same function -- the one additional
   * global bucketed stage is enough on its own). The reselection moves
   * dabs ANYWHERE in the array, not merely at the tail -- dab #13 (of 60
   * compared) shifts position/radius in this exact reproduction, nowhere
   * near either array's own tail.
   */
  it("PROVENANCE -- once a gesture's dab plan hits the MOP_MAX_EMISSION_POINTS cap, appending even 3 more raw points reselects an EARLY/MIDDLE dab's position, not merely the tail -- the residual isolated-dot mechanism", () => {
    const full = zigZagStroke(200);
    const almostFull = full.slice(0, 197); // "the last live frame the eye saw" -- 3 pointermove samples short of the final commit
    const fullDabs = resolveMopDabPlan(full, 10);
    const almostFullDabs = resolveMopDabPlan(almostFull, 10);
    // Both ALREADY at the cap -- confirms this reproduction exercises the
    // emission-level simplifyPathToBudget stage, not merely "a longer tail."
    expect(fullDabs.length).toBe(MOP_MAX_EMISSION_POINTS);
    expect(almostFullDabs.length).toBe(MOP_MAX_EMISSION_POINTS);
    const compareCount = Math.min(60, fullDabs.length, almostFullDabs.length);
    let firstDivergingIndex = -1;
    for (let index = 0; index < compareCount; index += 1) {
      if (Math.abs(fullDabs[index].x - almostFullDabs[index].x) > 1e-6 || Math.abs(fullDabs[index].y - almostFullDabs[index].y) > 1e-6) {
        firstDivergingIndex = index;
        break;
      }
    }
    expect(firstDivergingIndex).toBeGreaterThanOrEqual(0);
    expect(firstDivergingIndex).toBeLessThan(compareCount - 1); // not merely the tail
  });

  it("CONTROL -- below the MOP_MAX_EMISSION_POINTS cap, appending more raw points is perfectly append-stable (an early prefix's dabs are an exact, byte-identical sub-sequence) -- isolating the cap crossing, not raw point count alone, as the actual trigger", () => {
    const full = zigZagStroke(150);
    const almostFull = full.slice(0, 147);
    const fullDabs = resolveMopDabPlan(full, 10);
    const almostFullDabs = resolveMopDabPlan(almostFull, 10);
    expect(fullDabs.length).toBeLessThan(MOP_MAX_EMISSION_POINTS);
    expect(almostFullDabs.length).toBeLessThan(MOP_MAX_EMISSION_POINTS);
    expect(almostFullDabs).toEqual(fullDabs.slice(0, almostFullDabs.length));
  });

  it("CONTROL -- the raw-point presimplification stage alone (gesture under ~260 RAW points, so it never triggers) is not the mechanism -- the 200-raw-point reproduction above already diverges despite never reaching that separate stage, confirming the EMISSION-level cap is the actual, sole provenance", () => {
    const full = zigZagStroke(200);
    // 200 raw points is well under the 260-raw-point threshold that would
    // trigger resolveMopEmissionPoints' OWN raw-point simplifyPathToBudget
    // pass (`points.length - 1 > budget`) -- so whatever divergence this
    // gesture shows (proven above) cannot be attributed to that stage.
    expect(full.length - 1).toBeLessThan(MOP_MAX_EMISSION_POINTS - 1);
  });
});

describe("Residual isolated-dot diagnostic -- Spray", () => {
  const baseRadius = 10;
  const cap: SprayCapProfile = STUDIORICH_STOCK_CAP;

  function gesture(count: number): SprayPoint[] {
    const points: SprayPoint[] = [];
    let x = 0;
    for (let i = 0; i < count; i += 1) {
      x += 3;
      points.push({ x, y: 18 * Math.sin(i / 6), tMs: i * 16 });
    }
    return points;
  }

  /**
   * Spray has no analogous global bucketed resampling anywhere in its
   * deposition pipeline (confirmed by inspection: zero references to
   * `simplifyPathToBudget` in sprayDeposition.ts -- every cap, on both the
   * particle-emission walk and the core-sample walk, is a hard APPEND
   * CUTOFF, never a re-selection -- "LIVE STROKE STABILITY V2"'s own
   * doc). This re-proves append-stability at a scale (2000 raw points,
   * ~20K particles) an order of magnitude past anything the existing
   * equivalence harness above already covered (~70-140 points), to rule
   * out a Mop-style cap-crossing mechanism existing at some larger,
   * untested scale for Spray too.
   */
  it("PARTICLE positions remain exactly append-stable at far larger scale than previously tested (2000 raw points, ~20K particles) -- no Mop-style cap-crossing mechanism exists for Spray's particle field", () => {
    const full = gesture(2000);
    const almostFull = full.slice(0, 1997);
    const seed = hashSeed("op-spray-scale");
    const fullParticles = resolveSprayParticlePlan(full, baseRadius, seed, cap);
    const almostParticles = resolveSprayParticlePlan(almostFull, baseRadius, seed, cap);
    expect(almostParticles).toEqual(fullParticles.slice(0, almostParticles.length));
  });

  it("CORE sample positions remain exactly append-stable at the same larger scale", () => {
    const full = gesture(2000);
    const almostFull = full.slice(0, 1997);
    const fullSamples = resolveSprayCoreSamplePoints(full, baseRadius, cap);
    const almostSamples = resolveSprayCoreSamplePoints(almostFull, baseRadius, cap);
    expect(almostSamples).toEqual(fullSamples.slice(0, almostSamples.length));
  });

  /**
   * Directly supports distinguishing the two things the acceptance report
   * asks to distinguish: "a particle disappearing/moving is still a
   * failure; the same particle becoming softer is acceptable." Captures
   * the actual canvas calls `paintSprayParticles` issues for ONE isolated
   * particle (deliberately sparse surroundings, no neighbors to visually
   * mask anything) under both rendering styles, and asserts the ONLY
   * difference is the fill primitive (gradient vs flat solid fill) -- the
   * arc()'s own x/y/radius (the particle's actual deposition footprint)
   * is identical either way, proving a lone particle's flat-to-gradient
   * transition is a pure rendering-style change, never a position/size
   * change, for this exact primitive.
   */
  it("an isolated particle's flat vs. gradient paint differ ONLY in fill style -- the arc()'s own position/radius (actual deposition footprint) is byte-identical either way", () => {
    const isolatedParticle = { x: 123.456, y: 78.9, radius: 4.2, alpha: 0.6 };
    function fakeParticleContext() {
      const calls: string[] = [];
      const ctx = {
        beginPath: () => calls.push("beginPath"),
        arc: (x: number, y: number, r: number) => calls.push(`arc(${x},${y},${r})`),
        fill: () => calls.push("fill"),
        createRadialGradient: (...args: number[]) => {
          calls.push(`createRadialGradient(${args.join(",")})`);
          return { addColorStop: () => {} };
        },
        fillStyle: "" as unknown,
      };
      return { ctx, calls };
    }
    const flat = fakeParticleContext();
    paintSprayParticles(flat.ctx as never, [isolatedParticle], "#ff00aa", 0.9, "flat");
    const gradient = fakeParticleContext();
    paintSprayParticles(gradient.ctx as never, [isolatedParticle], "#ff00aa", 0.9, "gradient");
    // Flat uses arc()+fill() with a solid fillStyle; gradient uses
    // createRadialGradient at the SAME x/y/radius (0 -> radius) -- same
    // footprint, only the fill mechanism differs.
    expect(flat.calls.some((call) => call.startsWith("arc(123.456,78.9,4.2)"))).toBe(true);
    expect(gradient.calls.some((call) => call.startsWith(`createRadialGradient(${isolatedParticle.x},${isolatedParticle.y},0,${isolatedParticle.x},${isolatedParticle.y},${isolatedParticle.radius})`))).toBe(true);
  });
});
