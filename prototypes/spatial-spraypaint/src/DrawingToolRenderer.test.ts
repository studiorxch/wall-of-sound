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

function alphaRecordingContext(): { ctx: CanvasRenderingContext2D; strokeStyles: string[] } {
  const strokeStyles: string[] = [];
  let strokeStyle = "";
  const ctx = {
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    arc: () => undefined,
    fill: () => undefined,
    stroke: () => strokeStyles.push(strokeStyle),
    get strokeStyle() { return strokeStyle; },
    set strokeStyle(value: string | CanvasGradient | CanvasPattern) { strokeStyle = String(value); },
    fillStyle: "",
    lineJoin: "round",
    lineCap: "round",
    lineWidth: 0,
  } as unknown as CanvasRenderingContext2D;
  return { ctx, strokeStyles };
}

describe("shared Drawing Tool renderer", () => {
  it("threads Spray coverage into measurably lower deposition opacity without redesigning Paint Marker", () => {
    const fullStyle: ToolStrokeStyle = { toolId: "spray-can", variantId: "new-york-fat", color: "#e92f3d", size: 24, coverage: 1 };
    const lightStyle: ToolStrokeStyle = { toolId: "spray-can", variantId: "new-york-fat", color: "#e92f3d", size: 24, coverage: 0.4 };
    const full = alphaRecordingContext();
    new DrawingToolRenderer().renderSegment(full.ctx, point(0), point(30), fullStyle, createStrokeRandom(9));
    const light = alphaRecordingContext();
    new DrawingToolRenderer().renderSegment(light.ctx, point(0), point(30), lightStyle, createStrokeRandom(9));

    expect(full.strokeStyles.length).toBeGreaterThan(0);
    expect(light.strokeStyles.length).toBe(full.strokeStyles.length);
    full.strokeStyles.forEach((rgba, index) => {
      const fullAlpha = Number.parseFloat(rgba.split(",")[3]);
      const lightAlpha = Number.parseFloat(light.strokeStyles[index].split(",")[3]);
      expect(lightAlpha).toBeLessThan(fullAlpha);
    });
  });

  it("omits coverage for Paint Marker without affecting its render calls", () => {
    const style: ToolStrokeStyle = { toolId: "paint-marker", variantId: "chisel", color: "#e92f3d", size: 24 };
    const recording = recordingContext();
    const renderer = new DrawingToolRenderer();
    renderer.beginStroke(style);
    renderer.renderSegment(recording.ctx, point(0), point(30), style);
    expect(recording.calls).toContain("fill");
    expect(recording.calls).not.toContain("arc");
  });


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
