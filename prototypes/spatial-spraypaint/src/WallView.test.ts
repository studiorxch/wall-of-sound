import { describe, expect, it } from "vitest";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  applyPan,
  applyZoomAroundPoint,
  resetWallView,
  screenToWall,
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
