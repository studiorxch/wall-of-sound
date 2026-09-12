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

export const INITIAL_WET_PAINT_CONTROLS: WetPaintControlState = {
  flow: "balanced",
  viscosity: "balanced",
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
