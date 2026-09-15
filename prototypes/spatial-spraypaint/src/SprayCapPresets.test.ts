import { describe, expect, it } from "vitest";
import { getSprayCapPreset, mapVelocityToDensity, resolveSprayDynamics, SPRAY_CAP_PRESETS } from "./SprayCapPresets";

describe("spray cap presets", () => {
  it("defines all eleven graffiti cap families plus the Fuzz Fat and Wiggly Needle effect caps", () => {
    expect(SPRAY_CAP_PRESETS).toHaveLength(13);
    expect(SPRAY_CAP_PRESETS.map((preset) => preset.id)).toEqual([
      "new-york-fat", "pink-dot-fat", "astro-fat", "german-fat",
      "lego-thin", "universal-thin", "level-1", "new-york-thin",
      "calligraphy", "needle", "wiggly-needle", "soft-fade", "fuzz-fat",
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

  it("gives Pink Dot Fat a halo/loaded-dot identity that New York Fat does not have", () => {
    const pink = getSprayCapPreset("pink-dot-fat");
    const newYork = getSprayCapPreset("new-york-fat");
    expect(pink.haloRadius).toBeGreaterThan(0);
    expect(pink.haloOpacity).toBeGreaterThan(0);
    expect(newYork.haloRadius).toBe(0);
    expect(newYork.haloOpacity).toBe(0);
    // Pink Dot's center is already denser/louder than New York Fat's, before the halo is added on top.
    expect(pink.coreDensity).toBeGreaterThan(newYork.coreDensity);
    expect(pink.coreOpacity).toBeGreaterThan(newYork.coreOpacity);
  });

  it("forks wiggly-needle from needle's exact deposition, adding only a bounded deterministic wiggle", () => {
    const needle = getSprayCapPreset("needle");
    const wiggly = getSprayCapPreset("wiggly-needle");

    expect(wiggly.id).toBe("wiggly-needle");
    expect(wiggly.family).toBe("specialty");
    expect(needle.wiggleAmplitude).toBe(0);
    expect(wiggly.wiggleAmplitude).toBeGreaterThan(0);
    expect(wiggly.wiggleFrequency).toBeGreaterThan(0);

    const { wiggleAmplitude: _needleWiggle, wiggleFrequency: _needleFreq, id: _needleId, name: _needleName, family: _needleFamily, ...needleRest } = needle;
    const { wiggleAmplitude: _wigglyWiggle, wiggleFrequency: _wigglyFreq, id: _wigglyId, name: _wigglyName, family: _wigglyFamily, ...wigglyRest } = wiggly;
    expect(wigglyRest).toEqual(needleRest);
    expect(resolveSprayDynamics(wiggly, 0.3, 5)).toEqual(resolveSprayDynamics(needle, 0.3, 5));
  });
});
