import { describe, expect, it } from "vitest";
import {
  SprayBrushEngine,
  createStrokeRandom,
  resolveHaloDistanceGain,
  resolveHaloFlareRatio,
  resolveHaloGradientStops,
  resolveOverspraySquashAngle,
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

function segmentRecordingContext(): {
  ctx: CanvasRenderingContext2D;
  strokeStyles: string[];
  fillStyles: string[];
  gradients: RecordedGradient[];
  rotateCalls: number[];
  scaleCalls: Array<{ x: number; y: number }>;
} {
  const strokeStyles: string[] = [];
  const fillStyles: string[] = [];
  const gradients: RecordedGradient[] = [];
  const rotateCalls: number[] = [];
  const scaleCalls: Array<{ x: number; y: number }> = [];
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
    rotate: (angle: number) => rotateCalls.push(angle),
    scale: (x: number, y: number) => scaleCalls.push({ x, y }),
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
  return { ctx, strokeStyles, fillStyles, gradients, rotateCalls, scaleCalls };
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

describe("Pink Dot Fat correction — distance-sensitive, oblique-flared, dab-spaced, center+ring halo", () => {
  const pink = getSprayCapPreset("pink-dot-fat");

  describe("resolveHaloDistanceGain — near-wall clean dot vs. pulled-back bloom", () => {
    it("is exactly 1 (no change) for a cap with haloDistanceGain 0, regardless of size", () => {
      const flat = { ...pink, haloDistanceGain: 0 };
      expect(resolveHaloDistanceGain(flat, 10)).toBe(1);
      expect(resolveHaloDistanceGain(flat, 200)).toBe(1);
    });

    it("suppresses the halo below 1 when the resolved size is well below the cap's own baseRadius", () => {
      const gain = resolveHaloDistanceGain(pink, pink.baseRadius * 0.3);
      expect(gain).toBeLessThan(1);
      expect(gain).toBeGreaterThan(0);
    });

    it("amplifies the halo above 1 when the resolved size is well above the cap's own baseRadius", () => {
      const gain = resolveHaloDistanceGain(pink, pink.baseRadius * 1.7);
      expect(gain).toBeGreaterThan(1);
    });

    it("resolves to exactly 1 at the cap's own native baseRadius", () => {
      expect(resolveHaloDistanceGain(pink, pink.baseRadius)).toBe(1);
    });

    it("is monotonic — bigger resolved size always yields bigger (or equal) gain", () => {
      const small = resolveHaloDistanceGain(pink, pink.baseRadius * 0.4);
      const medium = resolveHaloDistanceGain(pink, pink.baseRadius * 1);
      const large = resolveHaloDistanceGain(pink, pink.baseRadius * 1.6);
      expect(medium).toBeGreaterThan(small);
      expect(large).toBeGreaterThan(medium);
    });
  });

  describe("resolveHaloFlareRatio — oblique elliptical flare on movement, circular at rest", () => {
    it("is exactly 1 (a perfect circle) for a cap with haloFlareAnisotropy 0, regardless of velocity", () => {
      const flat = { ...pink, haloFlareAnisotropy: 0 };
      expect(resolveHaloFlareRatio(flat, 0)).toBe(1);
      expect(resolveHaloFlareRatio(flat, 5)).toBe(1);
    });

    it("stays exactly 1 for stationary/near-stationary dwell velocities", () => {
      expect(resolveHaloFlareRatio(pink, 0)).toBe(1);
      expect(resolveHaloFlareRatio(pink, 0.03)).toBe(1);
      expect(resolveHaloFlareRatio(pink, 0.05)).toBe(1);
    });

    it("drops below 1 for genuinely fast/oblique travel", () => {
      const ratio = resolveHaloFlareRatio(pink, 1);
      expect(ratio).toBeLessThan(1);
      expect(ratio).toBeGreaterThan(0);
    });

    it("never goes below (1 - haloFlareAnisotropy), even at extreme velocity", () => {
      const ratio = resolveHaloFlareRatio(pink, 50);
      expect(ratio).toBeCloseTo(1 - pink.haloFlareAnisotropy, 5);
    });
  });

  describe("resolveHaloGradientStops — moat-then-peak center+ring profile", () => {
    it("returns the exact original two-stop linear fade when haloRingBias is 0", () => {
      const flat = { ...pink, haloRingBias: 0 };
      expect(resolveHaloGradientStops(flat, 0.4)).toEqual([{ offset: 0, alpha: 0.4 }, { offset: 1, alpha: 0 }]);
    });

    it("returns a four-stop moat-then-peak profile when haloRingBias is set", () => {
      const stops = resolveHaloGradientStops(pink, 0.4);
      expect(stops).toHaveLength(4);
      expect(stops[0].offset).toBe(0);
      expect(stops[stops.length - 1]).toEqual({ offset: 1, alpha: 0 });
      // A genuine moat: the middle stop dips below both its neighbors.
      const moat = stops[1];
      expect(moat.alpha).toBeLessThan(stops[0].alpha);
      expect(moat.alpha).toBeLessThan(stops[2].alpha);
      // A genuine peak: the outer band stop is brighter than the fading-in center.
      expect(stops[2].alpha).toBeGreaterThan(stops[0].alpha);
    });

    it("keeps every stop's alpha strictly proportional to the input alpha, so haloOpacity scaling stays deterministic", () => {
      const half = resolveHaloGradientStops(pink, 0.2);
      const full = resolveHaloGradientStops(pink, 0.4);
      for (let i = 0; i < half.length; i += 1) {
        expect(full[i].alpha).toBeCloseTo(half[i].alpha * 2, 6);
      }
    });

    it("never mutates the core disc — this reshapes the halo gradient only, the core stays fully opaque underneath, distinct from Ring/Donut's genuinely hollow center", () => {
      const stops = resolveHaloGradientStops(pink, 0.4);
      // Every stop offset stays inside (0,1) except the fixed 0/1 endpoints — no moat reaches all the way to 0 alpha at the center, unlike Ring/Donut's real hollow.
      expect(stops[0].alpha).toBeGreaterThan(0);
    });
  });

  describe("rendered halo — dab spacing, ellipse transform, and non-Pink-Dot regression", () => {
    it("gates halo draws by travel distance on a moving stroke, producing fewer dabs than segments", () => {
      const engine = new SprayBrushEngine();
      const { ctx, gradients } = segmentRecordingContext();
      const random = createStrokeRandom(9);
      engine.beginStroke();
      let previous: StrokePoint | null = null;
      const segments = 20;
      for (let i = 0; i <= segments; i += 1) {
        // Small steps relative to Pink Dot's ~42-unit baseRadius/halo size, so several segments fall within one dab-spacing window.
        const point: StrokePoint = { x: i * 4, y: 0, timestamp: i * 16, velocity: 0.3, width: 42, opacity: 1 };
        engine.renderSegment(ctx, previous, point, "#ffffff", pink, random);
        previous = point;
      }
      // One gradient per halo draw call (single-point-per-call after the first), each call draws at most one NEW endpoint once a stroke is underway.
      expect(gradients.length).toBeLessThan(segments);
      expect(gradients.length).toBeGreaterThan(0);
    });

    it("never gates a true dwell (zero travel distance) — every repeated call at the same point still draws", () => {
      const engine = new SprayBrushEngine();
      const { ctx, gradients } = segmentRecordingContext();
      const random = createStrokeRandom(9);
      const point: StrokePoint = { x: 40, y: 40, timestamp: 0, velocity: 0.03, width: 42, opacity: 1 };
      engine.beginStroke();
      engine.renderSegment(ctx, null, point, "#ffffff", pink, random);
      for (let i = 0; i < 5; i += 1) engine.renderSegment(ctx, point, point, "#ffffff", pink, random);
      expect(gradients.length).toBe(6);
    });

    it("resets dab spacing at the start of each new stroke", () => {
      const engine = new SprayBrushEngine();
      const random = createStrokeRandom(9);
      const runStroke = () => {
        const { ctx, gradients } = segmentRecordingContext();
        engine.beginStroke();
        let previous: StrokePoint | null = null;
        for (let i = 0; i <= 3; i += 1) {
          const point: StrokePoint = { x: i * 3, y: 0, timestamp: i * 16, velocity: 0.3, width: 42, opacity: 1 };
          engine.renderSegment(ctx, previous, point, "#ffffff", pink, random);
          previous = point;
        }
        return gradients.length;
      };
      const first = runStroke();
      const second = runStroke();
      // Same short deterministic path each time -> same dab count each time, proving state didn't leak/accumulate across the beginStroke() boundary.
      expect(second).toBe(first);
    });

    it("elongates the halo into an ellipse (rotate + scale) on a fast-moving segment, but never on a stationary dwell", () => {
      const dwell = segmentRecordingContext();
      const dwellPoint: StrokePoint = { x: 40, y: 40, timestamp: 0, velocity: 0.05, width: 42, opacity: 1 };
      new SprayBrushEngine().renderSegment(dwell.ctx, null, dwellPoint, "#ffffff", pink, createStrokeRandom(4));
      expect(dwell.rotateCalls).toHaveLength(0);
      expect(dwell.scaleCalls).toHaveLength(0);

      const moving = segmentRecordingContext();
      const start: StrokePoint = { x: 0, y: 0, timestamp: 0, velocity: 1.2, width: 42, opacity: 1 };
      // Distance must clear the dab-spacing threshold (haloRadius * haloDabSpacing) or the draw is gated entirely.
      const end: StrokePoint = { x: 200, y: 0, timestamp: 16, velocity: 1.2, width: 42, opacity: 1 };
      new SprayBrushEngine().renderSegment(moving.ctx, start, end, "#ffffff", pink, createStrokeRandom(4));
      expect(moving.rotateCalls.length).toBeGreaterThan(0);
      expect(moving.scaleCalls.length).toBeGreaterThan(0);
      // Elongated along a purely horizontal travel (dx>0, dy=0) -> travel angle 0.
      expect(moving.rotateCalls[0]).toBeCloseTo(0, 5);
      expect(moving.scaleCalls[0].y).toBeLessThan(1);
      expect(moving.scaleCalls[0].x).toBe(1);
    });

    it("gives every OTHER cap all four halo-correction fields at 0 — the same neutral default as every cap before this build", () => {
      for (const id of [
        "new-york-fat", "astro-fat", "german-fat", "lego-thin", "universal-thin", "level-1",
        "new-york-thin", "calligraphy", "transversal-slot", "needle", "wiggly-needle",
        "soft-fade", "fuzz-fat", "ring-donut", "dry-streak",
      ]) {
        const cap = getSprayCapPreset(id);
        expect(cap.haloDistanceGain).toBe(0);
        expect(cap.haloFlareAnisotropy).toBe(0);
        expect(cap.haloDabSpacing).toBe(0);
        expect(cap.haloRingBias).toBe(0);
      }
    });

    it("leaves every cap WITHOUT a halo field producing zero halo gradients — renderHalo still no-ops immediately (Ring/Donut is excluded here: its own core IS a gradient, an unrelated pre-existing mechanism, not a halo)", () => {
      for (const id of [
        "new-york-fat", "astro-fat", "german-fat", "lego-thin", "universal-thin", "level-1",
        "new-york-thin", "calligraphy", "transversal-slot", "needle", "wiggly-needle",
        "soft-fade", "fuzz-fat", "dry-streak",
      ]) {
        const cap = getSprayCapPreset(id);
        const point: StrokePoint = { x: 40, y: 40, timestamp: 0, velocity: 1.2, width: cap.baseRadius, opacity: 1 };
        const rec = segmentRecordingContext();
        new SprayBrushEngine().renderSegment(rec.ctx, null, point, "#ffffff", cap, createStrokeRandom(6));
        expect(rec.gradients).toHaveLength(0);
      }
    });

    it("leaves Pink Dot's CORE and overspray rendering completely unaffected by the halo correction fields — same corePasses draw sequence and same overspray particles regardless of dab spacing/flare/distance gain/ring bias", () => {
      const point: StrokePoint = { x: 40, y: 40, timestamp: 0, velocity: 1.2, width: 42, opacity: 1 };
      const withCorrection = segmentRecordingContext();
      new SprayBrushEngine().renderSegment(withCorrection.ctx, null, point, "#ffffff", pink, createStrokeRandom(11));
      const legacy = { ...pink, haloDistanceGain: 0, haloFlareAnisotropy: 0, haloDabSpacing: 0, haloRingBias: 0 };
      const withoutCorrection = segmentRecordingContext();
      new SprayBrushEngine().renderSegment(withoutCorrection.ctx, null, point, "#ffffff", legacy, createStrokeRandom(11));
      // The core (line stroke passes) never touches the halo at all.
      expect(withCorrection.strokeStyles).toEqual(withoutCorrection.strokeStyles);
      // fillStyles[0] is the halo's OWN fill (legitimately different — that's
      // the correction working); fillStyles[1:] is the overspray particles,
      // which must still match exactly since none of these fields touch overspray.
      expect(withCorrection.fillStyles.slice(1)).toEqual(withoutCorrection.fillStyles.slice(1));
      expect(withCorrection.fillStyles[0]).not.toEqual(withoutCorrection.fillStyles[0]);
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

  it("differs structurally from Pink Dot Fat: a real annular gradient (with a moat), not Pink Dot's single center-to-edge halo fade", () => {
    const ring = getSprayCapPreset("ring-donut");
    const pinkDot = getSprayCapPreset("pink-dot-fat");
    expect(ring.ringRadius).toBeGreaterThan(0);
    expect(pinkDot.ringRadius).toBe(0);
    expect(ring.haloRadius).toBe(0); // does not also stack Pink Dot's halo mechanism
    expect(pinkDot.haloRadius).toBeGreaterThan(0);
    expect(ring.depositionShape).toBe("ring");
    expect(pinkDot.depositionShape).toBe("line");
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
