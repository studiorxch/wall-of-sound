import { describe, expect, it } from "vitest";
import { getSprayCapProfile } from "./SprayCapProfile";
import { getSprayCapPreset, resolveSprayDynamics, SPRAY_CAP_PRESETS } from "./SprayCapPresets";

describe("spray cap calibration profile", () => {
  it("describes every existing cap without adding a second deposition authority", () => {
    const profiles = SPRAY_CAP_PRESETS.map(({ id }) => getSprayCapProfile(id));
    expect(profiles).toHaveLength(11);
    expect(profiles.map(({ id }) => id)).toEqual(SPRAY_CAP_PRESETS.map(({ id }) => id));
    for (const profile of profiles) {
      expect(profile.deposition).toBe(getSprayCapPreset(profile.id));
      expect(profile.nominalWidthRange.maximum).toBeGreaterThan(profile.nominalWidthRange.minimum);
      expect(profile.calibrationStatus).toBe("digital-baseline-not-physical-reference");
      expect(profile.calibrationNotes.length).toBeGreaterThan(20);
      expect(profile.distanceResponse).toContain("pending-physical-calibration");
    }
  });

  it("keeps legacy aliases on the canonical cap profile", () => {
    expect(getSprayCapProfile("fat").id).toBe("new-york-fat");
    expect(getSprayCapProfile("skinny").id).toBe("universal-thin");
    expect(getSprayCapProfile("unknown").id).toBe("new-york-fat");
  });

  it("preserves calibrated Spray deposition and dynamics unchanged", () => {
    for (const preset of SPRAY_CAP_PRESETS) {
      const profile = getSprayCapProfile(preset.id);
      expect(profile.deposition).toBe(preset);
      expect(resolveSprayDynamics(profile.deposition, 0.72, 31)).toEqual(
        resolveSprayDynamics(preset, 0.72, 31),
      );
    }
  });

  it("keeps aerosol calligraphy physically distinct from a marker nib", () => {
    const calligraphy = getSprayCapProfile("calligraphy");
    expect(calligraphy.coneShape).toBe("fan");
    expect(calligraphy.orientationBehavior).toBe("fixed-transversal");
    expect(calligraphy.calibrationNotes).toContain("aerosol");
    expect(calligraphy.calibrationNotes).toContain("Chisel marker nib");
  });
});
