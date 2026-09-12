import { type MarkerVariantId } from "./DrawingTool";

export type MarkerWidthPresetId = "xs" | "s" | "m" | "l" | "xl";

export interface MarkerWidthPreset {
  id: MarkerWidthPresetId;
  label: string;
  width: number;
}

export type MarkerWidthState = Record<MarkerVariantId, number>;

const PRESET_LABELS: readonly MarkerWidthPresetId[] = ["xs", "s", "m", "l", "xl"];

const WIDTHS: Record<MarkerVariantId, readonly number[]> = {
  round: [12, 20, 28, 40, 56],
  chisel: [16, 24, 34, 48, 64],
  "clean-chisel": [16, 24, 34, 48, 64],
  "drippy-chisel": [18, 26, 38, 52, 66],
  mop: [24, 34, 44, 56, 68],
  "drip-mop": [28, 40, 50, 62, 72],
};

export const INITIAL_MARKER_WIDTHS: MarkerWidthState = {
  round: 28,
  chisel: 34,
  "clean-chisel": 34,
  "drippy-chisel": 38,
  mop: 44,
  "drip-mop": 50,
};

export function getMarkerWidthPresets(variantId: MarkerVariantId): readonly MarkerWidthPreset[] {
  return WIDTHS[variantId].map((width, index) => ({
    id: PRESET_LABELS[index],
    label: PRESET_LABELS[index].toUpperCase(),
    width,
  }));
}

export function selectMarkerWidth(
  state: MarkerWidthState,
  variantId: MarkerVariantId,
  width: number,
): MarkerWidthState {
  const preset = getMarkerWidthPresets(variantId).find((candidate) => candidate.width === width);
  return preset ? { ...state, [variantId]: preset.width } : state;
}
