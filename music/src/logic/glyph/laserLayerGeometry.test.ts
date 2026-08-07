import { describe, it, expect } from "vitest";
import { buildOscillationLinePath, buildSegmentedBeamMarks } from "./laserLayerGeometry";
import type { LaserPlacedSegment } from "../../data/glyphLaserLayerTypes";

type PointOverride = { x: number; y: number; activity?: number; modulationAmount?: number; modulationRate?: number; intensity?: number };

function segment(points: PointOverride[]): LaserPlacedSegment {
  return {
    id: "seg-0", rowIndex: 0, sectionId: "s0",
    points: points.map((p, i) => ({
      timeSeconds: i * 0.1, x: p.x, y: p.y,
      activity: p.activity ?? 0.5, intensity: p.intensity ?? 0.5,
      modulationAmount: p.modulationAmount ?? 0.5, modulationRate: p.modulationRate ?? 0.5,
    })),
    bounds: { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 },
  };
}

describe("buildOscillationLinePath", () => {
  it("returns an empty array for an empty segment", () => {
    expect(buildOscillationLinePath(segment([]), { amplitude: 5, smoothing: 0.5 })).toEqual([]);
  });

  it("starts with exactly one M command", () => {
    const path = buildOscillationLinePath(segment([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }]), { amplitude: 5, smoothing: 0.5 });
    expect(path[0].type).toBe("M");
    expect(path.filter((c) => c.type === "M")).toHaveLength(1);
  });

  it("uses time -> path x-position unchanged (x is never altered by oscillation)", () => {
    const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }];
    const path = buildOscillationLinePath(segment(points), { amplitude: 5, smoothing: 0.5 });
    const xs = path.map((c) => (c.type === "M" || c.type === "L" ? c.x : null)).filter((x): x is number => x != null);
    expect(xs).toEqual([0, 10, 20]);
  });

  it("produces a larger oscillation amplitude for a higher modulationAmount", () => {
    const low = buildOscillationLinePath(segment([{ x: 0, y: 0, modulationAmount: 0.05 }, { x: 10, y: 0, modulationAmount: 0.05 }]), { amplitude: 10, smoothing: 0.5 });
    const high = buildOscillationLinePath(segment([{ x: 0, y: 0, modulationAmount: 0.95 }, { x: 10, y: 0, modulationAmount: 0.95 }]), { amplitude: 10, smoothing: 0.5 });
    const deviation = (cmds: typeof low) => Math.max(...cmds.map((c) => (c.type === "L" ? Math.abs(c.y) : 0)));
    expect(deviation(high)).toBeGreaterThan(deviation(low));
  });

  it("is deterministic for identical input", () => {
    const points = [{ x: 0, y: 0 }, { x: 10, y: 5 }, { x: 20, y: 0 }];
    expect(buildOscillationLinePath(segment(points), { amplitude: 5, smoothing: 0.5 })).toEqual(buildOscillationLinePath(segment(points), { amplitude: 5, smoothing: 0.5 }));
  });
});

describe("buildSegmentedBeamMarks", () => {
  it("produces one mark per point", () => {
    const marks = buildSegmentedBeamMarks(segment([{ x: 0, y: 0 }, { x: 10, y: 0 }]), { amplitude: 10 });
    expect(marks).toHaveLength(2);
  });

  it("sizes a mark by its point's activity", () => {
    const marks = buildSegmentedBeamMarks(segment([{ x: 0, y: 0, activity: 0.1 }, { x: 10, y: 0, activity: 0.9 }]), { amplitude: 10 });
    expect(marks[1].height).toBeGreaterThan(marks[0].height);
  });

  it("carries intensity through as opacity, never a color value", () => {
    const marks = buildSegmentedBeamMarks(segment([{ x: 0, y: 0, intensity: 0.42 }]), { amplitude: 10 });
    expect(marks[0].opacity).toBe(0.42);
    expect(marks[0]).not.toHaveProperty("color");
  });
});
