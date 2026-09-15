import { describe, expect, it } from "vitest";
import {
  buildSprayBrushList,
  findSprayBrushPreset,
  groupMarkerVariantsByFamily,
  groupSprayPresetsByFamily,
  markerFamilyFor,
  provenanceLabel,
} from "./BrushStudio";
import { addCustomSprayBrush, duplicateSprayBrush, EMPTY_CUSTOM_SPRAY_REGISTRY } from "./CustomBrush";
import { MARKER_VARIANTS } from "./PaintMarkerEngine";
import { getSprayCapPreset, SPRAY_CAP_PRESETS } from "./SprayCapPresets";

describe("Brush Studio brush-list grouping (Spray and Marker each expose their own brushes)", () => {
  it("groups every built-in Spray cap into Fat/Thin/Specialty, in that order, with none dropped or duplicated", () => {
    const groups = groupSprayPresetsByFamily(SPRAY_CAP_PRESETS);
    expect(groups.map((g) => g.family)).toEqual(["fat", "thin", "specialty"]);
    const total = groups.reduce((sum, g) => sum + g.presets.length, 0);
    expect(total).toBe(SPRAY_CAP_PRESETS.length);
    const allIds = groups.flatMap((g) => g.presets.map((p) => p.id));
    expect(new Set(allIds).size).toBe(SPRAY_CAP_PRESETS.length);
  });

  it("groups every Marker variant into Round/Chisel/Mop with none dropped or duplicated", () => {
    const groups = groupMarkerVariantsByFamily(MARKER_VARIANTS);
    expect(groups.map((g) => g.family)).toEqual(["round", "chisel", "mop"]);
    const total = groups.reduce((sum, g) => sum + g.variants.length, 0);
    expect(total).toBe(MARKER_VARIANTS.length);
  });

  it("classifies each marker variant id into its family correctly", () => {
    expect(markerFamilyFor("round")).toBe("round");
    expect(markerFamilyFor("chisel")).toBe("chisel");
    expect(markerFamilyFor("clean-chisel")).toBe("chisel");
    expect(markerFamilyFor("drippy-chisel")).toBe("chisel");
    expect(markerFamilyFor("mop")).toBe("mop");
    expect(markerFamilyFor("drip-mop")).toBe("mop");
  });

  it("builds the Spray brush list with no Custom group when nothing has been duplicated", () => {
    const groups = buildSprayBrushList(SPRAY_CAP_PRESETS, EMPTY_CUSTOM_SPRAY_REGISTRY);
    expect(groups.map((g) => g.key)).toEqual(["fat", "thin", "specialty"]);
  });

  it("appends a Custom group, correctly classified, once a brush has been duplicated", () => {
    const custom = duplicateSprayBrush(getSprayCapPreset("needle"), "My Jet");
    const registry = addCustomSprayBrush(EMPTY_CUSTOM_SPRAY_REGISTRY, custom);
    const groups = buildSprayBrushList(SPRAY_CAP_PRESETS, registry);
    expect(groups.map((g) => g.key)).toEqual(["fat", "thin", "specialty", "custom"]);
    const customGroup = groups[groups.length - 1];
    expect(customGroup.entries).toHaveLength(1);
    expect(customGroup.entries[0]).toMatchObject({ id: custom.preset.id, isCustom: true, provenance: "custom-studio-brush" });
  });

  it("labels every provenance value distinctly", () => {
    expect(provenanceLabel("physical-reference")).not.toBe(provenanceLabel("digital-effect"));
    expect(provenanceLabel("digital-effect")).not.toBe(provenanceLabel("custom-studio-brush"));
    expect(provenanceLabel("physical-reference")).not.toBe(provenanceLabel("custom-studio-brush"));
  });

  it("findSprayBrushPreset resolves both built-in and custom ids, and returns undefined for neither", () => {
    const custom = duplicateSprayBrush(getSprayCapPreset("soft-fade"), "House Mist");
    const registry = addCustomSprayBrush(EMPTY_CUSTOM_SPRAY_REGISTRY, custom);
    expect(findSprayBrushPreset(SPRAY_CAP_PRESETS, registry, "needle")?.id).toBe("needle");
    expect(findSprayBrushPreset(SPRAY_CAP_PRESETS, registry, custom.preset.id)?.id).toBe(custom.preset.id);
    expect(findSprayBrushPreset(SPRAY_CAP_PRESETS, registry, "not-a-real-id")).toBeUndefined();
  });
});
