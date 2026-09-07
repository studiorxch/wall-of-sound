import { describe, expect, it } from "vitest";
import { getSprayCapPreset, mapVelocityToDensity, resolveSprayDynamics, SPRAY_CAP_PRESETS } from "./SprayCapPresets";

describe("spray cap presets", () => {
  it("defines all eleven graffiti cap families", () => {
    expect(SPRAY_CAP_PRESETS).toHaveLength(11);
    expect(SPRAY_CAP_PRESETS.map((preset) => preset.id)).toEqual([
      "new-york-fat", "pink-dot-fat", "astro-fat", "german-fat",
      "lego-thin", "universal-thin", "level-1", "new-york-thin",
      "calligraphy", "needle", "soft-fade",
    ]);
    expect(new Set(SPRAY_CAP_PRESETS.map((preset) => preset.family))).toEqual(new Set(["fat", "thin", "specialty"]));
  });

  it("keeps legacy preset links mapped to the new authority", () => {
    expect(getSprayCapPreset("fat").id).toBe("new-york-fat");
    expect(getSprayCapPreset("skinny").id).toBe("universal-thin");
    expect(getSprayCapPreset("unknown").id).toBe("new-york-fat");
  });

  it("maps slower movement to denser accumulation", () => {
    expect(mapVelocityToDensity(0, 1)).toBeGreaterThan(mapVelocityToDensity(1.5, 1));
    expect(mapVelocityToDensity(10, 1)).toBeGreaterThanOrEqual(0.58);
  });

  it("gives caps materially different deposition personalities", () => {
    const pink = resolveSprayDynamics(getSprayCapPreset("pink-dot-fat"), 0.3, 42);
    const thin = resolveSprayDynamics(getSprayCapPreset("level-1"), 0.3, 6);
    const soft = resolveSprayDynamics(getSprayCapPreset("soft-fade"), 0.3, 50);
    const needle = resolveSprayDynamics(getSprayCapPreset("needle"), 0.3, 5);
    const calligraphy = resolveSprayDynamics(getSprayCapPreset("calligraphy"), 0.3, 25);

    expect(pink.corePasses).toBeGreaterThan(thin.corePasses);
    expect(pink.coreOpacity).toBeGreaterThan(soft.coreOpacity);
    expect(soft.particleSpread).toBeGreaterThan(pink.particleSpread);
    expect(needle.splatterProbability).toBeGreaterThan(thin.splatterProbability);
    expect(calligraphy.anisotropy).toBeLessThan(1);
  });
});
