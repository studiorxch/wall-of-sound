import { type SmoothingLevel } from "./StrokeSmoother";
import { type AnonymityMode, type InputSourceMode } from "./types";

export interface SettingsState {
  isOpen: boolean;
  smoothing: SmoothingLevel;
  dripsEnabled: boolean;
  radiusOverride: number | null;
  coverageOverride: number | null;
  fillModeEnabled: boolean;
  trackingDebugVisible: boolean;
}

export type SettingsAction =
  | { type: "toggle" }
  | { type: "open" }
  | { type: "close" }
  | { type: "smoothing"; value: SmoothingLevel }
  | { type: "drips"; value: boolean }
  | { type: "radius"; value: number | null }
  | { type: "coverage"; value: number | null }
  | { type: "fill-mode"; value: boolean }
  | { type: "tracking-debug"; value: boolean };

export const INITIAL_SETTINGS_STATE: SettingsState = {
  isOpen: false,
  smoothing: "medium",
  dripsEnabled: true,
  radiusOverride: null,
  coverageOverride: null,
  fillModeEnabled: false,
  trackingDebugVisible: false,
};

export function cameraTreatmentForInputMode(
  _mode: InputSourceMode,
  _current: AnonymityMode,
): AnonymityMode {
  return "hidden";
}

export function reduceSettingsState(state: SettingsState, action: SettingsAction): SettingsState {
  switch (action.type) {
    case "toggle": return { ...state, isOpen: !state.isOpen };
    case "open": return { ...state, isOpen: true };
    case "close": return { ...state, isOpen: false };
    case "smoothing": return { ...state, smoothing: action.value };
    case "drips": return { ...state, dripsEnabled: action.value };
    case "radius": return { ...state, radiusOverride: action.value };
    case "coverage": return { ...state, coverageOverride: action.value };
    case "fill-mode": return { ...state, fillModeEnabled: action.value };
    case "tracking-debug": return { ...state, trackingDebugVisible: action.value };
  }
}
