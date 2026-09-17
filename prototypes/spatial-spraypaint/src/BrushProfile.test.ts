import { describe, expect, it } from "vitest";
import { isWetBrushProfile, resolveBrushProfile } from "./BrushProfile";

describe("BrushProfile", () => {
  it("resolves all four brush families to the same shared shape", () => {
    const spray = resolveBrushProfile("spray-can", "new-york-fat");
    const round = resolveBrushProfile("paint-marker", "round");
    const chisel = resolveBrushProfile("paint-marker", "chisel");
    const mop = resolveBrushProfile("paint-marker", "mop");

    for (const profile of [spray, round, chisel, mop]) {
      expect(typeof profile.size).toBe("number");
      expect(typeof profile.opacity).toBe("number");
      expect(typeof profile.dripTendency).toBe("number");
      expect(typeof profile.dripBodyWidthRatio).toBe("number");
      expect(typeof profile.taperAmount).toBe("number");
      expect(typeof profile.terminalBeadRatio).toBe("number");
      expect(typeof profile.originPoolingRatio).toBe("number");
      expect(profile.previewFootprint).toBeDefined();
      expect(["round", "chisel", "mop", "spray"]).toContain(profile.previewFootprint.shape);
    }
  });

  it("only exposes wet-only properties (flow/viscosity/squeeze response) on a wet-capable brush", () => {
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
    expect(round.wet).toBeUndefined();
    expect(chisel.wet).toBeUndefined();
    expect(spray.wet).toBeUndefined();
  });

  it("orders brush-specific drip tendency Round < Chisel < Mop, per the required default tuning", () => {
    const round = resolveBrushProfile("paint-marker", "round");
    const chisel = resolveBrushProfile("paint-marker", "chisel");
    const mop = resolveBrushProfile("paint-marker", "mop");
    expect(round.dripTendency).toBeLessThan(chisel.dripTendency);
    expect(chisel.dripTendency).toBeLessThan(mop.dripTendency);
  });

  it("gives Mop's profile a materially wider drip body and stronger origin pooling than Round/Chisel", () => {
    const round = resolveBrushProfile("paint-marker", "round");
    const chisel = resolveBrushProfile("paint-marker", "chisel");
    const mop = resolveBrushProfile("paint-marker", "mop");
    expect(mop.dripBodyWidthRatio).toBeGreaterThan(round.dripBodyWidthRatio);
    expect(mop.dripBodyWidthRatio).toBeGreaterThan(chisel.dripBodyWidthRatio);
    expect(mop.originPoolingRatio).toBeGreaterThan(0);
    expect(round.originPoolingRatio).toBe(0);
  });

  it("gives every brush a real filled-footprint descriptor distinct per family, for preview rendering", () => {
    const spray = resolveBrushProfile("spray-can", "new-york-fat");
    const round = resolveBrushProfile("paint-marker", "round");
    const chisel = resolveBrushProfile("paint-marker", "chisel");
    const mop = resolveBrushProfile("paint-marker", "mop");
    expect(spray.previewFootprint.shape).toBe("spray");
    expect(round.previewFootprint.shape).toBe("round");
    expect(chisel.previewFootprint.shape).toBe("chisel");
    expect(mop.previewFootprint.shape).toBe("mop");
    // Chisel reads as a flat, elongated footprint -- never circular.
    expect(chisel.previewFootprint.aspectRatio).toBeGreaterThan(1.5);
  });

  it("resolves every real Spray cap and marker variant without falling back to a default", () => {
    const spray = resolveBrushProfile("spray-can", "pink-dot-fat");
    expect(spray.id).toBe("pink-dot-fat");
    const dripMop = resolveBrushProfile("paint-marker", "drip-mop");
    expect(dripMop.id).toBe("drip-mop");
    expect(dripMop.dripTendency).toBe(1);
  });
});
