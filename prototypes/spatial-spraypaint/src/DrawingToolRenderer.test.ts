import { describe, expect, it } from "vitest";
import { DrawingToolRenderer, type ToolStrokeStyle } from "./DrawingToolRenderer";
import { createStrokeRandom } from "./SprayBrushEngine";
import { type StrokePoint } from "./types";

const point = (x: number): StrokePoint => ({
  x,
  y: 20,
  timestamp: x,
  velocity: 0.7,
  width: 24,
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

describe("shared Drawing Tool renderer", () => {
  it("dispatches Spray through the calibrated aerosol renderer", () => {
    const style: ToolStrokeStyle = {
      toolId: "spray-can",
      variantId: "new-york-fat",
      color: "#e92f3d",
      size: 24,
    };
    const recording = recordingContext();
    new DrawingToolRenderer().renderSegment(
      recording.ctx,
      point(0),
      point(30),
      style,
      createStrokeRandom(7),
    );
    expect(recording.calls).toContain("arc");
    expect(recording.calls).toContain("stroke");
  });

  it("dispatches Paint Marker without aerosol particles", () => {
    const style: ToolStrokeStyle = {
      toolId: "paint-marker",
      variantId: "chisel",
      color: "#e92f3d",
      size: 24,
    };
    const recording = recordingContext();
    const renderer = new DrawingToolRenderer();
    renderer.beginStroke(style);
    renderer.renderSegment(recording.ctx, point(0), point(30), style);
    expect(recording.calls).toContain("fill");
    expect(recording.calls).toContain("closePath");
    expect(recording.calls).not.toContain("arc");
  });
});
