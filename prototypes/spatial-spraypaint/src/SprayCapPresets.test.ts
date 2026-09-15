import { describe, expect, it } from "vitest";
import { getSprayCapPreset, mapVelocityToDensity, resolveSprayDynamics, SPRAY_CAP_PRESETS } from "./SprayCapPresets";

describe("spray cap presets", () => {
  it("defines all eleven graffiti cap families plus Rectangular Transversal, Fuzz Fat, Wiggly Needle, Ring/Donut, and Dry/Streak", () => {
    expect(SPRAY_CAP_PRESETS).toHaveLength(16);
    expect(SPRAY_CAP_PRESETS.map((preset) => preset.id)).toEqual([
      "new-york-fat", "pink-dot-fat", "astro-fat", "german-fat",
      "lego-thin", "universal-thin", "level-1", "new-york-thin",
      "calligraphy", "transversal-slot", "needle", "wiggly-needle", "soft-fade", "fuzz-fat",
      "ring-donut", "dry-streak",
    ]);
    expect(new Set(SPRAY_CAP_PRESETS.map((preset) => preset.family))).toEqual(new Set(["fat", "thin", "specialty"]));
  });

  it("forks fuzz-fat from german-fat's exact current RENDERING behavior without disturbing german-fat (defaultFillMode is the one deliberate exception — see below)", () => {
    const germanFat = getSprayCapPreset("german-fat");
    const fuzzFat = getSprayCapPreset("fuzz-fat");

    expect(fuzzFat.id).toBe("fuzz-fat");
    expect(fuzzFat.name).toBe("Fuzz Fat");
    expect(fuzzFat.family).toBe("specialty");
    expect(germanFat.id).toBe("german-fat");
    expect(germanFat.family).toBe("fat");

    const { id: _fuzzId, name: _fuzzName, family: _fuzzFamily, defaultFillMode: _fuzzFillMode, ...fuzzRendering } = fuzzFat;
    const { id: _germanId, name: _germanName, family: _germanFamily, defaultFillMode: _germanFillMode, ...germanRendering } = germanFat;
    expect(fuzzRendering).toEqual(germanRendering);

    expect(resolveSprayDynamics(fuzzFat, 0.3, 38)).toEqual(resolveSprayDynamics(germanFat, 0.3, 38));
  });

  it("keeps Fuzz Fat's Fill default OFF even though German/Hardcore Fat now defaults to Fill ON — a deliberate divergence, not drift: Fuzz Fat is a usage-mode fork exception, not a physics fork exception", () => {
    expect(getSprayCapPreset("fuzz-fat").defaultFillMode).toBe(false);
    expect(getSprayCapPreset("german-fat").defaultFillMode).toBe(true);
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

describe("Astro Fat vs. New York Fat differentiation", () => {
  it("gives Astro Fat a resolved core opacity meaningfully denser than New York Fat's, not just a wider radius", () => {
    const astro = resolveSprayDynamics(getSprayCapPreset("astro-fat"), 0.3, 62);
    const nyFat = resolveSprayDynamics(getSprayCapPreset("new-york-fat"), 0.3, 32);
    // Old baseline resolved to only ~1.09x here — barely distinguishable per unit area.
    expect(astro.coreOpacity).toBeGreaterThan(nyFat.coreOpacity * 1.3);
    expect(astro.corePasses).toBeGreaterThan(nyFat.corePasses);
  });

  it("gives Astro Fat a visibly wider, denser overspray field than New York Fat's", () => {
    const astro = resolveSprayDynamics(getSprayCapPreset("astro-fat"), 0.3, 62);
    const nyFat = resolveSprayDynamics(getSprayCapPreset("new-york-fat"), 0.3, 32);
    expect(astro.particleCount).toBeGreaterThan(nyFat.particleCount * 2);
    expect(astro.particleSpread).toBeGreaterThan(nyFat.particleSpread * 2);
  });

  it("gives Astro Fat a forceful punchy dwell/start character, distinct from New York Fat's more restrained settled one", () => {
    expect(getSprayCapPreset("astro-fat").endpointBehavior).toBe("punchy");
    expect(getSprayCapPreset("new-york-fat").endpointBehavior).toBe("settled");
  });

  it("keeps Astro Fat's core clearly hotter than Soft/Fade's despite a similar overspray breadth, so the two 'big broad' caps stay distinguishable", () => {
    const astro = resolveSprayDynamics(getSprayCapPreset("astro-fat"), 0.3, 62);
    const softFade = resolveSprayDynamics(getSprayCapPreset("soft-fade"), 0.3, 50);
    expect(astro.coreOpacity).toBeGreaterThan(softFade.coreOpacity * 4);
  });

  it("never gives Astro Fat a halo or ring field, so it can't duplicate Pink Dot Fat's or Ring/Donut's bloom mechanism", () => {
    const astro = getSprayCapPreset("astro-fat");
    expect(astro.haloRadius).toBe(0);
    expect(astro.haloOpacity).toBe(0);
    expect(astro.ringRadius).toBe(0);
  });

  it("does not raise Astro Fat's jitter/splatter into Fuzz Fat's raw/splattery territory", () => {
    const astro = getSprayCapPreset("astro-fat");
    const fuzz = getSprayCapPreset("fuzz-fat");
    expect(astro.jitter).toBeLessThan(fuzz.jitter);
    expect(astro.splatterProbability).toBeLessThan(fuzz.splatterProbability);
    expect(astro.endpointBehavior).not.toBe("raw");
  });

  it("preserves New York Fat's exact numbers — the controlled baseline this task differentiated Astro away from, not vice versa", () => {
    const nyFat = getSprayCapPreset("new-york-fat");
    expect(nyFat).toMatchObject({
      baseRadius: 32, coreDensity: 1.14, coreOpacity: 0.29, edgeFalloff: 0.7,
      particleCount: 18, particleSpread: 1.08, particleOpacity: 0.25,
      flowRate: 1.2, accumulationRate: 1.16, velocityResponse: 0.58,
      endpointBehavior: "settled", haloRadius: 0,
    });
  });
});

describe("Pink Dot Fat correction fields — distance-sensitive, oblique-flared, dab-spaced, center+ring halo", () => {
  it("gives Pink Dot Fat non-zero values for all four correction fields", () => {
    const pink = getSprayCapPreset("pink-dot-fat");
    expect(pink.haloDistanceGain).toBeGreaterThan(0);
    expect(pink.haloFlareAnisotropy).toBeGreaterThan(0);
    expect(pink.haloDabSpacing).toBeGreaterThan(0);
    expect(pink.haloRingBias).toBeGreaterThan(0);
  });

  it("gives every other cap all four correction fields at exactly 0", () => {
    for (const preset of SPRAY_CAP_PRESETS) {
      if (preset.id === "pink-dot-fat") continue;
      expect(preset.haloDistanceGain).toBe(0);
      expect(preset.haloFlareAnisotropy).toBe(0);
      expect(preset.haloDabSpacing).toBe(0);
      expect(preset.haloRingBias).toBe(0);
    }
  });

  it("leaves Pink Dot's core/overspray physics (coreDensity, coreOpacity, particleCount/Spread/Opacity, flowRate, accumulationRate) numerically untouched — this is a halo-only correction", () => {
    const pink = getSprayCapPreset("pink-dot-fat");
    expect(pink).toMatchObject({
      baseRadius: 42, coreDensity: 1.46, coreOpacity: 0.34, edgeFalloff: 0.76,
      particleCount: 26, particleSpread: 1.2, particleOpacity: 0.29,
      flowRate: 1.48, accumulationRate: 1.38, velocityResponse: 0.42,
      endpointBehavior: "punchy", haloRadius: 2.4, haloOpacity: 0.05,
    });
  });

  it("keeps Pink Dot structurally distinct from Ring/Donut — Pink Dot's core opacity stays fully opaque-capable (no hollow center field), unlike Ring/Donut's deliberately low centerOpacity", () => {
    const pink = getSprayCapPreset("pink-dot-fat");
    const ring = getSprayCapPreset("ring-donut");
    expect(pink.depositionShape).toBe("line");
    expect(pink.ringRadius).toBe(0);
    expect(ring.depositionShape).toBe("ring");
    expect(ring.centerOpacity).toBeLessThan(ring.ringOpacity);
  });
});
