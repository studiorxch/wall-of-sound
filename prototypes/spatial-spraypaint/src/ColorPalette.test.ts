import { describe, expect, it } from "vitest";
import {
  COLOR_PALETTES,
  INITIAL_COLOR_PALETTE_STATE,
  getColorPalette,
  selectColorPalette,
  selectPaletteColor,
} from "./ColorPalette";

describe("color palette authority", () => {
  it("keeps one canonical current palette and color state", () => {
    expect(getColorPalette(INITIAL_COLOR_PALETTE_STATE.paletteId).name).toBe("StudioRich");
    expect(INITIAL_COLOR_PALETTE_STATE.currentColor).toBe("#e92f3d");
    expect(COLOR_PALETTES).toHaveLength(3);
  });

  it("changes active color and retains a bounded deduplicated recent list", () => {
    let state = selectPaletteColor(INITIAL_COLOR_PALETTE_STATE, "#15CFE5");
    state = selectPaletteColor(state, "#FFD21C");
    state = selectPaletteColor(state, "#15CFE5");
    expect(state.currentColor).toBe("#15cfe5");
    expect(state.recentColors).toEqual(["#ffd21c", "#e92f3d"]);
    for (const color of ["#111111", "#222222", "#333333", "#444444", "#555555", "#666666", "#777777"]) {
      state = selectPaletteColor(state, color);
    }
    expect(state.recentColors).toHaveLength(6);
  });

  it("switches palettes without altering the selected color or recent colors", () => {
    const colored = selectPaletteColor(INITIAL_COLOR_PALETTE_STATE, "#20d96b");
    expect(selectColorPalette(colored, "black-400ml-fallback")).toEqual({
      ...colored,
      paletteId: "black-400ml-fallback",
    });
  });

  it("labels proprietary-palette stand-ins honestly as calibration fallbacks", () => {
    for (const palette of COLOR_PALETTES.filter(({ source }) => source === "embedded-calibration-fallback")) {
      expect(palette.name).toContain("fallback");
      expect(palette.colors.length).toBeGreaterThanOrEqual(12);
    }
  });
});
