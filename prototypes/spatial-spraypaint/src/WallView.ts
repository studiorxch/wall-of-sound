export interface WallPoint {
  x: number;
  y: number;
}

export interface WallViewState {
  panX: number;
  panY: number;
  zoom: number;
}

export interface QuickZoomState {
  view: WallViewState;
  restoreView: WallViewState | null;
}

export type PanSource = "space" | "middle" | null;

export interface PanInteractionState {
  spaceHeld: boolean;
  source: PanSource;
}

export interface WheelPanInput {
  deltaX: number;
  deltaY: number;
  shiftKey: boolean;
  deltaMode?: number;
}

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;
export const QUICK_ZOOM_LEVEL = 2;

export function resetWallView(): WallViewState {
  return { panX: 0, panY: 0, zoom: 1 };
}

export function screenToWall(view: WallViewState, point: WallPoint): WallPoint {
  return {
    x: (point.x - view.panX) / view.zoom,
    y: (point.y - view.panY) / view.zoom,
  };
}

export function wallToScreen(view: WallViewState, point: WallPoint): WallPoint {
  return {
    x: point.x * view.zoom + view.panX,
    y: point.y * view.zoom + view.panY,
  };
}

export function applyPan(view: WallViewState, deltaX: number, deltaY: number): WallViewState {
  return { ...view, panX: view.panX + deltaX, panY: view.panY + deltaY };
}

export function shouldPanPointer(spaceHeld: boolean, button: number): boolean {
  return (spaceHeld && button === 0) || button === 1;
}

export function resetPanInteraction(): PanInteractionState {
  return { spaceHeld: false, source: null };
}

export function setSpacePanHeld(state: PanInteractionState, spaceHeld: boolean): PanInteractionState {
  return {
    spaceHeld,
    source: !spaceHeld && state.source === "space" ? null : state.source,
  };
}

export function beginPanInteraction(state: PanInteractionState, button: number): PanInteractionState {
  const source: PanSource = button === 1 ? "middle" : state.spaceHeld && button === 0 ? "space" : null;
  return { ...state, source };
}

export function endPanInteraction(state: PanInteractionState): PanInteractionState {
  return { ...state, source: null };
}

export function effectiveTool<T extends string>(activeTool: T, state: PanInteractionState): T | "pan" {
  return state.source ? "pan" : activeTool;
}

export function resolveWheelPan(
  input: WheelPanInput,
  pageSize = 800,
): WallPoint {
  const scale = input.deltaMode === 1 ? 16 : input.deltaMode === 2 ? pageSize : 1;
  if (input.shiftKey) {
    const horizontal = Math.abs(input.deltaX) >= Math.abs(input.deltaY) ? input.deltaX : input.deltaY;
    return { x: horizontal === 0 ? 0 : -horizontal * scale, y: 0 };
  }
  return {
    x: input.deltaX === 0 ? 0 : -input.deltaX * scale,
    y: input.deltaY === 0 ? 0 : -input.deltaY * scale,
  };
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function applyZoomAroundPoint(
  view: WallViewState,
  requestedZoom: number,
  screenAnchor: WallPoint,
): WallViewState {
  const zoom = clampZoom(requestedZoom);
  const wallAnchor = screenToWall(view, screenAnchor);
  return {
    zoom,
    panX: screenAnchor.x - wallAnchor.x * zoom,
    panY: screenAnchor.y - wallAnchor.y * zoom,
  };
}

export function toggleQuickZoom(
  state: QuickZoomState,
  screenAnchor: WallPoint,
  detailZoom = QUICK_ZOOM_LEVEL,
): QuickZoomState {
  if (state.restoreView) {
    return { view: { ...state.restoreView }, restoreView: null };
  }
  const restoreView = { ...state.view };
  const targetZoom = Math.max(detailZoom, state.view.zoom * 2);
  return {
    view: applyZoomAroundPoint(state.view, targetZoom, screenAnchor),
    restoreView,
  };
}
