import { describe, expect, it } from "vitest";
import {
  getSprayCapPreset,
  mapVelocityToDensity,
  resolveSprayDynamics,
  SPRAY_CAP_PRESETS,
} from "./SprayCapPresets";

describe("spray cap presets", () => {
  it("resolves all five data-driven cap personalities", () => {
    expect(SPRAY_CAP_PRESETS.map((preset) => preset.id)).toEqual([
      "fat",
      "skinny",
      "soft",
      "high-pressure",
      "dust-fog",
    ]);
    expect(getSprayCapPreset("skinny").name).toBe("Skinny Cap");
    expect(getSprayCapPreset("unknown").id).toBe("fat");
  });

  it("maps slower movement to denser accumulation", () => {
    expect(mapVelocityToDensity(0, 1)).toBeGreaterThan(mapVelocityToDensity(1.5, 1));
    expect(mapVelocityToDensity(10, 1)).toBeGreaterThanOrEqual(0.55);
  });

  it("makes high pressure stronger than skinny and dust visibly mistier", () => {
    const high = resolveSprayDynamics(getSprayCapPreset("high-pressure"), 0.3, 34);
    const fat = resolveSprayDynamics(getSprayCapPreset("fat"), 0.3, 38);
    const skinny = resolveSprayDynamics(getSprayCapPreset("skinny"), 0.3, 12);
    const dust = resolveSprayDynamics(getSprayCapPreset("dust-fog"), 0.3, 54);

    expect(high.corePasses).toBeGreaterThan(skinny.corePasses);
    expect(high.coreOpacity).toBeGreaterThan(skinny.coreOpacity);
    expect(high.coreOpacity).toBeGreaterThan(fat.coreOpacity);
    expect(high.particleCount).toBeGreaterThan(fat.particleCount);
    expect(fat.coreOpacity).toBeGreaterThan(skinny.coreOpacity);
    expect(dust.particleSpread).toBeGreaterThan(high.particleSpread);
    expect(dust.coreOpacity).toBeLessThan(skinny.coreOpacity);
  });
});
