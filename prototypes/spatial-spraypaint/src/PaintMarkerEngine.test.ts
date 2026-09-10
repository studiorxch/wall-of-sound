import { describe, expect, it } from "vitest";
import { PaintMarkerEngine, getMarkerVariant, resolveMarkerGeometry } from "./PaintMarkerEngine";
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
    expect(geometry).toMatchObject({ passCount: 1, particleCount: 0, opacity: 0.94 });
    expect(geometry.width).toBeGreaterThan(20);

    const recording = recordingContext();
    new PaintMarkerEngine().renderSegment(recording.ctx, point(0, 0), point(40, 0), "#ff0000", "round");
    expect(recording.calls.filter((call) => call === "stroke")).toHaveLength(1);
    expect(recording.calls).not.toContain("fill");
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
    expect(vertical.direction).not.toBe(horizontal.direction);
    expect(vertical.width).not.toBeCloseTo(horizontal.width, 3);
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
  });

  it("gives Mop a broad wet core, speed thinning, edge passes, and high drip authority", () => {
    const slow = resolveMarkerGeometry("mop", point(0, 0), point(1, 0, 0.1));
    const fast = resolveMarkerGeometry("mop", point(0, 0), point(50, 0, 4));
    expect(slow.width).toBeGreaterThan(fast.width);
    expect(slow.passCount).toBe(3);
    expect(getMarkerVariant("mop").dripTendency).toBeGreaterThan(0.9);
  });
});
