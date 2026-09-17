import { describe, expect, it } from "vitest";
import {
  isWetBrushProfile,
  resolveBrushProfile,
  setBrushProfileOverride,
  EMPTY_BRUSH_PROFILE_OVERRIDES,
} from "./BrushProfile";

describe("BrushProfile", () => {
  it("resolves all four brush families to the same shared canonical schema", () => {
    const spray = resolveBrushProfile("spray-can", "new-york-fat");
    const round = resolveBrushProfile("paint-marker", "round");
    const chisel = resolveBrushProfile("paint-marker", "chisel");
    const mop = resolveBrushProfile("paint-marker", "mop");

    for (const profile of [spray, round, chisel, mop]) {
      expect(typeof profile.size).toBe("number");
      expect(typeof profile.opacity).toBe("number");
      expect(typeof profile.drip.tendency).toBe("number");
      expect(typeof profile.drip.bodyWidth).toBe("number");
      expect(typeof profile.drip.taper).toBe("number");
      expect(typeof profile.drip.terminalBead).toBe("number");
      expect(typeof profile.drip.originPooling).toBe("number");
      expect(typeof profile.drip.sourceOpacityCeiling).toBe("number");
      expect(profile.footprint).toBeDefined();
      expect(["round", "chisel", "mop", "spray"]).toContain(profile.footprint.shape);
    }
  });

  it("only exposes wet-only properties (flow/viscosity/squeeze response) on a wet-capable brush -- null everywhere else", () => {
    const round = resolveBrushProfile("paint-marker", "round");
    const chisel = resolveBrushProfile("paint-marker", "chisel");
    const spray = resolveBrushProfile("spray-can", "new-york-fat");
    const mop = resolveBrushProfile("paint-marker", "mop");
    const dripMop = resolveBrushProfile("paint-marker", "drip-mop");

    expect(isWetBrushProfile(round)).toBe(false);
    expect(isWetBrushProfile(chisel)).toBe(false);
    expect(isWetBrushProfile(spray)).toBe(false);
    expect(isWetBrushProfile(mop)).toBe(true);
    expect(isWetBrushProfile(dripMop)).toBe(true);

    expect(mop.wet?.squeezeResponse).toBeGreaterThan(1);
    expect(round.wet).toBeNull();
    expect(chisel.wet).toBeNull();
    expect(spray.wet).toBeNull();
  });

  it("orders brush-specific drip tendency Round < Chisel < Mop, per the required default tuning", () => {
    const round = resolveBrushProfile("paint-marker", "round");
    const chisel = resolveBrushProfile("paint-marker", "chisel");
    const mop = resolveBrushProfile("paint-marker", "mop");
    expect(round.drip.tendency).toBeLessThan(chisel.drip.tendency);
    expect(chisel.drip.tendency).toBeLessThan(mop.drip.tendency);
  });

  it("gives Mop's profile a materially wider drip body and stronger origin pooling than Round/Chisel", () => {
    const round = resolveBrushProfile("paint-marker", "round");
    const chisel = resolveBrushProfile("paint-marker", "chisel");
    const mop = resolveBrushProfile("paint-marker", "mop");
    expect(mop.drip.bodyWidth).toBeGreaterThan(round.drip.bodyWidth);
    expect(mop.drip.bodyWidth).toBeGreaterThan(chisel.drip.bodyWidth);
    expect(mop.drip.originPooling).toBeGreaterThan(0);
    expect(round.drip.originPooling).toBe(0);
  });

  it("gives every brush a real filled-footprint descriptor distinct per family, for preview rendering (picker footprint comes from BrushProfile)", () => {
    const spray = resolveBrushProfile("spray-can", "new-york-fat");
    const round = resolveBrushProfile("paint-marker", "round");
    const chisel = resolveBrushProfile("paint-marker", "chisel");
    const mop = resolveBrushProfile("paint-marker", "mop");
    expect(spray.footprint.shape).toBe("spray");
    expect(round.footprint.shape).toBe("round");
    expect(chisel.footprint.shape).toBe("chisel");
    expect(mop.footprint.shape).toBe("mop");
    // Chisel reads as a flat, elongated footprint -- never circular.
    expect(chisel.footprint.aspectRatio).toBeGreaterThan(1.5);
  });

  it("resolves every real Spray cap and marker variant without falling back to a default", () => {
    const spray = resolveBrushProfile("spray-can", "pink-dot-fat");
    expect(spray.id).toBe("pink-dot-fat");
    const dripMop = resolveBrushProfile("paint-marker", "drip-mop");
    expect(dripMop.id).toBe("drip-mop");
    expect(dripMop.drip.tendency).toBe(1);
  });

  it("keeps the source-opacity ceiling equal to the brush's own effective opacity for every family (dripOpacity <= sourcePaintOpacityAtOrigin)", () => {
    for (const profile of [
      resolveBrushProfile("spray-can", "pink-dot-fat"),
      resolveBrushProfile("paint-marker", "round"),
      resolveBrushProfile("paint-marker", "chisel"),
      resolveBrushProfile("paint-marker", "mop"),
    ]) {
      expect(profile.drip.sourceOpacityCeiling).toBeLessThanOrEqual(profile.opacity);
      expect(profile.drip.sourceOpacityCeiling).toBeLessThanOrEqual(1);
    }
  });

  describe("BrushProfileOverrideStore -- the one writable truth", () => {
    it("leaves every brush at its computed default with an empty override store", () => {
      const round = resolveBrushProfile("paint-marker", "round", EMPTY_BRUSH_PROFILE_OVERRIDES);
      expect(round.opacity).toBeCloseTo(0.95, 5);
    });

    it("an opacity edit on one brush changes ONLY that brush's resolved profile, using the same store shape for every family", () => {
      let store = EMPTY_BRUSH_PROFILE_OVERRIDES;
      store = setBrushProfileOverride(store, "paint-marker", "round", { opacity: 0.4 });
      store = setBrushProfileOverride(store, "paint-marker", "chisel", { opacity: 0.6 });
      store = setBrushProfileOverride(store, "paint-marker", "mop", { opacity: 0.75 });
      store = setBrushProfileOverride(store, "spray-can", "new-york-fat", { opacity: 0.2 });

      expect(resolveBrushProfile("paint-marker", "round", store).opacity).toBeCloseTo(0.4, 5);
      expect(resolveBrushProfile("paint-marker", "chisel", store).opacity).toBeCloseTo(0.6, 5);
      expect(resolveBrushProfile("paint-marker", "mop", store).opacity).toBeCloseTo(0.75, 5);
      expect(resolveBrushProfile("spray-can", "new-york-fat", store).opacity).toBeCloseTo(0.2, 5);

      // Untouched brushes stay at their own defaults.
      expect(resolveBrushProfile("paint-marker", "drip-mop", store).opacity).toBeCloseTo(0.95, 5);
      expect(resolveBrushProfile("spray-can", "pink-dot-fat", store).opacity).not.toBeCloseTo(0.2, 5);
    });

    it("an opacity edit also lowers that brush's own drip source-opacity ceiling (the invariant tracks live edits, not just defaults)", () => {
      const store = setBrushProfileOverride(EMPTY_BRUSH_PROFILE_OVERRIDES, "paint-marker", "mop", { opacity: 0.3 });
      const mop = resolveBrushProfile("paint-marker", "mop", store);
      expect(mop.drip.sourceOpacityCeiling).toBeCloseTo(0.3, 5);
    });

    it("a drip tendency edit changes only the edited brush and is clamped to [0, 1]", () => {
      let store = setBrushProfileOverride(EMPTY_BRUSH_PROFILE_OVERRIDES, "paint-marker", "round", { dripTendency: 0.9 });
      expect(resolveBrushProfile("paint-marker", "round", store).drip.tendency).toBeCloseTo(0.9, 5);
      expect(resolveBrushProfile("paint-marker", "chisel", store).drip.tendency).not.toBeCloseTo(0.9, 5);

      store = setBrushProfileOverride(store, "paint-marker", "round", { dripTendency: 5 });
      expect(resolveBrushProfile("paint-marker", "round", store).drip.tendency).toBe(1);
    });
  });
});
