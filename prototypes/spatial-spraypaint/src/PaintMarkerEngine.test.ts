import { describe, expect, it } from "vitest";
import {
  PaintMarkerEngine,
  buildSweptRibbonSegment,
  getMarkerVariant,
  resolveMarkerGeometry,
  smoothMarkerDirection,
} from "./PaintMarkerEngine";
import { type StrokePoint } from "./types";

const point = (x: number, y: number, velocity = 0.5): StrokePoint => ({
  x,
  y,
  timestamp: x + y,
  velocity,
  width: 30,
  opacity: 1,
});

function recordingContext(): { ctx: CanvasRenderingContext2D; calls: string[] } {
  const calls: string[] = [];
  const ctx = {
    save: () => calls.push("save"),
    restore: () => calls.push("restore"),
    beginPath: () => calls.push("beginPath"),
    moveTo: () => calls.push("moveTo"),
    lineTo: () => calls.push("lineTo"),
    closePath: () => calls.push("closePath"),
    stroke: () => calls.push("stroke"),
    fill: () => calls.push("fill"),
    arc: () => calls.push("arc"),
    ellipse: () => calls.push("ellipse"),
    lineJoin: "round",
    lineCap: "round",
    strokeStyle: "",
    fillStyle: "",
    lineWidth: 0,
  } as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

describe("Paint Marker renderer", () => {
  it("renders a dense continuous Round Marker core without aerosol particles", () => {
    const geometry = resolveMarkerGeometry("round", point(0, 0), point(40, 0));
    expect(geometry).toMatchObject({ passCount: 1, particleCount: 0, opacity: 1 });
    expect(geometry.width).toBeGreaterThan(20);

    const recording = recordingContext();
    const engine = new PaintMarkerEngine();
    engine.beginStroke("round");
    engine.renderSegment(recording.ctx, point(0, 0), point(40, 0), "#ff0000", "round");
    engine.renderSegment(recording.ctx, point(40, 0), point(80, 5), "#ff0000", "round");
    expect(recording.calls.filter((call) => call === "fill").length).toBeGreaterThanOrEqual(4);
    expect(recording.calls).toContain("closePath");
    expect(recording.calls).not.toContain("stroke");
  });

  it("produces an anisotropic Chisel footprint", () => {
    const narrow = resolveMarkerGeometry("chisel", point(0, 0), point(40, -19));
    const broad = resolveMarkerGeometry("chisel", point(0, 0), point(20, 43));
    expect(broad.width).toBeGreaterThan(narrow.width * 1.5);
    expect(broad.particleCount).toBe(0);
  });

  it("changes Chisel output orientation with stroke direction and preserves sharp turns", () => {
    const horizontal = resolveMarkerGeometry("chisel", point(0, 0), point(40, 0));
    const vertical = resolveMarkerGeometry("chisel", point(40, 0), point(40, 40));
    const diagonal = resolveMarkerGeometry("chisel", point(0, 0), point(40, 40));
    expect(vertical.direction).not.toBe(horizontal.direction);
    expect(vertical.width).not.toBeCloseTo(horizontal.width, 3);
    expect(diagonal.width).not.toBeCloseTo(horizontal.width, 3);
    expect(smoothMarkerDirection(0, Math.PI * 0.8, 0.4)).toBeCloseTo(Math.PI * 0.8);
    expect(smoothMarkerDirection(0, Math.PI * 0.35, 0.4)).toBeLessThan(Math.PI * 0.35);
  });

  it("builds joined ribbon endpoints without a segment gap", () => {
    const first = buildSweptRibbonSegment(point(0, 0), point(40, 0), 24, 28, 0);
    const second = buildSweptRibbonSegment(point(40, 0), point(80, 0), 28, 25, 0);
    expect(first.endLeft).toEqual(second.startLeft);
    expect(first.endRight).toEqual(second.startRight);
  });

  it("fills a non-degenerate continuity join even on a straight Chisel stroke", () => {
    const recording = recordingContext();
    const engine = new PaintMarkerEngine();
    engine.beginStroke("chisel");
    engine.renderSegment(recording.ctx, point(0, 0), point(40, 0), "#ff0000", "chisel");
    engine.renderSegment(recording.ctx, point(40, 0), point(80, 0), "#ff0000", "chisel");
    expect(recording.calls.filter((call) => call === "closePath")).toHaveLength(3);
    expect(recording.calls.filter((call) => call === "fill")).toHaveLength(3);
  });

  it("renders a deterministic stable geometry plan", () => {
    const previous = point(10, 12);
    const current = point(44, 51, 1.2);
    expect(resolveMarkerGeometry("round", previous, current)).toEqual(
      resolveMarkerGeometry("round", previous, current),
    );
    expect(resolveMarkerGeometry("chisel", previous, current)).toEqual(
      resolveMarkerGeometry("chisel", previous, current),
    );
    expect(buildSweptRibbonSegment(previous, current, 20, 28, 0.4)).toEqual(
      buildSweptRibbonSegment(previous, current, 20, 28, 0.4),
    );
  });

  it("keeps Round variation subtle and velocity response bounded", () => {
    const widths = [10, 30, 50, 70].map((x) => resolveMarkerGeometry("round", point(x - 10, 0), point(x, 0, 0.3)).width);
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(2);
    expect(resolveMarkerGeometry("round", point(0, 0), point(30, 0, 4)).width).toBeGreaterThan(25);
  });

  it("separates Mop and Drip Mop load, width, edge passes, and drip authority", () => {
    const slow = resolveMarkerGeometry("mop", point(0, 0), point(1, 0, 0.1));
    const fast = resolveMarkerGeometry("mop", point(0, 0), point(50, 0, 4));
    const dripMop = resolveMarkerGeometry("drip-mop", point(0, 0), { ...point(1, 0, 0.1), paintLoad: 0.9 });
    expect(slow.width).toBeGreaterThan(fast.width);
    expect(slow.passCount).toBe(3);
    expect(dripMop.width).toBeGreaterThan(slow.width);
    expect(dripMop.passCount).toBe(4);
    expect(getMarkerVariant("mop").dripTendency).toBeLessThan(getMarkerVariant("drip-mop").dripTendency);
    expect(getMarkerVariant("mop").material).toBe("wet");
    expect(getMarkerVariant("drip-mop").material).toBe("high-flow");
  });

  it("combines a continuous wet body with visible edge streak passes", () => {
    const recording = recordingContext();
    const engine = new PaintMarkerEngine();
    engine.beginStroke("drip-mop");
    engine.renderSegment(
      recording.ctx,
      { ...point(0, 0), paintLoad: 0.9 },
      { ...point(50, 4), paintLoad: 0.9 },
      "#ff0000",
      "drip-mop",
    );
    expect(recording.calls).toContain("fill");
    expect(recording.calls.filter((call) => call === "stroke")).toHaveLength(3);
    expect(recording.calls).not.toContain("arc");
  });
});
