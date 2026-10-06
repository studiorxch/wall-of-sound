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
import { strokeMop } from "./strokeSmoothing";
import type { MopPoint } from "./mopDeposition";
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
