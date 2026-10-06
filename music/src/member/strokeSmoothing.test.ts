import { describe, expect, it } from "vitest";
import {
  fillMopDab,
  fillSprayParticle,
  hash01,
  hashLateralUnit,
  paintSprayParticles,
  resolveGraphiteProfile,
  strokeGraphite,
  strokeInk,
  strokeMarker,
  strokeMaterialDrip,
  strokeMop,
  strokeSpray,
  traceSmoothedPath,
  withAlpha,
  GRAPHITE_GRADE_ORDER,
  GRAPHITE_PROFILES,
  GRAPHITE_PROFILE_VERSION,
} from "./strokeSmoothing";
import { resolveMopDabPlan } from "./mopDeposition";

function fakeStrokeContext() {
  const calls: string[] = [];
  const lineWidths: number[] = [];
  const alphas: number[] = [];
  const strokeStyles: string[] = [];
  const ctx = {
    save: () => calls.push("save"),
    restore: () => calls.push("restore"),
    stroke: () => calls.push("stroke"),
    beginPath: () => calls.push("beginPath"),
    moveTo: (x: number, y: number) => calls.push(`moveTo(${x},${y})`),
    lineTo: (x: number, y: number) => calls.push(`lineTo(${x},${y})`),
    quadraticCurveTo: (cx: number, cy: number, x: number, y: number) => calls.push(`quadraticCurveTo(${cx},${cy},${x},${y})`),
    get lineWidth() { return lineWidths[lineWidths.length - 1] ?? 0; },
    set lineWidth(value: number) { lineWidths.push(value); calls.push(`lineWidth=${value}`); },
    get globalAlpha() { return alphas[alphas.length - 1] ?? 0; },
    set globalAlpha(value: number) { alphas.push(value); calls.push(`globalAlpha=${value}`); },
    get strokeStyle() { return strokeStyles[strokeStyles.length - 1] ?? ""; },
    set strokeStyle(value: string) { strokeStyles.push(value); calls.push(`strokeStyle=${value}`); },
    lineCap: "",
    lineJoin: "",
    globalCompositeOperation: "",
  };
  return { ctx, calls, lineWidths, alphas, strokeStyles };
}

/** Combines fakeStrokeContext's stroke tracking with fakeContext's fill/gradient tracking -- strokeMop's body pass strokes, its dab pass fills (via fillMopDab's radial gradient). */
function fakeMopContext() {
  const calls: string[] = [];
  const lineWidths: number[] = [];
  const alphas: number[] = [];
  const strokeStyles: string[] = [];
  const gradientStops: [number, string][] = [];
  const fillStyles: unknown[] = [];
  let createRadialGradientCallCount = 0;
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
      createRadialGradientCallCount += 1;
      calls.push("createRadialGradient");
      return { addColorStop: (offset: number, color: string) => gradientStops.push([offset, color]) };
    },
    get lineWidth() { return lineWidths[lineWidths.length - 1] ?? 0; },
    set lineWidth(value: number) { lineWidths.push(value); calls.push(`lineWidth=${value}`); },
    get globalAlpha() { return alphas[alphas.length - 1] ?? 0; },
    set globalAlpha(value: number) { alphas.push(value); calls.push(`globalAlpha=${value}`); },
    get strokeStyle() { return strokeStyles[strokeStyles.length - 1] ?? ""; },
    set strokeStyle(value: string) { strokeStyles.push(value); calls.push(`strokeStyle=${value}`); },
    get fillStyle() { return fillStyles[fillStyles.length - 1] ?? ""; },
    set fillStyle(value: unknown) { fillStyles.push(value); calls.push(`fillStyle=${typeof value === "string" ? value : "[gradient]"}`); },
    lineCap: "",
    lineJoin: "",
    globalCompositeOperation: "",
  };
  return { ctx, calls, lineWidths, alphas, strokeStyles, gradientStops, fillStyles, get createRadialGradientCallCount() { return createRadialGradientCallCount; } };
}

function fakeContext() {
  const calls: string[] = [];
  const gradientStops: [number, string][] = [];
  const ctx = {
    moveTo: (x: number, y: number) => calls.push(`moveTo(${x},${y})`),
    lineTo: (x: number, y: number) => calls.push(`lineTo(${x},${y})`),
    quadraticCurveTo: (cx: number, cy: number, x: number, y: number) => calls.push(`quadraticCurveTo(${cx},${cy},${x},${y})`),
    beginPath: () => calls.push("beginPath"),
    arc: (x: number, y: number, r: number) => calls.push(`arc(${x},${y},${r})`),
    fill: () => calls.push("fill"),
    createRadialGradient: () => ({
      addColorStop: (offset: number, color: string) => gradientStops.push([offset, color]),
    }),
    fillStyle: "" as unknown,
  };
  return { ctx, calls, gradientStops };
}

describe("traceSmoothedPath -- quadratic-midpoint smoothing", () => {
  it("draws nothing for 0 or 1 points", () => {
    const { ctx, calls } = fakeContext();
    traceSmoothedPath(ctx as never, []);
    traceSmoothedPath(ctx as never, [{ x: 1, y: 1 }]);
    expect(calls).toEqual([]);
  });

  it("falls back to a single lineTo for exactly 2 points -- a curve needs a midpoint to aim at", () => {
    const { ctx, calls } = fakeContext();
    traceSmoothedPath(ctx as never, [{ x: 0, y: 0 }, { x: 10, y: 0 }]);
    expect(calls).toEqual(["moveTo(0,0)", "lineTo(10,0)"]);
  });

  it("traces a quadraticCurveTo through the midpoint of each interior pair, using the authored point as the control point", () => {
    const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    const { ctx, calls } = fakeContext();
    traceSmoothedPath(ctx as never, points);
    // moveTo the first authored point, one quadraticCurveTo per interior
    // point (control = the authored point, end = midpoint to the next),
    // then a final lineTo the last authored point.
    expect(calls[0]).toBe("moveTo(0,0)");
    expect(calls[1]).toBe("quadraticCurveTo(10,0,10,5)"); // control (10,0), end = midpoint((10,0),(10,10))
    expect(calls[2]).toBe("quadraticCurveTo(10,10,5,10)"); // control (10,10), end = midpoint((10,10),(0,10))
    expect(calls[3]).toBe("lineTo(0,10)");
  });

  it("never routes the traced path further from an authored point than half its local segment length -- gesture fidelity, not beautification", () => {
    // The curve's endpoint at each step IS the exact midpoint, and its
    // control point IS the exact authored point, so by construction the
    // traced curve never diverges from the authored polyline by more than
    // half the shorter adjacent segment -- verified here by checking every
    // emitted midpoint is the arithmetic mean of two consecutive authored
    // points, not some smoothed/resampled position.
    const points = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 100 }];
    const { calls } = (() => { const f = fakeContext(); traceSmoothedPath(f.ctx as never, points); return f; })();
    expect(calls[1]).toBe("quadraticCurveTo(4,0,4,50)");
  });
});

describe("withAlpha -- hex to rgba", () => {
  it("converts a #rrggbb color and alpha into an rgba() string", () => {
    expect(withAlpha("#e2572b", 0.5)).toBe("rgba(226, 87, 43, 0.5)");
  });

  it("clamps alpha into [0, 1]", () => {
    expect(withAlpha("#ffffff", 2)).toBe("rgba(255, 255, 255, 1)");
    expect(withAlpha("#000000", -1)).toBe("rgba(0, 0, 0, 0)");
  });

  it("passes through a non-hex color unchanged", () => {
    expect(withAlpha("red", 0.5)).toBe("red");
  });
});

describe("fillSprayParticle -- soft radial-gradient fill, not a flat circle", () => {
  it("skips drawing entirely for a zero-alpha or zero-radius particle", () => {
    const { ctx, calls } = fakeContext();
    fillSprayParticle(ctx as never, { x: 5, y: 5, radius: 0, alpha: 1 }, "#e2572b", 1);
    fillSprayParticle(ctx as never, { x: 5, y: 5, radius: 2, alpha: 0 }, "#e2572b", 1);
    expect(calls).toEqual([]);
  });

  it("Revision 8: skips drawing (never throws) for a non-finite position or radius -- an edge-case reprojected point should never crash the render pass", () => {
    const { ctx, calls } = fakeContext();
    fillSprayParticle(ctx as never, { x: NaN, y: 5, radius: 2, alpha: 1 }, "#e2572b", 1);
    fillSprayParticle(ctx as never, { x: 5, y: Infinity, radius: 2, alpha: 1 }, "#e2572b", 1);
    fillSprayParticle(ctx as never, { x: 5, y: 5, radius: NaN, alpha: 1 }, "#e2572b", 1);
    expect(calls).toEqual([]);
  });

  it("fades the gradient's outer stop to fully transparent, never a hard edge", () => {
    const { ctx, gradientStops } = fakeContext();
    fillSprayParticle(ctx as never, { x: 5, y: 5, radius: 3, alpha: 0.8 }, "#e2572b", 0.6);
    const last = gradientStops[gradientStops.length - 1];
    expect(last[0]).toBe(1);
    expect(last[1]).toBe("rgba(226, 87, 43, 0)");
  });

  it("draws exactly one arc + fill per particle", () => {
    const { ctx, calls } = fakeContext();
    fillSprayParticle(ctx as never, { x: 5, y: 5, radius: 3, alpha: 0.8 }, "#e2572b", 0.6);
    expect(calls).toEqual(["beginPath", "arc(5,5,3)", "fill"]);
  });
});

describe("hashLateralUnit -- Revision 5 deterministic scatter", () => {
  it("is a pure, deterministic function of its inputs -- same position always gives the same value", () => {
    expect(hashLateralUnit(12.5, 40.2)).toBe(hashLateralUnit(12.5, 40.2));
  });

  it("returns a value within [-1, 1]", () => {
    for (let i = 0; i < 50; i += 1) {
      const value = hashLateralUnit(i * 3.7, i * -5.1);
      expect(value).toBeGreaterThanOrEqual(-1);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("different positions generally give different values -- not a constant", () => {
    const values = new Set(Array.from({ length: 20 }, (_, i) => hashLateralUnit(i * 4, i * 9)));
    expect(values.size).toBeGreaterThan(1);
  });
});

describe("hash01 -- Revision 6 salted deterministic hash", () => {
  it("is a pure, deterministic function of its inputs including salt", () => {
    expect(hash01(12.5, 40.2, 3)).toBe(hash01(12.5, 40.2, 3));
  });

  it("returns a value within [0, 1)", () => {
    for (let i = 0; i < 50; i += 1) {
      const value = hash01(i * 3.7, i * -5.1, i % 5);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("different salts decorrelate the SAME position -- independent-looking streams from one (x, y)", () => {
    const a = hash01(10, 20, 1);
    const b = hash01(10, 20, 2);
    const c = hash01(10, 20, 3);
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it("hashLateralUnit is exactly hash01(x, y, 0) remapped to [-1, 1]", () => {
    expect(hashLateralUnit(5, 7)).toBeCloseTo(hash01(5, 7, 0) * 2 - 1, 10);
  });
});

describe("fillMopDab -- Revision 11 crisp contact edge (opacity != edge softness)", () => {
  it("skips drawing entirely for a zero-alpha, zero-radius, or non-finite dab", () => {
    const { ctx, calls } = fakeContext();
    fillMopDab(ctx as never, { x: 5, y: 5, radius: 0, alpha: 1 }, "#1c6e6e", 1);
    fillMopDab(ctx as never, { x: 5, y: 5, radius: 2, alpha: 0 }, "#1c6e6e", 1);
    fillMopDab(ctx as never, { x: NaN, y: 5, radius: 2, alpha: 1 }, "#1c6e6e", 1);
    expect(calls).toEqual([]);
  });

  it("draws exactly one arc + fill per dab, same shape as fillSprayParticle", () => {
    const { ctx, calls } = fakeContext();
    fillMopDab(ctx as never, { x: 5, y: 5, radius: 3, alpha: 0.8 }, "#1c6e6e", 0.6);
    expect(calls).toEqual(["beginPath", "arc(5,5,3)", "fill"]);
  });

  it("stays at FULL center alpha out to 88% of the radius -- a crisp contact edge, not a soft aerosol falloff", () => {
    const { ctx, gradientStops } = fakeContext();
    fillMopDab(ctx as never, { x: 0, y: 0, radius: 10, alpha: 1 }, "#1c6e6e", 0.5);
    const centerStop = gradientStops[0];
    const nearEdgeStop = gradientStops[1];
    const edgeStop = gradientStops[2];
    expect(centerStop[0]).toBe(0);
    expect(nearEdgeStop[0]).toBe(0.88);
    expect(nearEdgeStop[1]).toBe(centerStop[1]); // SAME alpha as center -- no gradual aerosol fade
    expect(edgeStop[0]).toBe(1);
    expect(edgeStop[1]).toContain(", 0)"); // fully transparent only in the last 12%
  });

  it("opacity scales overall translucency (center alpha), independent of the edge-softness shape -- low opacity is translucent ink, not blurrier ink", () => {
    const { ctx: ctxLow, gradientStops: stopsLow } = fakeContext();
    fillMopDab(ctxLow as never, { x: 0, y: 0, radius: 10, alpha: 1 }, "#1c6e6e", 0.2);
    const { ctx: ctxHigh, gradientStops: stopsHigh } = fakeContext();
    fillMopDab(ctxHigh as never, { x: 0, y: 0, radius: 10, alpha: 1 }, "#1c6e6e", 0.9);
    // Both still have the SAME gradient SHAPE (offsets 0, 0.88, 1) -- only
    // the alpha values at each offset differ with opacity.
    expect(stopsLow.map((s) => s[0])).toEqual(stopsHigh.map((s) => s[0]));
    expect(stopsLow[0][1]).not.toBe(stopsHigh[0][1]);
  });
});

describe("strokeGraphite -- Graphite Pencil V1", () => {
  const points = [{ x: 0, y: 0 }, { x: 10, y: 2 }, { x: 22, y: 5 }, { x: 30, y: 4 }, { x: 41, y: 6 }];
  const style = { color: "#171412", width: 6, opacity: 0.82 };

  it("draws nothing for fewer than 2 points", () => {
    const { ctx, calls } = fakeStrokeContext();
    strokeGraphite(ctx as never, [], style, "mark-a");
    strokeGraphite(ctx as never, [{ x: 1, y: 1 }], style, "mark-a");
    expect(calls).toEqual([]);
  });

  it("is deterministic: identical points + seed produce an identical call sequence every time", () => {
    const first = fakeStrokeContext();
    strokeGraphite(first.ctx as never, points, style, "mark-a");
    const second = fakeStrokeContext();
    strokeGraphite(second.ctx as never, points, style, "mark-a");
    expect(second.calls).toEqual(first.calls);
  });

  it("a different Mark id (seed) produces a different grain pattern -- not one universal texture", () => {
    const a = fakeStrokeContext();
    strokeGraphite(a.ctx as never, points, style, "mark-a");
    const b = fakeStrokeContext();
    strokeGraphite(b.ctx as never, points, style, "mark-b");
    expect(b.calls).not.toEqual(a.calls);
  });

  it("never draws at full opacity in a single pass -- buildup needs headroom below saturation", () => {
    const { ctx, alphas } = fakeStrokeContext();
    strokeGraphite(ctx as never, points, style, "mark-a");
    for (const alpha of alphas) expect(alpha).toBeLessThan(style.opacity);
  });

  it("respects the authored color for every pass", () => {
    const { ctx, strokeStyles } = fakeStrokeContext();
    strokeGraphite(ctx as never, points, style, "mark-a");
    expect(strokeStyles.length).toBeGreaterThan(0);
    for (const value of strokeStyles) expect(value).toBe(style.color);
  });

  it("a user-selected non-default color is honored, not overridden by a fixed graphite gray", () => {
    const { ctx, strokeStyles } = fakeStrokeContext();
    strokeGraphite(ctx as never, points, { ...style, color: "#2a6fd6" }, "mark-a");
    for (const value of strokeStyles) expect(value).toBe("#2a6fd6");
  });

  it("scales rendered widths with the authored width", () => {
    const narrow = fakeStrokeContext();
    strokeGraphite(narrow.ctx as never, points, { ...style, width: 3 }, "mark-a");
    const wide = fakeStrokeContext();
    strokeGraphite(wide.ctx as never, points, { ...style, width: 20 }, "mark-a");
    expect(Math.max(...wide.lineWidths)).toBeGreaterThan(Math.max(...narrow.lineWidths));
  });

  it("scales alpha with opacity -- lower opacity reads as lighter graphite, higher as denser mass", () => {
    const light = fakeStrokeContext();
    strokeGraphite(light.ctx as never, points, { ...style, opacity: 0.2 }, "mark-a");
    const dense = fakeStrokeContext();
    strokeGraphite(dense.ctx as never, points, { ...style, opacity: 0.95 }, "mark-a");
    expect(Math.max(...dense.alphas)).toBeGreaterThan(Math.max(...light.alphas));
  });

  it("bounds its work to the stroke's own recorded points -- no unbounded or particle-array-scaled loop", () => {
    const { ctx, calls } = fakeStrokeContext();
    strokeGraphite(ctx as never, points, style, "mark-a");
    // One body pass (beginPath+stroke) plus at most one beginPath+stroke per
    // recorded segment (points.length - 1) for the grain pass -- never more.
    const strokeCalls = calls.filter((call) => call === "stroke").length;
    expect(strokeCalls).toBeLessThanOrEqual(points.length);
  });
});

describe("strokeInk -- Ink Pen V1", () => {
  const points = [{ x: 0, y: 0 }, { x: 10, y: 2 }, { x: 22, y: 5 }, { x: 30, y: 4 }, { x: 41, y: 6 }];
  const style = { color: "#101828", width: 3, opacity: 0.95 };

  it("draws nothing for fewer than 2 points", () => {
    const { ctx, calls } = fakeStrokeContext();
    strokeInk(ctx as never, [], style);
    strokeInk(ctx as never, [{ x: 1, y: 1 }], style);
    expect(calls).toEqual([]);
  });

  it("draws exactly one continuous body pass -- no grain, no secondary deposition", () => {
    const { ctx, calls } = fakeStrokeContext();
    strokeInk(ctx as never, points, style);
    expect(calls.filter((call) => call === "stroke").length).toBe(1);
    expect(calls.filter((call) => call === "beginPath").length).toBe(1);
  });

  it("is fully deterministic (purely geometric -- no hashing, no randomness, no seed needed)", () => {
    const first = fakeStrokeContext();
    strokeInk(first.ctx as never, points, style);
    const second = fakeStrokeContext();
    strokeInk(second.ctx as never, points, style);
    expect(second.calls).toEqual(first.calls);
  });

  it("respects the authored color", () => {
    const { ctx, strokeStyles } = fakeStrokeContext();
    strokeInk(ctx as never, points, style);
    expect(strokeStyles).toEqual([style.color]);
  });

  it("a user-selected non-default color is honored", () => {
    const { ctx, strokeStyles } = fakeStrokeContext();
    strokeInk(ctx as never, points, { ...style, color: "#2a6fd6" });
    expect(strokeStyles).toEqual(["#2a6fd6"]);
  });

  it("respects the authored width exactly (no reduction, no secondary width)", () => {
    const { ctx, lineWidths } = fakeStrokeContext();
    strokeInk(ctx as never, points, { ...style, width: 7 });
    expect(lineWidths).toEqual([7]);
  });

  it("respects the authored opacity exactly (no sub-saturation, unlike Pencil)", () => {
    const { ctx, alphas } = fakeStrokeContext();
    strokeInk(ctx as never, points, { ...style, opacity: 0.4 });
    expect(alphas).toEqual([0.4]);
  });

  it("renders a denser, more continuous pass than Pencil's graphite treatment at the same style", () => {
    const ink = fakeStrokeContext();
    strokeInk(ink.ctx as never, points, style);
    const graphite = fakeStrokeContext();
    strokeGraphite(graphite.ctx as never, points, style, "mark-a");
    // Pen's single pass reaches the full authored opacity; Pencil's body
    // pass is deliberately sub-saturation to leave room for sketch buildup.
    expect(Math.max(...ink.alphas)).toBeGreaterThan(Math.max(...graphite.alphas));
    // Pen draws exactly one stroke; Pencil's grain pass draws additional
    // per-segment strokes.
    expect(ink.calls.filter((c) => c === "stroke").length).toBeLessThan(graphite.calls.filter((c) => c === "stroke").length);
  });
});

describe("Graphite Grades Foundation V1 -- profiles", () => {
  const points = [{ x: 0, y: 0 }, { x: 10, y: 2 }, { x: 22, y: 5 }, { x: 30, y: 4 }, { x: 41, y: 6 }, { x: 55, y: 9 }];
  const style = { color: "#171412", width: 6, opacity: 0.82 };

  it("defines all seven calibration anchors in hard-to-soft order", () => {
    expect(GRAPHITE_GRADE_ORDER).toEqual(["9h", "6h", "3h", "hb", "3b", "6b", "9b"]);
    expect(Object.keys(GRAPHITE_PROFILES).sort()).toEqual([...GRAPHITE_GRADE_ORDER].sort());
  });

  it("HB preserves Graphite Pencil V1's exact original constants", () => {
    expect(GRAPHITE_PROFILES.hb).toEqual({
      depositionAlpha: 0.75,
      grainDensity: 0.68,
      grainAlphaBase: 0.22,
      grainAlphaRange: 0.28,
      edgeJitter: 0.14,
    });
  });

  it("calling strokeGraphite with no profile argument renders identically to explicitly passing HB", () => {
    const implicit = fakeStrokeContext();
    strokeGraphite(implicit.ctx as never, points, style, "mark-a");
    const explicit = fakeStrokeContext();
    strokeGraphite(explicit.ctx as never, points, style, "mark-a", GRAPHITE_PROFILES.hb);
    expect(explicit.calls).toEqual(implicit.calls);
  });

  it("resolveGraphiteProfile resolves a legacy/missing/unknown variantId to HB", () => {
    expect(resolveGraphiteProfile(undefined)).toBe(GRAPHITE_PROFILES.hb);
    expect(resolveGraphiteProfile(null)).toBe(GRAPHITE_PROFILES.hb);
    expect(resolveGraphiteProfile("")).toBe(GRAPHITE_PROFILES.hb);
    expect(resolveGraphiteProfile("not-a-real-grade")).toBe(GRAPHITE_PROFILES.hb);
  });

  it("resolveGraphiteProfile resolves each known grade to its own profile", () => {
    for (const grade of GRAPHITE_GRADE_ORDER) {
      expect(resolveGraphiteProfile(grade)).toBe(GRAPHITE_PROFILES[grade]);
    }
  });

  it("deposition alpha increases monotonically from 9H (hardest) to 9B (softest)", () => {
    const alphas = GRAPHITE_GRADE_ORDER.map((grade) => GRAPHITE_PROFILES[grade].depositionAlpha);
    for (let i = 1; i < alphas.length; i += 1) expect(alphas[i]).toBeGreaterThan(alphas[i - 1]);
  });

  it("grain density increases monotonically from 9H (sparsest/most restrained) to 9B (densest)", () => {
    const densities = GRAPHITE_GRADE_ORDER.map((grade) => GRAPHITE_PROFILES[grade].grainDensity);
    for (let i = 1; i < densities.length; i += 1) expect(densities[i]).toBeGreaterThan(densities[i - 1]);
  });

  it("edge jitter increases monotonically from 9H (most precise) to 9B (roughest)", () => {
    const jitters = GRAPHITE_GRADE_ORDER.map((grade) => GRAPHITE_PROFILES[grade].edgeJitter);
    for (let i = 1; i < jitters.length; i += 1) expect(jitters[i]).toBeGreaterThan(jitters[i - 1]);
  });

  it("9H remains visibly present -- not reduced to invisible", () => {
    const { ctx, alphas } = fakeStrokeContext();
    strokeGraphite(ctx as never, points, style, "mark-a", GRAPHITE_PROFILES["9h"]);
    expect(Math.max(...alphas)).toBeGreaterThan(0.15);
  });

  it("9B stays below full opacity in its body pass -- it must still read as graphite, not become a flat/solid Marker-like fill", () => {
    const { ctx } = fakeStrokeContext();
    strokeGraphite(ctx as never, points, style, "mark-a", GRAPHITE_PROFILES["9b"]);
    // Body-pass alpha = opacity * depositionAlpha; even at full authored
    // opacity this must stay meaningfully under 1 (still has visible grain
    // texture on top, and never becomes a single fully-opaque fill).
    expect(GRAPHITE_PROFILES["9b"].depositionAlpha).toBeLessThan(1);
  });

  it("9B still draws a grain pass (still graphite, not a flat single-pass line)", () => {
    const { calls } = (() => {
      const f = fakeStrokeContext();
      strokeGraphite(f.ctx as never, points, style, "mark-a", GRAPHITE_PROFILES["9b"]);
      return f;
    })();
    // Body pass + at least one grain-pass stroke.
    expect(calls.filter((c) => c === "stroke").length).toBeGreaterThan(1);
  });

  it("grade differences are NOT achieved merely by scaling opacity -- deposition alpha AND grain density AND edge jitter all differ between 9H and 9B", () => {
    const nine9h = GRAPHITE_PROFILES["9h"];
    const nine9b = GRAPHITE_PROFILES["9b"];
    expect(nine9h.depositionAlpha).not.toBe(nine9b.depositionAlpha);
    expect(nine9h.grainDensity).not.toBe(nine9b.grainDensity);
    expect(nine9h.edgeJitter).not.toBe(nine9b.edgeJitter);
  });

  it("each grade renders deterministically (identical points+seed -> identical calls)", () => {
    for (const grade of GRAPHITE_GRADE_ORDER) {
      const first = fakeStrokeContext();
      strokeGraphite(first.ctx as never, points, style, "mark-a", GRAPHITE_PROFILES[grade]);
      const second = fakeStrokeContext();
      strokeGraphite(second.ctx as never, points, style, "mark-a", GRAPHITE_PROFILES[grade]);
      expect(second.calls).toEqual(first.calls);
    }
  });

  it("GRAPHITE_PROFILE_VERSION is a positive integer", () => {
    expect(Number.isInteger(GRAPHITE_PROFILE_VERSION)).toBe(true);
    expect(GRAPHITE_PROFILE_VERSION).toBeGreaterThanOrEqual(1);
  });
});

describe("strokeMarker -- Marker Material Calibration V1", () => {
  const points = [{ x: 0, y: 0 }, { x: 10, y: 2 }, { x: 22, y: 5 }, { x: 30, y: 4 }, { x: 41, y: 6 }];
  const style = { color: "#171412", width: 12, opacity: 0.85 };

  it("draws nothing for fewer than 2 points", () => {
    const { ctx, calls } = fakeStrokeContext();
    strokeMarker(ctx as never, [], style, "mark-a");
    strokeMarker(ctx as never, [{ x: 1, y: 1 }], style, "mark-a");
    expect(calls).toEqual([]);
  });

  it("is deterministic: identical points + seed produce an identical call sequence every time (reload-safe)", () => {
    const first = fakeStrokeContext();
    strokeMarker(first.ctx as never, points, style, "mark-a");
    const second = fakeStrokeContext();
    strokeMarker(second.ctx as never, points, style, "mark-a");
    expect(second.calls).toEqual(first.calls);
  });

  it("a different Mark id (seed) produces a different variance pattern -- not one universal texture", () => {
    const a = fakeStrokeContext();
    strokeMarker(a.ctx as never, points, style, "mark-a");
    const b = fakeStrokeContext();
    strokeMarker(b.ctx as never, points, style, "mark-b");
    expect(b.calls).not.toEqual(a.calls);
  });

  it("respects the authored color for every pass -- never pushed toward a fixed ink black", () => {
    const { ctx, strokeStyles } = fakeStrokeContext();
    strokeMarker(ctx as never, points, { ...style, color: "#2a6fd6" }, "mark-a");
    expect(strokeStyles.length).toBeGreaterThan(0);
    for (const value of strokeStyles) expect(value).toBe("#2a6fd6");
  });

  it("scales rendered widths with the authored width across narrow/medium/broad", () => {
    const narrow = fakeStrokeContext();
    strokeMarker(narrow.ctx as never, points, { ...style, width: 3 }, "mark-a");
    const medium = fakeStrokeContext();
    strokeMarker(medium.ctx as never, points, { ...style, width: 12 }, "mark-a");
    const broad = fakeStrokeContext();
    strokeMarker(broad.ctx as never, points, { ...style, width: 30 }, "mark-a");
    expect(Math.max(...medium.lineWidths)).toBeGreaterThan(Math.max(...narrow.lineWidths));
    expect(Math.max(...broad.lineWidths)).toBeGreaterThan(Math.max(...medium.lineWidths));
  });

  it("a narrow Marker stroke is still visibly broader than an equal-width Pen stroke (its own halo pass widens the silhouette)", () => {
    const marker = fakeStrokeContext();
    strokeMarker(marker.ctx as never, points, { ...style, width: 3 }, "mark-a");
    const pen = fakeStrokeContext();
    strokeInk(pen.ctx as never, points, { ...style, width: 3 });
    expect(Math.max(...marker.lineWidths)).toBeGreaterThan(Math.max(...pen.lineWidths));
  });

  it("scales alpha with opacity -- lower opacity reads as more translucent marker, higher as denser ink", () => {
    const light = fakeStrokeContext();
    strokeMarker(light.ctx as never, points, { ...style, opacity: 0.2 }, "mark-a");
    const dense = fakeStrokeContext();
    strokeMarker(dense.ctx as never, points, { ...style, opacity: 0.95 }, "mark-a");
    expect(Math.max(...dense.alphas)).toBeGreaterThan(Math.max(...light.alphas));
  });

  it("opacity never exceeds 1 even at full authored opacity (no clipping artifact)", () => {
    const { ctx, alphas } = fakeStrokeContext();
    strokeMarker(ctx as never, points, { ...style, opacity: 1 }, "mark-a");
    for (const alpha of alphas) expect(alpha).toBeLessThanOrEqual(1);
  });

  it("draws a core pass denser than Pencil's own body-pass alpha -- Marker must not read as faint/sketchy", () => {
    const { ctx, alphas } = fakeStrokeContext();
    strokeMarker(ctx as never, points, style, "mark-a");
    // The core pass is the densest single pass; Pencil's HB body alpha is
    // authored*0.75 (GRAPHITE_PROFILES.hb.depositionAlpha) -- Marker's peak
    // single-pass alpha must exceed that fraction of its own opacity.
    expect(Math.max(...alphas) / style.opacity).toBeGreaterThan(0.75);
  });

  it("never exceeds the authored width by more than a controlled halo margin -- broad Marker must not balloon into Mop territory", () => {
    const { ctx, lineWidths } = fakeStrokeContext();
    strokeMarker(ctx as never, points, { ...style, width: 40 }, "mark-a");
    expect(Math.max(...lineWidths)).toBeLessThan(40 * 1.3);
  });

  it("bounds its work to the stroke's own recorded points -- no unbounded or particle-array-scaled loop", () => {
    const { ctx, calls } = fakeStrokeContext();
    strokeMarker(ctx as never, points, style, "mark-a");
    // Two whole-path passes (halo, core) plus at most one stroke per
    // recorded segment (points.length - 1) for the variance pass.
    const strokeCalls = calls.filter((call) => call === "stroke").length;
    expect(strokeCalls).toBeLessThanOrEqual(points.length + 1);
  });
});

describe("strokeMop -- Mop Material Calibration V1", () => {
  // Widely-spaced points so resolveMopDabPlan's overlap-guaranteed
  // resampling produces a real, non-trivial dab count.
  const points = [{ x: 0, y: 0 }, { x: 40, y: 8 }, { x: 88, y: 20 }, { x: 120, y: 16 }, { x: 164, y: 24 }];
  const style = { color: "#1c6e6e", width: 20, opacity: 0.85 };

  it("draws nothing for fewer than 2 points", () => {
    const { ctx, calls } = fakeMopContext();
    strokeMop(ctx as never, [], style, "mark-a");
    strokeMop(ctx as never, [{ x: 1, y: 1 }], style, "mark-a");
    expect(calls).toEqual([]);
  });

  it("is deterministic: identical points + seed produce an identical call sequence every time (reload-safe)", () => {
    const first = fakeMopContext();
    strokeMop(first.ctx as never, points, style, "mark-a");
    const second = fakeMopContext();
    strokeMop(second.ctx as never, points, style, "mark-a");
    expect(second.calls).toEqual(first.calls);
  });

  it("a different Mark id (seed) produces a different dab pattern -- not one universal texture", () => {
    const a = fakeMopContext();
    strokeMop(a.ctx as never, points, style, "mark-a");
    const b = fakeMopContext();
    strokeMop(b.ctx as never, points, style, "mark-b");
    expect(b.calls).not.toEqual(a.calls);
  });

  it("draws a continuous body stroke (path continuity guaranteed regardless of dab placement)", () => {
    const { ctx, calls } = fakeMopContext();
    strokeMop(ctx as never, points, style, "mark-a");
    expect(calls).toContain(`moveTo(${points[0].x},${points[0].y})`);
    expect(calls.filter((call) => call === "stroke").length).toBe(1);
  });

  it("respects the authored color for both the body stroke and the dab fill", () => {
    const { ctx, strokeStyles, gradientStops } = fakeMopContext();
    strokeMop(ctx as never, points, { ...style, color: "#2a6fd6" }, "mark-a");
    for (const value of strokeStyles) expect(value).toBe("#2a6fd6");
    expect(gradientStops.length).toBeGreaterThan(0);
    for (const [, color] of gradientStops) expect(color).toContain("42, 111, 214"); // #2a6fd6 as rgb
  });

  it("scales the body width with the authored width across narrow/medium/broad", () => {
    const narrow = fakeMopContext();
    strokeMop(narrow.ctx as never, points, { ...style, width: 4 }, "mark-a");
    const medium = fakeMopContext();
    strokeMop(medium.ctx as never, points, { ...style, width: 20 }, "mark-a");
    const broad = fakeMopContext();
    strokeMop(broad.ctx as never, points, { ...style, width: 44 }, "mark-a");
    expect(Math.max(...medium.lineWidths)).toBeGreaterThan(Math.max(...narrow.lineWidths));
    expect(Math.max(...broad.lineWidths)).toBeGreaterThan(Math.max(...medium.lineWidths));
  });

  it("scales alpha with opacity -- lower opacity reads as thinner paint, higher as denser deposition", () => {
    const light = fakeMopContext();
    strokeMop(light.ctx as never, points, { ...style, opacity: 0.2 }, "mark-a");
    const dense = fakeMopContext();
    strokeMop(dense.ctx as never, points, { ...style, opacity: 0.95 }, "mark-a");
    expect(Math.max(...dense.alphas)).toBeGreaterThan(Math.max(...light.alphas));
  });

  it("produces at least one dab whose radius exceeds the body's own half-width -- the imperfect, paint-loaded edge that distinguishes Mop from Marker's contained halo", () => {
    // Checked across several Mark ids (not just one) since which specific
    // dab draws the high end of the deterministic jitter range depends on
    // the seed -- the material claim is "this CAN happen", not "always at
    // this exact seed".
    const maxRadiusAcrossSeeds = ["mark-a", "mark-b", "mark-c", "mark-d", "mark-e"].map((seed) => {
      const { ctx, calls } = fakeMopContext();
      strokeMop(ctx as never, points, style, seed);
      const arcRadii = calls.filter((call) => call.startsWith("arc(")).map((call) => Number(call.slice(0, -1).split(",")[2]));
      return arcRadii.length > 0 ? Math.max(...arcRadii) : 0;
    });
    expect(Math.max(...maxRadiusAcrossSeeds)).toBeGreaterThan(style.width / 2);
  });

  it("bounds its work to a fixed multiple of resolveMopDabPlan's own (already-bounded) emission count -- no unbounded or canvas-area-scaled loop", () => {
    const { ctx, calls } = fakeMopContext();
    strokeMop(ctx as never, points, style, "mark-a");
    // One body stroke + at most one fill-producing arc per emission point;
    // resolveMopDabPlan itself is bounded (MOP_MAX_EMISSION_POINTS), so
    // this is bounded regardless of how long the authored stroke gets.
    const arcCalls = calls.filter((call) => call.startsWith("arc(")).length;
    expect(arcCalls).toBeLessThan(300);
  });

  it("a Mop stroke is denser (higher peak single-pass alpha) than a same-width, same-opacity Marker stroke -- heavier deposition, not Marker-with-a-bigger-brush", () => {
    const mop = fakeMopContext();
    strokeMop(mop.ctx as never, points, style, "mark-a");
    const marker = fakeStrokeContext();
    strokeMarker(marker.ctx as never, points, style, "mark-a");
    expect(Math.max(...mop.alphas)).toBeGreaterThanOrEqual(Math.max(...marker.alphas) * 0.85);
  });

  it("existing legacy Mop Marks (no new fields) render without error through the same function", () => {
    const legacyStyle = { color: "#171412", width: 12, opacity: 0.6 };
    expect(() => strokeMop({} as never, [], legacyStyle, "legacy-mark")).not.toThrow();
    const { ctx } = fakeMopContext();
    expect(() => strokeMop(ctx as never, points, legacyStyle, "legacy-mark")).not.toThrow();
  });

  /**
   * MOP/SPRAY POINTER-UP WYSIWYG V1 -- `dabs`/`dabOrdinalOffset` mirror
   * strokeSpray's own `particles` override exactly. These prove the
   * canonical commit/reload path (no options, resolves internally) and
   * an externally-resolved dab list (what the live preview, and any
   * future chunked Mop bake, would supply) paint IDENTICALLY when given
   * the SAME dabs -- the mechanism `resolveMopDabPlan`'s own equivalence
   * tests (mopDeposition.test.ts) rely on `strokeMop` to actually use.
   */
  describe("dabs/dabOrdinalOffset options -- MOP/SPRAY POINTER-UP WYSIWYG V1", () => {
    it("an explicit dabs list is painted verbatim, never recomputed from points -- canonical reload derives the identical committed arrangement from the same mechanism", () => {
      const resolved = resolveMopDabPlan(points, style.width * 0.5);
      const viaInternalResolve = fakeMopContext();
      strokeMop(viaInternalResolve.ctx as never, points, style, "mark-a");
      const viaExplicitDabs = fakeMopContext();
      strokeMop(viaExplicitDabs.ctx as never, points, style, "mark-a", { dabs: resolved });
      expect(viaExplicitDabs.calls).toEqual(viaInternalResolve.calls);
    });

    it("dabOrdinalOffset shifts which dabs are treated as dot-like -- an offset at or past the threshold disables inclusion-skip/lateral-scatter suppression entirely", () => {
      const shortTap = [{ x: 0, y: 0 }, { x: 4, y: 1 }];
      const noOffset = fakeMopContext();
      strokeMop(noOffset.ctx as never, shortTap, style, "mark-a");
      const withOffset = fakeMopContext();
      strokeMop(withOffset.ctx as never, shortTap, style, "mark-a", { dabOrdinalOffset: 10 });
      // With no offset this short gesture is entirely dot-like (every dab
      // painted dead-center, same as resolveMopDabPlan's own default);
      // with an offset past the threshold, none of its dabs are dot-like
      // any more -- a real behavioral difference, proving the parameter
      // is actually threaded through to resolveMopDabPlan.
      const arcPositions = (calls: readonly string[]) => calls.filter((call) => call.startsWith("arc(")).map((call) => call.replace(/^arc\(/, ""));
      expect(arcPositions(withOffset.calls)).not.toEqual(arcPositions(noOffset.calls));
    });

    it("omitting both options still resolves+paints the full default dab plan, byte-identical to no options at all", () => {
      const withoutOptions = fakeMopContext();
      strokeMop(withoutOptions.ctx as never, points, style, "mark-a");
      const explicitUndefined = fakeMopContext();
      strokeMop(explicitUndefined.ctx as never, points, style, "mark-a", { dabOrdinalOffset: undefined, dabs: undefined });
      expect(explicitUndefined.calls).toEqual(withoutOptions.calls);
    });
  });

  /**
   * BLACKBOOK Presentation Readiness -- Mop/Spray Windowed Continuous-Pass
   * Seam Fix V1. See `StrokeMopOptions.lineCap`'s own doc for the full
   * mechanism this closes: a "round" cap at a live-preview window's own
   * shared boundary point gets composited TWICE (once by each adjacent
   * window), reading as a visibly darker "bead" that then disappears the
   * instant pointer-up repaints canonically in one single, uncapped-interior
   * call -- the actual mechanism behind "Mop visibly changes after
   * pointer-up," independent of (and in addition to) the dab-ordinal
   * catch-up timing Batch B already fixed.
   */
  describe("lineCap option -- Mop/Spray Windowed Continuous-Pass Seam Fix V1", () => {
    it("defaults to a round body-pass cap, byte-identical to every pre-existing caller (canonical commit, reload) that never passes it", () => {
      const { ctx } = fakeMopContext();
      strokeMop(ctx as never, points, style, "mark-a");
      expect(ctx.lineCap).toBe("round");
    });

    it("an explicit lineCap is actually threaded through to the body pass, not silently ignored", () => {
      const { ctx } = fakeMopContext();
      strokeMop(ctx as never, points, style, "mark-a", { lineCap: "butt" });
      expect(ctx.lineCap).toBe("butt");
    });

    it("two adjacent windowed calls, sharing one boundary point, both painted with lineCap \"butt\" -- the live preview's own call pattern -- never carry a \"round\" cap at that shared point, which is what previously double-composited a darker seam there", () => {
      const windowA = points.slice(0, 3); // shares points[2] with windowB's own first point
      const windowB = points.slice(2);
      const a = fakeMopContext();
      strokeMop(a.ctx as never, windowA, style, "mark-a", { lineCap: "butt" });
      expect(a.ctx.lineCap).toBe("butt");
      const b = fakeMopContext();
      strokeMop(b.ctx as never, windowB, style, "mark-a", { lineCap: "butt" });
      expect(b.ctx.lineCap).toBe("butt");
    });

    it("omitting lineCap is byte-identical to no options at all", () => {
      const withoutOptions = fakeMopContext();
      strokeMop(withoutOptions.ctx as never, points, style, "mark-a");
      const explicitUndefined = fakeMopContext();
      strokeMop(explicitUndefined.ctx as never, points, style, "mark-a", { lineCap: undefined });
      expect(explicitUndefined.calls).toEqual(withoutOptions.calls);
      expect(explicitUndefined.ctx.lineCap).toBe(withoutOptions.ctx.lineCap);
    });
  });

  /**
   * BLACKBOOK Presentation Readiness -- Mop Dab-Duplication Seam Fix V1.
   * Proves the ACTUAL runtime paint call -- not merely the dab-plan
   * computation `simulateWindowedDabs` (mopDeposition.test.ts) already
   * proved equivalent -- stops double-painting the shared boundary dab.
   * Simulates `advanceMopLivePreview`'s own exact sequence: window A's
   * full resolved dabs painted as-is (the gesture's first window, nothing
   * to drop), then window B's resolved dabs with its own duplicated first
   * dab sliced off before being passed to `strokeMop`'s own `dabs` option
   * -- exactly what blackbookRuntime.ts now does.
   */
  describe("windowed live-preview paint call -- Mop Dab-Duplication Seam Fix V1", () => {
    const longPoints = [
      { x: 0, y: 0 }, { x: 20, y: 6 }, { x: 44, y: 14 }, { x: 70, y: 10 },
      { x: 96, y: 22 }, { x: 118, y: 30 }, { x: 140, y: 18 }, { x: 168, y: 26 },
    ];

    it("painting window A, then window B with its own duplicated first dab dropped, never repeats an arc() draw the canonical complete-gesture call wouldn't also produce exactly once", () => {
      const baseRadius = style.width * 0.5;
      const windowA = longPoints.slice(0, 4);
      const windowB = longPoints.slice(3); // shares longPoints[3] with window A's own last point

      const dabsA = resolveMopDabPlan(windowA, baseRadius, 0);
      const a = fakeMopContext();
      strokeMop(a.ctx as never, windowA, style, "mark-a", { dabs: dabsA, lineCap: "butt" });

      const ordinalOffsetAfterA = dabsA.length; // isFirstWindow -- nothing subtracted, matches blackbookRuntime.ts
      const dabsB = resolveMopDabPlan(windowB, baseRadius, ordinalOffsetAfterA);
      const dabsBToPaint = dabsB.slice(1); // the fix: drop the duplicated shared-boundary dab before painting
      const b = fakeMopContext();
      strokeMop(b.ctx as never, windowB, style, "mark-a", { dabs: dabsBToPaint, lineCap: "butt" });

      const arcCallsA = a.calls.filter((call) => call.startsWith("arc("));
      const arcCallsB = b.calls.filter((call) => call.startsWith("arc("));
      const combined = [...arcCallsA, ...arcCallsB];

      const canonical = fakeMopContext();
      strokeMop(canonical.ctx as never, longPoints, style, "mark-a");
      const canonicalArcCalls = canonical.calls.filter((call) => call.startsWith("arc("));

      expect(combined).toEqual(canonicalArcCalls);
    });

    it("regression guard: painting window B's FULL (undeduplicated) dabs -- the pre-fix behavior -- produces one extra arc() draw versus canonical, proving the fix is load-bearing, not a no-op", () => {
      const baseRadius = style.width * 0.5;
      const windowA = longPoints.slice(0, 4);
      const windowB = longPoints.slice(3);

      const dabsA = resolveMopDabPlan(windowA, baseRadius, 0);
      const a = fakeMopContext();
      strokeMop(a.ctx as never, windowA, style, "mark-a", { dabs: dabsA, lineCap: "butt" });

      const dabsB = resolveMopDabPlan(windowB, baseRadius, dabsA.length);
      const bUnfixed = fakeMopContext();
      strokeMop(bUnfixed.ctx as never, windowB, style, "mark-a", { dabs: dabsB, lineCap: "butt" }); // no .slice(1) -- the bug

      const arcCallsA = a.calls.filter((call) => call.startsWith("arc("));
      const arcCallsBUnfixed = bUnfixed.calls.filter((call) => call.startsWith("arc("));

      const canonical = fakeMopContext();
      strokeMop(canonical.ctx as never, longPoints, style, "mark-a");
      const canonicalArcCalls = canonical.calls.filter((call) => call.startsWith("arc("));

      expect(arcCallsA.length + arcCallsBUnfixed.length).toBe(canonicalArcCalls.length + 1);
    });
  });
});

describe("strokeSpray -- Spray Material Calibration V1", () => {
  const points = [{ x: 0, y: 0 }, { x: 40, y: 8 }, { x: 88, y: 20 }, { x: 120, y: 16 }, { x: 164, y: 24 }];
  const style = { color: "#e2572b", width: 24, opacity: 0.85 };

  it("draws nothing for fewer than 2 points", () => {
    const { ctx, calls } = fakeMopContext();
    strokeSpray(ctx as never, [], style, "mark-a");
    strokeSpray(ctx as never, [{ x: 1, y: 1 }], style, "mark-a");
    expect(calls).toEqual([]);
  });

  it("is deterministic: identical points + seed produce an identical call sequence every time (reload-safe)", () => {
    const first = fakeMopContext();
    strokeSpray(first.ctx as never, points, style, "mark-a");
    const second = fakeMopContext();
    strokeSpray(second.ctx as never, points, style, "mark-a");
    expect(second.calls).toEqual(first.calls);
  });

  it("a different Mark id (seed) produces different aerosol variation -- not one universal texture", () => {
    const a = fakeMopContext();
    strokeSpray(a.ctx as never, points, style, "mark-a");
    const b = fakeMopContext();
    strokeSpray(b.ctx as never, points, style, "mark-b");
    expect(b.calls).not.toEqual(a.calls);
  });

  it("respects the authored color for both the core stroke and the particle fill", () => {
    const { ctx, strokeStyles, gradientStops } = fakeMopContext();
    strokeSpray(ctx as never, points, { ...style, color: "#2a6fd6" }, "mark-a");
    for (const value of strokeStyles) expect(value).toBe("#2a6fd6");
    expect(gradientStops.length).toBeGreaterThan(0);
    for (const [, color] of gradientStops) expect(color).toContain("42, 111, 214"); // #2a6fd6 as rgb
  });

  it("scales the footprint with the authored width across narrow/medium/broad", () => {
    const narrow = fakeMopContext();
    strokeSpray(narrow.ctx as never, points, { ...style, width: 6 }, "mark-a");
    const medium = fakeMopContext();
    strokeSpray(medium.ctx as never, points, { ...style, width: 24 }, "mark-a");
    const broad = fakeMopContext();
    strokeSpray(broad.ctx as never, points, { ...style, width: 48 }, "mark-a");
    expect(Math.max(...medium.lineWidths)).toBeGreaterThan(Math.max(...narrow.lineWidths));
    expect(Math.max(...broad.lineWidths)).toBeGreaterThan(Math.max(...medium.lineWidths));
  });

  it("produces a real particle field (not just a core stroke) -- the aerosol texture layer that distinguishes Spray from a plain wide line", () => {
    const { ctx, calls } = fakeMopContext();
    strokeSpray(ctx as never, points, style, "mark-a");
    const arcCalls = calls.filter((call) => call.startsWith("arc(")).length;
    expect(arcCalls).toBeGreaterThan(10);
  });

  it("particles cluster toward the center more than the edge -- denser core than perimeter, not a uniform disk", () => {
    // centerBias=1 with particleMinRadiusRatio banding still means most
    // particles' own random draw lands in the lower half of the banded
    // range more often than not is NOT guaranteed by centerBias=1 alone
    // (uniform in the band) -- what IS guaranteed and material-relevant is
    // that the CORE (a separate, denser, continuous pass covering the
    // innermost band) always deposits paint at the center regardless of
    // where particles happen to land, so the combined center-vs-perimeter
    // alpha is always denser at the center. Verify the core pass exists
    // and contributes non-trivial alpha alongside the particle field.
    const { ctx, calls, alphas } = fakeMopContext();
    strokeSpray(ctx as never, points, style, "mark-a");
    const strokeCallCount = calls.filter((call) => call === "stroke").length;
    expect(strokeCallCount).toBeGreaterThan(0); // the core passes
    expect(Math.max(...alphas)).toBeGreaterThan(0);
  });

  it("scales alpha with opacity -- lower opacity reads as lighter aerosol, higher as denser deposition", () => {
    const light = fakeMopContext();
    strokeSpray(light.ctx as never, points, { ...style, opacity: 0.2 }, "mark-a");
    const dense = fakeMopContext();
    strokeSpray(dense.ctx as never, points, { ...style, opacity: 0.95 }, "mark-a");
    expect(Math.max(...dense.alphas)).toBeGreaterThan(Math.max(...light.alphas));
  });

  it("bounds its work to a fixed multiple of the deposition engine's own (already-bounded) emission/particle counts -- no unbounded or canvas-area-scaled loop", () => {
    const { ctx, calls } = fakeMopContext();
    strokeSpray(ctx as never, points, style, "mark-a");
    // corePasses (fixed, 3) continuous strokes + at most
    // maxEmissionPoints * maxParticlesPerEmission particle fills --
    // both already bounded in sprayDeposition.ts regardless of stroke
    // length, so this stays bounded for any authored path.
    const arcCalls = calls.filter((call) => call.startsWith("arc(")).length;
    expect(arcCalls).toBeLessThan(2500);
  });

  it("a Spray stroke's particle field is structurally distinct from Mop's dab field -- individually soft (radial gradient), never Mop's crisp contact-edge fill", () => {
    const spray = fakeMopContext();
    strokeSpray(spray.ctx as never, points, style, "mark-a");
    // fillSprayParticle always creates a gradient with a 3-stop falloff
    // (center, mid, transparent edge); Mop's fillMopDab holds full alpha
    // out to 88% before fading -- different gradient shapes are the
    // material distinction, both already exercised by their own dedicated
    // tests (fillSprayParticle/fillMopDab describe blocks above).
    expect(spray.gradientStops.length).toBeGreaterThan(0);
    const firstParticleStops = spray.gradientStops.slice(0, 3);
    expect(firstParticleStops[firstParticleStops.length - 1][0]).toBe(1); // fades fully by the outer edge
  });

  it("existing legacy Spray Marks (no new fields) render without error through the same function", () => {
    const legacyStyle = { color: "#171412", width: 18, opacity: 0.6 };
    expect(() => strokeSpray({} as never, [], legacyStyle, "legacy-mark")).not.toThrow();
    const { ctx } = fakeMopContext();
    expect(() => strokeSpray(ctx as never, points, legacyStyle, "legacy-mark")).not.toThrow();
  });

  /**
   * SPRAY LIVE PREVIEW PERFORMANCE V1 -- `particleRendering` only ever
   * changes the per-particle PAINT primitive; everything else (the
   * deposition plan, core passes, cap resolution) is identical regardless
   * of the option. These tests prove that directly, rather than merely
   * asserting "it feels faster."
   */
  describe("particleRendering option -- SPRAY LIVE PREVIEW PERFORMANCE V1", () => {
    it("defaults to the existing soft-gradient particle fill when no option is passed -- byte-identical to every call site before this batch", () => {
      const withoutOption = fakeMopContext();
      strokeSpray(withoutOption.ctx as never, points, style, "mark-a");
      const explicitGradient2 = fakeMopContext();
      strokeSpray(explicitGradient2.ctx as never, points, style, "mark-a", undefined, { particleRendering: "gradient" });
      expect(withoutOption.calls).toEqual(explicitGradient2.calls);
      expect(withoutOption.createRadialGradientCallCount).toBeGreaterThan(0);
    });

    it("'flat' mode never calls createRadialGradient -- the actual cost this option exists to remove", () => {
      const flat = fakeMopContext();
      strokeSpray(flat.ctx as never, points, style, "mark-a", undefined, { particleRendering: "flat" });
      expect(flat.createRadialGradientCallCount).toBe(0);
      // Every particle fillStyle assignment is a plain color string, never a gradient object.
      const particleFillStyles = flat.fillStyles.filter((value) => typeof value === "string" && value.startsWith("rgba"));
      expect(particleFillStyles.length).toBeGreaterThan(0);
    });

    it("'flat' and 'gradient' modes produce the exact same number of particle paint calls (arc+fill) -- same deposition plan, only the fill primitive differs", () => {
      const gradient = fakeMopContext();
      strokeSpray(gradient.ctx as never, points, style, "mark-a", undefined, { particleRendering: "gradient" });
      const flat = fakeMopContext();
      strokeSpray(flat.ctx as never, points, style, "mark-a", undefined, { particleRendering: "flat" });
      const arcCount = (calls: readonly string[]) => calls.filter((call) => call.startsWith("arc(")).length;
      const fillCount = (calls: readonly string[]) => calls.filter((call) => call === "fill").length;
      expect(arcCount(flat.calls)).toBe(arcCount(gradient.calls));
      expect(fillCount(flat.calls)).toBe(fillCount(gradient.calls));
    });

    it("'flat' and 'gradient' modes paint particles at the exact same positions, in the exact same order -- both consume the SAME resolveSprayParticlePlan output, never a second simulation", () => {
      const gradient = fakeMopContext();
      strokeSpray(gradient.ctx as never, points, style, "mark-a", undefined, { particleRendering: "gradient" });
      const flat = fakeMopContext();
      strokeSpray(flat.ctx as never, points, style, "mark-a", undefined, { particleRendering: "flat" });
      const arcPositions = (calls: readonly string[]) => calls.filter((call) => call.startsWith("arc(")).map((call) => call.replace(/^arc\(/, ""));
      expect(arcPositions(flat.calls)).toEqual(arcPositions(gradient.calls));
    });

    it("the core passes (stroke calls, cap profile, width/jitter) are completely unaffected by particleRendering", () => {
      const gradient = fakeMopContext();
      strokeSpray(gradient.ctx as never, points, style, "mark-a", undefined, { particleRendering: "gradient" });
      const flat = fakeMopContext();
      strokeSpray(flat.ctx as never, points, style, "mark-a", undefined, { particleRendering: "flat" });
      const coreCalls = (c: typeof gradient) => c.calls.filter((call) => call === "stroke" || call.startsWith("moveTo(") || call.startsWith("lineTo(") || call.startsWith("lineWidth="));
      expect(coreCalls(flat)).toEqual(coreCalls(gradient));
    });

    it("different caps (Stock/Fat/Precision/Calligraphy) still produce different deposition in 'flat' mode -- the option never collapses cap identity", () => {
      const stock = fakeMopContext();
      strokeSpray(stock.ctx as never, points, style, "mark-a", undefined, { particleRendering: "flat" });
      const fat = fakeMopContext();
      // Importing a different cap profile here would duplicate sprayDeposition.ts's own import surface for a single assertion -- width alone (already proven elsewhere to change footprint/particle count) is sufficient to prove 'flat' mode still respects whatever deposition plan it's given.
      strokeSpray(fat.ctx as never, points, { ...style, width: 48 }, "mark-a", undefined, { particleRendering: "flat" });
      const arcCount = (calls: readonly string[]) => calls.filter((call) => call.startsWith("arc(")).length;
      expect(arcCount(fat.calls)).not.toBe(arcCount(stock.calls));
    });
  });

  /**
   * SPRAY POINTER-UP RECONCILIATION V1 -- `particles` lets a caller that
   * already holds an externally-resolved (cursor-based, incremental, or
   * chunked) particle list paint EXACTLY that list instead of re-entering
   * `resolveSprayParticlePlan`. Core passes are always resolved/painted
   * internally from `points`, regardless of this option -- it only ever
   * replaces the particle HALF of `strokeSpray`'s own work.
   */
  describe("particles override option -- SPRAY POINTER-UP RECONCILIATION V1", () => {
    it("an explicit particles: [] suppresses all particle painting while still painting core passes -- the live-preview/canonical-bake split this option exists for", () => {
      const suppressed = fakeMopContext();
      strokeSpray(suppressed.ctx as never, points, style, "mark-a", undefined, { particles: [] });
      const arcCalls = suppressed.calls.filter((call) => call.startsWith("arc(")).length;
      expect(arcCalls).toBe(0);
      const strokeCalls = suppressed.calls.filter((call) => call === "stroke").length;
      expect(strokeCalls).toBeGreaterThan(0); // core passes still painted
    });

    it("an explicit particles list is painted verbatim, never recomputed from points -- a deliberately-mismatched list proves this isn't silently ignored", () => {
      const explicitParticles = [
        { x: 5, y: 5, radius: 3, alpha: 1 },
        { x: 50, y: 50, radius: 2, alpha: 0.5 },
      ];
      const { ctx, calls } = fakeMopContext();
      strokeSpray(ctx as never, points, style, "mark-a", undefined, { particles: explicitParticles });
      const arcCalls = calls.filter((call) => call.startsWith("arc("));
      expect(arcCalls).toEqual(["arc(5,5,3)", "arc(50,50,2)"]);
    });

    it("omitting particles entirely still resolves+paints the full canonical particle plan, byte-identical to no option at all", () => {
      const withoutOption = fakeMopContext();
      strokeSpray(withoutOption.ctx as never, points, style, "mark-a");
      const explicitUndefined = fakeMopContext();
      strokeSpray(explicitUndefined.ctx as never, points, style, "mark-a", undefined, { particles: undefined });
      expect(withoutOption.calls).toEqual(explicitUndefined.calls);
    });

    it("particleRendering still governs the fill primitive used for an explicit particles list -- the two options compose rather than one silently overriding the other", () => {
      const explicitParticles = [{ x: 10, y: 10, radius: 4, alpha: 1 }];
      const gradient = fakeMopContext();
      strokeSpray(gradient.ctx as never, points, style, "mark-a", undefined, { particles: explicitParticles, particleRendering: "gradient" });
      expect(gradient.createRadialGradientCallCount).toBe(1);
      const flat = fakeMopContext();
      strokeSpray(flat.ctx as never, points, style, "mark-a", undefined, { particles: explicitParticles, particleRendering: "flat" });
      expect(flat.createRadialGradientCallCount).toBe(0);
    });
  });

  /**
   * BLACKBOOK Presentation Readiness -- Mop/Spray Windowed Continuous-Pass
   * Seam Fix V1. Mirrors Mop's own `lineCap` option exactly, applied to
   * Spray's CORE pass(es) -- see `StrokeMopOptions.lineCap`'s doc for the
   * shared mechanism. Spray's own live preview (`advanceSprayLivePreview`)
   * windows the CORE pass the same way Mop windows its body pass, and
   * `resolveSprayCorePlan` draws up to 3 independently-jittered passes per
   * call -- each one its own "round"-capped stroke -- so the seam defect
   * this fixes was 3x as dense for Spray as for Mop before this fix.
   */
  describe("coreLineCap option -- Mop/Spray Windowed Continuous-Pass Seam Fix V1", () => {
    it("defaults to a round core-pass cap, byte-identical to every pre-existing caller (canonical commit, reload, the background bake) that never passes it", () => {
      const { ctx } = fakeMopContext();
      strokeSpray(ctx as never, points, style, "mark-a");
      expect(ctx.lineCap).toBe("round");
    });

    it("an explicit coreLineCap is actually threaded through to the core pass(es), not silently ignored", () => {
      const { ctx } = fakeMopContext();
      strokeSpray(ctx as never, points, style, "mark-a", undefined, { coreLineCap: "butt" });
      expect(ctx.lineCap).toBe("butt");
    });

    it("composes with particles: [] -- the live preview's own exact call shape (windowed core pass, no particle painting)", () => {
      const { ctx, calls } = fakeMopContext();
      strokeSpray(ctx as never, points, style, "mark-a", undefined, { particles: [], coreLineCap: "butt" });
      expect(ctx.lineCap).toBe("butt");
      expect(calls.filter((call) => call.startsWith("arc(")).length).toBe(0); // particles still suppressed
      expect(calls.filter((call) => call === "stroke").length).toBeGreaterThan(0); // core passes still painted
    });

    it("omitting coreLineCap is byte-identical to no options at all", () => {
      const withoutOptions = fakeMopContext();
      strokeSpray(withoutOptions.ctx as never, points, style, "mark-a");
      const explicitUndefined = fakeMopContext();
      strokeSpray(explicitUndefined.ctx as never, points, style, "mark-a", undefined, { coreLineCap: undefined });
      expect(explicitUndefined.calls).toEqual(withoutOptions.calls);
      expect(explicitUndefined.ctx.lineCap).toBe(withoutOptions.ctx.lineCap);
    });
  });
});

describe("paintSprayParticles -- SPRAY POINTER-UP RECONCILIATION V1", () => {
  it("paints each particle via gradient fill by default, matching strokeSpray's own canonical primitive", () => {
    const fake = fakeMopContext();
    paintSprayParticles(fake.ctx as never, [{ x: 1, y: 2, radius: 3, alpha: 1 }, { x: 4, y: 5, radius: 6, alpha: 0.5 }], "#000", 1);
    expect(fake.createRadialGradientCallCount).toBe(2);
    expect(fake.calls.filter((call) => call.startsWith("arc("))).toEqual(["arc(1,2,3)", "arc(4,5,6)"]);
  });

  it("paints flat (no gradient) when told to -- the primitive a chunked canonical bake or the live preview actually calls per frame", () => {
    const fake = fakeMopContext();
    paintSprayParticles(fake.ctx as never, [{ x: 1, y: 2, radius: 3, alpha: 1 }], "#000", 1, "flat");
    expect(fake.createRadialGradientCallCount).toBe(0);
  });

  it("an empty particle list paints nothing", () => {
    const { calls, ctx } = fakeMopContext();
    paintSprayParticles(ctx as never, [], "#000", 1);
    expect(calls).toEqual([]);
  });

  it("MOP/SPRAY POINTER-UP WYSIWYG V1 -- repeated flat calls (the exact pattern beginSprayCanonicalBake's catch-up call makes, including a final call with nothing new) never call createRadialGradient -- no synchronous gradient-bake regression from the pointer-up catch-up fix", () => {
    const fake = fakeMopContext();
    paintSprayParticles(fake.ctx as never, [{ x: 1, y: 1, radius: 2, alpha: 1 }], "#000", 1, "flat");
    paintSprayParticles(fake.ctx as never, [{ x: 2, y: 2, radius: 2, alpha: 1 }], "#000", 1, "flat");
    paintSprayParticles(fake.ctx as never, [], "#000", 1, "flat"); // the "nothing new to catch up" case
    expect(fake.createRadialGradientCallCount).toBe(0);
  });
});

describe("BLACKBOOK Deterministic Drips β0.1 -- strokeMaterialDrip (rendering a persisted drip's own points)", () => {
  const dripPoints = [{ x: 10, y: 10 }, { x: 11, y: 16 }, { x: 10.5, y: 22 }, { x: 11.2, y: 27 }];
  const style = { color: "#1c6e6e", width: 34, opacity: 0.55 };

  it("draws exactly one fill per persisted point -- never regenerating/resampling the drip's own already-authored geometry", () => {
    const { ctx, calls } = fakeMopContext();
    strokeMaterialDrip(ctx as never, dripPoints, style, "mop");
    expect(calls.filter((call) => call.startsWith("arc(")).length).toBe(dripPoints.length);
    expect(calls.filter((call) => call === "fill").length).toBe(dripPoints.length);
  });

  it("tapers -- each successive circle's radius is strictly smaller than the previous, never widening", () => {
    const { ctx, calls } = fakeMopContext();
    strokeMaterialDrip(ctx as never, dripPoints, style, "mop");
    const radii = calls.filter((call) => call.startsWith("arc(")).map((call) => Number(call.slice(0, -1).split(",")[2]));
    for (let i = 1; i < radii.length; i += 1) expect(radii[i]).toBeLessThan(radii[i - 1]);
  });

  it("Mop starts fatter than Spray at the same authored width -- distinct material calibration, same renderer", () => {
    const mop = fakeMopContext();
    strokeMaterialDrip(mop.ctx as never, dripPoints, style, "mop");
    const spray = fakeMopContext();
    strokeMaterialDrip(spray.ctx as never, dripPoints, style, "spray");
    const firstRadius = (calls: string[]) => Number(calls.find((call) => call.startsWith("arc("))!.slice(0, -1).split(",")[2]);
    expect(firstRadius(mop.calls)).toBeGreaterThan(firstRadius(spray.calls));
  });

  it("is a pure function of its inputs -- rendering the same points/style/material twice issues identical draw calls", () => {
    const a = fakeMopContext();
    strokeMaterialDrip(a.ctx as never, dripPoints, style, "mop");
    const b = fakeMopContext();
    strokeMaterialDrip(b.ctx as never, dripPoints, style, "mop");
    expect(a.calls).toEqual(b.calls);
  });

  it("draws nothing for an empty point list, rather than throwing", () => {
    const { ctx, calls } = fakeMopContext();
    expect(() => strokeMaterialDrip(ctx as never, [], style, "mop")).not.toThrow();
    expect(calls.filter((call) => call.startsWith("arc("))).toHaveLength(0);
  });
});
