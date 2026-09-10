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

export type PanCancellationReason =
  | "space-keyup"
  | "pointercancel"
  | "lostpointercapture"
  | "window-blur"
  | "visibilitychange"
  | "escape"
  | "mode-switch"
  | "hand-resume"
  | "wheel";

export interface WheelPanInput {
  deltaX: number;
  deltaY: number;
  shiftKey: boolean;
  deltaMode?: number;
}

export interface WheelZoomInput {
  deltaY: number;
  ctrlKey: boolean;
  metaKey: boolean;
  deltaMode?: number;
}

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 4;
export const QUICK_ZOOM_LEVEL = 2;
export const WALL_ZOOM_PRESETS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const;
const WHEEL_ZOOM_SENSITIVITY = 0.002;

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

export function cancelPanInteraction(
  _state: PanInteractionState,
  _reason: PanCancellationReason,
): PanInteractionState {
  return resetPanInteraction();
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

export function isWheelZoomGesture(
  input: Pick<WheelZoomInput, "ctrlKey" | "metaKey">,
): boolean {
  return input.ctrlKey || input.metaKey;
}

export function resolveWheelZoom(
  view: WallViewState,
  input: WheelZoomInput,
  screenAnchor: WallPoint,
  pageSize = 800,
): WallViewState {
  const scale = input.deltaMode === 1 ? 16 : input.deltaMode === 2 ? pageSize : 1;
  const factor = Math.exp(-input.deltaY * scale * WHEEL_ZOOM_SENSITIVITY);
  return applyZoomAroundPoint(view, view.zoom * factor, screenAnchor);
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

export function formatZoomPercentage(view: Pick<WallViewState, "zoom">): string {
  return `${Math.round(view.zoom * 100)}%`;
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
