export type WetPaintFlow = "low" | "balanced" | "high";
export type WetPaintViscosity = "thick" | "balanced" | "runny";

export interface WetPaintControlState {
  flow: WetPaintFlow;
  viscosity: WetPaintViscosity;
}

export interface WetPaintControlModifiers {
  delivery: number;
  dwellResponse: number;
  threshold: number;
  width: number;
  length: number;
  gravityDuration: number;
}

/**
 * V0.10.2 Marker + Spray Control Reduction: Mop's canonical/default paint
 * chemistry is High flow / Runny viscosity -- Mop is currently the only
 * wet-capable marker variant reachable through the shipped UI (see
 * `BrushStudio.ts`'s `markerFamilyFor`/the V0.10 marker consolidation), so
 * this single global default IS Mop's own default in practice. Session
 * changes (now made from Brush Studio, not the normal picker) still start
 * from here; Mop's own deposition/drip physics (`PaintMarkerEngine.ts`'s
 * `MARKER_VARIANTS` entry, `dripTendency`, etc.) are untouched by this --
 * Flow/Viscosity only scale delivery/threshold/width/length, never the
 * variant's own canonical identity.
 */
export const INITIAL_WET_PAINT_CONTROLS: WetPaintControlState = {
  flow: "high",
  viscosity: "runny",
};

export function resolveWetPaintControlModifiers(
  controls: WetPaintControlState,
): WetPaintControlModifiers {
  const flow = {
    low: { delivery: 0.76, dwellResponse: 0.78, threshold: 1.14, width: 0.82 },
    balanced: { delivery: 1, dwellResponse: 1, threshold: 1, width: 1 },
    high: { delivery: 1.28, dwellResponse: 1.35, threshold: 0.84, width: 1.3 },
  }[controls.flow];
  const viscosity = {
    thick: { threshold: 1.08, width: 1.2, length: 0.72, gravityDuration: 1.28 },
    balanced: { threshold: 1, width: 1, length: 1, gravityDuration: 1 },
    runny: { threshold: 0.88, width: 0.9, length: 1.48, gravityDuration: 0.74 },
  }[controls.viscosity];
  return {
    delivery: flow.delivery,
    dwellResponse: flow.dwellResponse,
    threshold: flow.threshold * viscosity.threshold,
    width: flow.width * viscosity.width,
    length: viscosity.length,
    gravityDuration: viscosity.gravityDuration,
  };
}

export function updateWetPaintControls(
  state: WetPaintControlState,
  update: Partial<WetPaintControlState>,
): WetPaintControlState {
  return { ...state, ...update };
}
