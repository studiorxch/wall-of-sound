import { type SmoothingLevel } from "./StrokeSmoother";
import { type AnonymityMode, type InputSourceMode } from "./types";

export interface SettingsState {
  isOpen: boolean;
  smoothing: SmoothingLevel;
  dripsEnabled: boolean;
  radiusOverride: number | null;
  trackingDebugVisible: boolean;
}

export type SettingsAction =
  | { type: "toggle" }
  | { type: "open" }
  | { type: "close" }
  | { type: "smoothing"; value: SmoothingLevel }
  | { type: "drips"; value: boolean }
  | { type: "radius"; value: number | null }
  | { type: "tracking-debug"; value: boolean };

export const INITIAL_SETTINGS_STATE: SettingsState = {
  isOpen: false,
  smoothing: "medium",
  dripsEnabled: true,
  radiusOverride: null,
  trackingDebugVisible: false,
};

export function cameraTreatmentForInputMode(
  mode: InputSourceMode,
  current: AnonymityMode,
): AnonymityMode {
  return mode === "spatial" ? "clean" : current;
}

export function reduceSettingsState(state: SettingsState, action: SettingsAction): SettingsState {
  switch (action.type) {
    case "toggle": return { ...state, isOpen: !state.isOpen };
    case "open": return { ...state, isOpen: true };
    case "close": return { ...state, isOpen: false };
    case "smoothing": return { ...state, smoothing: action.value };
    case "drips": return { ...state, dripsEnabled: action.value };
    case "radius": return { ...state, radiusOverride: action.value };
    case "tracking-debug": return { ...state, trackingDebugVisible: action.value };
  }
}
