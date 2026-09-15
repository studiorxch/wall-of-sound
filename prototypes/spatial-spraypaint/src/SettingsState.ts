import {
  EMPTY_SPRAY_OVERRIDES,
  resetSprayBrush,
  resetSprayProperty,
  setSprayOverride,
  type SprayOverrideStore,
  type SprayPropertyKey,
  type SprayPropertyOverride,
} from "./BrushProperties";
import { type SmoothingLevel } from "./StrokeSmoother";
import { type AnonymityMode, type InputSourceMode } from "./types";

export interface SettingsState {
  isOpen: boolean;
  smoothing: SmoothingLevel;
  dripsEnabled: boolean;
  /**
   * PRESET DEFAULT -> SESSION/USER MODIFICATION -> EFFECTIVE VALUE, per Spray
   * brush (keyed by cap id, built-in or custom). Replaces the old flat
   * radiusOverride/coverageOverride/fillModeEnabled fields, which applied
   * globally and silently carried over when switching brushes — exactly the
   * "changing Fill mutates other brushes" defect Brush Studio V1 corrects.
   */
  sprayOverrides: SprayOverrideStore;
  trackingDebugVisible: boolean;
}

export type SettingsAction =
  | { type: "toggle" }
  | { type: "open" }
  | { type: "close" }
  | { type: "smoothing"; value: SmoothingLevel }
  | { type: "drips"; value: boolean }
  | { type: "spray-property"; capId: string; patch: SprayPropertyOverride }
  | { type: "reset-spray-property"; capId: string; key: SprayPropertyKey }
  | { type: "reset-spray-brush"; capId: string }
  | { type: "tracking-debug"; value: boolean };

export const INITIAL_SETTINGS_STATE: SettingsState = {
  isOpen: false,
  smoothing: "medium",
  dripsEnabled: true,
  sprayOverrides: EMPTY_SPRAY_OVERRIDES,
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
    case "spray-property":
      return { ...state, sprayOverrides: setSprayOverride(state.sprayOverrides, action.capId, action.patch) };
    case "reset-spray-property":
      return { ...state, sprayOverrides: resetSprayProperty(state.sprayOverrides, action.capId, action.key) };
    case "reset-spray-brush":
      return { ...state, sprayOverrides: resetSprayBrush(state.sprayOverrides, action.capId) };
    case "tracking-debug": return { ...state, trackingDebugVisible: action.value };
  }
}
