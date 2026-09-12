export type ColorPaletteId = "studiorich" | "montana-gold-fallback" | "black-400ml-fallback";

export interface ColorSwatch {
  name: string;
  hex: string;
}

export interface ColorPaletteDefinition {
  id: ColorPaletteId;
  name: string;
  source: "existing-prototype" | "embedded-calibration-fallback";
  colors: readonly ColorSwatch[];
}

export interface ColorPaletteState {
  paletteId: ColorPaletteId;
  currentColor: string;
  recentColors: string[];
}

export const COLOR_PALETTES: readonly ColorPaletteDefinition[] = [
  {
    id: "studiorich",
    name: "StudioRich",
    source: "existing-prototype",
    colors: [
      { name: "Black", hex: "#0b0b0d" },
      { name: "White", hex: "#f5f1e7" },
      { name: "Silver", hex: "#aeb4b8" },
      { name: "Red", hex: "#e92f3d" },
      { name: "Orange", hex: "#ff6a1a" },
      { name: "Yellow", hex: "#ffd21c" },
      { name: "Green", hex: "#20d96b" },
      { name: "Cyan", hex: "#15cfe5" },
      { name: "Blue", hex: "#2764ff" },
      { name: "Purple", hex: "#8347d8" },
      { name: "Pink", hex: "#ff3f8f" },
    ],
  },
  {
    id: "montana-gold-fallback",
    name: "Montana Gold · fallback",
    source: "embedded-calibration-fallback",
    colors: [
      { name: "Warm White", hex: "#f3ebd2" },
      { name: "Lemon", hex: "#f6db29" },
      { name: "Power Orange", hex: "#f57a22" },
      { name: "Signal Red", hex: "#df2935" },
      { name: "Magenta", hex: "#d63882" },
      { name: "Violet", hex: "#6c3ea0" },
      { name: "Ultramarine", hex: "#2851a3" },
      { name: "Sky", hex: "#36a7d8" },
      { name: "Aqua", hex: "#20a99a" },
      { name: "Leaf", hex: "#4f9c45" },
      { name: "Chocolate", hex: "#59392f" },
      { name: "Shock Black", hex: "#171719" },
    ],
  },
  {
    id: "black-400ml-fallback",
    name: "BLACK 400ML · fallback",
    source: "embedded-calibration-fallback",
    colors: [
      { name: "True White", hex: "#f7f7f2" },
      { name: "Light Gray", hex: "#c8c9c7" },
      { name: "Middle Gray", hex: "#777a7c" },
      { name: "True Black", hex: "#101113" },
      { name: "Traffic Yellow", hex: "#f4c928" },
      { name: "Traffic Orange", hex: "#ee6c25" },
      { name: "Traffic Red", hex: "#c92d39" },
      { name: "Purple", hex: "#723c8c" },
      { name: "Gentian Blue", hex: "#245e9c" },
      { name: "Turquoise", hex: "#168b8e" },
      { name: "Grass Green", hex: "#3f8b4b" },
      { name: "Hazelnut", hex: "#6a4936" },
    ],
  },
] as const;

export const INITIAL_COLOR_PALETTE_STATE: ColorPaletteState = {
  paletteId: "studiorich",
  currentColor: "#e92f3d",
  recentColors: [],
};

export function getColorPalette(id: string): ColorPaletteDefinition {
  return COLOR_PALETTES.find((palette) => palette.id === id) ?? COLOR_PALETTES[0];
}

export function selectColorPalette(
  state: ColorPaletteState,
  paletteId: ColorPaletteId,
): ColorPaletteState {
  return { ...state, paletteId };
}

export function selectPaletteColor(
  state: ColorPaletteState,
  color: string,
): ColorPaletteState {
  const normalized = color.toLowerCase();
  const recentColors = [state.currentColor.toLowerCase(), ...state.recentColors]
    .filter((candidate, index, values) => candidate !== normalized && values.indexOf(candidate) === index)
    .slice(0, 6);
  return { ...state, currentColor: normalized, recentColors };
}
