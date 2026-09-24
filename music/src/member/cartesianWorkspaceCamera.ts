/**
 * Blackbook Spatial Workspace V1 -- extracted, unchanged Cartesian camera
 * math proven by ARTWORK V2's Blank Canvas (`blankCanvasRuntime.ts`). This
 * module is intentionally the ONLY thing lifted out: it is pure view/camera
 * math (pan, zoom, screen<->document conversion, zoom-at-cursor, fit-to-rect)
 * with no DOM, no canvas element, no rendering, and no Mark/persistence
 * knowledge -- exactly the seam the ARTWORK/BLACKBOOK bounded-workspace
 * recon identified as reusable-but-not-yet-packaged.
 *
 * VIEW TRANSFORM vs ARTWORK TRANSFORM: everything here only changes how a
 * document-space point PROJECTS onto the screen. It never reads or mutates
 * persisted Mark geometry -- callers convert a raw pointer sample through
 * `screenToDoc` once, then store the result exactly as before.
 *
 * Deliberately isotropic (one `zoom` scales both axes equally) -- this is
 * what lets a non-square document rect (e.g. a future page frame) render
 * with its true proportions rather than being stretched to fit a viewport.
 *
 * No rotation in this module (out of scope for this BUILD), but nothing
 * here assumes an unrotated axis-aligned mapping is permanent: `panBy`'s
 * screen-space delta and `zoomAt`'s screen-space anchor point are the two
 * places a future `viewRotation` would need to inverse-rotate before/after
 * applying -- see the BOUNDED SPATIAL WORKSPACE recon's "View Rotation
 * Readiness" section for the full reasoning.
 */

export interface CartesianCameraState {
  readonly panX: number;
  readonly panY: number;
  readonly zoom: number;
}

export interface DocPoint {
  readonly x: number;
  readonly y: number;
}

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

export interface DocRect {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface CartesianCamera {
  getState(): CartesianCameraState;
  /** Converts a document-space point to a screen-space point, given the current viewport size. */
  docToScreen(point: DocPoint, viewportWidth: number, viewportHeight: number): ScreenPoint;
  /** Converts a screen-space point (e.g. `event.clientX/clientY` relative to the viewport's own origin) to a document-space point. */
  screenToDoc(screenX: number, screenY: number, viewportWidth: number, viewportHeight: number): DocPoint;
  /** Pans by a SCREEN-space delta (e.g. a pointer drag's raw pixel movement) -- converted to document units internally via the current zoom. */
  panBy(screenDeltaX: number, screenDeltaY: number): void;
  /** Rescales `zoom` by `factor` (clamped to `[minZoom, maxZoom]`) while keeping the document point under `(screenX, screenY)` fixed on screen. */
  zoomAt(screenX: number, screenY: number, factor: number, viewportWidth: number, viewportHeight: number, minZoom: number, maxZoom: number): void;
  /** Frames `rect` centered in the viewport, scaled (within `[minZoom, maxZoom]`) so it fits with `padding` (e.g. `0.8` == rect fills 80% of the smaller viewport dimension). */
  fitToRect(rect: DocRect, viewportWidth: number, viewportHeight: number, padding: number, minZoom: number, maxZoom: number): void;
  /** Resets to the identity view (`panX: 0, panY: 0, zoom: 1`). */
  reset(): void;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function createCartesianCamera(initial?: Partial<CartesianCameraState>): CartesianCamera {
  const state: { panX: number; panY: number; zoom: number } = {
    panX: initial?.panX ?? 0,
    panY: initial?.panY ?? 0,
    zoom: initial?.zoom ?? 1,
  };

  return {
    getState(): CartesianCameraState {
      return { ...state };
    },
    docToScreen(point, viewportWidth, viewportHeight) {
      return {
        x: viewportWidth / 2 + (point.x + state.panX) * state.zoom,
        y: viewportHeight / 2 + (point.y + state.panY) * state.zoom,
      };
    },
    screenToDoc(screenX, screenY, viewportWidth, viewportHeight) {
      return {
        x: (screenX - viewportWidth / 2) / state.zoom - state.panX,
        y: (screenY - viewportHeight / 2) / state.zoom - state.panY,
      };
    },
    panBy(screenDeltaX, screenDeltaY) {
      state.panX += screenDeltaX / state.zoom;
      state.panY += screenDeltaY / state.zoom;
    },
    zoomAt(screenX, screenY, factor, viewportWidth, viewportHeight, minZoom, maxZoom) {
      const before = this.screenToDoc(screenX, screenY, viewportWidth, viewportHeight);
      state.zoom = clamp(state.zoom * factor, minZoom, maxZoom);
      state.panX = (screenX - viewportWidth / 2) / state.zoom - before.x;
      state.panY = (screenY - viewportHeight / 2) / state.zoom - before.y;
    },
    fitToRect(rect, viewportWidth, viewportHeight, padding, minZoom, maxZoom) {
      const spanX = Math.max(1e-6, rect.maxX - rect.minX);
      const spanY = Math.max(1e-6, rect.maxY - rect.minY);
      state.zoom = clamp(Math.min(viewportWidth / spanX, viewportHeight / spanY) * padding, minZoom, maxZoom);
      state.panX = -(rect.minX + rect.maxX) / 2;
      state.panY = -(rect.minY + rect.maxY) / 2;
    },
    reset() {
      state.panX = 0;
      state.panY = 0;
      state.zoom = 1;
    },
  };
}
