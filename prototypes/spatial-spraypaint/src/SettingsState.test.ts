import { describe, expect, it } from "vitest";
import { INITIAL_SETTINGS_STATE, reduceSettingsState } from "./SettingsState";

describe("settings state", () => {
  it("opens, closes, and toggles without changing drawing preferences", () => {
    const opened = reduceSettingsState(INITIAL_SETTINGS_STATE, { type: "open" });
    const smoothed = reduceSettingsState(opened, { type: "smoothing", value: "high" });
    const closed = reduceSettingsState(smoothed, { type: "close" });
    expect(closed).toMatchObject({ isOpen: false, smoothing: "high", dripsEnabled: true });
  });

  it("tracks optional radius and diagnostics independently", () => {
    const radius = reduceSettingsState(INITIAL_SETTINGS_STATE, { type: "radius", value: 24 });
    const debug = reduceSettingsState(radius, { type: "tracking-debug", value: true });
    expect(debug).toMatchObject({ radiusOverride: 24, trackingDebugVisible: true });
  });
});
