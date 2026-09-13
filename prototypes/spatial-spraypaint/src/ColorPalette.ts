import black400mlPaletteData from "./data/black400mlPalette.json";
import montanaGold400mlPaletteData from "./data/montanaGold400mlPalette.json";

export type ColorPaletteId = "studiorich" | "montana-gold" | "black-400ml";

export interface ColorSwatch {
  name: string;
  hex: string;
  code: string | null;
  aliasOfObjectId?: number | null;
}

export interface ColorPaletteDefinition {
  id: ColorPaletteId;
  name: string;
  source: "existing-prototype" | "canonical-manufacturer-data";
  colors: readonly ColorSwatch[];
}

export interface ColorPaletteState {
  paletteId: ColorPaletteId;
  currentColor: string;
  recentColors: string[];
  selectedSwatchName: string | null;
  selectedSwatchCode: string | null;
}

interface ManufacturerPaletteRecord {
  label: string;
  code: string | null;
  color: { displayHex: string };
  source: { aliasOfObjectId: number | null };
}

function manufacturerSwatches(data: readonly ManufacturerPaletteRecord[]): ColorSwatch[] {
  return data.map((entry) => ({
    name: entry.label,
    code: entry.code,
    hex: entry.color.displayHex,
    aliasOfObjectId: entry.source.aliasOfObjectId,
  }));
}

export const COLOR_PALETTES: readonly ColorPaletteDefinition[] = [
  {
    id: "studiorich",
    name: "StudioRich",
    source: "existing-prototype",
    colors: [
      { name: "Black", hex: "#0b0b0d", code: null },
      { name: "White", hex: "#f5f1e7", code: null },
      { name: "Silver", hex: "#aeb4b8", code: null },
      { name: "Red", hex: "#e92f3d", code: null },
      { name: "Orange", hex: "#ff6a1a", code: null },
      { name: "Yellow", hex: "#ffd21c", code: null },
      { name: "Green", hex: "#20d96b", code: null },
      { name: "Cyan", hex: "#15cfe5", code: null },
      { name: "Blue", hex: "#2764ff", code: null },
      { name: "Purple", hex: "#8347d8", code: null },
      { name: "Pink", hex: "#ff3f8f", code: null },
    ],
  },
  {
    id: "montana-gold",
    name: "Montana Gold",
    source: "canonical-manufacturer-data",
    colors: manufacturerSwatches(montanaGold400mlPaletteData as ManufacturerPaletteRecord[]),
  },
  {
    id: "black-400ml",
    name: "BLACK 400ML",
    source: "canonical-manufacturer-data",
    colors: manufacturerSwatches(black400mlPaletteData as ManufacturerPaletteRecord[]),
  },
] as const;

export const INITIAL_COLOR_PALETTE_STATE: ColorPaletteState = {
  paletteId: "studiorich",
  currentColor: "#e92f3d",
  recentColors: [],
  selectedSwatchName: "Red",
  selectedSwatchCode: null,
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
  swatch?: Pick<ColorSwatch, "name" | "code">,
): ColorPaletteState {
  const normalized = color.toLowerCase();
  const recentColors = [state.currentColor.toLowerCase(), ...state.recentColors]
    .filter((candidate, index, values) => candidate !== normalized && values.indexOf(candidate) === index)
    .slice(0, 6);
  return {
    ...state,
    currentColor: normalized,
    recentColors,
    selectedSwatchName: swatch?.name ?? null,
    selectedSwatchCode: swatch?.code ?? null,
  };
}
