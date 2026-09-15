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

describe("Fat caps default to Fill ON (dense normal-mode Spray read as smooth solid monolines; Fill is the more characteristic fat-cap default)", () => {
  it("defaults New York Fat, Pink Dot Fat, Astro Fat, and German/Hardcore Fat to Fill ON with no override", () => {
    for (const id of ["new-york-fat", "pink-dot-fat", "astro-fat", "german-fat"]) {
      const preset = getSprayCapPreset(id);
      expect(preset.defaultFillMode).toBe(true);
      expect(resolveEffectiveSprayStyle(preset, {}).fillMode).toBe(true);
    }
  });

  it("does not automatically enable Fill for thin caps, Needle/Wiggly Needle, Calligraphy/Transversal, Soft/Fade, or Fuzz Fat", () => {
    for (const id of [
      "lego-thin", "universal-thin", "level-1", "new-york-thin",
      "needle", "wiggly-needle", "calligraphy", "transversal-slot",
      "soft-fade", "fuzz-fat",
    ]) {
      const preset = getSprayCapPreset(id);
      expect(preset.defaultFillMode).toBe(false);
      expect(resolveEffectiveSprayStyle(preset, {}).fillMode).toBe(false);
    }
  });

  it("leaves Ring/Donut and Dry/Streak's Fill default exactly as it already was — broad alone is not a reason for Fill ON, and Dry/Streak's own deliberately-under-loaded single-pass character is preserved", () => {
    expect(getSprayCapPreset("ring-donut").defaultFillMode).toBe(false);
    expect(getSprayCapPreset("dry-streak").defaultFillMode).toBe(false);
  });

  it("selecting a fat cap with no session modification resolves Fill ON without any manual toggle", () => {
    const astro = getSprayCapPreset("astro-fat");
    expect(resolveEffectiveSprayStyle(astro, getSprayOverride(EMPTY_SPRAY_OVERRIDES, astro.id)).fillMode).toBe(true);
  });

  it("manually turning Fill OFF on a fat cap is a per-brush session modification, not a preset change", () => {
    const store = setSprayOverride(EMPTY_SPRAY_OVERRIDES, "new-york-fat", { fillMode: false });
    expect(resolveEffectiveSprayStyle(getSprayCapPreset("new-york-fat"), getSprayOverride(store, "new-york-fat")).fillMode).toBe(false);
    // The preset default itself is untouched — a fresh brush (or a different session) still starts at ON.
    expect(getSprayCapPreset("new-york-fat").defaultFillMode).toBe(true);
  });

  it("switching to a different fat cap after disabling Fill on one does not leak that modification — the other cap uses its own default", () => {
    const store = setSprayOverride(EMPTY_SPRAY_OVERRIDES, "new-york-fat", { fillMode: false });
    expect(resolveEffectiveSprayStyle(getSprayCapPreset("new-york-fat"), getSprayOverride(store, "new-york-fat")).fillMode).toBe(false);
    expect(resolveEffectiveSprayStyle(getSprayCapPreset("astro-fat"), getSprayOverride(store, "astro-fat")).fillMode).toBe(true);
    expect(resolveEffectiveSprayStyle(getSprayCapPreset("pink-dot-fat"), getSprayOverride(store, "pink-dot-fat")).fillMode).toBe(true);
  });

  it("switching back to a previously-modified fat cap preserves its own per-brush modification (the store is keyed by cap id, not overwritten by browsing other caps)", () => {
    let store = setSprayOverride(EMPTY_SPRAY_OVERRIDES, "new-york-fat", { fillMode: false });
    store = setSprayOverride(store, "astro-fat", { size: 40 }); // browsing/modifying a different brush in between
    expect(resolveEffectiveSprayStyle(getSprayCapPreset("new-york-fat"), getSprayOverride(store, "new-york-fat")).fillMode).toBe(false);
  });

  it("Reset Brush restores Fill to ON for an affected fat cap, same mechanism as resetting any other property", () => {
    let store = setSprayOverride(EMPTY_SPRAY_OVERRIDES, "german-fat", { fillMode: false, size: 20 });
    store = resetSprayBrush(store, "german-fat");
    expect(getSprayOverride(store, "german-fat")).toEqual({});
    expect(resolveEffectiveSprayStyle(getSprayCapPreset("german-fat"), getSprayOverride(store, "german-fat")).fillMode).toBe(true);
  });

  it("resetting just the Fill property on a fat cap restores ON while leaving other overrides on that cap intact", () => {
    let store = setSprayOverride(EMPTY_SPRAY_OVERRIDES, "pink-dot-fat", { fillMode: false, size: 55 });
    store = resetSprayProperty(store, "pink-dot-fat", "fillMode");
    expect(getSprayOverride(store, "pink-dot-fat")).toEqual({ size: 55 });
    expect(resolveEffectiveSprayStyle(getSprayCapPreset("pink-dot-fat"), getSprayOverride(store, "pink-dot-fat")).fillMode).toBe(true);
  });
});

describe("Pink Dot Fat correction dials surfaced in Brush Studio's PAINT readout", () => {
  it("shows all four halo-correction fields as read-only diagnostics for Pink Dot Fat", () => {
    const pink = getSprayCapPreset("pink-dot-fat");
    const groups = getSprayPropertyGroups(pink, resolveEffectiveSprayStyle(pink, {}), {});
    for (const key of ["haloDistanceGain", "haloFlareAnisotropy", "haloDabSpacing", "haloRingBias"]) {
      const row = groups.paint.find((r) => r.key === key);
      expect(row).toBeDefined();
      expect(row?.kind).toBe("readonly");
      expect(row?.value).toBeGreaterThan(0);
    }
  });

  it("omits the halo-correction rows entirely for a cap with no halo (New York Fat)", () => {
    const nyFat = getSprayCapPreset("new-york-fat");
    const groups = getSprayPropertyGroups(nyFat, resolveEffectiveSprayStyle(nyFat, {}), {});
    for (const key of ["haloDistanceGain", "haloFlareAnisotropy", "haloDabSpacing", "haloRingBias"]) {
      expect(groups.paint.find((r) => r.key === key)).toBeUndefined();
    }
  });
});
