import { describe, expect, it } from "vitest";
import { getSprayCapPreset, mapVelocityToDensity, resolveSprayDynamics, SPRAY_CAP_PRESETS } from "./SprayCapPresets";

describe("spray cap presets", () => {
  it("defines all eleven graffiti cap families plus the Fuzz Fat effect cap", () => {
    expect(SPRAY_CAP_PRESETS).toHaveLength(12);
    expect(SPRAY_CAP_PRESETS.map((preset) => preset.id)).toEqual([
      "new-york-fat", "pink-dot-fat", "astro-fat", "german-fat",
      "lego-thin", "universal-thin", "level-1", "new-york-thin",
      "calligraphy", "needle", "soft-fade", "fuzz-fat",
    ]);
    expect(new Set(SPRAY_CAP_PRESETS.map((preset) => preset.family))).toEqual(new Set(["fat", "thin", "specialty"]));
  });

  it("forks fuzz-fat from german-fat's exact current numeric behavior without disturbing german-fat", () => {
    const germanFat = getSprayCapPreset("german-fat");
    const fuzzFat = getSprayCapPreset("fuzz-fat");

    expect(fuzzFat.id).toBe("fuzz-fat");
    expect(fuzzFat.name).toBe("Fuzz Fat");
    expect(fuzzFat.family).toBe("specialty");
    expect(germanFat.id).toBe("german-fat");
    expect(germanFat.family).toBe("fat");

    const { id: _fuzzId, name: _fuzzName, family: _fuzzFamily, ...fuzzRendering } = fuzzFat;
    const { id: _germanId, name: _germanName, family: _germanFamily, ...germanRendering } = germanFat;
    expect(fuzzRendering).toEqual(germanRendering);

    expect(resolveSprayDynamics(fuzzFat, 0.3, 38)).toEqual(resolveSprayDynamics(germanFat, 0.3, 38));
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
