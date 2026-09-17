import { describe, expect, it } from "vitest";
import { cameraTreatmentForInputMode, INITIAL_SETTINGS_STATE, reduceSettingsState } from "./SettingsState";

describe("settings state", () => {
  it("opens, closes, and toggles without changing drawing preferences", () => {
    const opened = reduceSettingsState(INITIAL_SETTINGS_STATE, { type: "open" });
    const smoothed = reduceSettingsState(opened, { type: "smoothing", value: "high" });
    const closed = reduceSettingsState(smoothed, { type: "close" });
    expect(closed).toMatchObject({ isOpen: false, smoothing: "high", dripsEnabled: true });
  });

  it("tracks per-brush Spray property overrides independently of diagnostics", () => {
    const sized = reduceSettingsState(INITIAL_SETTINGS_STATE, {
      type: "spray-property", capId: "needle", patch: { size: 24 },
    });
    const debug = reduceSettingsState(sized, { type: "tracking-debug", value: true });
    expect(debug.sprayOverrides).toEqual({ needle: { size: 24 } });
    expect(debug.trackingDebugVisible).toBe(true);
  });

  it("keeps overrides for different brushes independent — setting one never mutates another", () => {
    let state = reduceSettingsState(INITIAL_SETTINGS_STATE, {
      type: "spray-property", capId: "needle", patch: { fillMode: true },
    });
    state = reduceSettingsState(state, {
      type: "spray-property", capId: "calligraphy", patch: { fillMode: false },
    });
    expect(state.sprayOverrides).toEqual({ needle: { fillMode: true }, calligraphy: { fillMode: false } });
  });

  it("reset-spray-property clears one property and reset-spray-brush clears all of a brush's overrides", () => {
    let state = reduceSettingsState(INITIAL_SETTINGS_STATE, {
      type: "spray-property", capId: "needle", patch: { size: 12, coverage: 0.5 },
    });
    state = reduceSettingsState(state, { type: "reset-spray-property", capId: "needle", key: "size" });
    expect(state.sprayOverrides).toEqual({ needle: { coverage: 0.5 } });
    state = reduceSettingsState(state, { type: "reset-spray-brush", capId: "needle" });
    expect(state.sprayOverrides).toEqual({});
  });

  it("starts with an empty override store, defaulting to every brush's own preset values", () => {
    expect(INITIAL_SETTINGS_STATE.sprayOverrides).toEqual({});
  });

  it("tracks per-(brush, mode) Flair overrides independently of Spray overrides", () => {
    const state = reduceSettingsState(INITIAL_SETTINGS_STATE, {
      type: "flair-property", capId: "track-marks", mode: "wall", patch: { flairAmount: 2 },
    });
    expect(state.flairOverrides).toEqual({ "track-marks": { wall: { flairAmount: 2 } } });
    expect(state.sprayOverrides).toEqual({});
  });

  it("keeps Flair overrides for different modes of the SAME brush independent — changing Wall never mutates Blackbook", () => {
    let state = reduceSettingsState(INITIAL_SETTINGS_STATE, {
      type: "flair-property", capId: "track-marks", mode: "wall", patch: { flairAmount: 2 },
    });
    state = reduceSettingsState(state, {
      type: "flair-property", capId: "track-marks", mode: "blackbook", patch: { flairSmoothing: 0.9 },
    });
    expect(state.flairOverrides).toEqual({
      "track-marks": { wall: { flairAmount: 2 }, blackbook: { flairSmoothing: 0.9 } },
    });
  });

  it("reset-flair-property clears one property and reset-flair-mode clears a whole mode bundle", () => {
    let state = reduceSettingsState(INITIAL_SETTINGS_STATE, {
      type: "flair-property", capId: "track-marks", mode: "wild", patch: { flairAmount: 2, bloomResponse: 0.5 },
    });
    state = reduceSettingsState(state, { type: "reset-flair-property", capId: "track-marks", mode: "wild", key: "flairAmount" });
    expect(state.flairOverrides).toEqual({ "track-marks": { wild: { bloomResponse: 0.5 } } });
    state = reduceSettingsState(state, { type: "reset-flair-mode", capId: "track-marks", mode: "wild" });
    expect(state.flairOverrides).toEqual({});
  });

  it("toggles pencil diagnostics visibility independently of tracking debug", () => {
    const state = reduceSettingsState(INITIAL_SETTINGS_STATE, { type: "pencil-diagnostics", value: true });
    expect(state.pencilDiagnosticsVisible).toBe(true);
    expect(state.trackingDebugVisible).toBe(false);
  });

  it("defaults fresh sessions to a dotted grid style and switches independently of other settings", () => {
    expect(INITIAL_SETTINGS_STATE.gridStyle).toBe("dotted");
    const state = reduceSettingsState(INITIAL_SETTINGS_STATE, { type: "grid-style", value: "solid" });
    expect(state.gridStyle).toBe("solid");
    expect(state.smoothing).toBe("medium");
  });

  it("keeps the performer hidden across Physical and Hand modes", () => {
    expect(cameraTreatmentForInputMode("spatial", "clean")).toBe("hidden");
    expect(cameraTreatmentForInputMode("mouse", "ghost")).toBe("hidden");
  });
});
