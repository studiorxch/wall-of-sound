import { describe, expect, it } from "vitest";
import {
  SprayBrushEngine,
  createStrokeRandom,
  PLUME_DWELL_FULL_MS,
  PLUME_MAX_ANGLE_DEGREES,
  resolveHaloDistanceGain,
  resolveHaloFlareRatio,
  resolveHaloGradientStops,
  resolveMouseSprayInput,
  resolveOverspraySquashAngle,
  resolvePinkDotDualPlume,
  resolvePinkDotDwellScale,
  resolvePinkDotOuterFieldBands,
  resolvePinkDotOuterFieldStops,
  resolveRingProfile,
  resolveShapedStampGeometry,
  resolveStreakGate,
  shapedStampWidthAlongTravel,
  TRANSVERSAL_AXIS_ANGLE,
} from "./SprayBrushEngine";
import { getSprayCapPreset, resolveSprayDynamics } from "./SprayCapPresets";
import { type StrokePoint } from "./types";

interface RecordedGradient {
  x0: number; y0: number; r0: number; x1: number; y1: number; r1: number;
  stops: Array<{ offset: number; color: string }>;
}

interface RecordedStroke {
  x0: number; y0: number; x1: number; y1: number; lineWidth: number; alpha: number;
}

interface RecordedArc {
  x: number; y: number; r: number; alpha: number;
}

function segmentRecordingContext(): {
  ctx: CanvasRenderingContext2D;
  strokeStyles: string[];
  fillStyles: string[];
  gradients: RecordedGradient[];
  rotateCalls: number[];
  scaleCalls: Array<{ x: number; y: number }>;
  strokes: RecordedStroke[];
  arcs: RecordedArc[];
} {
  const strokeStyles: string[] = [];
  const fillStyles: string[] = [];
  const gradients: RecordedGradient[] = [];
  const rotateCalls: number[] = [];
  const scaleCalls: Array<{ x: number; y: number }> = [];
  const strokes: RecordedStroke[] = [];
  const arcs: RecordedArc[] = [];
  let strokeStyle = "";
  let fillStyle = "";
  let activeGradient: RecordedGradient | null = null;
  let lineWidth = 0;
  let firstPoint: { x: number; y: number } | null = null;
  let lastPoint: { x: number; y: number } | null = null;
  let lastArc: { x: number; y: number; r: number } | null = null;
  const ctx = {
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => { firstPoint = null; lastPoint = null; },
    closePath: () => undefined,
    moveTo: (x: number, y: number) => { firstPoint = { x, y }; lastPoint = { x, y }; },
    lineTo: (x: number, y: number) => { lastPoint = { x, y }; },
    arc: (x: number, y: number, r: number) => { lastArc = { x, y, r }; },
    arcTo: () => undefined,
    ellipse: () => undefined,
    translate: () => undefined,
    rotate: (angle: number) => rotateCalls.push(angle),
    scale: (x: number, y: number) => scaleCalls.push({ x, y }),
    stroke: () => {
      strokeStyles.push(strokeStyle);
      if (firstPoint && lastPoint) {
        strokes.push({ x0: firstPoint.x, y0: firstPoint.y, x1: lastPoint.x, y1: lastPoint.y, lineWidth, alpha: alphaOf(strokeStyle) });
      }
    },
    fill: () => {
      fillStyles.push(fillStyle);
      if (lastArc) arcs.push({ ...lastArc, alpha: alphaOf(fillStyle) });
    },
    createRadialGradient: (x0: number, y0: number, r0: number, x1: number, y1: number, r1: number) => {
      const gradient: RecordedGradient = { x0, y0, r0, x1, y1, r1, stops: [] };
      gradients.push(gradient);
      activeGradient = gradient;
      return {
        addColorStop: (offset: number, color: string) => gradient.stops.push({ offset, color }),
      } as unknown as CanvasGradient;
    },
    get strokeStyle() { return strokeStyle; },
    set strokeStyle(value: string | CanvasGradient | CanvasPattern) { strokeStyle = String(value); },
    get fillStyle() { return fillStyle; },
    set fillStyle(value: string | CanvasGradient | CanvasPattern) {
      fillStyle = typeof value === "string" ? value : `gradient:${JSON.stringify(activeGradient)}`;
    },
    lineCap: "round",
    lineJoin: "round",
    get lineWidth() { return lineWidth; },
    set lineWidth(value: number) { lineWidth = value; },
  } as unknown as CanvasRenderingContext2D;
  return { ctx, strokeStyles, fillStyles, gradients, rotateCalls, scaleCalls, strokes, arcs };
}

function alphaOf(rgba: string): number {
  return Number.parseFloat(rgba.split(",")[3]);
}

function lineWidthRecordingContext(): { ctx: CanvasRenderingContext2D; lineWidths: number[] } {
  const lineWidths: number[] = [];
  let lineWidth = 0;
  const ctx = {
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => undefined,
    closePath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    arc: () => undefined,
    arcTo: () => undefined,
    ellipse: () => undefined,
    translate: () => undefined,
    rotate: () => undefined,
    scale: () => undefined,
    createRadialGradient: () => ({ addColorStop: () => undefined }) as unknown as CanvasGradient,
    stroke: () => lineWidths.push(lineWidth),
    fill: () => undefined,
    strokeStyle: "",
    fillStyle: "",
    lineCap: "round",
    lineJoin: "round",
    get lineWidth() { return lineWidth; },
    set lineWidth(value: number) { lineWidth = value; },
  } as unknown as CanvasRenderingContext2D;
  return { ctx, lineWidths };
}

function cumulativeAlpha(alphas: readonly number[]): number {
  return 1 - alphas.reduce((remaining, alpha) => remaining * (1 - alpha), 1);
}

/**
 * Draws a `segments`-segment stroke confined to ONE location (a short,
 * sub-cell-sized wobble, not a real cross-canvas sweep) through one engine
 * instance and returns every recorded core strokeStyle alpha, in order. Used
 * to test the per-location ceiling itself — whether ONE spot's own build-up
 * stays bounded — as distinct from `drawFillPath`, which tests correctness
 * ACROSS locations (see the "spatial correctness" describe block above).
 */
function drawFillStroke(
  engine: SprayBrushEngine,
  capId: string,
  options: { segments?: number; fillMode?: boolean; coverage?: number; velocity?: number; seed?: number } = {},
): number[] {
  const { segments = 20, fillMode = false, coverage = 1, velocity = 0.3, seed = 7 } = options;
  const cap = getSprayCapPreset(capId);
  const { ctx, strokeStyles } = segmentRecordingContext();
  const random = createStrokeRandom(seed);
  engine.beginStroke();
  let previous: StrokePoint | null = null;
  for (let i = 0; i <= segments; i += 1) {
    const point: StrokePoint = { x: i * 0.3, y: 0, timestamp: i * 16, velocity, width: 32, opacity: 1 };
    engine.renderSegment(ctx, previous, point, "#ffffff", cap, random, coverage, fillMode);
    previous = point;
  }
  return strokeStyles.map(alphaOf);
}

/**
 * Draws an explicit sequence of points through one engine instance (all in the
 * SAME beginStroke() session, i.e. one continuous gesture) and returns each
 * segment's own composited alpha (its corePasses sub-layers combined into one
 * number), so per-location coverage along the path can be inspected directly.
 */
function drawFillPath(
  engine: SprayBrushEngine,
  capId: string,
  points: ReadonlyArray<{ x: number; y: number; velocity?: number }>,
  fillMode: boolean,
  seed = 7,
): number[] {
  const cap = getSprayCapPreset(capId);
  const { ctx, strokeStyles } = segmentRecordingContext();
  const random = createStrokeRandom(seed);
  let previous: StrokePoint | null = null;
  const segmentAlphas: number[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const raw = points[i];
    const velocity = raw.velocity ?? 0.3;
    const strokePoint: StrokePoint = { x: raw.x, y: raw.y, timestamp: i * 16, velocity, width: 32, opacity: 1 };
    const before = strokeStyles.length;
    engine.renderSegment(ctx, previous, strokePoint, "#ffffff", cap, random, 1, fillMode);
    if (i > 0) {
      const corePasses = resolveSprayDynamics(cap, velocity, strokePoint.width).corePasses;
      const thisSegment = strokeStyles.slice(before, before + corePasses).map(alphaOf);
      segmentAlphas.push(cumulativeAlpha(thisSegment));
    }
    previous = strokePoint;
  }
  return segmentAlphas;
}

describe("spray fill-mode spatial correctness (local vs global saturation)", () => {
  it("A — a long single sweep over never-revisited territory keeps roughly consistent first-pass coverage start to end", () => {
    const points = Array.from({ length: 40 }, (_, i) => ({ x: i * 6, y: 0 }));
    const segments = drawFillPath(new SprayBrushEngine(), "new-york-fat", points, true);
    const start = segments.slice(0, 3);
    const end = segments.slice(-3);
    const avg = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;
    // Same tolerance either way; the point is start and end should be close to
    // EACH OTHER, not that either is a magic number.
    expect(avg(end)).toBeGreaterThan(avg(start) * 0.7);
    expect(avg(end)).toBeLessThan(avg(start) * 1.3);
  });

  it("B — painting a fresh, never-touched region later in the same continuous gesture gets the same first-pass coverage as the first region did", () => {
    const engine = new SprayBrushEngine();
    // Region A: x 0-100. A long "travel" jump to a distant, untouched region B: x 2000-2100.
    const regionA = Array.from({ length: 15 }, (_, i) => ({ x: i * 7, y: 0 }));
    const travel = [{ x: 2000, y: 0 }];
    const regionB = Array.from({ length: 15 }, (_, i) => ({ x: 2000 + i * 7, y: 0 }));
    const path = [...regionA, ...travel, ...regionB];
    const allSegments = drawFillPath(engine, "new-york-fat", path, true);
    const regionASegments = allSegments.slice(0, regionA.length - 1);
    // Skip the travel segment itself (index regionA.length-1) — it's a real
    // paint stroke across empty space, not representative of either region.
    const regionBSegments = allSegments.slice(regionA.length + 1);

    const avg = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;
    const firstOfA = avg(regionASegments.slice(0, 3));
    const firstOfB = avg(regionBSegments.slice(0, 3));
    expect(firstOfB).toBeGreaterThan(firstOfA * 0.7);
    expect(firstOfB).toBeLessThan(firstOfA * 1.3);
  });

  it("C — continuous back-and-forth over the SAME pixels (no pointer release) still builds visible coverage across traversals", () => {
    const engine = new SprayBrushEngine();
    const rightward = Array.from({ length: 15 }, (_, i) => ({ x: i * 7, y: 0 }));
    const leftward = Array.from({ length: 15 }, (_, i) => ({ x: (14 - i) * 7, y: 0 }));
    const firstPass = drawFillPath(engine, "new-york-fat", rightward, true);
    const secondPass = drawFillPath(engine, "new-york-fat", leftward, true);
    const thirdPass = drawFillPath(engine, "new-york-fat", rightward, true);

    const cumulativeAt = (passes: number[][]) => cumulativeAlpha(passes.flat());
    const after1 = cumulativeAt([firstPass]);
    const after2 = cumulativeAt([firstPass, secondPass]);
    const after3 = cumulativeAt([firstPass, secondPass, thirdPass]);

    expect(after2).toBeGreaterThan(after1);
    expect(after3).toBeGreaterThan(after2);
    expect(after3).toBeLessThan(0.98);
  });

  it("D — released-stroke accumulation still holds: 1 sweep < 2 released sweeps < 4 released sweeps", () => {
    const alpha1 = cumulativeAlpha(drawFillStroke(new SprayBrushEngine(), "new-york-fat", { fillMode: true, seed: 1 }));
    const engine2 = new SprayBrushEngine();
    const alpha2 = cumulativeAlpha([
      ...drawFillStroke(engine2, "new-york-fat", { fillMode: true, seed: 1 }),
      ...drawFillStroke(engine2, "new-york-fat", { fillMode: true, seed: 2 }),
    ]);
    const engine4 = new SprayBrushEngine();
    const alpha4 = cumulativeAlpha([
      ...drawFillStroke(engine4, "new-york-fat", { fillMode: true, seed: 1 }),
      ...drawFillStroke(engine4, "new-york-fat", { fillMode: true, seed: 2 }),
      ...drawFillStroke(engine4, "new-york-fat", { fillMode: true, seed: 3 }),
      ...drawFillStroke(engine4, "new-york-fat", { fillMode: true, seed: 4 }),
    ]);
    expect(alpha2).toBeGreaterThan(alpha1);
    expect(alpha4).toBeGreaterThan(alpha2);
  });
});

describe("spray fill-mode per-stroke opacity ceiling", () => {
  it("leaves normal (fillMode off) Spray behavior completely unchanged", () => {
    const withDefault = drawFillStroke(new SprayBrushEngine(), "new-york-fat");
    const withExplicitOff = drawFillStroke(new SprayBrushEngine(), "new-york-fat", { fillMode: false });
    expect(withDefault).toEqual(withExplicitOff);
    // Confirms the pre-existing, already-diagnosed saturation: normal mode
    // still climbs close to fully opaque within one continuous stroke.
    expect(cumulativeAlpha(withDefault)).toBeGreaterThan(0.9);
  });

  it("keeps one long Fill-mode sweep well below normal mode's near-total saturation", () => {
    const normal = cumulativeAlpha(drawFillStroke(new SprayBrushEngine(), "new-york-fat", { fillMode: false }));
    const fill = cumulativeAlpha(drawFillStroke(new SprayBrushEngine(), "new-york-fat", { fillMode: true }));
    expect(fill).toBeLessThan(0.75);
    expect(fill).toBeLessThan(normal);
  });

  it("lets a second separate sweep build cumulative coverage on top of the first, and a third build further", () => {
    const engine = new SprayBrushEngine();
    const sweep1 = drawFillStroke(engine, "new-york-fat", { fillMode: true, seed: 1 });
    const sweep2 = drawFillStroke(engine, "new-york-fat", { fillMode: true, seed: 2 });
    const sweep3 = drawFillStroke(engine, "new-york-fat", { fillMode: true, seed: 3 });

    const after1 = cumulativeAlpha(sweep1);
    const after2 = cumulativeAlpha([...sweep1, ...sweep2]);
    const after3 = cumulativeAlpha([...sweep1, ...sweep2, ...sweep3]);

    // Monotonic...
    expect(after2).toBeGreaterThan(after1);
    expect(after3).toBeGreaterThan(after2);
    // ...but bounded — never approaches fully opaque within just three sweeps.
    expect(after3).toBeLessThan(0.97);
  });

  it("makes a fast Fill sweep lighter than a slow one, same as normal mode already does", () => {
    const slow = cumulativeAlpha(drawFillStroke(new SprayBrushEngine(), "new-york-fat", { fillMode: true, velocity: 0.05 }));
    const fast = cumulativeAlpha(drawFillStroke(new SprayBrushEngine(), "new-york-fat", { fillMode: true, velocity: 1.2 }));
    expect(fast).toBeLessThan(slow);
  });

  it("scales its per-segment correction smoothly, with no erratic jumps that would read as seams", () => {
    const alphas = drawFillStroke(new SprayBrushEngine(), "new-york-fat", { fillMode: true, segments: 30 });
    for (let i = 1; i < alphas.length; i += 1) {
      // Each new segment's own alpha should decay smoothly toward the ceiling,
      // never spike back up or swing wildly relative to its neighbor.
      expect(alphas[i]).toBeLessThanOrEqual(alphas[i - 1] + 0.02);
    }
  });

  it("leaves Fuzz Fat's own rendering byte-identical (fillMode defaults off)", () => {
    const fuzzBefore = drawFillStroke(new SprayBrushEngine(), "fuzz-fat");
    const fuzzAgain = drawFillStroke(new SprayBrushEngine(), "fuzz-fat");
    expect(fuzzBefore).toEqual(fuzzAgain);
    expect(cumulativeAlpha(fuzzBefore)).toBeGreaterThan(0.9);
  });

  it("keeps Oval Calligraphy's shaped-stamp geometry independent of fillMode — fillMode changes alpha, not shape", () => {
    const cap = getSprayCapPreset("calligraphy");
    const start: StrokePoint = { x: 0, y: 0, timestamp: 0, velocity: 0.3, width: 25, opacity: 1 };
    const point: StrokePoint = { x: 100, y: 0, timestamp: 0, velocity: 0.3, width: 25, opacity: 1 };

    const withFill = segmentRecordingContext();
    new SprayBrushEngine().renderSegment(withFill.ctx, start, point, "#fff", cap, createStrokeRandom(1), 1, true);
    const withoutFill = segmentRecordingContext();
    new SprayBrushEngine().renderSegment(withoutFill.ctx, start, point, "#fff", cap, createStrokeRandom(1), 1, false);

    expect(withFill.fillStyles.length).toBeGreaterThan(0);
    expect(withFill.fillStyles.length).toBe(withoutFill.fillStyles.length);
    // Fill mode's own ceiling still bounds cumulative alpha for a shaped cap exactly as it does for line caps.
    const cumulative = (alphas: number[]) => 1 - alphas.reduce((remaining, a) => remaining * (1 - a), 1);
    expect(cumulative(withFill.fillStyles.map(alphaOf))).toBeLessThan(cumulative(withoutFill.fillStyles.map(alphaOf)));
  });

  it("composes coherently with the Spray coverage multiplier — lower coverage still yields lower cumulative fill", () => {
    const fullCoverage = cumulativeAlpha(
      drawFillStroke(new SprayBrushEngine(), "new-york-fat", { fillMode: true, coverage: 1 }),
    );
    const lowCoverage = cumulativeAlpha(
      drawFillStroke(new SprayBrushEngine(), "new-york-fat", { fillMode: true, coverage: 0.4 }),
    );
    expect(lowCoverage).toBeLessThan(fullCoverage);
    // Fill mode's ceiling still bounds the high-coverage case well below normal-mode saturation.
    expect(fullCoverage).toBeLessThan(0.75);
  });
});

describe("spray cap personality — halo, fixed-axis overspray, Wiggly Needle", () => {
  it("draws visibly more stroke passes behind Pink Dot Fat's dot (its dual-plume outer atmosphere) than New York Fat's plain core", () => {
    const drawDot = (capId: string) => {
      const cap = getSprayCapPreset(capId);
      const point: StrokePoint = { x: 40, y: 40, timestamp: 0, velocity: 0.05, width: 32, opacity: 1 };
      const { ctx, strokeStyles } = segmentRecordingContext();
      new SprayBrushEngine().renderSegment(ctx, null, point, "#ffffff", cap, createStrokeRandom(3));
      return strokeStyles;
    };
    const pinkStrokes = drawDot("pink-dot-fat");
    const nyFatStrokes = drawDot("new-york-fat");
    // Pink Dot draws its own core passes PLUS two outer atmosphere bands (mist, ring); New York Fat draws only its own core passes.
    expect(pinkStrokes.length).toBeGreaterThan(nyFatStrokes.length);
  });

  it("scales the generic (dormant) halo mechanism's alpha deterministically with a cap's haloOpacity field — using a synthetic line-cap fixture, since no built-in cap uses it after Pink Dot's migration to the unified plume", () => {
    const base = { ...getSprayCapPreset("new-york-fat"), haloRadius: 2, haloOpacity: 0.1 };
    const brighter = { ...base, haloOpacity: base.haloOpacity * 2 };
    const point: StrokePoint = { x: 40, y: 40, timestamp: 0, velocity: 0.05, width: 32, opacity: 1 };
    const dim = segmentRecordingContext();
    new SprayBrushEngine().renderSegment(dim.ctx, null, point, "#ffffff", base, createStrokeRandom(3));
    const bright = segmentRecordingContext();
    new SprayBrushEngine().renderSegment(bright.ctx, null, point, "#ffffff", brighter, createStrokeRandom(3));
    expect(alphaOf(bright.gradients[0].stops[0].color)).toBeGreaterThan(alphaOf(dim.gradients[0].stops[0].color));
  });

  it("strengthens Pink Dot's plume through repeated dwell via ordinary compositing, no new dwell/time tracking", () => {
    const cap = getSprayCapPreset("pink-dot-fat");
    const point: StrokePoint = { x: 40, y: 40, timestamp: 0, velocity: 0.05, width: 32, opacity: 1 };
    const { ctx, strokeStyles } = segmentRecordingContext();
    const engine = new SprayBrushEngine();
    const random = createStrokeRandom(3);
    engine.renderSegment(ctx, null, point, "#ffffff", cap, random);
    const afterFirst = strokeStyles.length;
    engine.renderSegment(ctx, point, point, "#ffffff", cap, random);
    engine.renderSegment(ctx, point, point, "#ffffff", cap, random);
    // Every one of the 3 dwell calls draws its own full set of strokes (mist + ring + core passes) — none gated — so the total after 3 calls is 3x a single call's worth.
    expect(strokeStyles.length).toBeGreaterThanOrEqual(afterFirst * 3);
  });

  it("resolves the overspray squash axis: fixed for directional caps, travel-following for symmetric ones", () => {
    expect(resolveOverspraySquashAngle(0.32, 0)).toBe(TRANSVERSAL_AXIS_ANGLE);
    expect(resolveOverspraySquashAngle(0.32, Math.PI / 2)).toBe(TRANSVERSAL_AXIS_ANGLE);
    expect(resolveOverspraySquashAngle(1, Math.PI / 3)).toBe(Math.PI / 3);
  });

  it("keeps Calligraphy's overspray plume anchored to its fixed transversal axis regardless of travel direction (regression: it must not read as a rotating ribbon)", () => {
    const cap = getSprayCapPreset("calligraphy");
    const captureFixedAxisSpread = (travelAngleDeg: number) => {
      const rad = (travelAngleDeg * Math.PI) / 180;
      const epsilon = 0.001; // negligible distance: exercises travel angle without along-interpolation noise
      const start: StrokePoint = { x: 500, y: 500, timestamp: 0, velocity: 0.3, width: 25, opacity: 1 };
      const point: StrokePoint = { ...start, x: 500 + Math.cos(rad) * epsilon, y: 500 + Math.sin(rad) * epsilon, timestamp: 1 };
      const offsets: Array<[number, number]> = [];
      const { ctx } = segmentRecordingContext();
      (ctx as unknown as { arc: (x: number, y: number) => void }).arc = (x: number, y: number) =>
        offsets.push([x - start.x, y - start.y]);
      new SprayBrushEngine().renderSegment(ctx, start, point, "#ffffff", cap, createStrokeRandom(5));
      const perpDistances = offsets.map(([dx, dy]) =>
        Math.abs(dx * Math.sin(TRANSVERSAL_AXIS_ANGLE) - dy * Math.cos(TRANSVERSAL_AXIS_ANGLE)),
      );
      return perpDistances.reduce((sum, v) => sum + v, 0) / perpDistances.length;
    };

    const spreadAt0 = captureFixedAxisSpread(0);
    const spreadAt90 = captureFixedAxisSpread(90);
    expect(spreadAt0).toBeGreaterThan(0);
    // Same random seed, only travel direction differs: a fixed squash axis keeps
    // this fixed-axis-relative spread stat roughly stable across travel angles.
    // A travel-following squash (the pre-fix bug) would swing this far more.
    expect(spreadAt90).toBeGreaterThan(spreadAt0 * 0.6);
    expect(spreadAt90).toBeLessThan(spreadAt0 * 1.4);
  });

  it("gives Wiggly Needle a deterministic lateral wander while Needle itself stays a straight line", () => {
    const needle = getSprayCapPreset("needle");
    const wiggly = getSprayCapPreset("wiggly-needle");
    const start: StrokePoint = { x: 0, y: 0, timestamp: 0, velocity: 0.3, width: 25, opacity: 1 };
    const point: StrokePoint = { x: 200, y: 0, timestamp: 80, velocity: 0.3, width: 25, opacity: 1 };

    const captureLineToYs = (cap: ReturnType<typeof getSprayCapPreset>) => {
      const ys: number[] = [];
      const { ctx } = segmentRecordingContext();
      (ctx as unknown as { lineTo: (x: number, y: number) => void }).lineTo = (_x: number, y: number) => ys.push(y);
      new SprayBrushEngine().renderSegment(ctx, start, point, "#ffffff", cap, createStrokeRandom(9));
      return ys;
    };

    const needleYs = captureLineToYs(needle);
    const wigglyYs = captureLineToYs(wiggly);
    // Needle's travel is perfectly horizontal; any y deviation is just per-pass jitter (small).
    expect(Math.max(...needleYs.map(Math.abs))).toBeLessThan(3);
    // Wiggly Needle's deterministic lateral offset is far larger than jitter alone.
    expect(Math.max(...wigglyYs.map(Math.abs))).toBeGreaterThan(5);
  });

  it("reproduces Wiggly Needle's wander identically for the same points, seed, and timestamps (replay-safe)", () => {
    const wiggly = getSprayCapPreset("wiggly-needle");
    const start: StrokePoint = { x: 0, y: 0, timestamp: 0, velocity: 0.3, width: 25, opacity: 1 };
    const point: StrokePoint = { x: 200, y: 0, timestamp: 80, velocity: 0.3, width: 25, opacity: 1 };
    const render = () => {
      const { ctx, strokeStyles } = segmentRecordingContext();
      const ys: number[] = [];
      (ctx as unknown as { lineTo: (x: number, y: number) => void }).lineTo = (_x: number, y: number) => ys.push(y);
      new SprayBrushEngine().renderSegment(ctx, start, point, "#ffffff", wiggly, createStrokeRandom(9));
      return { ys, strokeStyles };
    };
    const first = render();
    const second = render();
    expect(second.ys).toEqual(first.ys);
  });
});

describe("generic halo mechanism (dormant, preserved infrastructure — no built-in cap uses it after Pink Dot's migration to the unified plume; exercised via a synthetic fixture)", () => {
  const syntheticHaloCap = {
    ...getSprayCapPreset("new-york-fat"),
    haloRadius: 2.4, haloOpacity: 0.05,
    haloDistanceGain: 0.85, haloFlareAnisotropy: 0.55, haloDabSpacing: 0.85, haloRingBias: 0.6,
  };

  it("resolveHaloDistanceGain: near suppresses, far amplifies, native size is neutral, 0 is always a no-op", () => {
    expect(resolveHaloDistanceGain({ ...syntheticHaloCap, haloDistanceGain: 0 }, 10)).toBe(1);
    expect(resolveHaloDistanceGain(syntheticHaloCap, syntheticHaloCap.baseRadius)).toBe(1);
    expect(resolveHaloDistanceGain(syntheticHaloCap, syntheticHaloCap.baseRadius * 0.3)).toBeLessThan(1);
    expect(resolveHaloDistanceGain(syntheticHaloCap, syntheticHaloCap.baseRadius * 1.7)).toBeGreaterThan(1);
  });

  it("resolveHaloFlareRatio: circular at rest and at 0 anisotropy, elongates above the velocity threshold", () => {
    expect(resolveHaloFlareRatio({ ...syntheticHaloCap, haloFlareAnisotropy: 0 }, 5)).toBe(1);
    expect(resolveHaloFlareRatio(syntheticHaloCap, 0.05)).toBe(1);
    expect(resolveHaloFlareRatio(syntheticHaloCap, 1)).toBeLessThan(1);
  });

  it("resolveHaloGradientStops: two-stop legacy fade at bias 0, four-stop moat-then-peak at bias > 0, alphas stay proportional", () => {
    expect(resolveHaloGradientStops({ ...syntheticHaloCap, haloRingBias: 0 }, 0.4)).toEqual([{ offset: 0, alpha: 0.4 }, { offset: 1, alpha: 0 }]);
    const stops = resolveHaloGradientStops(syntheticHaloCap, 0.4);
    expect(stops).toHaveLength(4);
    expect(stops[stops.length - 1]).toEqual({ offset: 1, alpha: 0 });
    const half = resolveHaloGradientStops(syntheticHaloCap, 0.2);
    const full = resolveHaloGradientStops(syntheticHaloCap, 0.4);
    for (let i = 0; i < half.length; i += 1) expect(full[i].alpha).toBeCloseTo(half[i].alpha * 2, 6);
  });

  it("still renders through the real engine without throwing, on a synthetic fixture, confirming the mechanism is dormant, not deleted", () => {
    const point: StrokePoint = { x: 40, y: 40, timestamp: 0, velocity: 0.05, width: 32, opacity: 1 };
    const { ctx, gradients } = segmentRecordingContext();
    expect(() => new SprayBrushEngine().renderSegment(ctx, null, point, "#ffffff", syntheticHaloCap, createStrokeRandom(3))).not.toThrow();
    expect(gradients.length).toBeGreaterThan(0);
  });
});

describe("Pink Dot Fat dual-plume — one resolver, two coordinated CONTINUOUS layers (inner core + outer atmosphere)", () => {
  const pink = getSprayCapPreset("pink-dot-fat");
  const nativeDynamics = resolveSprayDynamics(pink, 0.3, pink.baseRadius);

  /**
   * A size proxy for the outer field's current render, working for BOTH
   * rendering techniques: a dwell point's radial-gradient stamp (its own
   * `r1`) and a moving segment's offset-rail bands (their `lineWidth`,
   * which scales proportionally with the whole field exactly like `r1`
   * does — rail strokes are picked out by matching their recorded alpha
   * against the analytically-resolved ring/mist band alphas for this
   * exact point, which is robust regardless of world-vs-local coordinates
   * (unlike position, alpha is never touched by ctx transforms), so it
   * never confuses a rail stroke with one of the inner core's own passes.
   */
  function outerFieldSizeProxy(engine: SprayBrushEngine, point: StrokePoint, previous: StrokePoint | null, random: () => number): number {
    const { ctx, gradients, strokes } = segmentRecordingContext();
    engine.renderSegment(ctx, previous, point, "#ffffff", pink, random);
    if (gradients.length) return Math.max(...gradients.map((g) => g.r1));
    const dynamics = resolveSprayDynamics(pink, point.velocity, point.width);
    const input = resolveMouseSprayInput(point, pink, 1, 0);
    const state = resolvePinkDotDualPlume(pink, input, point.velocity, dynamics);
    const knownAlphas = resolvePinkDotOuterFieldBands(state.outer).map((b) => b.alpha);
    // hexToRgba formats alpha with toFixed(3), so the recorded value can be
    // off from the analytically-resolved one by up to ~0.0005 — the
    // tolerance must clear that rounding, not chase exact equality.
    const railStrokes = strokes.filter((s) => knownAlphas.some((a) => Math.abs(a - s.alpha) < 0.002));
    return railStrokes.length ? Math.max(...railStrokes.map((s) => s.lineWidth)) : 0;
  }

  describe("resolveMouseSprayInput — mouse V1's mapping into the input-neutral canonical state (unchanged API)", () => {
    it("bounds sprayAngle to PLUME_MAX_ANGLE_DEGREES and converts to radians", () => {
      const point: StrokePoint = { x: 0, y: 0, timestamp: 0, velocity: 0.3, width: 42, opacity: 1 };
      const withinBound = resolveMouseSprayInput(point, pink, 1, 20);
      expect(withinBound.sprayAngle).toBeCloseTo((20 * Math.PI) / 180, 5);
      const overBound = resolveMouseSprayInput(point, pink, 1, 999);
      expect(overBound.sprayAngle).toBeCloseTo((PLUME_MAX_ANGLE_DEGREES * Math.PI) / 180, 5);
      const negative = resolveMouseSprayInput(point, pink, 1, -10);
      expect(negative.sprayAngle).toBe(0);
    });

    it("resolves sprayDistance as the ratio of point.width to the cap's own baseRadius", () => {
      const point: StrokePoint = { x: 0, y: 0, timestamp: 0, velocity: 0.3, width: pink.baseRadius * 1.5, opacity: 1 };
      const input = resolveMouseSprayInput(point, pink, 1, 0);
      expect(input.sprayDistance).toBeCloseTo(1.5, 5);
    });
  });

  describe("resolvePinkDotDualPlume — distance response: outer grows FASTER than inner (not simply proportionally bigger)", () => {
    it("gives the inner core no extra distance gain — it scales exactly with the resolved (live Size) radius, same as every cap", () => {
      const farDynamics = resolveSprayDynamics(pink, 0.3, pink.baseRadius * 1.7);
      const far = resolvePinkDotDualPlume(pink, { sprayAngle: 0, sprayDistance: 1.7, sprayOutput: 1 }, 0.3, farDynamics);
      expect(far.inner.radius).toBeCloseTo(farDynamics.radius, 5);
    });

    it("amplifies the outer ring/mist beyond their own proportional scaling at far distance", () => {
      const far = resolvePinkDotDualPlume(pink, { sprayAngle: 0, sprayDistance: 1.7, sprayOutput: 1 }, 0.3, nativeDynamics);
      const native = resolvePinkDotDualPlume(pink, { sprayAngle: 0, sprayDistance: 1, sprayOutput: 1 }, 0.3, nativeDynamics);
      expect(far.outer.ringRadius).toBeGreaterThan(native.outer.ringRadius);
      expect(far.outer.mistRadius).toBeGreaterThan(native.outer.mistRadius);
      expect(far.outer.ringOpacity).toBeGreaterThan(native.outer.ringOpacity);
    });

    it("grows the outer envelope by a LARGER factor than the inner core between near and far — the brief's explicit 'outer grows faster than inner' requirement", () => {
      const nearDynamics = resolveSprayDynamics(pink, 0.3, pink.baseRadius * 0.3);
      const farDynamics = resolveSprayDynamics(pink, 0.3, pink.baseRadius * 1.7);
      const near = resolvePinkDotDualPlume(pink, { sprayAngle: 0, sprayDistance: 0.3, sprayOutput: 1 }, 0.3, nearDynamics);
      const far = resolvePinkDotDualPlume(pink, { sprayAngle: 0, sprayDistance: 1.7, sprayOutput: 1 }, 0.3, farDynamics);
      const innerGrowth = far.inner.radius / near.inner.radius;
      const outerRingGrowth = far.outer.ringRadius / near.outer.ringRadius;
      const outerMistGrowth = far.outer.mistRadius / near.outer.mistRadius;
      expect(outerRingGrowth).toBeGreaterThan(innerGrowth);
      expect(outerMistGrowth).toBeGreaterThan(outerRingGrowth);
    });

    it("suppresses the outer bands below their native strength when resolved size is well below baseRadius (near)", () => {
      const near = resolvePinkDotDualPlume(pink, { sprayAngle: 0, sprayDistance: 0.3, sprayOutput: 1 }, 0.3, nativeDynamics);
      const native = resolvePinkDotDualPlume(pink, { sprayAngle: 0, sprayDistance: 1, sprayOutput: 1 }, 0.3, nativeDynamics);
      expect(near.outer.ringRadius).toBeLessThan(native.outer.ringRadius);
      expect(near.outer.mistRadius).toBeLessThan(native.outer.mistRadius);
    });
  });

  describe("resolvePinkDotDualPlume — bullseye structure (stationary): hot core -> ring -> fading mist, never hollow", () => {
    it("gives the core a materially higher opacity than the ring, and the ring a higher opacity than the mist", () => {
      const state = resolvePinkDotDualPlume(pink, { sprayAngle: 0, sprayDistance: 1, sprayOutput: 1 }, 0.05, nativeDynamics);
      expect(state.inner.opacity).toBeGreaterThan(state.outer.ringOpacity);
      expect(state.outer.ringOpacity).toBeGreaterThan(state.outer.mistOpacity);
    });

    it("orders the geometry core < ring < mist, so the ring/mist extend past the core rather than being hidden inside it", () => {
      const state = resolvePinkDotDualPlume(pink, { sprayAngle: 0, sprayDistance: 1, sprayOutput: 1 }, 0.05, nativeDynamics);
      expect(state.inner.radius).toBeLessThan(state.outer.ringRadius);
      expect(state.outer.ringRadius).toBeLessThan(state.outer.mistRadius);
    });

    it("never zeroes the core's own opacity — the center stays visibly painted, unlike Ring/Donut's deliberately hollow center", () => {
      const state = resolvePinkDotDualPlume(pink, { sprayAngle: 0, sprayDistance: 1, sprayOutput: 1 }, 0.05, nativeDynamics);
      expect(state.inner.opacity).toBeGreaterThan(0);
      const ring = getSprayCapPreset("ring-donut");
      expect(ring.centerOpacity).toBeLessThan(ring.ringOpacity); // Ring/Donut's own, genuinely different, hollow structure
    });
  });

  describe("resolvePinkDotDualPlume — angle and velocity flare, applied coherently to BOTH layers (inner moderate, outer stronger)", () => {
    it("stays a perfect circle on both layers at zero angle and low (dwell) velocity", () => {
      const state = resolvePinkDotDualPlume(pink, { sprayAngle: 0, sprayDistance: 1, sprayOutput: 1 }, 0.05, nativeDynamics);
      expect(state.inner.anisotropy).toBe(1);
      expect(state.outer.anisotropy).toBe(1);
    });

    it("flares a STATIONARY deposit (velocity 0) on both layers purely from a non-zero simulated spray angle", () => {
      const angled = resolvePinkDotDualPlume(pink, { sprayAngle: (30 * Math.PI) / 180, sprayDistance: 1, sprayOutput: 1 }, 0, nativeDynamics);
      expect(angled.inner.anisotropy).toBeLessThan(1);
      expect(angled.outer.anisotropy).toBeLessThan(1);
    });

    it("gives the outer layer a STRONGER stretch than the inner layer at the same angle — 'inner: moderate, outer: stronger'", () => {
      const state = resolvePinkDotDualPlume(pink, { sprayAngle: (30 * Math.PI) / 180, sprayDistance: 1, sprayOutput: 1 }, 0, nativeDynamics);
      expect(state.outer.anisotropy).toBeLessThan(state.inner.anisotropy);
    });

    it("does not stack angle and velocity into an exaggerated combined flare — the stronger of the two wins", () => {
      const angleRad = (PLUME_MAX_ANGLE_DEGREES * Math.PI) / 180;
      const angleOnly = resolvePinkDotDualPlume(pink, { sprayAngle: angleRad, sprayDistance: 1, sprayOutput: 1 }, 0, nativeDynamics);
      const angleAndVelocity = resolvePinkDotDualPlume(pink, { sprayAngle: angleRad, sprayDistance: 1, sprayOutput: 1 }, 1.2, nativeDynamics);
      expect(angleAndVelocity.outer.anisotropy).toBeCloseTo(angleOnly.outer.anisotropy, 5);
      expect(angleAndVelocity.inner.anisotropy).toBeCloseTo(angleOnly.inner.anisotropy, 5);
    });

    it("never flares either layer for a cap with plumeFlareStrength 0", () => {
      const flat = { ...pink, plumeFlareStrength: 0 };
      const state = resolvePinkDotDualPlume(flat, { sprayAngle: (PLUME_MAX_ANGLE_DEGREES * Math.PI) / 180, sprayDistance: 1, sprayOutput: 1 }, 5, nativeDynamics);
      expect(state.inner.anisotropy).toBe(1);
      expect(state.outer.anisotropy).toBe(1);
    });
  });

  describe("rendered dual-plume — continuity, no coarse whole-plume gating, reversals stay connected", () => {
    it("draws the inner core AND the outer field's own rails on EVERY moving segment — no dab-spacing gate skips any of them", () => {
      const engine = new SprayBrushEngine();
      const { ctx, strokeStyles, gradients } = segmentRecordingContext();
      const random = createStrokeRandom(9);
      engine.beginStroke();
      let previous: StrokePoint | null = null;
      const segments = 20;
      for (let i = 0; i <= segments; i += 1) {
        // x steps by 4 world units per segment, well above the dwell-distance
        // gate (a fraction of the ~42 radius) AND velocity 0.3 is above the
        // stationary threshold, so every one of these (after the first) is a
        // genuine moving segment, not a dwell point.
        const point: StrokePoint = { x: i * 4, y: 0, timestamp: i * 16, velocity: 0.3, width: 42, opacity: 1 };
        engine.renderSegment(ctx, previous, point, "#ffffff", pink, random);
        previous = point;
      }
      // Inner core strokes several passes per segment; outer field adds its
      // own rail strokes on top of that for every one of the `segments`
      // moving segments, proving no gating dropped the outer field. Only the
      // stroke's bare first point stamps a gradient.
      const dynamics = resolveSprayDynamics(pink, 0.3, 42);
      expect(strokeStyles.length).toBeGreaterThan(segments * dynamics.corePasses);
      expect(gradients.length).toBeGreaterThanOrEqual(1);
    });

    it("is deterministic — identical points/seed always render the identical draw sequence for both layers", () => {
      const engine1 = new SprayBrushEngine();
      const first = segmentRecordingContext();
      const engine2 = new SprayBrushEngine();
      const second = segmentRecordingContext();
      for (const engine of [{ engine: engine1, rec: first }, { engine: engine2, rec: second }]) {
        const random = createStrokeRandom(11);
        engine.engine.beginStroke();
        let previous: StrokePoint | null = null;
        for (let i = 0; i <= 8; i += 1) {
          const point: StrokePoint = { x: i * 5, y: Math.sin(i) * 10, timestamp: i * 16, velocity: 0.4, width: 42, opacity: 1 };
          engine.engine.renderSegment(engine.rec.ctx, previous, point, "#ffffff", pink, random);
          previous = point;
        }
      }
      expect(second.strokeStyles).toEqual(first.strokeStyles);
      expect(second.gradients).toEqual(first.gradients);
    });

    it("keeps drawing (never silently drops) through a sharp zigzag, a closed loop, and a backtrack/reversal — both layers", () => {
      const engine = new SprayBrushEngine();
      const { ctx, strokeStyles, gradients } = segmentRecordingContext();
      const random = createStrokeRandom(5);
      engine.beginStroke();
      const zigzag: StrokePoint[] = [
        { x: 0, y: 0, timestamp: 0, velocity: 0.4, width: 42, opacity: 1 }, // previous === null: the one true dwell point in this sequence
        { x: 50, y: 50, timestamp: 16, velocity: 0.4, width: 42, opacity: 1 },
        { x: 100, y: 0, timestamp: 32, velocity: 0.4, width: 42, opacity: 1 },
        { x: 60, y: -40, timestamp: 48, velocity: 0.4, width: 42, opacity: 1 }, // sharp corner
        { x: 20, y: 0, timestamp: 64, velocity: 0.4, width: 42, opacity: 1 }, // backtrack toward start
        { x: 0, y: 0, timestamp: 80, velocity: 0.4, width: 42, opacity: 1 }, // closes the loop
      ];
      const corePasses = resolveSprayDynamics(pink, 0.4, 42).corePasses;
      let previous: StrokePoint | null = null;
      for (const point of zigzag) {
        const strokesBefore = strokeStyles.length;
        const gradientsBefore = gradients.length;
        expect(() => engine.renderSegment(ctx, previous, point, "#ffffff", pink, random)).not.toThrow();
        expect(strokeStyles.length).toBeGreaterThan(strokesBefore); // inner core: every segment, including the sharp corner and the reversal, actually draws something
        if (previous === null) {
          expect(gradients.length).toBeGreaterThan(gradientsBefore); // the one dwell point: a radial-gradient bullseye stamp
        } else {
          // every other (moving) segment: the outer field's own offset rails add MORE strokes beyond the inner core's own passes
          expect(strokeStyles.length - strokesBefore).toBeGreaterThan(corePasses);
        }
        previous = point;
      }
    });

    it("sweeps the outer field's ring/mist as offset bands spanning the WHOLE segment on a long moving jump, not just stamps at its two endpoints", () => {
      const engine = new SprayBrushEngine();
      const { ctx, strokes } = segmentRecordingContext();
      const random = createStrokeRandom(3);
      engine.beginStroke();
      const start: StrokePoint = { x: 0, y: 0, timestamp: 0, velocity: 0.3, width: 42, opacity: 1 };
      const point: StrokePoint = { x: 400, y: 0, timestamp: 16, velocity: 0.3, width: 42, opacity: 1 };
      engine.renderSegment(ctx, start, point, "#ffffff", pink, random);
      // 2 bands (ring, mist) x 2 sides (above/below) = 4 offset-rail strokes, each spanning the full 400-unit segment.
      const wideRails = strokes.filter((s) => Math.abs(s.x1 - s.x0) > 300);
      expect(wideRails.length).toBeGreaterThanOrEqual(4);
    });

    it("keeps sweeping offset rails through a SLOW but genuinely continuous stroke, even though fine curve-smoothing sub-sampling makes many individual segments shorter than the plain dwell-distance gate — it must not repeatedly stamp a bullseye along the way", () => {
      const engine = new SprayBrushEngine();
      const { ctx, gradients } = segmentRecordingContext();
      const random = createStrokeRandom(7);
      engine.beginStroke();
      let previous: StrokePoint | null = null;
      // Many small (~2 world unit) steps with real, sustained, non-trivial
      // velocity — well above the stationary threshold — reproducing a
      // deliberate slow drag sampled finely by the app's own smoothing
      // pipeline, not a pause.
      for (let i = 0; i <= 80; i += 1) {
        const point: StrokePoint = { x: i * 2, y: 0, timestamp: i * 25, velocity: 0.3, width: 42, opacity: 1 };
        engine.renderSegment(ctx, previous, point, "#ffffff", pink, random);
        previous = point;
      }
      // Only the stroke's own bare first point (previous === null) may stamp
      // a radial gradient; every other segment, however short, must use the
      // rail technique instead.
      expect(gradients.length).toBe(1);
    });
  });

  describe("Fill mode — architecture unchanged: inner core stays ceiling-bounded, outer atmosphere composites freely (same convention as every other cap's halo/overspray)", () => {
    it("keeps a filled Pink Dot core's max alpha well below a solid/opaque read, same ceiling mechanism as any other cap's core", () => {
      const point: StrokePoint = { x: 40, y: 40, timestamp: 0, velocity: 0.3, width: 42, opacity: 1 };
      const filled = segmentRecordingContext();
      const engine = new SprayBrushEngine();
      engine.beginStroke();
      for (let pass = 0; pass < 3; pass += 1) {
        engine.renderSegment(filled.ctx, null, point, "#ffffff", pink, createStrokeRandom(7), 1, true);
      }
      const alphas = filled.strokeStyles.map(alphaOf).filter((a) => !Number.isNaN(a));
      expect(Math.max(...alphas)).toBeLessThan(0.6);
    });

    it("lets three overlapping Fill sweeps build MORE cumulative outer-field coverage than one sweep — dusty buildup, not a flat bucket fill", () => {
      const random = createStrokeRandom(3);
      const sweep = (passes: number) => {
        const { ctx, gradients } = segmentRecordingContext();
        const engine = new SprayBrushEngine();
        for (let pass = 0; pass < passes; pass += 1) {
          engine.beginStroke();
          let previous: StrokePoint | null = null;
          for (let i = 0; i <= 10; i += 1) {
            const point: StrokePoint = { x: i * 6, y: 0, timestamp: i * 16, velocity: 0.3, width: 42, opacity: 1 };
            engine.renderSegment(ctx, previous, point, "#ffffff", pink, random, 1, true);
            previous = point;
          }
        }
        return gradients.length;
      };
      expect(sweep(3)).toBeGreaterThan(sweep(1));
    });
  });

  describe("resolvePinkDotOuterFieldStops — a TRUE four-zone radial profile: core-edge -> moat -> ring peak -> mist, with a genuine density minimum (not blur)", () => {
    const state = resolvePinkDotDualPlume(pink, { sprayAngle: 0, sprayDistance: 1, sprayOutput: 1 }, 0.05, nativeDynamics);
    const stopAt = (stops: readonly { offset: number; alpha: number }[], targetOffset: number) =>
      [...stops].sort((a, b) => Math.abs(a.offset - targetOffset) - Math.abs(b.offset - targetOffset))[0];

    it("gives the moat a density strictly BELOW the core-edge zone right next to it", () => {
      const stops = resolvePinkDotOuterFieldStops(state.outer);
      const coreEdge = stopAt(stops, 0);
      const moat = stopAt(stops, 0.55);
      expect(moat.alpha).toBeLessThan(coreEdge.alpha);
    });

    it("gives the moat a density strictly BELOW the outer ring peak", () => {
      const stops = resolvePinkDotOuterFieldStops(state.outer);
      const moat = stopAt(stops, 0.55);
      const ring = stopAt(stops, 0.8);
      expect(moat.alpha).toBeLessThan(ring.alpha);
    });

    it("keeps the mist tail strictly below the ring peak", () => {
      const stops = resolvePinkDotOuterFieldStops(state.outer);
      const ring = stopAt(stops, 0.8);
      const mist = stopAt(stops, 0.9);
      expect(mist.alpha).toBeLessThan(ring.alpha);
    });

    it("fades all the way to zero at the field's own outer edge (offset 1) — a clean taper, not an abrupt clip", () => {
      const stops = resolvePinkDotOuterFieldStops(state.outer);
      expect(stops[stops.length - 1].offset).toBe(1);
      expect(stops[stops.length - 1].alpha).toBe(0);
    });

    it("holds the moat-below-both-neighbors invariant across a range of tuned ring opacities, not just the current preset value", () => {
      for (const ringOpacity of [0.05, 0.24, 0.6, 1]) {
        const outer = { ...state.outer, ringOpacity };
        const stops = resolvePinkDotOuterFieldStops(outer);
        const coreEdge = stopAt(stops, 0);
        const moat = stopAt(stops, 0.55);
        const ring = stopAt(stops, 0.8);
        expect(moat.alpha).toBeLessThan(coreEdge.alpha);
        expect(moat.alpha).toBeLessThan(ring.alpha);
      }
    });

    it("returns no stops when the outer layer has collapsed to zero mist radius or zero ring opacity", () => {
      expect(resolvePinkDotOuterFieldStops({ ...state.outer, mistRadius: 0 })).toHaveLength(0);
      expect(resolvePinkDotOuterFieldStops({ ...state.outer, ringOpacity: 0 })).toHaveLength(0);
    });
  });

  describe("resolvePinkDotDwellScale — endpoints are dwell-driven, not automatic", () => {
    it("returns a small floor scale, not 1, at zero accumulated dwell time (a bare click)", () => {
      expect(resolvePinkDotDwellScale(0)).toBeLessThan(0.3);
      expect(resolvePinkDotDwellScale(0)).toBeGreaterThan(0);
    });

    it("ramps up monotonically as dwell time accumulates", () => {
      const early = resolvePinkDotDwellScale(150); // ~0.2s territory
      const mid = resolvePinkDotDwellScale(400); // ~0.5s territory
      const late = resolvePinkDotDwellScale(900); // ~1s territory
      expect(mid).toBeGreaterThan(early);
      expect(late).toBeGreaterThan(mid);
    });

    it("reaches exactly full (1) scale by PLUME_DWELL_FULL_MS and stays capped at 1 beyond it", () => {
      expect(resolvePinkDotDwellScale(PLUME_DWELL_FULL_MS)).toBeCloseTo(1, 5);
      expect(resolvePinkDotDwellScale(PLUME_DWELL_FULL_MS * 3)).toBeCloseTo(1, 5);
    });
  });

  describe("rendered dwell-driven endpoints — no giant bulb from a bare click, progressive buildup from a real hold", () => {

    it("draws a bare click (single point, no prior dwell) far smaller than a sustained hold at the same spot", () => {
      const clickEngine = new SprayBrushEngine();
      clickEngine.beginStroke();
      const clickPoint: StrokePoint = { x: 0, y: 0, timestamp: 0, velocity: 0, width: 42, opacity: 1 };
      const clickRadius = outerFieldSizeProxy(clickEngine, clickPoint, null, createStrokeRandom(1));

      const heldEngine = new SprayBrushEngine();
      heldEngine.beginStroke();
      let previous: StrokePoint | null = null;
      let heldRadius = 0;
      const random = createStrokeRandom(1);
      // Repeated near-zero-distance points at increasing real timestamps —
      // exactly how the app's own render loop deposits a genuine held dwell.
      for (let i = 0; i <= 60; i += 1) {
        const point: StrokePoint = { x: 0, y: 0, timestamp: i * 16, velocity: 0, width: 42, opacity: 1 };
        heldRadius = outerFieldSizeProxy(heldEngine, point, previous, random);
        previous = point;
      }
      expect(heldRadius).toBeGreaterThan(clickRadius * 2);
    });

    it("does not let dwell strength carry into the very next segment once real movement starts", () => {
      const engine = new SprayBrushEngine();
      engine.beginStroke();
      const random = createStrokeRandom(2);
      let previous: StrokePoint | null = null;
      // Dwell for ~600ms first, building up real dwell strength.
      for (let i = 0; i <= 40; i += 1) {
        const point: StrokePoint = { x: 0, y: 0, timestamp: i * 16, velocity: 0, width: 42, opacity: 1 };
        outerFieldSizeProxy(engine, point, previous, random);
        previous = point;
      }
      // Now move immediately and substantially — this segment must render at
      // full/native size, not shrunk by leftover dwell scaling.
      const movedPoint: StrokePoint = { x: 200, y: 0, timestamp: 640 + 16, velocity: 0.4, width: 42, opacity: 1 };
      const movedSize = outerFieldSizeProxy(engine, movedPoint, previous, random);
      const dynamics = resolveSprayDynamics(pink, 0.4, 42);
      const state = resolvePinkDotDualPlume(pink, { sprayAngle: 0, sprayDistance: 1, sprayOutput: 1 }, 0.4, dynamics);
      const nativeMaxBandWidth = Math.max(...resolvePinkDotOuterFieldBands(state.outer).map((b) => b.width));
      expect(movedSize).toBeGreaterThan(nativeMaxBandWidth * 0.9);
    });

    it("resets and rebuilds dwell strength for a mid-stroke pause, not just the stroke's literal first/last point", () => {
      const engine = new SprayBrushEngine();
      engine.beginStroke();
      const random = createStrokeRandom(3);
      let previous: StrokePoint | null = null;
      // Move for a while first (interior of the stroke, not an endpoint).
      for (let i = 0; i <= 10; i += 1) {
        const point: StrokePoint = { x: i * 10, y: 0, timestamp: i * 16, velocity: 0.4, width: 42, opacity: 1 };
        outerFieldSizeProxy(engine, point, previous, random);
        previous = point;
      }
      // Pause in place, right after — the very FIRST stationary sample after
      // movement should be minimal, exactly like the stroke's own start.
      const pauseStart: StrokePoint = { x: 100, y: 0, timestamp: 176, velocity: 0, width: 42, opacity: 1 };
      const firstPauseRadius = outerFieldSizeProxy(engine, pauseStart, previous, random);
      previous = pauseStart;
      // Keep pausing at the same spot for real elapsed time.
      let lastPauseRadius = firstPauseRadius;
      for (let i = 1; i <= 40; i += 1) {
        const point: StrokePoint = { x: 100, y: 0, timestamp: 176 + i * 16, velocity: 0, width: 42, opacity: 1 };
        lastPauseRadius = outerFieldSizeProxy(engine, point, previous, random);
        previous = point;
      }
      expect(lastPauseRadius).toBeGreaterThan(firstPauseRadius * 2);
    });
  });

  describe("moving cross-section — the moat survives movement, distance changes continuously, flare transforms all zones together", () => {
    it("leaves a genuine unpainted gap between the inner core and the ring band on a MOVING segment — the moat is real space, not an alpha dip", () => {
      const dynamics = resolveSprayDynamics(pink, 0.3, 42);
      const state = resolvePinkDotDualPlume(pink, { sprayAngle: 0, sprayDistance: 1, sprayOutput: 1 }, 0.3, dynamics);
      const bands = resolvePinkDotOuterFieldBands(state.outer);
      expect(bands.length).toBe(2);
      const ringBand = [...bands].sort((a, b) => a.offset - b.offset)[0]; // the nearer-to-center band is the ring
      const ringInnerEdge = ringBand.offset - ringBand.width / 2;
      // A real gap: the ring band's own inner edge sits meaningfully beyond
      // the inner core's own radius — nothing (no stroke, no gradient) is
      // ever drawn in between them for a moving segment.
      expect(ringInnerEdge).toBeGreaterThan(state.inner.radius);
    });

    it("renders the outer field's ring/mist rails strictly outside the inner core's own radius on an actual MOVING render call", () => {
      const point: StrokePoint = { x: 60, y: 0, timestamp: 16, velocity: 0.1, width: 42, opacity: 1 };
      const start: StrokePoint = { x: 0, y: 0, timestamp: 0, velocity: 0.1, width: 42, opacity: 1 };
      const { ctx, strokes } = segmentRecordingContext();
      new SprayBrushEngine().renderSegment(ctx, start, point, "#ffffff", pink, createStrokeRandom(1));
      const dynamics = resolveSprayDynamics(pink, 0.1, 42);
      const state = resolvePinkDotDualPlume(pink, { sprayAngle: 0, sprayDistance: 1, sprayOutput: 1 }, 0.1, dynamics);
      const knownAlphas = resolvePinkDotOuterFieldBands(state.outer).map((b) => b.alpha);
      // Picked out by alpha (never touched by jitter or ctx transforms),
      // not by position — a small jitter offset can occasionally push an
      // inner-core pass's own |y0| past a naive position threshold too.
      const railStrokes = strokes.filter((s) => knownAlphas.some((a) => Math.abs(a - s.alpha) < 0.002));
      expect(railStrokes.length).toBeGreaterThan(0);
      // This segment is horizontal (angle 0), so a rail's own perpendicular
      // offset from the centerline is simply its recorded |y0|.
      for (const s of railStrokes) expect(Math.abs(s.y0) - s.lineWidth / 2).toBeGreaterThan(dynamics.radius * 0.9);
    });

    it("evolves the resolved outer-field geometry smoothly (no discontinuities) as canonical distance changes continuously: narrow -> wide -> narrow", () => {
      // A pure-math test of resolvePinkDotDualPlume itself — the actual
      // property under test ("no discontinuities as distance changes") is a
      // property of this resolver, not of any particular rendering
      // technique, so testing it here is both more direct and immune to
      // any ambiguity in picking specific strokes back out of a mocked
      // canvas recording.
      const steps = 20;
      const distanceFactorAt = (i: number) => {
        const t = i / steps; // 0..1
        const triangle = t <= 0.5 ? t * 2 : (1 - t) * 2; // 0 -> 1 -> 0
        return 0.15 + (0.9 - 0.15) * triangle;
      };
      const mistRadii: number[] = [];
      for (let i = 0; i <= steps; i += 1) {
        const distanceFactor = distanceFactorAt(i);
        const dynamics = resolveSprayDynamics(pink, 0.3, pink.baseRadius * distanceFactor);
        const state = resolvePinkDotDualPlume(pink, { sprayAngle: 0, sprayDistance: distanceFactor, sprayOutput: 1 }, 0.3, dynamics);
        mistRadii.push(state.outer.mistRadius);
      }
      const peakIndex = mistRadii.indexOf(Math.max(...mistRadii));
      // The peak sits near the middle of the ramp (where distance peaks at
      // 0.9), not at either end — a genuine narrow->wide->narrow arc, not a
      // flat line, a one-sided ramp, or a random jump.
      expect(peakIndex).toBeGreaterThan(steps * 0.25);
      expect(peakIndex).toBeLessThan(steps * 0.75);
      expect(mistRadii[peakIndex]).toBeGreaterThan(mistRadii[0] * 1.5);
      expect(mistRadii[peakIndex]).toBeGreaterThan(mistRadii[steps] * 1.3);
      // Rises monotonically to the peak, falls monotonically from it — what
      // "no discontinuity" actually means for a densely sampled continuous
      // ramp: no reversals or sudden jumps against the input's own
      // direction of travel.
      for (let i = 1; i <= peakIndex; i += 1) expect(mistRadii[i]).toBeGreaterThanOrEqual(mistRadii[i - 1]);
      for (let i = peakIndex + 1; i <= steps; i += 1) expect(mistRadii[i]).toBeLessThanOrEqual(mistRadii[i - 1]);
    });

    it("keeps rendering every step (never breaks the stream) as a real render call sweeps through the same narrow -> wide -> narrow distance ramp", () => {
      const engine = new SprayBrushEngine();
      const { ctx, strokeStyles } = segmentRecordingContext();
      const random = createStrokeRandom(4);
      engine.beginStroke();
      const steps = 20;
      const distanceFactorAt = (i: number) => {
        const t = i / steps;
        const triangle = t <= 0.5 ? t * 2 : (1 - t) * 2;
        return 0.15 + (0.9 - 0.15) * triangle;
      };
      let previous: StrokePoint | null = null;
      for (let i = 0; i <= steps; i += 1) {
        const point: StrokePoint = { x: i * 15, y: 0, timestamp: i * 16, velocity: 0.1, width: pink.baseRadius * distanceFactorAt(i), opacity: 1 };
        const before = strokeStyles.length;
        expect(() => engine.renderSegment(ctx, previous, point, "#ffffff", pink, random)).not.toThrow();
        expect(strokeStyles.length).toBeGreaterThan(before); // every step still deposits something, stream never breaks
        previous = point;
      }
    });

    it("transforms core-edge/moat/ring/mist together under flare — the gradient's own stops are identical regardless of anisotropy; only the geometric squash differs", () => {
      const flat = resolvePinkDotDualPlume(pink, { sprayAngle: 0, sprayDistance: 1, sprayOutput: 1 }, 0, nativeDynamics);
      const flared = resolvePinkDotDualPlume(pink, { sprayAngle: (40 * Math.PI) / 180, sprayDistance: 1, sprayOutput: 1 }, 0, nativeDynamics);
      expect(flared.outer.anisotropy).toBeLessThan(1);
      const flatStops = resolvePinkDotOuterFieldStops(flat.outer);
      const flaredStops = resolvePinkDotOuterFieldStops(flared.outer);
      // Same zone structure (offsets), same relative alpha bias — flare never
      // re-shapes the density profile itself, only stretches it geometrically.
      expect(flaredStops.map((s) => s.offset)).toEqual(flatStops.map((s) => s.offset));
    });

    it("scales the whole field's radius as distance grows, so the moat/ring/mist zones (fixed fractions of it) expand together with the field", () => {
      const near = resolvePinkDotDualPlume(pink, { sprayAngle: 0, sprayDistance: 0.3, sprayOutput: 1 }, 0.3, nativeDynamics);
      const far = resolvePinkDotDualPlume(pink, { sprayAngle: 0, sprayDistance: 1.7, sprayOutput: 1 }, 0.3, nativeDynamics);
      expect(far.outer.mistRadius).toBeGreaterThan(near.outer.mistRadius);
    });

    it("keeps overspray speckle out of the moat too, on a real moving render call — a structured gap the eye can register as empty, not one stray particles quietly refill", () => {
      const engine = new SprayBrushEngine();
      const { ctx, arcs } = segmentRecordingContext();
      const random = createStrokeRandom(2);
      let previous: StrokePoint | null = null;
      // A long slow stroke, matching the live "moving line" scenario — many
      // segments, plenty of overspray particles, real chance to refill a gap
      // if the exclusion were missing.
      for (let i = 0; i <= 40; i += 1) {
        const point: StrokePoint = { x: i * 3, y: 0, timestamp: i * 25, velocity: 0.3, width: 42, opacity: 1 };
        engine.renderSegment(ctx, previous, point, "#ffffff", pink, random);
        previous = point;
      }
      const dynamics = resolveSprayDynamics(pink, 0.3, 42);
      const state = resolvePinkDotDualPlume(pink, { sprayAngle: 0, sprayDistance: 1, sprayOutput: 1 }, 0.3, dynamics);
      const moatRadius = state.outer.mistRadius * 0.55; // RADIAL_MOAT_END_T
      expect(arcs.length).toBeGreaterThan(0);
      // Steady-state samples only (away from the stroke's own start/end).
      const steadyState = arcs.filter((a) => a.x > 40 && a.x < 80);
      for (const a of steadyState) expect(Math.abs(a.y) - a.r).toBeGreaterThan(moatRadius * 0.8);
    });
  });

  describe("regression — every OTHER cap is unaffected by the dual-plume rework", () => {
    it("gives every other cap all plume fields at 0 and depositionShape !== 'plume'", () => {
      for (const id of [
        "new-york-fat", "astro-fat", "german-fat", "lego-thin", "universal-thin", "level-1",
        "new-york-thin", "calligraphy", "transversal-slot", "needle", "wiggly-needle",
        "soft-fade", "fuzz-fat", "ring-donut", "dry-streak",
      ]) {
        const cap = getSprayCapPreset(id);
        expect(cap.depositionShape).not.toBe("plume");
        expect(cap.plumeRingRadius).toBe(0);
        expect(cap.plumeMistRadius).toBe(0);
        expect(cap.plumeFlareStrength).toBe(0);
      }
    });

    it("renders every other cap through the ordinary generic core loop, unaffected by renderPinkDotDualPlume/renderPinkDotOuterField/renderPinkDotInnerCore", () => {
      const point: StrokePoint = { x: 40, y: 40, timestamp: 0, velocity: 1.2, width: 32, opacity: 1 };
      const nyFat = getSprayCapPreset("new-york-fat");
      const rec = segmentRecordingContext();
      expect(() => new SprayBrushEngine().renderSegment(rec.ctx, null, point, "#ffffff", nyFat, createStrokeRandom(6))).not.toThrow();
      expect(rec.strokeStyles.length).toBeGreaterThan(0);
    });
  });
});

describe("Ring / Donut — genuine annular structure", () => {
  it("gives the ring band a higher peak opacity than the center, with a moat between them (real hollow, not a blurred dot)", () => {
    const cap = getSprayCapPreset("ring-donut");
    const profile = resolveRingProfile(cap, 40, 1);
    expect(profile).not.toBeNull();
    if (!profile) return;
    const centerAlpha = profile.stops[0].alpha;
    const moatAlpha = profile.stops[1].alpha;
    const peakAlpha = profile.stops[2].alpha;
    expect(centerAlpha).toBeGreaterThan(0); // "optional faint center mist"
    expect(centerAlpha).toBeLessThan(peakAlpha); // the actual "center < ring" requirement
    expect(moatAlpha).toBeLessThan(centerAlpha); // the annular dip that makes it read as hollow, not tapered
    expect(moatAlpha).toBeLessThan(peakAlpha);
    expect(profile.stops[profile.stops.length - 1].alpha).toBe(0); // soft outer bloom fades to nothing
  });

  it("returns null for caps with ringRadius 0 (every other cap)", () => {
    expect(resolveRingProfile(getSprayCapPreset("pink-dot-fat"), 40, 1)).toBeNull();
    expect(resolveRingProfile(getSprayCapPreset("new-york-fat"), 40, 1)).toBeNull();
  });

  it("is deterministic — same cap/scale/alpha always produces the same profile", () => {
    const cap = getSprayCapPreset("ring-donut");
    expect(resolveRingProfile(cap, 40, 0.6)).toEqual(resolveRingProfile(cap, 40, 0.6));
  });

  it("differs structurally from Pink Dot Fat: a genuinely hollow annular gradient (with a moat), not Pink Dot's opaque-core-plus-ring plume", () => {
    const ring = getSprayCapPreset("ring-donut");
    const pinkDot = getSprayCapPreset("pink-dot-fat");
    expect(ring.ringRadius).toBeGreaterThan(0);
    expect(pinkDot.ringRadius).toBe(0); // Pink Dot's own ring geometry lives in plumeRingRadius, a distinct field
    expect(ring.centerOpacity).toBeLessThan(ring.ringOpacity); // Ring/Donut's defining hollow center
    expect(ring.haloRadius).toBe(0); // neither cap uses the generic (dormant) halo mechanism
    expect(pinkDot.haloRadius).toBe(0);
    expect(ring.depositionShape).toBe("ring");
    expect(pinkDot.depositionShape).toBe("plume");
    expect(pinkDot.plumeRingRadius).toBeGreaterThan(0);
  });

  it("draws a real multi-stop radial gradient (not a flat fill) at a stationary dot, and again on a moving stroke", () => {
    const cap = getSprayCapPreset("ring-donut");
    const dot = segmentRecordingContext();
    const point: StrokePoint = { x: 40, y: 40, timestamp: 0, velocity: 0.05, width: 40, opacity: 1 };
    new SprayBrushEngine().renderSegment(dot.ctx, null, point, "#ffffff", cap, createStrokeRandom(3));
    expect(dot.gradients.length).toBeGreaterThan(0);
    expect(dot.gradients[0].stops.length).toBeGreaterThanOrEqual(4);

    const stroke = segmentRecordingContext();
    const start: StrokePoint = { x: 0, y: 0, timestamp: 0, velocity: 0.3, width: 40, opacity: 1 };
    const end: StrokePoint = { x: 150, y: 0, timestamp: 100, velocity: 0.3, width: 40, opacity: 1 };
    new SprayBrushEngine().renderSegment(stroke.ctx, start, end, "#ffffff", cap, createStrokeRandom(3));
    expect(stroke.gradients.length).toBeGreaterThan(0);
  });
});

describe("Astro Fat vs. New York Fat — rendered output, not just preset numbers", () => {
  it("gives Astro Fat's dwell dot a substantially higher composited alpha than New York Fat's, at each cap's own live default size", () => {
    const cumulativeAlpha = (alphas: number[]) => 1 - alphas.reduce((remaining, a) => remaining * (1 - a), 1);
    const dwell = (capId: string, radius: number) => {
      const cap = getSprayCapPreset(capId);
      const { ctx, strokeStyles } = segmentRecordingContext();
      const point: StrokePoint = { x: 40, y: 40, timestamp: 0, velocity: 0.1, width: radius, opacity: 1 };
      new SprayBrushEngine().renderSegment(ctx, null, point, "#ffffff", cap, createStrokeRandom(3));
      return cumulativeAlpha(strokeStyles.map(alphaOf));
    };
    const astroAlpha = dwell("astro-fat", 62);
    const nyFatAlpha = dwell("new-york-fat", 32);
    expect(astroAlpha).toBeGreaterThan(nyFatAlpha);
  });

  it("still bounds Astro Fat's Fill-mode sweep well below normal-mode saturation, same ceiling mechanism as any other cap", () => {
    const cap = getSprayCapPreset("astro-fat");
    const cumulativeAlpha = (alphas: number[]) => 1 - alphas.reduce((remaining, a) => remaining * (1 - a), 1);
    const sweep = (fillMode: boolean) => {
      const { ctx, strokeStyles } = segmentRecordingContext();
      const random = createStrokeRandom(7);
      const engine = new SprayBrushEngine();
      engine.beginStroke();
      let previous: StrokePoint | null = null;
      for (let i = 0; i <= 20; i += 1) {
        const point: StrokePoint = { x: i * 0.3, y: 0, timestamp: i * 16, velocity: 0.3, width: 62, opacity: 1 };
        engine.renderSegment(ctx, previous, point, "#ffffff", cap, random, 1, fillMode);
        previous = point;
      }
      return cumulativeAlpha(strokeStyles.map(alphaOf));
    };
    const normal = sweep(false);
    const filled = sweep(true);
    expect(filled).toBeLessThan(0.75);
    expect(filled).toBeLessThan(normal);
  });
});

describe("Dry / Streak — deterministic directional lanes and gaps", () => {
  it("gates lanes fully to zero periodically along travel distance (real gaps, not just low opacity)", () => {
    const radius = 34;
    const samples = Array.from({ length: 40 }, (_, i) => resolveStreakGate(radius, 0, i * 8));
    expect(Math.min(...samples)).toBeLessThan(0.01);
    expect(Math.max(...samples)).toBeGreaterThan(0.9);
  });

  it("is deterministic — same radius/lane/position always produces the same gate, no Math.random involved", () => {
    expect(resolveStreakGate(34, 2, 123.4)).toBe(resolveStreakGate(34, 2, 123.4));
  });

  it("staggers different lanes out of phase, producing internal ribbing rather than all lanes gapping together", () => {
    const radius = 34;
    const along = 50;
    const gates = [0, 1, 2, 3, 4].map((lane) => resolveStreakGate(radius, lane, along));
    expect(new Set(gates.map((g) => g.toFixed(4))).size).toBeGreaterThan(1);
  });

  it("keeps the gap pattern tied to the CURRENT travel direction (recomputed from angle-projected position, not a fixed world grid)", () => {
    // Same world point, different `alongTravel` projections (as travel angle changes) legitimately
    // produce different gates — this is what "orientation follows stroke direction" requires.
    const radius = 34;
    const alongHorizontal = 100 * Math.cos(0) + 0 * Math.sin(0);
    const alongDiagonal = 100 * Math.cos(Math.PI / 4) + 100 * Math.sin(Math.PI / 4);
    expect(alongHorizontal).not.toBe(alongDiagonal);
    expect(resolveStreakGate(radius, 0, alongHorizontal)).not.toBe(resolveStreakGate(radius, 0, alongDiagonal));
  });

  it("is not equivalent to Fuzz Fat: a distinct deterministic multi-lane mechanism, not raw jitter/splatter", () => {
    const streak = getSprayCapPreset("dry-streak");
    const fuzz = getSprayCapPreset("fuzz-fat");
    expect(streak.depositionShape).toBe("streak");
    expect(fuzz.depositionShape).toBe("line");
    expect(streak.streakLanes).toBeGreaterThan(1);
    expect(fuzz.streakLanes).toBe(0);
    // Fuzz Fat's raggedness comes from jitter/splatter; Dry/Streak deliberately keeps both low —
    // its texture comes entirely from the deterministic lane gate, not from randomness.
    expect(streak.jitter).toBeLessThan(fuzz.jitter);
    expect(streak.splatterProbability).toBeLessThan(fuzz.splatterProbability);
  });

  it("renders as multiple separate strokeStyle draws per segment (lanes), with some segments producing fewer draws than others (gaps)", () => {
    const cap = getSprayCapPreset("dry-streak");
    const engine = new SprayBrushEngine();
    const { ctx, strokeStyles } = segmentRecordingContext();
    let previous: StrokePoint | null = null;
    const drawsPerSegment: number[] = [];
    for (let i = 0; i <= 24; i += 1) {
      const point: StrokePoint = { x: i * 10, y: 0, timestamp: i * 20, velocity: 0.3, width: 34, opacity: 1 };
      const before = strokeStyles.length;
      engine.renderSegment(ctx, previous, point, "#ffffff", cap, createStrokeRandom(5));
      drawsPerSegment.push(strokeStyles.length - before);
      previous = point;
    }
    // Some segments should draw fewer than the full lane count (visible gaps along the stroke).
    expect(Math.min(...drawsPerSegment)).toBeLessThan(cap.streakLanes);
    // But not literally every segment is a total gap — the stroke is still visible overall.
    expect(Math.max(...drawsPerSegment)).toBeGreaterThan(0);
  });

  it("lets Fill mode's repeated-sweep accumulation still increase coverage, same as any other cap", () => {
    const cap = getSprayCapPreset("dry-streak");
    const cumulativeAlpha = (alphas: number[]) => 1 - alphas.reduce((remaining, a) => remaining * (1 - a), 1);
    const sweep = (engine: SprayBrushEngine, seed: number) => {
      const { ctx, strokeStyles } = segmentRecordingContext();
      let previous: StrokePoint | null = null;
      const random = createStrokeRandom(seed);
      for (let i = 0; i <= 20; i += 1) {
        const point: StrokePoint = { x: i * 6, y: 0, timestamp: i * 20, velocity: 0.3, width: 34, opacity: 1 };
        engine.renderSegment(ctx, previous, point, "#ffffff", cap, random, 1, true);
        previous = point;
      }
      return strokeStyles.map(alphaOf);
    };
    const engine = new SprayBrushEngine();
    const sweep1 = sweep(engine, 1);
    const sweep2 = sweep(engine, 2);
    const after1 = cumulativeAlpha(sweep1);
    const after2 = cumulativeAlpha([...sweep1, ...sweep2]);
    expect(after2).toBeGreaterThan(after1);
  });

  it("replays deterministically: identical points/seed/timestamps produce an identical gap pattern", () => {
    const cap = getSprayCapPreset("dry-streak");
    const render = () => {
      const engine = new SprayBrushEngine();
      const { ctx, strokeStyles } = segmentRecordingContext();
      let previous: StrokePoint | null = null;
      const random = createStrokeRandom(7);
      for (let i = 0; i <= 16; i += 1) {
        const point: StrokePoint = { x: i * 8, y: 0, timestamp: i * 20, velocity: 0.3, width: 34, opacity: 1 };
        engine.renderSegment(ctx, previous, point, "#ffffff", cap, random);
        previous = point;
      }
      return strokeStyles;
    };
    expect(render()).toEqual(render());
  });
});

describe("spray brush replay randomness", () => {
  it("replays a canonical stroke with the same stable random sequence", () => {
    const firstReplay = createStrokeRandom(42);
    const secondReplay = createStrokeRandom(42);
    const otherStroke = createStrokeRandom(43);
    const firstValues = Array.from({ length: 12 }, () => firstReplay());
    expect(Array.from({ length: 12 }, () => secondReplay())).toEqual(firstValues);
    expect(Array.from({ length: 12 }, () => otherStroke())).not.toEqual(firstValues);
  });

  it("replays a wet drip deterministically downward with a pooled origin and tapered stem", () => {
    const render = () => {
      const calls: Array<{ operation: string; values: number[] }> = [];
      const ctx = {
        save: () => undefined,
        restore: () => undefined,
        beginPath: () => undefined,
        arc: (...values: number[]) => calls.push({ operation: "arc", values }),
        fill: () => calls.push({ operation: "fill", values: [] }),
        moveTo: (...values: number[]) => calls.push({ operation: "moveTo", values }),
        lineTo: (...values: number[]) => calls.push({ operation: "lineTo", values }),
        closePath: () => calls.push({ operation: "closePath", values: [] }),
        stroke: () => undefined,
        lineCap: "round",
        strokeStyle: "",
        fillStyle: "",
        lineWidth: 0,
      } as unknown as CanvasRenderingContext2D;
      new SprayBrushEngine().renderCompletedDrip(ctx, {
        x: 20,
        y: 30,
        width: 8,
        length: 140,
        opacity: 0.8,
        bend: 12,
        tipWidthRatio: 0.3,
        originPoolRadius: 10,
      }, "#ff0000");
      return calls;
    };
    const first = render();
    expect(first).toEqual(render());
    expect(first.filter(({ operation }) => operation === "arc")).toHaveLength(1);
    const lines = first.filter(({ operation }) => operation === "lineTo");
    expect(first.filter(({ operation }) => operation === "closePath")).toHaveLength(1);
    expect(Math.max(...lines.map(({ values }) => values[1]))).toBeGreaterThan(160);
  });

  it("defaults renderSegment coverage to full density, preserving current Spray behavior", () => {
    const point: StrokePoint = { x: 30, y: 20, timestamp: 30, velocity: 0.7, width: 24, opacity: 1 };
    const cap = getSprayCapPreset("new-york-fat");
    const withDefault = segmentRecordingContext();
    new SprayBrushEngine().renderSegment(withDefault.ctx, null, point, "#ff0000", cap, createStrokeRandom(11));
    const withExplicitFull = segmentRecordingContext();
    new SprayBrushEngine().renderSegment(withExplicitFull.ctx, null, point, "#ff0000", cap, createStrokeRandom(11), 1);
    expect(withDefault.strokeStyles).toEqual(withExplicitFull.strokeStyles);
    expect(withDefault.fillStyles).toEqual(withExplicitFull.fillStyles);
  });

  it("lets a lower coverage value produce measurably lower core and overspray opacity", () => {
    const point: StrokePoint = { x: 30, y: 20, timestamp: 30, velocity: 0.7, width: 24, opacity: 1 };
    const cap = getSprayCapPreset("new-york-fat");
    const full = segmentRecordingContext();
    new SprayBrushEngine().renderSegment(full.ctx, null, point, "#ff0000", cap, createStrokeRandom(11), 1);
    const light = segmentRecordingContext();
    new SprayBrushEngine().renderSegment(light.ctx, null, point, "#ff0000", cap, createStrokeRandom(11), 0.4);

    expect(full.strokeStyles.length).toBeGreaterThan(0);
    expect(light.strokeStyles.length).toBe(full.strokeStyles.length);
    full.strokeStyles.forEach((rgba, index) => {
      expect(alphaOf(light.strokeStyles[index])).toBeLessThan(alphaOf(rgba));
    });

    expect(full.fillStyles.length).toBeGreaterThan(0);
    expect(light.fillStyles.length).toBe(full.fillStyles.length);
    full.fillStyles.forEach((rgba, index) => {
      expect(alphaOf(light.fillStyles[index])).toBeLessThan(alphaOf(rgba));
    });
  });

  it("clamps out-of-range coverage instead of inverting or exceeding full density", () => {
    const point: StrokePoint = { x: 30, y: 20, timestamp: 30, velocity: 0.7, width: 24, opacity: 1 };
    const cap = getSprayCapPreset("new-york-fat");
    const full = segmentRecordingContext();
    new SprayBrushEngine().renderSegment(full.ctx, null, point, "#ff0000", cap, createStrokeRandom(11), 1);
    const overshoot = segmentRecordingContext();
    new SprayBrushEngine().renderSegment(overshoot.ctx, null, point, "#ff0000", cap, createStrokeRandom(11), 2.5);
    expect(overshoot.strokeStyles).toEqual(full.strokeStyles);

    const negative = segmentRecordingContext();
    new SprayBrushEngine().renderSegment(negative.ctx, null, point, "#ff0000", cap, createStrokeRandom(11), -1);
    negative.strokeStyles.forEach((rgba) => expect(alphaOf(rgba)).toBe(0));
  });

  it("gives Oval Calligraphy genuine direction-dependent wide/thin swept width from fixed shape geometry, not a line-width trick", () => {
    const cap = getSprayCapPreset("calligraphy");
    expect(cap.depositionShape).toBe("oval");
    const dynamics = resolveSprayDynamics(cap, 0.3, 25);
    const geometry = resolveShapedStampGeometry(cap.depositionShape, dynamics.radius);
    expect(geometry).not.toBeNull();
    if (!geometry) return;

    // The pure geometry math: no travel angle is even an input to resolveShapedStampGeometry,
    // so the shape/rotation cannot rotate with the stroke by construction.
    expect(geometry.rotation).toBe(TRANSVERSAL_AXIS_ANGLE);
    const alongWidth = shapedStampWidthAlongTravel(geometry, TRANSVERSAL_AXIS_ANGLE);
    const perpendicularWidth = shapedStampWidthAlongTravel(geometry, TRANSVERSAL_AXIS_ANGLE + Math.PI / 2);
    expect(perpendicularWidth).toBeGreaterThan(alongWidth);

    // Integration: renderSegment actually stamps an ellipse at exactly that fixed rotation,
    // regardless of which direction this particular segment happens to travel.
    const captureEllipseRotations = (travelAngle: number) => {
      const rotations: number[] = [];
      const { ctx } = segmentRecordingContext();
      (ctx as unknown as { ellipse: (...args: number[]) => void }).ellipse = (_x, _y, _rx, _ry, rotation) =>
        rotations.push(rotation);
      const start: StrokePoint = { x: 0, y: 0, timestamp: 0, velocity: 0.3, width: 25, opacity: 1 };
      const point: StrokePoint = {
        x: Math.cos(travelAngle) * 100, y: Math.sin(travelAngle) * 100, timestamp: 0, velocity: 0.3, width: 25, opacity: 1,
      };
      new SprayBrushEngine().renderSegment(ctx, start, point, "#ffffff", cap, createStrokeRandom(1));
      return rotations;
    };
    const rotationsAlong = captureEllipseRotations(TRANSVERSAL_AXIS_ANGLE);
    const rotationsAcross = captureEllipseRotations(TRANSVERSAL_AXIS_ANGLE + Math.PI / 2);
    expect(rotationsAlong.length).toBeGreaterThan(0);
    expect(rotationsAcross.length).toBeGreaterThan(0);
    [...rotationsAlong, ...rotationsAcross].forEach((rotation) => expect(rotation).toBe(TRANSVERSAL_AXIS_ANGLE));
  });

  it("gives Rectangular Transversal a genuinely rectangular/slot deposition, fixed orientation, and stronger wide/narrow contrast than Oval Calligraphy", () => {
    const slot = getSprayCapPreset("transversal-slot");
    const oval = getSprayCapPreset("calligraphy");
    expect(slot.depositionShape).toBe("slot");

    const slotDynamics = resolveSprayDynamics(slot, 0.3, 25);
    const ovalDynamics = resolveSprayDynamics(oval, 0.3, 25);
    const slotGeometry = resolveShapedStampGeometry(slot.depositionShape, slotDynamics.radius);
    const ovalGeometry = resolveShapedStampGeometry(oval.depositionShape, ovalDynamics.radius);
    expect(slotGeometry).not.toBeNull();
    expect(ovalGeometry).not.toBeNull();
    if (!slotGeometry || !ovalGeometry) return;

    expect(slotGeometry.rotation).toBe(TRANSVERSAL_AXIS_ANGLE);
    expect(slotGeometry.cornerRadius).toBeGreaterThan(0);

    const slotAspect = slotGeometry.halfLength / slotGeometry.halfWidth;
    const ovalAspect = ovalGeometry.halfLength / ovalGeometry.halfWidth;
    expect(slotAspect).toBeGreaterThan(ovalAspect);

    const slotAlong = shapedStampWidthAlongTravel(slotGeometry, TRANSVERSAL_AXIS_ANGLE);
    const slotAcross = shapedStampWidthAlongTravel(slotGeometry, TRANSVERSAL_AXIS_ANGLE + Math.PI / 2);
    expect(slotAcross).toBeGreaterThan(slotAlong);
    // The wide/narrow swing itself is stronger for the slot than the oval.
    const ovalAlong = shapedStampWidthAlongTravel(ovalGeometry, TRANSVERSAL_AXIS_ANGLE);
    const ovalAcross = shapedStampWidthAlongTravel(ovalGeometry, TRANSVERSAL_AXIS_ANGLE + Math.PI / 2);
    expect(slotAcross / slotAlong).toBeGreaterThan(ovalAcross / ovalAlong);

    // Integration: renderSegment actually builds a rotated rect path (translate + rotate), not an ellipse.
    const translations: Array<{ x: number; y: number }> = [];
    const rotations: number[] = [];
    const { ctx } = segmentRecordingContext();
    (ctx as unknown as { translate: (x: number, y: number) => void }).translate = (x, y) => translations.push({ x, y });
    (ctx as unknown as { rotate: (angle: number) => void }).rotate = (angle) => rotations.push(angle);
    (ctx as unknown as { ellipse: (...args: number[]) => void }).ellipse = () => {
      throw new Error("Rectangular Transversal must not use ctx.ellipse");
    };
    const start: StrokePoint = { x: 0, y: 0, timestamp: 0, velocity: 0.3, width: 25, opacity: 1 };
    const point: StrokePoint = { x: 100, y: 0, timestamp: 0, velocity: 0.3, width: 25, opacity: 1 };
    new SprayBrushEngine().renderSegment(ctx, start, point, "#ffffff", slot, createStrokeRandom(1));
    expect(rotations.length).toBeGreaterThan(0);
    rotations.forEach((rotation) => expect(rotation).toBe(TRANSVERSAL_AXIS_ANGLE));
    expect(translations.length).toBe(rotations.length);
  });

  it("corrects Needle's rendering to a tighter overspray footprint than its old wide-spread baseline, at the actual rendering layer", () => {
    const needle = getSprayCapPreset("needle");
    const dynamics = resolveSprayDynamics(needle, 0.3, 5);
    // The dominant fuzziness driver was overspray, not the core: particleSpread
    // used to be the widest of ANY cap (2.05x radius). It must now read tight.
    expect(dynamics.particleSpread).toBeLessThan(dynamics.radius);
    // Old baseline resolved to ~0.38 at this velocity; corrected value sits well below it.
    expect(dynamics.particleOpacity).toBeLessThan(0.25);
  });

  it("makes Wiggly Needle's rendering track Needle's corrected core/overspray exactly, differing only in the wiggle offset", () => {
    const needle = getSprayCapPreset("needle");
    const wiggly = getSprayCapPreset("wiggly-needle");
    const point: StrokePoint = { x: 40, y: 40, timestamp: 0, velocity: 0.05, width: 32, opacity: 1 };

    const needleRun = segmentRecordingContext();
    new SprayBrushEngine().renderSegment(needleRun.ctx, null, point, "#ffffff", needle, createStrokeRandom(4));
    const wigglyRun = segmentRecordingContext();
    new SprayBrushEngine().renderSegment(wigglyRun.ctx, null, point, "#ffffff", wiggly, createStrokeRandom(4));

    // Same seed, same stationary point, same corrected deposition parameters —
    // at zero travel distance there's no wiggle offset yet, so the two must
    // render byte-identically here (proving the deposition itself is shared).
    expect(wigglyRun.strokeStyles).toEqual(needleRun.strokeStyles);
    expect(wigglyRun.fillStyles).toEqual(needleRun.fillStyles);
  });

  it("keeps symmetric caps direction-independent — the transversal fix only touches anisotropic caps", () => {
    const cap = getSprayCapPreset("new-york-fat");
    const point = (angle: number): StrokePoint => ({
      x: Math.cos(angle) * 100, y: Math.sin(angle) * 100, timestamp: 0, velocity: 0.3, width: 25, opacity: 1,
    });
    const start: StrokePoint = { x: 0, y: 0, timestamp: 0, velocity: 0.3, width: 25, opacity: 1 };

    const horizontal = lineWidthRecordingContext();
    new SprayBrushEngine().renderSegment(horizontal.ctx, start, point(0), "#ffffff", cap, createStrokeRandom(1));
    const vertical = lineWidthRecordingContext();
    new SprayBrushEngine().renderSegment(vertical.ctx, start, point(Math.PI / 2), "#ffffff", cap, createStrokeRandom(1));

    expect(Math.max(...horizontal.lineWidths)).toBeCloseTo(Math.max(...vertical.lineWidths), 5);
  });

  it("uses one stable opacity across progressive wet-run sections", () => {
    const fillStyles: string[] = [];
    let fillStyle = "";
    const ctx = {
      save: () => undefined,
      restore: () => undefined,
      beginPath: () => undefined,
      moveTo: () => undefined,
      lineTo: () => undefined,
      closePath: () => undefined,
      fill: () => fillStyles.push(fillStyle),
      get fillStyle() { return fillStyle; },
      set fillStyle(value: string | CanvasGradient | CanvasPattern) { fillStyle = String(value); },
      lineCap: "round",
    } as unknown as CanvasRenderingContext2D;
    const engine = new SprayBrushEngine();
    engine.startDrip({
      x: 20,
      y: 30,
      width: 10,
      length: 180,
      opacity: 0.8,
      bend: 2,
      durationMs: 1000,
      tipWidthRatio: 0.62,
    }, "#ff0000", 0);
    engine.advanceDrips(ctx, 250);
    engine.advanceDrips(ctx, 500);
    engine.advanceDrips(ctx, 750);
    expect(new Set(fillStyles)).toEqual(new Set(["rgba(255, 0, 0, 0.656)"]));
  });
});
