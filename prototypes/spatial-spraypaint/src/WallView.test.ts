import { describe, expect, it } from "vitest";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  WALL_ZOOM_PRESETS,
  applyPan,
  applyZoomAroundPoint,
  beginPanInteraction,
  cancelPanInteraction,
  effectiveTool,
  endPanInteraction,
  formatZoomPercentage,
  isWheelZoomGesture,
  resetWallView,
  resetPanInteraction,
  resolveWheelPan,
  resolveWheelZoom,
  screenToWall,
  setSpacePanHeld,
  shouldPanPointer,
  toggleQuickZoom,
  wallToScreen,
} from "./WallView";

describe("wall view transforms", () => {
  it("converts between screen and wall coordinates", () => {
    const view = { panX: 80, panY: -40, zoom: 2 };
    expect(screenToWall(view, { x: 280, y: 160 })).toEqual({ x: 100, y: 100 });
    expect(wallToScreen(view, { x: 100, y: 100 })).toEqual({ x: 280, y: 160 });
  });

  it("round-trips arbitrary coordinates through an inverse transform", () => {
    const view = { panX: -237.5, panY: 91.25, zoom: 0.65 };
    const wall = { x: 1200.75, y: -440.5 };
    const roundTrip = screenToWall(view, wallToScreen(view, wall));
    expect(roundTrip.x).toBeCloseTo(wall.x, 8);
    expect(roundTrip.y).toBeCloseTo(wall.y, 8);
  });

  it("applies screen-space pan without altering zoom", () => {
    expect(applyPan({ panX: 10, panY: 20, zoom: 1.5 }, -30, 45)).toEqual({
      panX: -20,
      panY: 65,
      zoom: 1.5,
    });
  });

  it("routes Space-drag and middle-drag to navigation instead of paint", () => {
    expect(shouldPanPointer(true, 0)).toBe(true);
    expect(shouldPanPointer(false, 1)).toBe(true);
    expect(shouldPanPointer(false, 0)).toBe(false);
  });

  it("treats Space-pan as a temporary override and restores the active tool on release", () => {
    const ready = setSpacePanHeld(resetPanInteraction(), true);
    const panning = beginPanInteraction(ready, 0);
    expect(effectiveTool("spray", panning)).toBe("pan");

    const released = setSpacePanHeld(panning, false);
    expect(released).toEqual({ spaceHeld: false, source: null });
    expect(effectiveTool("spray", released)).toBe("spray");
    expect(effectiveTool("future-tool", released)).toBe("future-tool");
  });

  it("ends middle-button pan without changing the active drawing tool", () => {
    const panning = beginPanInteraction(resetPanInteraction(), 1);
    expect(effectiveTool("spray", panning)).toBe("pan");
    expect(effectiveTool("spray", endPanInteraction(panning))).toBe("spray");
  });

  it.each([
    "pointercancel",
    "lostpointercapture",
    "window-blur",
    "visibilitychange",
    "escape",
    "mode-switch",
    "hand-resume",
    "wheel",
  ] as const)("clears temporary Pan on %s", (reason) => {
    const panning = beginPanInteraction(setSpacePanHeld(resetPanInteraction(), true), 0);
    const recovered = cancelPanInteraction(panning, reason);
    expect(recovered).toEqual(resetPanInteraction());
    expect(effectiveTool("spray", recovered)).toBe("spray");
  });

  it("restores drawing through repeated spray and Space-pan cycles", () => {
    let interaction = resetPanInteraction();
    for (let cycle = 0; cycle < 12; cycle += 1) {
      interaction = beginPanInteraction(setSpacePanHeld(interaction, true), 0);
      expect(effectiveTool("spray", interaction)).toBe("pan");
      interaction = cancelPanInteraction(interaction, "space-keyup");
      expect(effectiveTool("spray", interaction)).toBe("spray");
    }
  });

  it("maps vertical, horizontal, and Shift-wheel input to screen-space pan", () => {
    expect(resolveWheelPan({ deltaX: 0, deltaY: 24, shiftKey: false })).toEqual({ x: 0, y: -24 });
    expect(resolveWheelPan({ deltaX: -18, deltaY: 6, shiftKey: false })).toEqual({ x: 18, y: -6 });
    expect(resolveWheelPan({ deltaX: 0, deltaY: 20, shiftKey: true })).toEqual({ x: -20, y: 0 });
    expect(resolveWheelPan({ deltaX: 2, deltaY: 20, shiftKey: true })).toEqual({ x: -20, y: 0 });
    expect(resolveWheelPan({ deltaX: 20, deltaY: 2, shiftKey: true })).toEqual({ x: -20, y: 0 });
  });

  it("recognizes trackpad pinch and modified wheel zoom without consuming ordinary pan", () => {
    expect(isWheelZoomGesture({ ctrlKey: true, metaKey: false })).toBe(true);
    expect(isWheelZoomGesture({ ctrlKey: false, metaKey: true })).toBe(true);
    expect(isWheelZoomGesture({ ctrlKey: false, metaKey: false })).toBe(false);
  });

  it("keeps the pointer focal point anchored during wheel zoom", () => {
    const before = { panX: -80, panY: 35, zoom: 0.75 };
    const anchor = { x: 318, y: 244 };
    const wallAnchor = screenToWall(before, anchor);
    const after = resolveWheelZoom(
      before,
      { deltaY: -80, ctrlKey: true, metaKey: false },
      anchor,
    );
    expect(after.zoom).toBeGreaterThan(before.zoom);
    expect(wallToScreen(after, wallAnchor).x).toBeCloseTo(anchor.x, 8);
    expect(wallToScreen(after, wallAnchor).y).toBeCloseTo(anchor.y, 8);
  });

  it("applies every Scale preset through the existing WallView zoom authority", () => {
    const anchor = { x: 400, y: 300 };
    for (const preset of WALL_ZOOM_PRESETS) {
      expect(applyZoomAroundPoint(resetWallView(), preset, anchor).zoom).toBe(preset);
    }
  });

  it("formats the Scale readout from actual WallView zoom", () => {
    expect(formatZoomPercentage({ zoom: 0.25 })).toBe("25%");
    expect(formatZoomPercentage({ zoom: 1 })).toBe("100%");
    expect(formatZoomPercentage({ zoom: 1.253 })).toBe("125%");
    expect(formatZoomPercentage({ zoom: 4 })).toBe("400%");
  });

  it("keeps the wall point beneath the zoom anchor visually stable", () => {
    const before = { panX: -100, panY: 45, zoom: 0.8 };
    const anchor = { x: 640, y: 360 };
    const wallAnchor = screenToWall(before, anchor);
    const after = applyZoomAroundPoint(before, 2.25, anchor);
    expect(wallToScreen(after, wallAnchor)).toEqual(anchor);
  });

  it("clamps zoom to safe bounds", () => {
    const view = resetWallView();
    expect(applyZoomAroundPoint(view, 0.01, { x: 0, y: 0 }).zoom).toBe(MIN_ZOOM);
    expect(applyZoomAroundPoint(view, 99, { x: 0, y: 0 }).zoom).toBe(MAX_ZOOM);
    expect(resolveWheelZoom(
      view,
      { deltaY: 10000, ctrlKey: true, metaKey: false },
      { x: 0, y: 0 },
    ).zoom).toBe(MIN_ZOOM);
    expect(resolveWheelZoom(
      view,
      { deltaY: -10000, ctrlKey: true, metaKey: false },
      { x: 0, y: 0 },
    ).zoom).toBe(MAX_ZOOM);
  });

  it("resets to the useful default view", () => {
    expect(resetWallView()).toEqual({ panX: 0, panY: 0, zoom: 1 });
  });

  it("quick-zooms to detail and restores the exact former composition", () => {
    const composition = { panX: -315.25, panY: 117.75, zoom: 0.7 };
    const detail = toggleQuickZoom({ view: composition, restoreView: null }, { x: 400, y: 300 });
    expect(detail.view.zoom).toBe(2);
    expect(detail.restoreView).toEqual(composition);
    expect(toggleQuickZoom(detail, { x: 999, y: 999 })).toEqual({
      view: composition,
      restoreView: null,
    });
  });

  it("projects a stored wall-space stroke consistently under different views", () => {
    const stroke = [{ x: -50, y: 25 }, { x: 100, y: 75 }];
    const firstView = resetWallView();
    const movedView = applyPan(applyZoomAroundPoint(firstView, 2, { x: 0, y: 0 }), 300, -40);
    expect(stroke.map((point) => wallToScreen(firstView, point))).toEqual(stroke);
    expect(stroke.map((point) => wallToScreen(movedView, point))).toEqual([
      { x: 200, y: 10 },
      { x: 500, y: 110 },
    ]);
  });
});
