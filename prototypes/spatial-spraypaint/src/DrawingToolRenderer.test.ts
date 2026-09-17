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

  it("threads Fill mode through beginStroke so one location's own build-up stays bounded, off by default", () => {
    const cumulativeAlpha = (alphas: readonly number[]) =>
      1 - alphas.reduce((remaining, a) => remaining * (1 - a), 1);
    const sweep = (fillMode?: boolean) => {
      const renderer = new DrawingToolRenderer();
      const style: ToolStrokeStyle = { toolId: "spray-can", variantId: "new-york-fat", color: "#ffffff", size: 32, fillMode };
      renderer.beginStroke(style);
      const { ctx, strokeStyles } = alphaRecordingContext();
      let previous: StrokePoint | null = null;
      // A tight, sub-cell-sized wobble — not a real cross-canvas sweep — so
      // every draw call lands in the same fill-mode saturation cell. Spatial
      // correctness ACROSS locations is covered separately in
      // SprayBrushEngine.test.ts's "spatial correctness" suite.
      for (let i = 0; i <= 20; i += 1) {
        const p = { ...point(i * 0.3), velocity: 0.3 };
        renderer.renderSegment(ctx, previous, p, style, createStrokeRandom(3));
        previous = p;
      }
      return cumulativeAlpha(strokeStyles.map((rgba) => Number.parseFloat(rgba.split(",")[3])));
    };

    expect(sweep(undefined)).toBeGreaterThan(0.9);
    expect(sweep(false)).toBeGreaterThan(0.9);
    expect(sweep(true)).toBeLessThan(0.75);
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

  it("V0.10.15: the centralized BrushProfile's opacityOverride reaches actual rendering for BOTH Spray and Paint Marker -- proof a shared-panel edit changes the real mark, not just a readout", () => {
    const spray = (opacityOverride?: number) => {
      const style: ToolStrokeStyle = { toolId: "spray-can", variantId: "new-york-fat", color: "#e92f3d", size: 24, opacityOverride };
      const recording = alphaRecordingContext();
      new DrawingToolRenderer().renderSegment(recording.ctx, point(0), point(30), style, createStrokeRandom(9));
      return recording.strokeStyles;
    };
    const full = spray(0.9);
    const dim = spray(0.15);
    expect(full.length).toBeGreaterThan(0);
    expect(dim.length).toBe(full.length);
    full.forEach((rgba, index) => {
      const fullAlpha = Number.parseFloat(rgba.split(",")[3]);
      const dimAlpha = Number.parseFloat(dim[index].split(",")[3]);
      expect(dimAlpha).toBeLessThan(fullAlpha);
    });

    const markerFillStyle = (opacityOverride?: number) => {
      const style: ToolStrokeStyle = { toolId: "paint-marker", variantId: "round", color: "#e92f3d", size: 24, opacityOverride };
      let fillStyle = "";
      const ctx = {
        save: () => undefined,
        restore: () => undefined,
        beginPath: () => undefined,
        moveTo: () => undefined,
        lineTo: () => undefined,
        closePath: () => undefined,
        arc: () => undefined,
        fill: () => undefined,
        get fillStyle() { return fillStyle; },
        set fillStyle(value: string | CanvasGradient | CanvasPattern) { fillStyle = String(value); },
        strokeStyle: "",
        lineJoin: "round",
        lineCap: "round",
        lineWidth: 0,
      } as unknown as CanvasRenderingContext2D;
      const renderer = new DrawingToolRenderer();
      renderer.beginStroke(style);
      renderer.renderSegment(ctx, null, point(0), style);
      return fillStyle;
    };
    expect(markerFillStyle(undefined)).toBe("#e92f3d");
    const dimMarker = markerFillStyle(0.2);
    expect(dimMarker).not.toBe("#e92f3d");
    expect(Number.parseFloat(dimMarker.split(",")[3])).toBeCloseTo(0.2, 2);
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
