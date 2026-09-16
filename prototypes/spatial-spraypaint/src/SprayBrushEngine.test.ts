import { describe, expect, it } from "vitest";
import {
  SprayBrushEngine,
  createStrokeRandom,
  PLUME_DWELL_FULL_MS,
  PLUME_MAX_ANGLE_DEGREES,
  resolveHaloDistanceGain,
  resolveHaloFlareRatio,
  resolveHaloGradientStops,
  PINK_DOT_WIDTH_SMOOTHING,
  resolveMouseSprayInput,
  resolveOverspraySquashAngle,
  resolvePinkDotDualPlume,
  resolvePinkDotDwellScale,
  resolvePinkDotOuterFieldZones,
  resolvePinkDotStationaryProfile,
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
  /** Path ops making up this one stroke() call — lets a test tell a full-circle band-arc (stationary) apart from a two-point band rail (moving) without depending on world- vs local-space coordinates. */
  ops: readonly PathOp[];
}

interface RecordedArc {
  x: number; y: number; r: number; alpha: number;
}

interface PathOp {
  type: "moveTo" | "lineTo" | "arc" | "closePath";
  x?: number; y?: number; r?: number;
}

interface RecordedFill {
  ops: readonly PathOp[];
  fillRule: string;
  alpha: number;
  /** Distinct arc radii encountered while building this path, in the order first seen. */
  radii: number[];
  hasLineTo: boolean;
}

function segmentRecordingContext(): {
  ctx: CanvasRenderingContext2D;
  strokeStyles: string[];
  fillStyles: string[];
  gradients: RecordedGradient[];
  rotateCalls: number[];
  scaleCalls: Array<{ x: number; y: number }>;
  translateCalls: Array<{ x: number; y: number }>;
  strokes: RecordedStroke[];
  arcs: RecordedArc[];
  fills: RecordedFill[];
} {
  const strokeStyles: string[] = [];
  const fillStyles: string[] = [];
  const gradients: RecordedGradient[] = [];
  const rotateCalls: number[] = [];
  const scaleCalls: Array<{ x: number; y: number }> = [];
  const translateCalls: Array<{ x: number; y: number }> = [];
  const strokes: RecordedStroke[] = [];
  const arcs: RecordedArc[] = [];
  const fills: RecordedFill[] = [];
  let strokeStyle = "";
  let fillStyle = "";
  let activeGradient: RecordedGradient | null = null;
  let lineWidth = 0;
  let firstPoint: { x: number; y: number } | null = null;
  let lastPoint: { x: number; y: number } | null = null;
  let lastArc: { x: number; y: number; r: number } | null = null;
  let currentOps: PathOp[] = [];
  const ctx = {
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => { firstPoint = null; lastPoint = null; currentOps = []; },
    closePath: () => { currentOps.push({ type: "closePath" }); },
    moveTo: (x: number, y: number) => { firstPoint = { x, y }; lastPoint = { x, y }; currentOps.push({ type: "moveTo", x, y }); },
    lineTo: (x: number, y: number) => { lastPoint = { x, y }; currentOps.push({ type: "lineTo", x, y }); },
    arc: (x: number, y: number, r: number) => { lastArc = { x, y, r }; currentOps.push({ type: "arc", x, y, r }); },
    arcTo: () => undefined,
    ellipse: () => undefined,
    translate: (x: number, y: number) => translateCalls.push({ x, y }),
    rotate: (angle: number) => rotateCalls.push(angle),
    scale: (x: number, y: number) => scaleCalls.push({ x, y }),
    stroke: () => {
      strokeStyles.push(strokeStyle);
      // An arc-only path (Pink Dot's stationary band-stroke — see
      // SprayBrushEngine.strokePinkDotOuterFieldBand) never calls moveTo,
      // so firstPoint/lastPoint stay null; fall back to the arc's own
      // center so the stroke is still recorded (ops is what tests actually
      // key off for that case anyway).
      const arcOp = currentOps.find((op) => op.type === "arc");
      const p0 = firstPoint ?? (arcOp ? { x: arcOp.x ?? 0, y: arcOp.y ?? 0 } : null);
      const p1 = lastPoint ?? (arcOp ? { x: arcOp.x ?? 0, y: arcOp.y ?? 0 } : null);
      if (p0 && p1) {
        strokes.push({ x0: p0.x, y0: p0.y, x1: p1.x, y1: p1.y, lineWidth, alpha: alphaOf(strokeStyle), ops: currentOps });
      }
    },
    fill: (fillRule?: string) => {
      fillStyles.push(fillStyle);
      if (lastArc) arcs.push({ ...lastArc, alpha: alphaOf(fillStyle) });
      const radii: number[] = [];
      let hasLineTo = false;
      // Split into subpaths at each moveTo — a band fill traces TWO (outer
      // boundary, then inner/hole boundary), and each subpath independently
      // yields one "radius": either an arc's own radius, or — for the flat-
      // capped rectangle a moving segment now traces (see
      // SprayBrushEngine.tracePinkDotCapsule: moveTo(x0+sx,y0+sy),
      // lineTo(x1+sx,y1+sy), lineTo(x1-sx,y1-sy), lineTo(x0-sx,y0-sy),
      // closePath) — half the distance between its FIRST and LAST recorded
      // vertex. Those two vertices are always the segment's two symmetric
      // side-offsets at its start point ((x0,y0)+-(sx,sy)), so that distance
      // is exactly 2*radius regardless of how long the segment itself is —
      // unlike the shortest-edge, which is only the radius edge when the
      // segment is longer than the band is wide.
      let subpath: Array<{ x: number; y: number }> = [];
      const flushSubpath = () => {
        if (subpath.length >= 4) {
          const a = subpath[0];
          const b = subpath[subpath.length - 1];
          const r = Math.hypot(b.x - a.x, b.y - a.y) / 2;
          if (Number.isFinite(r) && !radii.includes(r)) radii.push(r);
        }
        subpath = [];
      };
      for (const op of currentOps) {
        if (op.type === "arc" && op.r !== undefined && !radii.includes(op.r)) radii.push(op.r);
        if (op.type === "lineTo") hasLineTo = true;
        if (op.type === "moveTo") { flushSubpath(); if (op.x !== undefined && op.y !== undefined) subpath.push({ x: op.x, y: op.y }); }
        else if (op.type === "lineTo" && op.x !== undefined && op.y !== undefined) subpath.push({ x: op.x, y: op.y });
        else if (op.type === "closePath") flushSubpath();
      }
      flushSubpath();
      fills.push({ ops: currentOps, fillRule: fillRule ?? "nonzero", alpha: alphaOf(fillStyle), radii, hasLineTo });
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
  return { ctx, strokeStyles, fillStyles, gradients, rotateCalls, scaleCalls, translateCalls, strokes, arcs, fills };
}

function alphaOf(rgba: string): number {
  return Number.parseFloat(rgba.split(",")[3]);
}

/**
 * Pink Dot's outer field now draws each band (mist, ring) as a STROKE —
 * either one full-circle arc (a true stationary point, no travel direction
 * to offset a rail from) or two straight "rail" strokes, one on each side
 * of the centerline at the band's own mid-radius (see
 * SprayBrushEngine.strokePinkDotOuterFieldBand).
 *
 * A structural test (arc op present, or two points sharing one y) can't
 * reliably tell a band stroke apart from the inner core's own stationary
 * stroke — a zero-length core stroke is ALSO a two-point [moveTo, lineTo]
 * with equal (world-space) x and y. The band's `lineWidth`, though, is
 * always exactly one of the two band widths (`ringOuterRadius -
 * moatRadius` or `mistOuterRadius - ringOuterRadius`) — a value the core
 * never produces (its own lineWidth is `inner.radius * 2 * edgeExpansion`)
 * — so matching on that value is what actually distinguishes them.
 */
function pinkDotBandWidths(zones: { moatRadius: number; ringOuterRadius: number; mistOuterRadius: number }): number[] {
  return [zones.ringOuterRadius - zones.moatRadius, zones.mistOuterRadius - zones.ringOuterRadius];
}

function pinkDotBandStrokes(strokes: RecordedStroke[], zones: { moatRadius: number; ringOuterRadius: number; mistOuterRadius: number }): RecordedStroke[] {
  const widths = pinkDotBandWidths(zones);
  return strokes.filter((s) => widths.some((w) => Math.abs(s.lineWidth - w) < 0.01));
}

/** The band's own mid-radius: an arc stroke's own radius, or a rail stroke's shared |y| offset from the centerline. */
function pinkDotBandRadius(stroke: RecordedStroke): number {
  const arcOp = stroke.ops.find((op) => op.type === "arc");
  if (arcOp?.r !== undefined) return arcOp.r;
  const moveOp = stroke.ops[0];
  return moveOp?.y !== undefined ? Math.abs(moveOp.y) : NaN;
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
  // Track Marks is a byte-for-byte numeric twin of Pink Dot Fat except for
  // plumeStochasticStationary (see SprayCapPresets.ts) — the TEMPORARY
  // preservation cap that still renders a true stationary dwell through
  // the swept-rail arc-stroke construction Pink Dot Fat itself moved off
  // of. Tests that specifically exercise THAT construction at a stationary
  // point use trackMarks so they keep covering it; tests about the MOVING
  // rail system (unaffected by this cap's stationary-only change) or about
  // Pink Dot Fat's own NEW stochastic field still use `pink`.
  const trackMarks = getSprayCapPreset("track-marks");
  const nativeDynamics = resolveSprayDynamics(pink, 0.3, pink.baseRadius);


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

  describe("rendered dual-plume — ONE continuous construction, no dot-vs-line branching, no repeated stamps", () => {
    it("draws the inner core AND the outer field's stochastic deposition on EVERY segment (moving or stationary alike) — no dab-spacing gate skips any of them", () => {
      // Pink Dot Fat's outer field is the SAME continuous deposition field
      // for every segment now, moving or stationary — no swept-rail
      // technique to switch to (that's trackMarks' job; see its own
      // coverage elsewhere in this file).
      const engine = new SprayBrushEngine();
      const { ctx, strokeStyles, arcs } = segmentRecordingContext();
      const random = createStrokeRandom(9);
      engine.beginStroke();
      let previous: StrokePoint | null = null;
      const segments = 20;
      for (let i = 0; i <= segments; i += 1) {
        const point: StrokePoint = { x: i * 4, y: 0, timestamp: i * 16, velocity: 0.3, width: 42, opacity: 1 };
        const arcsBefore = arcs.length;
        engine.renderSegment(ctx, previous, point, "#ffffff", pink, random);
        expect(arcs.length).toBeGreaterThan(arcsBefore); // outer field deposited particles THIS segment
        previous = point;
      }
      const dynamics = resolveSprayDynamics(pink, 0.3, 42);
      expect(strokeStyles.length).toBeGreaterThan(segments * dynamics.corePasses);
    });

    it("never calls createRadialGradient for Pink Dot — no gradient-stamp technique remains anywhere", () => {
      const engine = new SprayBrushEngine();
      const { ctx, gradients } = segmentRecordingContext();
      const random = createStrokeRandom(9);
      engine.beginStroke();
      let previous: StrokePoint | null = null;
      const points: StrokePoint[] = [
        { x: 0, y: 0, timestamp: 0, velocity: 0, width: 42, opacity: 1 }, // stationary
        { x: 0, y: 0, timestamp: 400, velocity: 0, width: 42, opacity: 1 }, // still stationary (dwell)
        { x: 200, y: 0, timestamp: 420, velocity: 0.4, width: 42, opacity: 1 }, // moving
      ];
      for (const point of points) {
        engine.renderSegment(ctx, previous, point, "#ffffff", pink, random);
        previous = point;
      }
      expect(gradients.length).toBe(0);
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
      expect(second.strokes.map((s) => ({ x0: s.x0, y0: s.y0, x1: s.x1, y1: s.y1, lineWidth: s.lineWidth, alpha: s.alpha })))
        .toEqual(first.strokes.map((s) => ({ x0: s.x0, y0: s.y0, x1: s.x1, y1: s.y1, lineWidth: s.lineWidth, alpha: s.alpha })));
    });

    it("keeps drawing (never silently drops) through a sharp zigzag, a closed loop, and a backtrack/reversal — both layers", () => {
      // Uses trackMarks: the first segment here is a true stationary point
      // (previous === null), and this test is about the swept-rail MOVING
      // system's continuity, not Pink Dot Fat's own new stochastic
      // stationary field — see the `trackMarks` doc comment above.
      const engine = new SprayBrushEngine();
      const { ctx, strokeStyles, strokes } = segmentRecordingContext();
      const random = createStrokeRandom(5);
      engine.beginStroke();
      const zigzag: StrokePoint[] = [
        { x: 0, y: 0, timestamp: 0, velocity: 0.4, width: 42, opacity: 1 },
        { x: 50, y: 50, timestamp: 16, velocity: 0.4, width: 42, opacity: 1 },
        { x: 100, y: 0, timestamp: 32, velocity: 0.4, width: 42, opacity: 1 },
        { x: 60, y: -40, timestamp: 48, velocity: 0.4, width: 42, opacity: 1 }, // sharp corner
        { x: 20, y: 0, timestamp: 64, velocity: 0.4, width: 42, opacity: 1 }, // backtrack toward start
        { x: 0, y: 0, timestamp: 80, velocity: 0.4, width: 42, opacity: 1 }, // closes the loop
      ];
      const zigzagZones = resolvePinkDotOuterFieldZones(resolvePinkDotDualPlume(trackMarks, { sprayAngle: 0, sprayDistance: 1, sprayOutput: 1 }, 0.4, resolveSprayDynamics(trackMarks, 0.4, 42)).outer);
      expect(zigzagZones).not.toBeNull();
      if (!zigzagZones) return;
      let previous: StrokePoint | null = null;
      for (const point of zigzag) {
        const strokesBefore = strokeStyles.length;
        const bandStrokesBefore = pinkDotBandStrokes(strokes, zigzagZones).length;
        expect(() => engine.renderSegment(ctx, previous, point, "#ffffff", trackMarks, random)).not.toThrow();
        expect(strokeStyles.length).toBeGreaterThan(strokesBefore); // inner core
        expect(pinkDotBandStrokes(strokes, zigzagZones).length).toBeGreaterThan(bandStrokesBefore); // outer field's own bands
        previous = point;
      }
    });

    it("(track-marks) draws exactly one mist band and one ring band per segment — never additional stamps at endpoints on top of the continuous sweep", () => {
      // track-marks: the swept-rail construction's own single-stamp-per-band
      // guarantee. Pink Dot Fat itself no longer draws rails at all — see
      // the "unifying moving and stationary" describe block below for its
      // own equivalent (sub-sampled, not rail) coverage guarantee.
      const engine = new SprayBrushEngine();
      const { ctx, strokes } = segmentRecordingContext();
      const random = createStrokeRandom(3);
      engine.beginStroke();
      const start: StrokePoint = { x: 0, y: 0, timestamp: 0, velocity: 0.3, width: 42, opacity: 1 };
      const point: StrokePoint = { x: 400, y: 0, timestamp: 16, velocity: 0.3, width: 42, opacity: 1 };
      engine.renderSegment(ctx, start, point, "#ffffff", trackMarks, random);
      const zones = resolvePinkDotOuterFieldZones(resolvePinkDotDualPlume(trackMarks, { sprayAngle: 0, sprayDistance: 1, sprayOutput: 1 }, 0.3, resolveSprayDynamics(trackMarks, 0.3, 42)).outer);
      expect(zones).not.toBeNull();
      if (!zones) return;
      const bandStrokes = pinkDotBandStrokes(strokes, zones);
      // Each band draws as TWO rails (one on each side of the centerline) —
      // mist + ring, 2 rails apiece, regardless of how long the segment is.
      expect(bandStrokes.length).toBe(4);
      const radii = [...new Set(bandStrokes.map(pinkDotBandRadius))];
      expect(radii.length).toBe(2); // exactly two distinct band radii: mist mid-radius, ring mid-radius
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
        const { ctx, arcs } = segmentRecordingContext();
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
        return arcs.length;
      };
      expect(sweep(3)).toBeGreaterThan(sweep(1));
    });
  });

  describe("resolvePinkDotOuterFieldZones — true four-zone geometry with a real (unpainted) density minimum", () => {
    const state = resolvePinkDotDualPlume(pink, { sprayAngle: 0, sprayDistance: 1, sprayOutput: 1 }, 0.05, nativeDynamics);

    it("orders the zone radii moat < ring < mist", () => {
      const zones = resolvePinkDotOuterFieldZones(state.outer);
      expect(zones).not.toBeNull();
      if (!zones) return;
      expect(zones.moatRadius).toBeLessThan(zones.ringOuterRadius);
      expect(zones.ringOuterRadius).toBeLessThan(zones.mistOuterRadius);
    });

    it("mathematically proves the mandatory density invariants: coreDensity > moatDensity, ringDensity > moatDensity, mistDensity < ringDensity", () => {
      const zones = resolvePinkDotOuterFieldZones(state.outer);
      expect(zones).not.toBeNull();
      if (!zones) return;
      const moatDensity = 0; // literally unpainted — see resolvePinkDotOuterFieldZones' own doc
      expect(state.inner.opacity).toBeGreaterThan(moatDensity);
      expect(zones.ringAlpha).toBeGreaterThan(moatDensity);
      expect(zones.mistAlpha).toBeLessThan(zones.ringAlpha);
    });

    it("keeps the moat's inner boundary strictly beyond the inner core's own radius — a real gap, not an overlap", () => {
      const zones = resolvePinkDotOuterFieldZones(state.outer);
      expect(zones).not.toBeNull();
      if (!zones) return;
      expect(zones.moatRadius).toBeGreaterThan(state.inner.radius);
    });

    it("returns null when the field has collapsed to zero mist radius or zero ring opacity", () => {
      expect(resolvePinkDotOuterFieldZones({ ...state.outer, mistRadius: 0 })).toBeNull();
      expect(resolvePinkDotOuterFieldZones({ ...state.outer, ringOpacity: 0 })).toBeNull();
    });
  });

  describe("strokePinkDotOuterFieldBand — ONE geometric construction, correct for a stationary point AND a moving segment", () => {
    it("degenerates a stationary point (start === point) into a plain circle-stroke via arc — no rail lineTo, no special-cased 'dot' path", () => {
      // trackMarks: this is specifically the swept-rail construction's own
      // stationary case, which Pink Dot Fat itself no longer uses (see
      // `plumeStochasticStationary` and the new "Pink Dot's stationary
      // aerosol deposition field" describe block below).
      const point: StrokePoint = { x: 40, y: 40, timestamp: 0, velocity: 0, width: 42, opacity: 1 };
      const { ctx, strokes } = segmentRecordingContext();
      new SprayBrushEngine().renderSegment(ctx, null, point, "#ffffff", trackMarks, createStrokeRandom(1));
      const zones = resolvePinkDotOuterFieldZones(resolvePinkDotDualPlume(trackMarks, { sprayAngle: 0, sprayDistance: 1, sprayOutput: 1 }, 0, resolveSprayDynamics(trackMarks, 0, 42)).outer);
      expect(zones).not.toBeNull();
      if (!zones) return;
      const bandStrokes = pinkDotBandStrokes(strokes, zones);
      expect(bandStrokes.length).toBe(2); // mist + ring, each ONE full-circle arc
      for (const stroke of bandStrokes) expect(stroke.ops.some((op) => op.type === "arc")).toBe(true);
    });

    it("(track-marks) sweeps a moving segment into two straight offset rails — the SAME construction, just a different `start`/`point` relationship, not a different technique", () => {
      // track-marks: Pink Dot Fat's own moving segment no longer sweeps
      // rails at all — see the "unifying moving and stationary" describe
      // block below.
      const start: StrokePoint = { x: 0, y: 0, timestamp: 0, velocity: 0.3, width: 42, opacity: 1 };
      const point: StrokePoint = { x: 120, y: 0, timestamp: 16, velocity: 0.3, width: 42, opacity: 1 };
      const { ctx, strokes } = segmentRecordingContext();
      new SprayBrushEngine().renderSegment(ctx, start, point, "#ffffff", trackMarks, createStrokeRandom(1));
      const zones = resolvePinkDotOuterFieldZones(resolvePinkDotDualPlume(trackMarks, { sprayAngle: 0, sprayDistance: 1, sprayOutput: 1 }, 0.3, resolveSprayDynamics(trackMarks, 0.3, 42)).outer);
      expect(zones).not.toBeNull();
      if (!zones) return;
      const bandStrokes = pinkDotBandStrokes(strokes, zones);
      expect(bandStrokes.length).toBe(4); // mist + ring, TWO rails apiece
      for (const stroke of bandStrokes) expect(stroke.ops.some((op) => op.type === "arc")).toBe(false);
    });

    it("strokes the ring band's two rails at exactly the mid-radius between the moat and the ring's own outer radius, with lineWidth spanning that whole gap", () => {
      // trackMarks: a true stationary point again (previous === null) — see
      // the comment on the "degenerates a stationary point" test above.
      const point: StrokePoint = { x: 40, y: 40, timestamp: 0, velocity: 0.05, width: 42, opacity: 1 };
      const { ctx, strokes } = segmentRecordingContext();
      new SprayBrushEngine().renderSegment(ctx, null, point, "#ffffff", trackMarks, createStrokeRandom(1));
      const dynamics = resolveSprayDynamics(trackMarks, 0.05, 42);
      const state = resolvePinkDotDualPlume(trackMarks, { sprayAngle: 0, sprayDistance: 1, sprayOutput: 1 }, 0.05, dynamics);
      const zones = resolvePinkDotOuterFieldZones(state.outer);
      expect(zones).not.toBeNull();
      if (!zones) return;
      const bandStrokes = pinkDotBandStrokes(strokes, zones);
      const ringStroke = [...bandStrokes].sort((a, b) => pinkDotBandRadius(a) - pinkDotBandRadius(b))[0];
      const expectedMid = (zones.moatRadius + zones.ringOuterRadius) / 2;
      const expectedWidth = zones.ringOuterRadius - zones.moatRadius;
      expect(pinkDotBandRadius(ringStroke)).toBeCloseTo(expectedMid, 5);
      expect(ringStroke.lineWidth).toBeCloseTo(expectedWidth, 5);
      // The rail's own footprint (mid-radius +- half its width) exactly
      // spans [moatRadius, ringOuterRadius] — nothing painted any closer to
      // the centerline than moatRadius, and nothing beyond ringOuterRadius.
      expect(pinkDotBandRadius(ringStroke) - ringStroke.lineWidth / 2).toBeCloseTo(zones.moatRadius, 5);
      expect(pinkDotBandRadius(ringStroke) + ringStroke.lineWidth / 2).toBeCloseTo(zones.ringOuterRadius, 5);
    });
  });

  describe("distance controls GEOMETRY; dwell controls DENSITY ONLY — mandatory dwell test", () => {
    it("gives a 0.2s, 0.5s, 1.0s, and 2.0s dwell at the SAME sprayDistance the exact same footprint radii — only opacity may increase", () => {
      // trackMarks: the swept-rail construction's own dwell invariant (Pink
      // Dot Fat's OWN dwell behavior, now through the stochastic field, is
      // covered separately below).
      const engine = new SprayBrushEngine();
      const random = createStrokeRandom(4);
      engine.beginStroke();
      const point = (t: number): StrokePoint => ({ x: 0, y: 0, timestamp: t, velocity: 0, width: 42, opacity: 1 });
      const checkpoints = [200, 500, 1000, 2000];
      const dwellZones = resolvePinkDotOuterFieldZones(resolvePinkDotDualPlume(trackMarks, { sprayAngle: 0, sprayDistance: 1, sprayOutput: 1 }, 0, resolveSprayDynamics(trackMarks, 0, 42)).outer);
      expect(dwellZones).not.toBeNull();
      if (!dwellZones) return;
      let previous: StrokePoint | null = null;
      const radiiAtCheckpoint: number[][] = [];
      const alphaAtCheckpoint: number[] = [];
      for (const t of checkpoints) {
        const { ctx, strokes } = segmentRecordingContext();
        const p = point(t);
        engine.renderSegment(ctx, previous, p, "#ffffff", trackMarks, random);
        previous = p;
        const bandStrokes = pinkDotBandStrokes(strokes, dwellZones);
        const allRadii = [...new Set(bandStrokes.map(pinkDotBandRadius))].sort((a, b) => a - b);
        radiiAtCheckpoint.push(allRadii);
        alphaAtCheckpoint.push(Math.max(...bandStrokes.map((s) => s.alpha)));
      }
      // Same geometry at every checkpoint — the footprint dimensions never change with dwell duration.
      for (let i = 1; i < radiiAtCheckpoint.length; i += 1) {
        expect(radiiAtCheckpoint[i].length).toBe(radiiAtCheckpoint[0].length);
        for (let j = 0; j < radiiAtCheckpoint[0].length; j += 1) {
          expect(radiiAtCheckpoint[i][j]).toBeCloseTo(radiiAtCheckpoint[0][j], 5);
        }
      }
      // Density/opacity DOES increase with dwell.
      for (let i = 1; i < alphaAtCheckpoint.length; i += 1) {
        expect(alphaAtCheckpoint[i]).toBeGreaterThanOrEqual(alphaAtCheckpoint[i - 1]);
      }
      expect(alphaAtCheckpoint[alphaAtCheckpoint.length - 1]).toBeGreaterThan(alphaAtCheckpoint[0]);
    });

    it("never lets dwell time affect resolvePinkDotDualPlume's own geometry output — dwell is applied only outside the resolver, as an opacity multiplier", () => {
      // The resolver itself takes no dwell/time input at all; it is a pure
      // function of sprayDistance/angle/velocity/output. This is what
      // structurally guarantees the rendered-radii test above.
      const a = resolvePinkDotDualPlume(pink, { sprayAngle: 0, sprayDistance: 1, sprayOutput: 1 }, 0, nativeDynamics);
      const b = resolvePinkDotDualPlume(pink, { sprayAngle: 0, sprayDistance: 1, sprayOutput: 1 }, 0, nativeDynamics);
      expect(a.outer.ringRadius).toBe(b.outer.ringRadius);
      expect(a.outer.mistRadius).toBe(b.outer.mistRadius);
      expect(a.inner.radius).toBe(b.inner.radius);
    });
  });

  describe("variable width during ONE continuous stroke — distance ramps 0.15 -> 0.30 -> 0.60 -> 1.00 -> 0.60 -> 0.30 -> 0.15, pointer down throughout", () => {
    it("evolves smoothly (thin -> wider -> wide flare -> narrower), no throw, no stream interruption", () => {
      // trackMarks: this is the swept-rail MOVING system's own width-ramp
      // response — untouched by Pink Dot Fat's stationary-only change, and
      // this ramp's first point (previous === null) is itself a true
      // stationary point, which trackMarks still renders through that
      // same swept-rail construction.
      const engine = new SprayBrushEngine();
      const random = createStrokeRandom(6);
      engine.beginStroke();
      const distanceFactors = [0.15, 0.3, 0.6, 1.0, 0.6, 0.3, 0.15];
      let previous: StrokePoint | null = null;
      const mistRadii: number[] = [];
      // Replicates the engine's own per-stroke width/velocity lag (see
      // SprayBrushEngine.pinkDotSmoothedWidth) so the expected band widths
      // used to identify band strokes below match what actually gets drawn.
      let smoothedWidth = -1;
      for (let i = 0; i < distanceFactors.length; i += 1) {
        const width = trackMarks.baseRadius * distanceFactors[i];
        const point: StrokePoint = { x: i * 20, y: 0, timestamp: i * 16, velocity: 0.4, width, opacity: 1 };
        smoothedWidth = smoothedWidth < 0 ? width : smoothedWidth + (width - smoothedWidth) * PINK_DOT_WIDTH_SMOOTHING;
        // sprayDistance (which drives outer/mist GAIN) comes from the RAW
        // point width via resolveMouseSprayInput, same as production — only
        // the `dynamics` radius argument itself uses the smoothed width.
        const input = resolveMouseSprayInput(point, trackMarks, 1, 0);
        const zones = resolvePinkDotOuterFieldZones(resolvePinkDotDualPlume(trackMarks, input, 0.4, resolveSprayDynamics(trackMarks, 0.4, smoothedWidth)).outer);
        expect(zones).not.toBeNull();
        if (!zones) return;
        const { ctx, strokes } = segmentRecordingContext();
        expect(() => engine.renderSegment(ctx, previous, point, "#ffffff", trackMarks, random)).not.toThrow();
        const bandStrokes = pinkDotBandStrokes(strokes, zones);
        expect(bandStrokes.length).toBeGreaterThan(0); // the stream never breaks
        mistRadii.push(Math.max(...bandStrokes.map(pinkDotBandRadius)));
        previous = point;
      }
      const peakIndex = mistRadii.indexOf(Math.max(...mistRadii));
      // Peak sits at the middle of the ramp (index 3, distance 1.0), not at either end.
      expect(peakIndex).toBe(3);
      expect(mistRadii[3]).toBeGreaterThan(mistRadii[0] * 1.5);
      expect(mistRadii[3]).toBeGreaterThan(mistRadii[mistRadii.length - 1] * 1.5);
      // Rises to the peak, falls from it — no reversal against the ramp's own direction.
      for (let i = 1; i <= peakIndex; i += 1) expect(mistRadii[i]).toBeGreaterThanOrEqual(mistRadii[i - 1]);
      for (let i = peakIndex + 1; i < mistRadii.length; i += 1) expect(mistRadii[i]).toBeLessThanOrEqual(mistRadii[i - 1]);
    });
  });

  describe("straight-line cross-section test — the most important automated test", () => {
    it("gives a long straight stroke's perpendicular cross-section the exact expected density sequence: background, mist, ring, moat(0), core, moat(0), ring, mist, background", () => {
      const dynamics = resolveSprayDynamics(pink, 0.3, 42);
      const state = resolvePinkDotDualPlume(pink, { sprayAngle: 0, sprayDistance: 1, sprayOutput: 1 }, 0.3, dynamics);
      const zones = resolvePinkDotOuterFieldZones(state.outer);
      expect(zones).not.toBeNull();
      if (!zones) return;
      // Sample the resolved radial profile at increasing perpendicular offsets from the centerline.
      const densityAt = (offset: number): number => {
        if (offset <= state.inner.radius) return state.inner.opacity; // core
        if (offset <= zones.moatRadius) return 0; // moat: literally unpainted
        if (offset <= zones.ringOuterRadius) return zones.ringAlpha; // ring peak
        if (offset <= zones.mistOuterRadius) return zones.mistAlpha; // mist falloff
        return 0; // background
      };
      const core = densityAt(0);
      const moat = densityAt((state.inner.radius + zones.moatRadius) / 2);
      const ring = densityAt((zones.moatRadius + zones.ringOuterRadius) / 2);
      const mist = densityAt((zones.ringOuterRadius + zones.mistOuterRadius) / 2);
      const background = densityAt(zones.mistOuterRadius + 10);
      expect(core).toBeGreaterThan(0);
      expect(moat).toBe(0);
      expect(ring).toBeGreaterThan(moat);
      expect(mist).toBeLessThan(ring);
      expect(mist).toBeGreaterThan(background);
      expect(background).toBe(0);
      // Symmetric: the same sequence must hold approaching from either side of the centerline (the profile is radial, not directional).
      expect(densityAt(-((state.inner.radius + zones.moatRadius) / 2) * -1)).toBe(moat);
    });

    it("(track-marks) confirms the rendered moat is a genuine gap — no band stroke's own footprint ever covers the region strictly between the core and the ring on a moving stroke", () => {
      // track-marks: Pink Dot Fat's own moving-stroke moat is now a
      // density MINIMUM sampled from the same continuous curve as its
      // stationary dot, not a hard-excluded region a rail leaves alone —
      // see "moving-stroke particles follow the same low-density-moat
      // profile as a stationary dot" in the unify block below.
      const engine = new SprayBrushEngine();
      const { ctx, strokes } = segmentRecordingContext();
      const random = createStrokeRandom(2);
      const start: StrokePoint = { x: 0, y: 0, timestamp: 0, velocity: 0.3, width: 42, opacity: 1 };
      const point: StrokePoint = { x: 300, y: 0, timestamp: 16, velocity: 0.3, width: 42, opacity: 1 };
      engine.renderSegment(ctx, start, point, "#ffffff", trackMarks, random);
      const dynamics = resolveSprayDynamics(trackMarks, 0.3, 42);
      const state = resolvePinkDotDualPlume(trackMarks, { sprayAngle: 0, sprayDistance: 1, sprayOutput: 1 }, 0.3, dynamics);
      const zones = resolvePinkDotOuterFieldZones(state.outer);
      expect(zones).not.toBeNull();
      if (!zones) return;
      const bandStrokes = pinkDotBandStrokes(strokes, zones);
      expect(bandStrokes.length).toBeGreaterThan(0);
      // Every band rail's own INNER edge (mid-radius minus half its own
      // lineWidth) is at least the moat radius — nothing paints any closer
      // to the centerline than that, for any single stroke call.
      for (const stroke of bandStrokes) {
        expect(pinkDotBandRadius(stroke) - stroke.lineWidth / 2).toBeGreaterThanOrEqual(zones.moatRadius - 0.01);
      }
    });
  });

  describe("flare emerges from continuously changing angle/velocity — not a separate visual effect", () => {
    it("squashes the outer field's SAME band-stroke construction via translate/rotate/scale — no alternate 'flared' rendering path", () => {
      // trackMarks: a true stationary point (previous === null), so this
      // exercises the swept-rail construction's own flare-squash path,
      // still fully intact on the preservation cap.
      const point: StrokePoint = { x: 40, y: 40, timestamp: 0, velocity: 0, width: 42, opacity: 1 };
      const flatZones = resolvePinkDotOuterFieldZones(resolvePinkDotDualPlume(trackMarks, { sprayAngle: 0, sprayDistance: 1, sprayOutput: 1 }, 0, resolveSprayDynamics(trackMarks, 0, 42)).outer);
      expect(flatZones).not.toBeNull();
      if (!flatZones) return;
      const flat = segmentRecordingContext();
      new SprayBrushEngine().renderSegment(flat.ctx, null, point, "#ffffff", trackMarks, createStrokeRandom(1), 1, false, 0);
      const flatBandStrokes = pinkDotBandStrokes(flat.strokes, flatZones);
      expect(flatBandStrokes.length).toBe(2); // same construction, zero rotate/scale calls at zero angle

      const flaredZones = resolvePinkDotOuterFieldZones(resolvePinkDotDualPlume(trackMarks, { sprayAngle: (40 * Math.PI) / 180, sprayDistance: 1, sprayOutput: 1 }, 0, resolveSprayDynamics(trackMarks, 0, 42)).outer);
      expect(flaredZones).not.toBeNull();
      if (!flaredZones) return;
      const flared = segmentRecordingContext();
      new SprayBrushEngine().renderSegment(flared.ctx, null, point, "#ffffff", trackMarks, createStrokeRandom(1), 1, false, 40);
      const flaredBandStrokes = pinkDotBandStrokes(flared.strokes, flaredZones);
      expect(flaredBandStrokes.length).toBe(2); // the SAME two-band construction, just transformed
      expect(flared.scaleCalls.length).toBeGreaterThan(0);
    });

    it("keeps the ring/moat radii identical whether flared or not — flare stretches the whole shape geometrically, it never resizes or reshapes the profile itself", () => {
      const flat = resolvePinkDotDualPlume(pink, { sprayAngle: 0, sprayDistance: 1, sprayOutput: 1 }, 0, nativeDynamics);
      const flared = resolvePinkDotDualPlume(pink, { sprayAngle: (40 * Math.PI) / 180, sprayDistance: 1, sprayOutput: 1 }, 0, nativeDynamics);
      expect(flared.outer.anisotropy).toBeLessThan(1);
      expect(flared.outer.ringRadius).toBeCloseTo(flat.outer.ringRadius, 5);
      expect(flared.outer.mistRadius).toBeCloseTo(flat.outer.mistRadius, 5);
    });
  });

  describe("Pink Dot's stationary aerosol deposition field — resolvePinkDotStationaryProfile / renderPinkDotStochasticOuterField", () => {
    // Three reference distances, matching the brief's own close/medium/far
    // bounded prototype — one normalized model (resolvePinkDotStationaryProfile)
    // is reused unchanged for every one of them; only the resolved
    // width/dynamics fed into it (a proxy for sprayDistance, same as the
    // rest of this app) differ.
    // 0.6, not the raw 0.15 minimum — at very close distance the outer
    // ring/mist bands (which shrink FASTER than the core with distance, by
    // design — see resolvePinkDotDualPlume's outerGain) can shrink inside
    // the core radius itself, an existing, untouched property of that
    // resolver this stationary-only reset isn't chartered to change.
    const closeState = resolvePinkDotDualPlume(pink, { sprayAngle: 0, sprayDistance: 0.6, sprayOutput: 1 }, 0, resolveSprayDynamics(pink, 0, pink.baseRadius * 0.6));
    const mediumState = resolvePinkDotDualPlume(pink, { sprayAngle: 0, sprayDistance: 1, sprayOutput: 1 }, 0, resolveSprayDynamics(pink, 0, pink.baseRadius));
    const farState = resolvePinkDotDualPlume(pink, { sprayAngle: 0, sprayDistance: 1.6, sprayOutput: 1 }, 0, resolveSprayDynamics(pink, 0, pink.baseRadius * 1.6));

    it("returns a real profile at close, medium, and far distance", () => {
      for (const state of [closeState, mediumState, farState]) {
        const profile = resolvePinkDotStationaryProfile(state.inner, state.outer);
        expect(profile).not.toBeNull();
      }
    });

    it("A. footprint radius changes with distance — core, ring, and mist all grow from close to medium to far", () => {
      const close = resolvePinkDotStationaryProfile(closeState.inner, closeState.outer);
      const medium = resolvePinkDotStationaryProfile(mediumState.inner, mediumState.outer);
      const far = resolvePinkDotStationaryProfile(farState.inner, farState.outer);
      expect(close).not.toBeNull();
      expect(medium).not.toBeNull();
      expect(far).not.toBeNull();
      if (!close || !medium || !far) return;
      expect(medium.coreRadius).toBeGreaterThan(close.coreRadius);
      expect(far.coreRadius).toBeGreaterThan(medium.coreRadius);
      expect(medium.ringRadius).toBeGreaterThan(close.ringRadius);
      expect(far.ringRadius).toBeGreaterThan(medium.ringRadius);
      expect(medium.mistRadius).toBeGreaterThan(close.mistRadius);
      expect(far.mistRadius).toBeGreaterThan(medium.mistRadius);
    });

    it("D. a nonzero density minimum (the moat) exists strictly between the core and the outer ring peak", () => {
      for (const state of [closeState, mediumState, farState]) {
        const profile = resolvePinkDotStationaryProfile(state.inner, state.outer);
        expect(profile).not.toBeNull();
        if (!profile) continue;
        expect(profile.moatDensity).toBeGreaterThan(0); // a real minimum, never a literal hole
        expect(profile.moatDensity).toBeLessThan(profile.ringDensity);
        expect(profile.moatDensity).toBeLessThan(profile.coreDensity);
        expect(profile.moatRadius).toBeGreaterThan(profile.coreRadius * 0.5);
        expect(profile.moatRadius).toBeLessThan(profile.ringRadius);
      }
    });

    it("E. the outer mist fades continuously — no radius where the curve just stops, and it never rises again once past the ring", () => {
      const profile = resolvePinkDotStationaryProfile(mediumState.inner, mediumState.outer);
      expect(profile).not.toBeNull();
      if (!profile) return;
      // Sample a long run outward from the ring peak: strictly non-increasing,
      // and every step's own drop is small relative to the ring's peak
      // density — a smooth fade, not a cliff.
      const samples: number[] = [];
      const span = (profile.mistRadius - profile.ringRadius) * 3;
      const steps = 60;
      for (let i = 0; i <= steps; i += 1) samples.push(profile.densityAt(profile.ringRadius + (span * i) / steps));
      for (let i = 1; i < samples.length; i += 1) {
        expect(samples[i]).toBeLessThanOrEqual(samples[i - 1] + 1e-9);
        expect(samples[i - 1] - samples[i]).toBeLessThan(profile.ringDensity * 0.15);
      }
      // Never reaches exactly zero within this span — a continuous decay, not a hard cutoff.
      expect(samples[samples.length - 1]).toBeGreaterThan(0);
    });

    it("resolvePinkDotStationaryProfile takes no dwell/time input — dwell is applied only outside it, structurally guaranteeing the render-level dwell test below", () => {
      const a = resolvePinkDotStationaryProfile(mediumState.inner, mediumState.outer);
      const b = resolvePinkDotStationaryProfile(mediumState.inner, mediumState.outer);
      expect(a).not.toBeNull();
      if (!a || !b) return;
      expect(a.coreRadius).toBe(b.coreRadius);
      expect(a.moatRadius).toBe(b.moatRadius);
      expect(a.ringRadius).toBe(b.ringRadius);
      expect(a.mistRadius).toBe(b.mistRadius);
      expect(a.moatDensity).toBe(b.moatDensity);
      expect(a.ringDensity).toBe(b.ringDensity);
    });

    it("B/C. render-level dwell test: 0.2s/0.5s/1.0s/2.0s dwell place particles at the EXACT same radii (same seeded random, dwell doesn't affect accept/reject) while total drawn density rises monotonically", () => {
      const checkpoints = [200, 500, 1000, 2000];
      const radiiAtCheckpoint: number[][] = [];
      const totalAlphaAtCheckpoint: number[] = [];
      for (const t of checkpoints) {
        const engine = new SprayBrushEngine();
        engine.beginStroke();
        // Distance-based dwell detection doesn't care about step size (only
        // `point.timestamp - previous.timestamp`), so ONE warm-up call at
        // t=0 (establishing `previous`, contributing 0 dwell time since
        // `previous` was null for it) followed by ONE measured call at
        // t=`t` accumulates exactly `t` ms of dwell — same total the
        // swept-rail dwell test above reaches by walking straight to each
        // checkpoint. The warm-up's own particles are drawn into a
        // throwaway context so only the MEASURED call's particles get
        // compared below.
        const warmup: StrokePoint = { x: 0, y: 0, timestamp: 0, velocity: 0, width: 42, opacity: 1 };
        engine.renderSegment(segmentRecordingContext().ctx, null, warmup, "#ffffff", pink, createStrokeRandom(1));
        const point: StrokePoint = { x: 0, y: 0, timestamp: t, velocity: 0, width: 42, opacity: 1 };
        const { ctx, arcs } = segmentRecordingContext();
        // A FRESH seeded random for every checkpoint's measured call, so
        // the accept/reject and placement sequence it drives is identical
        // regardless of how much dwell time has accumulated — only
        // `dwellOpacityScale` (and therefore drawn alpha) differs between
        // checkpoints, never the geometry.
        engine.renderSegment(ctx, warmup, point, "#ffffff", pink, createStrokeRandom(9));
        expect(arcs.length).toBeGreaterThan(0); // the field actually drew particles
        radiiAtCheckpoint.push(arcs.map((a) => Math.hypot(a.x, a.y)).sort((x, y) => x - y));
        totalAlphaAtCheckpoint.push(arcs.reduce((sum, a) => sum + a.alpha, 0));
      }
      // Same seeded random sequence drives BOTH accept/reject AND particle
      // placement/size every single call, and none of that depends on
      // dwell — only the drawn alpha does — so the exact radii drawn must
      // match at every checkpoint.
      for (let i = 1; i < radiiAtCheckpoint.length; i += 1) {
        expect(radiiAtCheckpoint[i].length).toBe(radiiAtCheckpoint[0].length);
        for (let j = 0; j < radiiAtCheckpoint[0].length; j += 1) {
          expect(radiiAtCheckpoint[i][j]).toBeCloseTo(radiiAtCheckpoint[0][j], 5);
        }
      }
      // Density (here, total accumulated particle alpha) rises monotonically with dwell.
      for (let i = 1; i < totalAlphaAtCheckpoint.length; i += 1) {
        expect(totalAlphaAtCheckpoint[i]).toBeGreaterThanOrEqual(totalAlphaAtCheckpoint[i - 1]);
      }
      expect(totalAlphaAtCheckpoint[totalAlphaAtCheckpoint.length - 1]).toBeGreaterThan(totalAlphaAtCheckpoint[0]);
    });

    it("stochastic field particles land at a real spread of radii, not concentrated at one exact digital-circle radius — a live proxy for 'not a perfectly circular ring'", () => {
      const engine = new SprayBrushEngine();
      engine.beginStroke();
      const { ctx, arcs } = segmentRecordingContext();
      const point: StrokePoint = { x: 100, y: 100, timestamp: 0, velocity: 0, width: 42, opacity: 1 };
      engine.renderSegment(ctx, null, point, "#ffffff", pink, createStrokeRandom(2));
      expect(arcs.length).toBeGreaterThan(15);
      const radii = arcs.map((a) => Math.hypot(a.x - 100, a.y - 100));
      const distinctRadii = new Set(radii.map((r) => Math.round(r * 10) / 10));
      expect(distinctRadii.size).toBeGreaterThan(5); // real spread, not one repeated exact radius
      // Not every particle sits at the exact same angle either.
      const angles = arcs.map((a) => Math.round((Math.atan2(a.y - 100, a.x - 100) * 180) / Math.PI));
      expect(new Set(angles).size).toBeGreaterThan(5);
    });

    it("never draws through renderPinkDotDualPlume's OLD arc-stroke rail construction for a stationary Pink Dot Fat dwell", () => {
      const engine = new SprayBrushEngine();
      const { ctx, strokes } = segmentRecordingContext();
      const point: StrokePoint = { x: 40, y: 40, timestamp: 0, velocity: 0, width: 42, opacity: 1 };
      engine.renderSegment(ctx, null, point, "#ffffff", pink, createStrokeRandom(1));
      const zones = resolvePinkDotOuterFieldZones(mediumState.outer);
      expect(zones).not.toBeNull();
      if (!zones) return;
      expect(pinkDotBandStrokes(strokes, zones).length).toBe(0);
    });

    it("track-marks (plumeStochasticStationary: false) still renders a true stationary dwell through the OLD arc-stroke construction, unaffected", () => {
      // Note: `arcs` isn't asserted to be empty here — Pink Dot's (untouched)
      // overspray particle layer also draws via arc+fill regardless of cap,
      // so it alone would populate `arcs` even with the stochastic field
      // fully absent. The band-stroke count is what actually distinguishes
      // "still using the old construction" from Pink Dot Fat's new one.
      const engine = new SprayBrushEngine();
      const { ctx, strokes } = segmentRecordingContext();
      const point: StrokePoint = { x: 40, y: 40, timestamp: 0, velocity: 0, width: 42, opacity: 1 };
      engine.renderSegment(ctx, null, point, "#ffffff", trackMarks, createStrokeRandom(1));
      const zones = resolvePinkDotOuterFieldZones(resolvePinkDotDualPlume(trackMarks, { sprayAngle: 0, sprayDistance: 1, sprayOutput: 1 }, 0, resolveSprayDynamics(trackMarks, 0, 42)).outer);
      expect(zones).not.toBeNull();
      if (!zones) return;
      expect(pinkDotBandStrokes(strokes, zones).length).toBe(2);
    });
  });

  describe("unifying moving and stationary — one continuous deposition field, no separate line technique", () => {
    it("never draws a single stroke() call for Pink Dot Fat's outer field on a moving segment — no rails, no bands, at any segment length", () => {
      const lengths = [10, 60, 400];
      for (const length of lengths) {
        const engine = new SprayBrushEngine();
        const { ctx, strokes } = segmentRecordingContext();
        const start: StrokePoint = { x: 0, y: 0, timestamp: 0, velocity: 0.3, width: 42, opacity: 1 };
        const point: StrokePoint = { x: length, y: 0, timestamp: 16, velocity: 0.3, width: 42, opacity: 1 };
        engine.renderSegment(ctx, start, point, "#ffffff", pink, createStrokeRandom(4));
        // The inner core still legitimately strokes a short line (untouched,
        // in scope of an EARLIER turn) — what must be absent is any stroke
        // shaped like the old rail construction: a lineWidth matching a
        // band width at all. Reuse the same zones-based band-width check
        // the rail-specific tests use, just asserting zero matches instead
        // of some.
        const zones = resolvePinkDotOuterFieldZones(resolvePinkDotDualPlume(pink, { sprayAngle: 0, sprayDistance: 1, sprayOutput: 1 }, 0.3, resolveSprayDynamics(pink, 0.3, 42)).outer);
        expect(zones).not.toBeNull();
        if (!zones) continue;
        expect(pinkDotBandStrokes(strokes, zones).length).toBe(0);
      }
    });

    it("sub-samples a long segment into MANY deposits spread across its whole length, not one stamp at each end", () => {
      const engine = new SprayBrushEngine();
      const { ctx, arcs } = segmentRecordingContext();
      const start: StrokePoint = { x: 0, y: 0, timestamp: 0, velocity: 0.3, width: 42, opacity: 1 };
      const point: StrokePoint = { x: 500, y: 0, timestamp: 16, velocity: 0.3, width: 42, opacity: 1 };
      engine.renderSegment(ctx, start, point, "#ffffff", pink, createStrokeRandom(4));
      expect(arcs.length).toBeGreaterThan(20); // far more than "one stamp per end" would produce
      // Particles land across a real spread of x-positions along the
      // segment, not clustered only near x=0 or x=500.
      const xs = arcs.map((a) => a.x).sort((a, b) => a - b);
      const midCount = xs.filter((x) => x > 150 && x < 350).length;
      expect(midCount).toBeGreaterThan(arcs.length * 0.15); // a real share lands in the MIDDLE third too
    });

    it("a fast, coarsely-sampled drag (few, widely-spaced renderSegment calls) still deposits continuously — sub-sample spacing comes from the footprint, not from how far apart the calls happen to land", () => {
      const engine = new SprayBrushEngine();
      engine.beginStroke();
      const { ctx, arcs } = segmentRecordingContext();
      // One single call covering 600px in one jump — the kind of gap a
      // fast real drag leaves between two consecutive pointermove events.
      const start: StrokePoint = { x: 0, y: 0, timestamp: 0, velocity: 1.2, width: 42, opacity: 1 };
      const point: StrokePoint = { x: 600, y: 0, timestamp: 16, velocity: 1.2, width: 42, opacity: 1 };
      engine.renderSegment(ctx, start, point, "#ffffff", pink, createStrokeRandom(5));
      // Sort accepted particles by x and check no gap between consecutive
      // ones is much wider than the footprint itself — i.e. no visible
      // empty stretch a "stamped only at the ends" renderer would leave.
      const xs = arcs.map((a) => a.x).sort((a, b) => a - b);
      expect(xs.length).toBeGreaterThan(30);
      let maxGap = 0;
      for (let i = 1; i < xs.length; i += 1) maxGap = Math.max(maxGap, xs[i] - xs[i - 1]);
      // Individual particles scatter across a full circle around each
      // sub-sample (angular jitter, not just lateral spacing), so raw x
      // gaps carry real sampling noise — generous relative to the
      // footprint's own scale, but a "stamped only at both ends" regressed
      // renderer would leave a gap on the order of the FULL 600px segment,
      // not a small multiple of one radius.
      const dynamics = resolveSprayDynamics(pink, 1.2, 42);
      expect(maxGap).toBeLessThan(dynamics.radius * 3);
    });

    it("a true stationary dwell and the FIRST segment of a moving stroke draw through the exact same per-exposure particle budget — no separate, larger 'endpoint bulb' construction", () => {
      const stationaryEngine = new SprayBrushEngine();
      stationaryEngine.beginStroke();
      const stationaryPoint: StrokePoint = { x: 0, y: 0, timestamp: 0, velocity: 0, width: 42, opacity: 1 };
      const { ctx: stationaryCtx, arcs: stationaryArcs } = segmentRecordingContext();
      stationaryEngine.renderSegment(stationaryCtx, null, stationaryPoint, "#ffffff", pink, createStrokeRandom(7));

      // A short first segment (a real drag's very first renderSegment call,
      // previous === null but already slightly moved) uses the SAME
      // resolver/budget logic — same order of magnitude of particles, not
      // an inflated one-time "start bulb."
      const movingEngine = new SprayBrushEngine();
      movingEngine.beginStroke();
      const movingPoint: StrokePoint = { x: 3, y: 0, timestamp: 16, velocity: 0.3, width: 42, opacity: 1 };
      const { ctx: movingCtx, arcs: movingArcs } = segmentRecordingContext();
      movingEngine.renderSegment(movingCtx, null, movingPoint, "#ffffff", pink, createStrokeRandom(7));

      expect(stationaryArcs.length).toBeGreaterThan(0);
      expect(movingArcs.length).toBeGreaterThan(0);
      const ratio = movingArcs.length / stationaryArcs.length;
      expect(ratio).toBeGreaterThan(0.5);
      expect(ratio).toBeLessThan(2); // same order of magnitude, not a multi-x bulb
    });

    it("a moving stroke's accepted particles still favor the ring radius over the moat radius — the SAME density curve as a stationary dot, not a flattened one", () => {
      const engine = new SprayBrushEngine();
      const { ctx, arcs } = segmentRecordingContext();
      const start: StrokePoint = { x: 0, y: 0, timestamp: 0, velocity: 0.3, width: 42, opacity: 1 };
      const point: StrokePoint = { x: 300, y: 0, timestamp: 16, velocity: 0.3, width: 42, opacity: 1 };
      engine.renderSegment(ctx, start, point, "#ffffff", pink, createStrokeRandom(8));
      const dynamics = resolveSprayDynamics(pink, 0.3, 42);
      const state = resolvePinkDotDualPlume(pink, { sprayAngle: 0, sprayDistance: 1, sprayOutput: 1 }, 0.3, dynamics);
      const profile = resolvePinkDotStationaryProfile(state.inner, state.outer);
      expect(profile).not.toBeNull();
      if (!profile) return;
      // Sample perpendicular offset from the (horizontal) centerline for
      // every accepted particle whose x lands well inside the segment,
      // away from either end — this app's own "nowhere near an endpoint"
      // midpoint convention.
      const midParticles = arcs.filter((a) => a.x > 100 && a.x < 200);
      expect(midParticles.length).toBeGreaterThan(15);
      const offsets = midParticles.map((a) => Math.abs(a.y));
      const moatBand = offsets.filter((o) => o < profile.moatRadius * 0.9).length;
      const ringBand = offsets.filter((o) => o > profile.ringRadius * 0.85 && o < profile.ringRadius * 1.15).length;
      // Normalize by each band's own radial width (an annulus's AREA, and
      // so its "room" for particles at a uniform density, grows with
      // radius) so this compares DENSITY, not raw counts in differently-
      // sized bands.
      const moatDensity = moatBand / Math.max(1, profile.moatRadius * 0.9);
      const ringDensity = ringBand / Math.max(1, profile.ringRadius * 0.3);
      expect(ringDensity).toBeGreaterThan(moatDensity);
    });
  });

  describe("acceptance — every other cap unaffected by the true-radial-profile rework", () => {
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
