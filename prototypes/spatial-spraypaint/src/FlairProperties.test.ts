import { describe, expect, it } from "vitest";
import {
  EMPTY_FLAIR_OVERRIDES,
  getFlairOverride,
  getFlairPropertyRows,
  isFlairModeModified,
  isFlairPropertyModified,
  resetFlairMode,
  resetFlairProperty,
  resolveEffectiveFlairParams,
  setFlairOverride,
} from "./FlairProperties";
import { getFlairProControlMetadata } from "./FlairCurves";

describe("FlairOverrideStore -- MODE DEFAULT -> SESSION MODIFICATION -> EFFECTIVE VALUE", () => {
  it("starts empty, defaulting every (cap, mode) pair to that mode's own canonical values", () => {
    expect(EMPTY_FLAIR_OVERRIDES).toEqual({});
    expect(getFlairOverride(EMPTY_FLAIR_OVERRIDES, "track-marks", "wall")).toEqual({});
  });

  it("resolveEffectiveFlairParams merges an override on top of the mode's own canonical defaults", () => {
    const store = setFlairOverride(EMPTY_FLAIR_OVERRIDES, "track-marks", "wall", { flairAmount: 2 });
    const effective = resolveEffectiveFlairParams("wall", getFlairOverride(store, "track-marks", "wall"));
    const defaults = getFlairProControlMetadata("wall");
    expect(effective.flairAmount).toBe(2);
    expect(effective.flairRange).toBe(defaults.flairRange);
    expect(effective.flairSmoothing).toBe(defaults.flairSmoothing);
    expect(effective.bloomResponse).toBe(defaults.bloomResponse);
    expect(effective.outputFalloff).toBe(defaults.outputFalloff);
  });

  it("per-brush session modifications do not leak -- setting Track Marks never affects another cap's store entry", () => {
    let store = setFlairOverride(EMPTY_FLAIR_OVERRIDES, "track-marks", "wall", { flairAmount: 2 });
    store = setFlairOverride(store, "pink-dot-fat", "wall", { flairAmount: 0.3 });
    expect(getFlairOverride(store, "track-marks", "wall")).toEqual({ flairAmount: 2 });
    expect(getFlairOverride(store, "pink-dot-fat", "wall")).toEqual({ flairAmount: 0.3 });
  });

  it("per-mode session modifications do not leak -- changing Wall parameters never mutates Blackbook's defaults for the same brush", () => {
    const store = setFlairOverride(EMPTY_FLAIR_OVERRIDES, "track-marks", "wall", { flairAmount: 2, flairRange: 5 });
    expect(getFlairOverride(store, "track-marks", "blackbook")).toEqual({});
    const blackbookEffective = resolveEffectiveFlairParams("blackbook", getFlairOverride(store, "track-marks", "blackbook"));
    expect(blackbookEffective).toEqual(getFlairProControlMetadata("blackbook"));
  });

  it("switching mode back preserves the earlier mode's own session modifications, coherently", () => {
    let store = setFlairOverride(EMPTY_FLAIR_OVERRIDES, "track-marks", "wall", { flairAmount: 1.8 });
    store = setFlairOverride(store, "track-marks", "blackbook", { bloomResponse: 0.1 });
    // Switching to blackbook and back to wall (no writes on wall in between) must still show wall's own earlier tweak.
    expect(getFlairOverride(store, "track-marks", "wall")).toEqual({ flairAmount: 1.8 });
    expect(getFlairOverride(store, "track-marks", "blackbook")).toEqual({ bloomResponse: 0.1 });
  });

  it("Reset Property clears one property back to the mode default, leaving sibling properties and other modes untouched", () => {
    let store = setFlairOverride(EMPTY_FLAIR_OVERRIDES, "track-marks", "wild", { flairAmount: 2, bloomResponse: 0.5 });
    store = resetFlairProperty(store, "track-marks", "wild", "flairAmount");
    expect(getFlairOverride(store, "track-marks", "wild")).toEqual({ bloomResponse: 0.5 });
  });

  it("Reset Flair clears the WHOLE mode bundle at once, leaving other modes for the same brush untouched", () => {
    let store = setFlairOverride(EMPTY_FLAIR_OVERRIDES, "track-marks", "wall", { flairAmount: 2, flairRange: 3 });
    store = setFlairOverride(store, "track-marks", "blackbook", { flairSmoothing: 0.9 });
    store = resetFlairMode(store, "track-marks", "wall");
    expect(getFlairOverride(store, "track-marks", "wall")).toEqual({});
    expect(getFlairOverride(store, "track-marks", "blackbook")).toEqual({ flairSmoothing: 0.9 });
  });

  it("drops an entirely-empty brush entry from the store once its last mode is reset, without touching other brushes", () => {
    let store = setFlairOverride(EMPTY_FLAIR_OVERRIDES, "track-marks", "wall", { flairAmount: 2 });
    store = setFlairOverride(store, "pink-dot-fat", "wall", { flairAmount: 0.5 });
    store = resetFlairMode(store, "track-marks", "wall");
    expect(store["track-marks"]).toBeUndefined();
    expect(getFlairOverride(store, "pink-dot-fat", "wall")).toEqual({ flairAmount: 0.5 });
  });

  it("isFlairPropertyModified / isFlairModeModified reflect override presence accurately", () => {
    const override = { flairAmount: 2 };
    expect(isFlairPropertyModified(override, "flairAmount")).toBe(true);
    expect(isFlairPropertyModified(override, "flairRange")).toBe(false);
    expect(isFlairModeModified(override)).toBe(true);
    expect(isFlairModeModified({})).toBe(false);
  });
});

describe("getFlairPropertyRows -- pure row descriptors for Brush Studio's FLAIR group", () => {
  it("returns exactly the five brief-named controls, each carrying its effective value and modified flag", () => {
    const effective = resolveEffectiveFlairParams("wall", { flairAmount: 2 });
    const rows = getFlairPropertyRows(effective, { flairAmount: 2 });
    expect(rows.map((row) => row.key).sort()).toEqual(
      ["bloomResponse", "flairAmount", "flairRange", "flairSmoothing", "outputFalloff"].sort(),
    );
    const amountRow = rows.find((row) => row.key === "flairAmount")!;
    expect(amountRow.value).toBe(2);
    expect(amountRow.modified).toBe(true);
    const rangeRow = rows.find((row) => row.key === "flairRange")!;
    expect(rangeRow.modified).toBe(false);
  });

  it("every row's value stays within its own declared min/max bounds for every mode's canonical defaults", () => {
    for (const mode of ["wall", "blackbook", "wild"] as const) {
      const effective = resolveEffectiveFlairParams(mode, {});
      for (const row of getFlairPropertyRows(effective, {})) {
        expect(row.value).toBeGreaterThanOrEqual(row.min);
        expect(row.value).toBeLessThanOrEqual(row.max);
      }
    }
  });
});
