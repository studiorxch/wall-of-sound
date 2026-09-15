import { describe, expect, it } from "vitest";
import { getSprayCapPreset, mapVelocityToDensity, resolveSprayDynamics, SPRAY_CAP_PRESETS } from "./SprayCapPresets";

describe("spray cap presets", () => {
  it("defines all eleven graffiti cap families plus Rectangular Transversal, Fuzz Fat, and Wiggly Needle", () => {
    expect(SPRAY_CAP_PRESETS).toHaveLength(14);
    expect(SPRAY_CAP_PRESETS.map((preset) => preset.id)).toEqual([
      "new-york-fat", "pink-dot-fat", "astro-fat", "german-fat",
      "lego-thin", "universal-thin", "level-1", "new-york-thin",
      "calligraphy", "transversal-slot", "needle", "wiggly-needle", "soft-fade", "fuzz-fat",
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

  it("corrects Needle to a concentrated pinline jet: tight mist, hot core, not the old wide-spread fuzz", () => {
    const needle = getSprayCapPreset("needle");
    // The old fuzzy baseline: particleSpread 2.05 (the widest of any cap),
    // particleOpacity 0.3, particleCount 15, endpointBehavior "raw".
    expect(needle.particleSpread).toBeLessThan(1);
    expect(needle.particleOpacity).toBeLessThan(0.2);
    expect(needle.particleCount).toBeLessThan(15);
    expect(needle.endpointBehavior).not.toBe("raw");
    // Core stays hot/dense — this was never the problem, and should not regress.
    expect(needle.coreOpacity).toBeGreaterThanOrEqual(0.42);
    expect(needle.coreDensity).toBeGreaterThanOrEqual(1.58);
    // Normal Needle must not wiggle.
    expect(needle.wiggleAmplitude).toBe(0);
  });

  it("makes corrected Needle clearly distinct from Fuzz Fat and Soft/Fade, not just narrower", () => {
    const needle = getSprayCapPreset("needle");
    const fuzzFat = getSprayCapPreset("fuzz-fat");
    const softFade = getSprayCapPreset("soft-fade");

    // Fuzz Fat: raw/splattery dry-brush effect. Needle should no longer share its "raw" endpoint identity.
    expect(needle.endpointBehavior).not.toBe(fuzzFat.endpointBehavior);
    expect(needle.coreOpacity).toBeGreaterThan(fuzzFat.coreOpacity);
    expect(needle.particleSpread).toBeLessThan(fuzzFat.particleSpread);

    // Soft/Fade: weak center, broad mist — the opposite personality from a hot concentrated jet.
    expect(needle.coreOpacity).toBeGreaterThan(softFade.coreOpacity * 2);
    expect(needle.particleSpread).toBeLessThan(softFade.particleSpread);
    expect(needle.particleCount).toBeLessThan(softFade.particleCount);
  });

  it("gives Rectangular Transversal its own canonical id, stamped-slot deposition, and a stronger contrast than Oval Calligraphy", () => {
    const oval = getSprayCapPreset("calligraphy");
    const slot = getSprayCapPreset("transversal-slot");

    expect(oval.name).toBe("Oval Calligraphy");
    expect(oval.depositionShape).toBe("oval");
    expect(slot.id).toBe("transversal-slot");
    expect(slot.name).toBe("Rectangular Transversal");
    expect(slot.family).toBe("specialty");
    expect(slot.depositionShape).toBe("slot");

    // Both stay directional (anisotropy < 1); slot's overspray squash is stronger (lower anisotropy).
    expect(oval.anisotropy).toBeLessThan(1);
    expect(slot.anisotropy).toBeLessThan(oval.anisotropy);
    // Slot reads harder-edged / more mechanical than the oval's softer character.
    expect(slot.edgeFalloff).toBeGreaterThan(oval.edgeFalloff);

    // Never collapsed into one preset, and the old id was never renamed out from under replay.
    expect(oval.id).toBe("calligraphy");
    expect(getSprayCapPreset("calligraphy").id).toBe("calligraphy");
  });
});
