import { describe, expect, it } from "vitest";
import { getSprayCapProfile } from "./SprayCapProfile";
import { getSprayCapPreset, resolveSprayDynamics, SPRAY_CAP_PRESETS } from "./SprayCapPresets";

describe("spray cap calibration profile", () => {
  it("describes every existing cap without adding a second deposition authority", () => {
    const profiles = SPRAY_CAP_PRESETS.map(({ id }) => getSprayCapProfile(id));
    expect(profiles).toHaveLength(13);
    expect(profiles.map(({ id }) => id)).toEqual(SPRAY_CAP_PRESETS.map(({ id }) => id));
    for (const profile of profiles) {
      expect(profile.deposition).toBe(getSprayCapPreset(profile.id));
      expect(profile.nominalWidthRange.maximum).toBeGreaterThan(profile.nominalWidthRange.minimum);
      expect(profile.calibrationStatus).toBe("digital-baseline-not-physical-reference");
      expect(profile.calibrationNotes.length).toBeGreaterThan(20);
      expect(profile.distanceResponse).toContain("pending-physical-calibration");
      expect(profile.cursorFootprint.coverageScale).toBeGreaterThanOrEqual(1);
      expect(profile.cursorFootprint.aspectRatio).toBe(profile.deposition.anisotropy);
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

  it("gives Fuzz Fat a distinct specialty identity while its deposition matches german-fat exactly", () => {
    const fuzzFat = getSprayCapProfile("fuzz-fat");
    const germanFat = getSprayCapProfile("german-fat");

    expect(fuzzFat.id).toBe("fuzz-fat");
    expect(fuzzFat.name).toBe("Fuzz Fat");
    expect(fuzzFat.family).toBe("specialty");
    expect(fuzzFat.calibrationNotes).not.toBe(germanFat.calibrationNotes);
    expect(fuzzFat.calibrationNotes).toContain("effect cap");

    expect(fuzzFat.deposition).not.toBe(germanFat.deposition);
    const { id: _fuzzId, name: _fuzzName, family: _fuzzFamily, ...fuzzDeposition } = fuzzFat.deposition;
    const { id: _germanId, name: _germanName, family: _germanFamily, ...germanDeposition } = germanFat.deposition;
    expect(fuzzDeposition).toEqual(germanDeposition);

    expect(resolveSprayDynamics(fuzzFat.deposition, 0.72, 31)).toEqual(
      resolveSprayDynamics(germanFat.deposition, 0.72, 31),
    );
  });

  it("keeps the displayed digital-baseline width metadata separate from the rendering radius authority", () => {
    // These are the exact ranges hardcoded into the cap browser's metadata line;
    // a change here without an equal change in index.html is a drift the UI
    // would silently go stale on.
    const expectedRanges: Record<string, [number, number]> = {
      "new-york-fat": [24, 42],
      "pink-dot-fat": [34, 54],
      "astro-fat": [48, 78],
      "german-fat": [28, 50],
      "fuzz-fat": [28, 50],
      "level-1": [4, 9],
    };
    for (const [id, [minimum, maximum]] of Object.entries(expectedRanges)) {
      const profile = getSprayCapProfile(id);
      expect(profile.nominalWidthRange).toMatchObject({ minimum, maximum, unit: "wall-units-digital-baseline" });
      // The metadata is descriptive only — it is never read by resolveSprayDynamics,
      // which only ever sees deposition.baseRadius, so displaying it cannot move
      // the actual render width.
      expect(profile.deposition).not.toHaveProperty("nominalWidthRange");
    }
  });

  it("keeps aerosol calligraphy physically distinct from a marker nib", () => {
    const calligraphy = getSprayCapProfile("calligraphy");
    expect(calligraphy.coneShape).toBe("fan");
    expect(calligraphy.orientationBehavior).toBe("fixed-transversal");
    expect(calligraphy.calibrationNotes).toContain("aerosol");
    expect(calligraphy.calibrationNotes).toContain("Chisel marker nib");
    expect(calligraphy.cursorFootprint).toMatchObject({
      shape: "ellipse",
      aspectRatio: 0.32,
      orientationBehavior: "fixed-transversal",
    });
  });
});
