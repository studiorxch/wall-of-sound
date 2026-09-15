import { describe, expect, it } from "vitest";
import {
  SprayBrushEngine,
  createStrokeRandom,
  resolveOverspraySquashAngle,
  resolveShapedStampGeometry,
  shapedStampWidthAlongTravel,
  TRANSVERSAL_AXIS_ANGLE,
} from "./SprayBrushEngine";
import { getSprayCapPreset, resolveSprayDynamics } from "./SprayCapPresets";
import { type StrokePoint } from "./types";

interface RecordedGradient {
  x0: number; y0: number; r0: number; x1: number; y1: number; r1: number;
  stops: Array<{ offset: number; color: string }>;
}

function segmentRecordingContext(): {
  ctx: CanvasRenderingContext2D;
  strokeStyles: string[];
  fillStyles: string[];
  gradients: RecordedGradient[];
} {
  const strokeStyles: string[] = [];
  const fillStyles: string[] = [];
  const gradients: RecordedGradient[] = [];
  let strokeStyle = "";
  let fillStyle = "";
  let activeGradient: RecordedGradient | null = null;
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
    stroke: () => strokeStyles.push(strokeStyle),
    fill: () => fillStyles.push(fillStyle),
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
    lineWidth: 0,
  } as unknown as CanvasRenderingContext2D;
  return { ctx, strokeStyles, fillStyles, gradients };
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
    moveTo: () => undefined,
    lineTo: () => undefined,
    arc: () => undefined,
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
  it("draws a soft radial halo behind Pink Dot Fat's dot but not New York Fat's", () => {
    const drawDot = (capId: string) => {
      const cap = getSprayCapPreset(capId);
      const point: StrokePoint = { x: 40, y: 40, timestamp: 0, velocity: 0.05, width: 32, opacity: 1 };
      const { ctx, gradients } = segmentRecordingContext();
      new SprayBrushEngine().renderSegment(ctx, null, point, "#ffffff", cap, createStrokeRandom(3));
      return gradients;
    };
    expect(drawDot("pink-dot-fat").length).toBeGreaterThan(0);
    expect(drawDot("new-york-fat")).toHaveLength(0);
  });

  it("scales halo alpha deterministically with the cap's haloOpacity field", () => {
    const base = getSprayCapPreset("pink-dot-fat");
    const brighter = { ...base, haloOpacity: base.haloOpacity * 2 };
    const point: StrokePoint = { x: 40, y: 40, timestamp: 0, velocity: 0.05, width: 32, opacity: 1 };
    const dim = segmentRecordingContext();
    new SprayBrushEngine().renderSegment(dim.ctx, null, point, "#ffffff", base, createStrokeRandom(3));
    const bright = segmentRecordingContext();
    new SprayBrushEngine().renderSegment(bright.ctx, null, point, "#ffffff", brighter, createStrokeRandom(3));
    expect(alphaOf(bright.gradients[0].stops[0].color)).toBeGreaterThan(alphaOf(dim.gradients[0].stops[0].color));
  });

  it("strengthens Pink Dot's halo through repeated dwell via ordinary compositing, no new dwell/time tracking", () => {
    const cap = getSprayCapPreset("pink-dot-fat");
    const point: StrokePoint = { x: 40, y: 40, timestamp: 0, velocity: 0.05, width: 32, opacity: 1 };
    const { ctx, gradients } = segmentRecordingContext();
    const engine = new SprayBrushEngine();
    const random = createStrokeRandom(3);
    engine.renderSegment(ctx, null, point, "#ffffff", cap, random);
    engine.renderSegment(ctx, point, point, "#ffffff", cap, random);
    engine.renderSegment(ctx, point, point, "#ffffff", cap, random);
    expect(gradients.length).toBeGreaterThanOrEqual(3);
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
