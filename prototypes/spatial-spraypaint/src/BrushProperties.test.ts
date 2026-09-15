import { describe, expect, it } from "vitest";
import {
  EMPTY_SPRAY_OVERRIDES,
  getSprayOverride,
  getSprayPropertyGroups,
  isSprayBrushModified,
  isSprayPropertyModified,
  resetSprayBrush,
  resetSprayProperty,
  resolveEffectiveSprayStyle,
  setSprayOverride,
  type SprayOverrideStore,
} from "./BrushProperties";
import { getSprayCapPreset } from "./SprayCapPresets";

describe("Spray brush property override model (PRESET DEFAULT -> SESSION MODIFICATION -> EFFECTIVE VALUE)", () => {
  it("resolves effective style straight from the preset when there is no override", () => {
    const needle = getSprayCapPreset("needle");
    const effective = resolveEffectiveSprayStyle(needle, {});
    expect(effective).toEqual({ size: needle.baseRadius, coverage: 1, fillMode: needle.defaultFillMode });
    expect(effective.fillMode).toBe(false);
  });

  it("respects each brush's own defaultFillMode when selected fresh, with no override", () => {
    for (const preset of [getSprayCapPreset("new-york-thin"), getSprayCapPreset("calligraphy"), getSprayCapPreset("needle")]) {
      expect(resolveEffectiveSprayStyle(preset, {}).fillMode).toBe(preset.defaultFillMode);
    }
  });

  it("lets a session override win over the preset default", () => {
    const cap = getSprayCapPreset("new-york-fat");
    const effective = resolveEffectiveSprayStyle(cap, { size: 50, coverage: 0.4, fillMode: true });
    expect(effective).toEqual({ size: 50, coverage: 0.4, fillMode: true });
  });

  it("setSprayOverride never mutates the store passed in, and leaves other brushes' entries untouched", () => {
    const original: SprayOverrideStore = { "new-york-fat": { size: 40 } };
    const next = setSprayOverride(original, "pink-dot-fat", { fillMode: true });
    expect(original).toEqual({ "new-york-fat": { size: 40 } });
    expect(next).not.toBe(original);
    expect(getSprayOverride(next, "new-york-fat")).toEqual({ size: 40 });
    expect(getSprayOverride(next, "pink-dot-fat")).toEqual({ fillMode: true });
  });

  it("changing Fill on one brush does not mutate another brush's stored override", () => {
    let store = setSprayOverride(EMPTY_SPRAY_OVERRIDES, "needle", { fillMode: true });
    store = setSprayOverride(store, "calligraphy", { fillMode: false });
    expect(getSprayOverride(store, "needle")).toEqual({ fillMode: true });
    expect(getSprayOverride(store, "calligraphy")).toEqual({ fillMode: false });
    // A brush never touched keeps falling back to its own preset default.
    const untouched = getSprayCapPreset("soft-fade");
    expect(resolveEffectiveSprayStyle(untouched, getSprayOverride(store, "soft-fade")).fillMode).toBe(
      untouched.defaultFillMode,
    );
  });

  it("merges a patch into an existing override without dropping other properties on the same brush", () => {
    let store = setSprayOverride(EMPTY_SPRAY_OVERRIDES, "astro-fat", { size: 70 });
    store = setSprayOverride(store, "astro-fat", { coverage: 0.5 });
    expect(getSprayOverride(store, "astro-fat")).toEqual({ size: 70, coverage: 0.5 });
  });

  it("resetSprayProperty clears one property and restores the preset default, keeping siblings", () => {
    let store = setSprayOverride(EMPTY_SPRAY_OVERRIDES, "needle", { size: 12, fillMode: true });
    store = resetSprayProperty(store, "needle", "size");
    expect(getSprayOverride(store, "needle")).toEqual({ fillMode: true });
    const needle = getSprayCapPreset("needle");
    expect(resolveEffectiveSprayStyle(needle, getSprayOverride(store, "needle")).size).toBe(needle.baseRadius);
  });

  it("resetSprayProperty drops the store entry entirely once its last property is cleared", () => {
    let store = setSprayOverride(EMPTY_SPRAY_OVERRIDES, "needle", { size: 12 });
    store = resetSprayProperty(store, "needle", "size");
    expect(store).not.toHaveProperty("needle");
  });

  it("resetSprayProperty is a no-op when nothing was overridden", () => {
    const store = resetSprayProperty(EMPTY_SPRAY_OVERRIDES, "needle", "size");
    expect(store).toBe(EMPTY_SPRAY_OVERRIDES);
  });

  it("resetSprayBrush clears every property for that brush in one call, leaving other brushes alone", () => {
    let store = setSprayOverride(EMPTY_SPRAY_OVERRIDES, "needle", { size: 12, coverage: 0.5, fillMode: true });
    store = setSprayOverride(store, "astro-fat", { size: 70 });
    store = resetSprayBrush(store, "needle");
    expect(store).not.toHaveProperty("needle");
    expect(getSprayOverride(store, "astro-fat")).toEqual({ size: 70 });
  });

  it("tracks per-property and per-brush modified state", () => {
    const override = { size: 40 };
    expect(isSprayPropertyModified(override, "size")).toBe(true);
    expect(isSprayPropertyModified(override, "coverage")).toBe(false);
    expect(isSprayBrushModified(override)).toBe(true);
    expect(isSprayBrushModified({})).toBe(false);
  });

  it("getSprayPropertyGroups exposes GENERAL as editable and SHAPE/PAINT/MOTION as informational readouts with real runtime values", () => {
    const needle = getSprayCapPreset("needle");
    const effective = resolveEffectiveSprayStyle(needle, { size: 8 });
    const groups = getSprayPropertyGroups(needle, effective, { size: 8 });

    const size = groups.general.find((row) => row.key === "size");
    expect(size).toMatchObject({ kind: "editable-number", value: 8, modified: true });
    const fill = groups.general.find((row) => row.key === "fillMode");
    expect(fill).toMatchObject({ kind: "editable-boolean", value: false, modified: false });

    expect(groups.shape.every((row) => row.kind === "readonly")).toBe(true);
    expect(groups.paint.every((row) => row.kind === "readonly")).toBe(true);
    expect(groups.motion.every((row) => row.kind === "readonly")).toBe(true);

    const coreOpacity = groups.paint.find((row) => row.key === "coreOpacity");
    expect(coreOpacity?.value).toBeCloseTo(needle.coreOpacity, 5);
    const wiggle = groups.motion.find((row) => row.key === "wiggleAmplitude");
    expect(wiggle?.value).toBe(needle.wiggleAmplitude);
  });

  it("gives Oval Calligraphy and Rectangular Transversal a real, differing SHAPE aspect-ratio readout", () => {
    const oval = getSprayCapPreset("calligraphy");
    const slot = getSprayCapPreset("transversal-slot");
    const ovalGroups = getSprayPropertyGroups(oval, resolveEffectiveSprayStyle(oval, {}), {});
    const slotGroups = getSprayPropertyGroups(slot, resolveEffectiveSprayStyle(slot, {}), {});
    const ovalAspect = ovalGroups.shape.find((row) => row.key === "aspectRatio")?.value as number;
    const slotAspect = slotGroups.shape.find((row) => row.key === "aspectRatio")?.value as number;
    expect(slotAspect).toBeGreaterThan(ovalAspect);
    expect(ovalGroups.shape.find((row) => row.key === "depositionShape")?.value).toBe("oval");
    expect(slotGroups.shape.find((row) => row.key === "depositionShape")?.value).toBe("slot");
  });

  it("gives a symmetric cap a shape readout with no directional aspect exaggeration", () => {
    const fat = getSprayCapPreset("new-york-fat");
    const groups = getSprayPropertyGroups(fat, resolveEffectiveSprayStyle(fat, {}), {});
    expect(groups.shape.find((row) => row.key === "orientationAngle")?.value).toBe("symmetric");
    expect(groups.shape.find((row) => row.key === "aspectRatio")?.value).toBe(1);
  });

  it("defaults Ring/Donut and Dry/Streak Fill mode to off, same mechanism as every other brush", () => {
    const ring = getSprayCapPreset("ring-donut");
    const streak = getSprayCapPreset("dry-streak");
    expect(ring.defaultFillMode).toBe(false);
    expect(streak.defaultFillMode).toBe(false);
    expect(resolveEffectiveSprayStyle(ring, {}).fillMode).toBe(false);
    expect(resolveEffectiveSprayStyle(streak, {}).fillMode).toBe(false);
  });

  it("keeps Ring/Donut and Dry/Streak property overrides fully independent, like any other pair of brushes", () => {
    let store = setSprayOverride(EMPTY_SPRAY_OVERRIDES, "ring-donut", { size: 60, fillMode: true });
    store = setSprayOverride(store, "dry-streak", { size: 10 });
    expect(getSprayOverride(store, "ring-donut")).toEqual({ size: 60, fillMode: true });
    expect(getSprayOverride(store, "dry-streak")).toEqual({ size: 10 });
  });
});
