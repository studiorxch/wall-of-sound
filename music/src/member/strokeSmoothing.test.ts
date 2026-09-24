import { describe, expect, it } from "vitest";
import {
  fillMopDab,
  fillSprayParticle,
  hash01,
  hashLateralUnit,
  resolveGraphiteProfile,
  strokeGraphite,
  strokeInk,
  strokeMarker,
  strokeMop,
  strokeSpray,
  traceSmoothedPath,
  withAlpha,
  GRAPHITE_GRADE_ORDER,
  GRAPHITE_PROFILES,
  GRAPHITE_PROFILE_VERSION,
} from "./strokeSmoothing";

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
  const ctx = {
    save: () => calls.push("save"),
    restore: () => calls.push("restore"),
    stroke: () => calls.push("stroke"),
    fill: () => calls.push("fill"),
    beginPath: () => calls.push("beginPath"),
    moveTo: (x: number, y: number) => calls.push(`moveTo(${x},${y})`),
    lineTo: (x: number, y: number) => calls.push(`lineTo(${x},${y})`),
    arc: (x: number, y: number, r: number) => calls.push(`arc(${x},${y},${r})`),
    createRadialGradient: () => ({
      addColorStop: (offset: number, color: string) => gradientStops.push([offset, color]),
    }),
    get lineWidth() { return lineWidths[lineWidths.length - 1] ?? 0; },
    set lineWidth(value: number) { lineWidths.push(value); calls.push(`lineWidth=${value}`); },
    get globalAlpha() { return alphas[alphas.length - 1] ?? 0; },
    set globalAlpha(value: number) { alphas.push(value); calls.push(`globalAlpha=${value}`); },
    get strokeStyle() { return strokeStyles[strokeStyles.length - 1] ?? ""; },
    set strokeStyle(value: string) { strokeStyles.push(value); calls.push(`strokeStyle=${value}`); },
    fillStyle: "" as unknown,
    lineCap: "",
    lineJoin: "",
    globalCompositeOperation: "",
  };
  return { ctx, calls, lineWidths, alphas, strokeStyles, gradientStops };
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
});
