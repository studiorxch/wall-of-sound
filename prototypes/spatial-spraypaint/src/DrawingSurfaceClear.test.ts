import { describe, expect, it } from "vitest";
import { DrawingToolRenderer } from "./DrawingToolRenderer";
import { clearDrawingSurfaceState, type DrawingSurfaceLayer } from "./DrawingSurfaceClear";
import { type DripSeed } from "./DripLogic";

function recordingLayer(): DrawingSurfaceLayer & {
  fillCount: () => number;
  isDirty: () => boolean;
} {
  let fills = 0;
  let dirty = false;
  const context = {
    save: () => undefined,
    restore: () => undefined,
    setTransform: () => undefined,
    clearRect: () => { dirty = false; },
    beginPath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    closePath: () => undefined,
    arc: () => undefined,
    fill: () => { fills += 1; dirty = true; },
    createLinearGradient: () => ({ addColorStop: () => undefined }),
    fillStyle: "",
  } as unknown as CanvasRenderingContext2D;
  return {
    canvas: { width: 800, height: 600 },
    context,
    fillCount: () => fills,
    isDirty: () => dirty,
  };
}

const drip = (): DripSeed => ({
  x: 100,
  y: 120,
  width: 12,
  length: 180,
  opacity: 0.84,
  durationMs: 1000,
  tipWidthRatio: 0.62,
  terminalBulbRatio: 0.58,
  renderAsOverlay: true,
  attachmentUnderlap: 14,
});

describe("drawing surface Clear authority", () => {
  it("clears body, active overlay, completed underlay, and retained drip state", () => {
    const body = recordingLayer();
    const underlay = recordingLayer();
    const overlay = recordingLayer();
    const renderer = new DrawingToolRenderer();

    body.context.fill();
    renderer.startDrip(drip(), "#e92f3d", 0);
    renderer.advanceDrips(body.context, 250, overlay.context, underlay.context);
    expect(body.isDirty()).toBe(true);
    expect(overlay.isDirty()).toBe(true);

    clearDrawingSurfaceState([body, underlay, overlay], renderer);
    const fillsAfterClear = {
      body: body.fillCount(),
      underlay: underlay.fillCount(),
      overlay: overlay.fillCount(),
    };
    expect(body.isDirty()).toBe(false);
    expect(underlay.isDirty()).toBe(false);
    expect(overlay.isDirty()).toBe(false);

    renderer.advanceDrips(body.context, 1200, overlay.context, underlay.context);
    expect(body.fillCount()).toBe(fillsAfterClear.body);
    expect(underlay.fillCount()).toBe(fillsAfterClear.underlay);
    expect(overlay.fillCount()).toBe(fillsAfterClear.overlay);
  });

  it("clears a completed/replayed underlay and permits normal drawing afterward", () => {
    const body = recordingLayer();
    const underlay = recordingLayer();
    const overlay = recordingLayer();
    const renderer = new DrawingToolRenderer();

    renderer.renderCompletedDrip(underlay.context, drip(), "#e92f3d");
    expect(underlay.isDirty()).toBe(true);
    clearDrawingSurfaceState([body, underlay, overlay], renderer);
    expect(underlay.isDirty()).toBe(false);

    const previousOverlayFills = overlay.fillCount();
    renderer.startDrip(drip(), "#e92f3d", 2000);
    renderer.advanceDrips(body.context, 2250, overlay.context, underlay.context);
    expect(overlay.fillCount()).toBeGreaterThan(previousOverlayFills);
    expect(overlay.isDirty()).toBe(true);
  });
});
