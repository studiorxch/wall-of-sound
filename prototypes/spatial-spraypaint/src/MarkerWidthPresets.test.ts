import { describe, expect, it } from "vitest";
import {
  INITIAL_MARKER_WIDTHS,
  getMarkerWidthPresets,
  selectMarkerWidth,
} from "./MarkerWidthPresets";

describe("marker width presets", () => {
  it.each(["round", "chisel", "clean-chisel", "drippy-chisel", "mop", "drip-mop"] as const)(
    "offers repeatable ordered widths for %s",
    (variantId) => {
      const presets = getMarkerWidthPresets(variantId);
      expect(presets).toHaveLength(5);
      expect(presets.map(({ width }) => width)).toEqual(
        [...presets.map(({ width }) => width)].sort((first, second) => first - second),
      );
      expect(presets.some(({ width }) => width === INITIAL_MARKER_WIDTHS[variantId])).toBe(true);
    },
  );

  it("updates only the selected marker variant and rejects arbitrary widths", () => {
    const selected = selectMarkerWidth(INITIAL_MARKER_WIDTHS, "mop", 56);
    expect(selected.mop).toBe(56);
    expect(selected.round).toBe(INITIAL_MARKER_WIDTHS.round);
    expect(selectMarkerWidth(selected, "mop", 57)).toBe(selected);
  });
});
