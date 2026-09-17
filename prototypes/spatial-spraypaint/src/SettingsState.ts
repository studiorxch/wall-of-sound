import {
  EMPTY_SPRAY_OVERRIDES,
  resetSprayBrush,
  resetSprayProperty,
  setSprayOverride,
  type SprayOverrideStore,
  type SprayPropertyKey,
  type SprayPropertyOverride,
} from "./BrushProperties";
import {
  EMPTY_FLAIR_OVERRIDES,
  resetFlairMode,
  resetFlairProperty,
  setFlairOverride,
  type FlairOverrideStore,
  type FlairParameterOverride,
  type FlairPropertyKey,
} from "./FlairProperties";
import { type FlairModeId } from "./ToolTaxonomy";
import { type SmoothingLevel } from "./StrokeSmoother";
import { type AnonymityMode, type InputSourceMode } from "./types";

export type GridStyle = "solid" | "dotted";

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
  /**
   * PRESET DEFAULT -> SESSION/USER MODIFICATION -> EFFECTIVE VALUE for
   * Flair's five Brush Studio controls (Brush Studio Flair Controls build
   * brief), keyed by cap id AND mode together (see `FlairProperties.ts`) so
   * one brush's Wall tweaks and Blackbook tweaks never leak into each other.
   * Session-local only, matching `sprayOverrides` — no persistence added.
   */
  flairOverrides: FlairOverrideStore;
  trackingDebugVisible: boolean;
  /** Section C of the Pencil Prep build brief: a temporary/diagnostic-only raw pointer readout (pointerType/pressure/tilt/twist/velocity/coalesced count). Off by default (Creative Interface Doctrine — normal state stays quiet); shows nothing about rendering or Flair, only raw hardware values. */
  pencilDiagnosticsVisible: boolean;
  /** Reference-line style for the wall's spacing grid. Fresh sessions default to "dotted"; a saved preference (persisted outside this module, in main.ts) overrides this default at startup. */
  gridStyle: GridStyle;
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
  | { type: "flair-property"; capId: string; mode: FlairModeId; patch: FlairParameterOverride }
  | { type: "reset-flair-property"; capId: string; mode: FlairModeId; key: FlairPropertyKey }
  | { type: "reset-flair-mode"; capId: string; mode: FlairModeId }
  | { type: "tracking-debug"; value: boolean }
  | { type: "pencil-diagnostics"; value: boolean }
  | { type: "grid-style"; value: GridStyle };

export const INITIAL_SETTINGS_STATE: SettingsState = {
  isOpen: false,
  smoothing: "medium",
  dripsEnabled: true,
  sprayOverrides: EMPTY_SPRAY_OVERRIDES,
  flairOverrides: EMPTY_FLAIR_OVERRIDES,
  trackingDebugVisible: false,
  pencilDiagnosticsVisible: false,
  gridStyle: "dotted",
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
    case "flair-property":
      return { ...state, flairOverrides: setFlairOverride(state.flairOverrides, action.capId, action.mode, action.patch) };
    case "reset-flair-property":
      return { ...state, flairOverrides: resetFlairProperty(state.flairOverrides, action.capId, action.mode, action.key) };
    case "reset-flair-mode":
      return { ...state, flairOverrides: resetFlairMode(state.flairOverrides, action.capId, action.mode) };
    case "tracking-debug": return { ...state, trackingDebugVisible: action.value };
    case "pencil-diagnostics": return { ...state, pencilDiagnosticsVisible: action.value };
    case "grid-style": return { ...state, gridStyle: action.value };
  }
}
