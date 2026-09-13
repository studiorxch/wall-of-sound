import { describe, expect, it } from "vitest";
import { AdaptiveCurveReconstructor, type CurveInputSample } from "./AdaptiveCurveReconstructor";
import { CanonicalStrokeManager } from "./CanonicalStroke";
import { PaintMarkerEngine } from "./PaintMarkerEngine";
import { StrokeSmoother } from "./StrokeSmoother";
import { WetPaintAccumulator } from "./WetPaintModel";
import { type DripSeed } from "./DripLogic";

type Point = { x: number; y: number };
type Shape = { kind: "circle"; center: Point; radius: number } | { kind: "polygon"; points: Point[] };

function recordingContext(): { ctx: CanvasRenderingContext2D; shapes: Shape[] } {
  const shapes: Shape[] = [];
  let polygon: Point[] = [];
  let circle: Shape | null = null;
  const ctx = {
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => { polygon = []; circle = null; },
    moveTo: (x: number, y: number) => { polygon = [{ x, y }]; },
    lineTo: (x: number, y: number) => { polygon.push({ x, y }); },
    closePath: () => undefined,
    fill: () => {
      if (circle) shapes.push(circle);
      else if (polygon.length >= 3) shapes.push({ kind: "polygon", points: [...polygon] });
    },
    arc: (x: number, y: number, radius: number) => {
      circle = { kind: "circle", center: { x, y }, radius };
    },
    fillStyle: "",
    strokeStyle: "",
    lineJoin: "round",
    lineCap: "round",
  } as unknown as CanvasRenderingContext2D;
  return { ctx, shapes };
}

function pointInShape(point: Point, shape: Shape): boolean {
  if (shape.kind === "circle") {
    return Math.hypot(point.x - shape.center.x, point.y - shape.center.y) <= shape.radius + 0.001;
  }
  let inside = false;
  for (let index = 0, prior = shape.points.length - 1; index < shape.points.length; prior = index++) {
    const current = shape.points[index];
    const previous = shape.points[prior];
    if (
      (current.y > point.y) !== (previous.y > point.y)
      && point.x < (previous.x - current.x) * (point.y - current.y) / (previous.y - current.y) + current.x
    ) inside = !inside;
  }
  return inside;
}

interface SpawnEvidence {
  drip: DripSeed;
  attachedAtFrame: boolean;
  rawIndex: number;
  reconstructedIndex: number;
  canonicalIndex: number;
  nextAvailable: boolean;
  renderedWidth: number;
}

function runIncrementalStroke(strokeId: number, rawPoints: readonly CurveInputSample[]): SpawnEvidence[] {
  const baseRadius = 50;
  const smoother = new StrokeSmoother();
  const reconstructor = new AdaptiveCurveReconstructor();
  const canonical = new CanonicalStrokeManager();
  const wet = new WetPaintAccumulator();
  const marker = new PaintMarkerEngine();
  const recording = recordingContext();
  const evidence: SpawnEvidence[] = [];
  wet.beginStroke(strokeId, "drip-mop", { flow: "high", viscosity: "runny" });
  marker.beginStroke("drip-mop");

  rawPoints.forEach((raw, rawIndex) => {
    const smoothed = smoother.smooth(raw, "medium");
    const reconstructed = reconstructor.push(
      { ...smoothed, timestamp: raw.timestamp },
      { baseRadius, cornerAngleDegrees: 125 },
    );
    const frameSpawns: Omit<SpawnEvidence, "attachedAtFrame">[] = [];
    reconstructed.forEach((sample, reconstructedIndex) => {
      const { point, interpolated, previous } = canonical.createPoint(
        sample.x,
        sample.y,
        baseRadius,
        0,
        sample.timestamp,
      );
      let segmentStart = previous;
      const segmentEnds = [...interpolated, point];
      segmentEnds.forEach((segmentEnd, canonicalIndex) => {
        const next = segmentEnds[canonicalIndex + 1] ?? null;
        const observation = wet.observe(segmentEnd, baseRadius, true, next);
        const rendered = { ...segmentEnd, paintLoad: observation.paintLoad };
        observation.drips.forEach((drip) => frameSpawns.push({
          drip,
          rawIndex,
          reconstructedIndex,
          canonicalIndex,
          nextAvailable: next !== null,
          renderedWidth: rendered.width,
        }));
        marker.renderSegment(recording.ctx, segmentStart, rendered, "#ff6688", "drip-mop");
        segmentStart = rendered;
      });
    });
    for (const spawn of frameSpawns) {
      evidence.push({
        ...spawn,
        attachedAtFrame: recording.shapes.some((shape) => pointInShape(spawn.drip, shape)),
      });
    }
  });
  return evidence;
}

function repeatedPath(
  resolvePoint: (index: number) => Point,
  count = 90,
  intervalMs = 16,
): CurveInputSample[] {
  return Array.from({ length: count }, (_, index) => ({
    ...resolvePoint(index),
    timestamp: index * intervalMs,
  }));
}

describe("Mop incremental runtime parity", () => {
  it.each([
    ["stationary dwell with physical jitter", repeatedPath((index) => ({
      x: 120 + (index % 3) * 1.4,
      y: 120 + (index % 5) * 3.2,
    }))],
    ["diagonal", repeatedPath((index) => ({ x: 70 + index * 12, y: 120 + index * 4 }), 90, 33)],
    ["horizontal control", repeatedPath((index) => ({ x: 70 + index * 1.5, y: 120 }))],
    ["vertical control", repeatedPath((index) => ({ x: 120, y: 70 + index * 1.5 }))],
  ] as const)("attaches every spawned drip to the body present that frame: %s", (label, rawPoints) => {
    const results = Array.from({ length: 20 }, (_, index) => runIncrementalStroke(index + 1, rawPoints)).flat();
    const failures = results.filter(({ attachedAtFrame }) => !attachedAtFrame);
    expect(results.length, `${label} did not emit a drip`).toBeGreaterThan(0);
    expect(failures, `${label} detached runtime spawns: ${JSON.stringify(failures)}`).toHaveLength(0);
  });

});
