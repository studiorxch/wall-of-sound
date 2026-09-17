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
    expect(INITIAL_COLOR_PALETTE_STATE.currentColor).toBe("#e92f3d");
    expect(COLOR_PALETTES).toHaveLength(3);
  });

  it("V0.10 UI Reset: does not default into the limited StudioRich palette -- browsing defaults to a full manufacturer palette instead", () => {
    const defaultPalette = getColorPalette(INITIAL_COLOR_PALETTE_STATE.paletteId);
    expect(defaultPalette.name).not.toBe("StudioRich");
    expect(defaultPalette.source).toBe("canonical-manufacturer-data");
    // StudioRich must still exist and remain fully selectable -- "optional palette only", never removed.
    expect(getColorPalette("studiorich").name).toBe("StudioRich");
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
    expect(selectColorPalette(colored, "black-400ml")).toEqual({
      ...colored,
      paletteId: "black-400ml",
    });
  });

  it("uses the complete canonical manufacturer palettes", () => {
    expect(getColorPalette("black-400ml").colors).toHaveLength(257);
    expect(getColorPalette("montana-gold").colors).toHaveLength(256);
    expect(COLOR_PALETTES.filter(({ source }) => source === "canonical-manufacturer-data")).toHaveLength(2);
    expect(COLOR_PALETTES.some(({ id }) => id.includes("fallback"))).toBe(false);
  });

  it("preserves exact manufacturer labels, codes, and alias entries", () => {
    const black = getColorPalette("black-400ml");
    const gold = getColorPalette("montana-gold");
    expect(black.colors.find(({ name }) => name === "BLK5077 Royal Blue")?.code).toBe("BLK5077");
    expect(gold.colors.find(({ name }) => name === "G5075 Signal Blue")?.code).toBe("G5075");
    expect(black.colors.filter(({ aliasOfObjectId }) => aliasOfObjectId != null)).toHaveLength(7);
    expect(gold.colors.filter(({ aliasOfObjectId }) => aliasOfObjectId != null)).toHaveLength(4);
    expect(black.colors.some(({ name }) => name === "BLK2093 Code Red")).toBe(true);
    expect(gold.colors.some(({ name }) => name === "S9100 Shock White")).toBe(true);

    const royalBlue = black.colors.find(({ name }) => name === "BLK5077 Royal Blue");
    expect(royalBlue).toBeDefined();
    const selected = selectPaletteColor(INITIAL_COLOR_PALETTE_STATE, royalBlue!.hex, royalBlue);
    expect(selected.selectedSwatchName).toBe("BLK5077 Royal Blue");
    expect(selected.selectedSwatchCode).toBe("BLK5077");
  });
});
