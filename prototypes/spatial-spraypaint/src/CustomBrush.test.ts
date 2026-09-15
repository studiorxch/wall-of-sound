import { describe, expect, it } from "vitest";
import {
  addCustomSprayBrush,
  classifyBuiltInSprayCap,
  classifySprayCapId,
  createCustomSprayBrushId,
  duplicateSprayBrush,
  EMPTY_CUSTOM_SPRAY_REGISTRY,
  findCustomSprayBrush,
  isCustomSprayCapId,
  renameCustomSprayBrush,
  updateCustomSprayBrush,
} from "./CustomBrush";
import { getSprayCapPreset, SPRAY_CAP_PRESETS } from "./SprayCapPresets";

describe("Spray brush provenance classification", () => {
  it("classifies every built-in cap as physical-reference or digital-effect, never custom", () => {
    for (const preset of SPRAY_CAP_PRESETS) {
      const provenance = classifyBuiltInSprayCap(preset.id);
      expect(["physical-reference", "digital-effect"]).toContain(provenance);
    }
  });

  it("classifies Fuzz Fat and Wiggly Needle as digital effects, not physical references", () => {
    expect(classifyBuiltInSprayCap("fuzz-fat")).toBe("digital-effect");
    expect(classifyBuiltInSprayCap("wiggly-needle")).toBe("digital-effect");
  });

  it("classifies Ring/Donut and Dry/Streak as digital-effect output archetypes, never physical-reference", () => {
    expect(classifyBuiltInSprayCap("ring-donut")).toBe("digital-effect");
    expect(classifyBuiltInSprayCap("dry-streak")).toBe("digital-effect");
    expect(classifySprayCapId("ring-donut")).toBe("digital-effect");
    expect(classifySprayCapId("dry-streak")).toBe("digital-effect");
  });

  it("classifies the rest of the built-in set as physical-reference caps", () => {
    expect(classifyBuiltInSprayCap("new-york-fat")).toBe("physical-reference");
    expect(classifyBuiltInSprayCap("calligraphy")).toBe("physical-reference");
    expect(classifyBuiltInSprayCap("transversal-slot")).toBe("physical-reference");
    expect(classifyBuiltInSprayCap("needle")).toBe("physical-reference");
  });

  it("classifies any custom-prefixed id as a custom studio brush via classifySprayCapId", () => {
    const customId = createCustomSprayBrushId();
    expect(isCustomSprayCapId(customId)).toBe(true);
    expect(classifySprayCapId(customId)).toBe("custom-studio-brush");
    expect(classifySprayCapId("needle")).toBe("physical-reference");
    expect(classifySprayCapId("fuzz-fat")).toBe("digital-effect");
  });
});

describe("Custom Spray brush duplication", () => {
  it("duplicates a built-in preset into a new custom identity without mutating the source", () => {
    const source = getSprayCapPreset("pink-dot-fat");
    const sourceSnapshot = { ...source };
    const custom = duplicateSprayBrush(source, "My Loaded Dot");

    expect(source).toEqual(sourceSnapshot);
    expect(custom.preset.id).not.toBe(source.id);
    expect(isCustomSprayCapId(custom.preset.id)).toBe(true);
    expect(custom.preset.name).toBe("My Loaded Dot");
    expect(custom.sourceId).toBe("pink-dot-fat");
    // Every other field inherited exactly.
    const { id: _customId, name: _customName, ...customRest } = custom.preset;
    const { id: _sourceId, name: _sourceName, ...sourceRest } = source;
    expect(customRest).toEqual(sourceRest);
  });

  it("gives each duplicate a distinct id even from the same source, back to back", () => {
    const source = getSprayCapPreset("needle");
    const first = duplicateSprayBrush(source, "Jet A");
    const second = duplicateSprayBrush(source, "Jet B");
    expect(first.preset.id).not.toBe(second.preset.id);
  });

  it("can duplicate a custom brush again, still never mutating the original built-in source", () => {
    const source = getSprayCapPreset("calligraphy");
    const first = duplicateSprayBrush(source, "House Oval");
    const firstSnapshot = { ...first.preset };
    const second = duplicateSprayBrush(first.preset, "House Oval Wide", createCustomSprayBrushId());

    expect(first.preset).toEqual(firstSnapshot);
    expect(second.preset.id).not.toBe(first.preset.id);
    expect(second.sourceId).toBe(first.preset.id);
    expect(classifySprayCapId(second.preset.id)).toBe("custom-studio-brush");
  });

  it("renameCustomSprayBrush changes only the display name", () => {
    const custom = duplicateSprayBrush(getSprayCapPreset("astro-fat"), "Wide Fill");
    const renamed = renameCustomSprayBrush(custom, "Wide Fill V2");
    expect(renamed.preset.name).toBe("Wide Fill V2");
    expect(renamed.preset.id).toBe(custom.preset.id);
    expect(custom.preset.name).toBe("Wide Fill");
  });
});

describe("In-memory custom brush registry", () => {
  it("adds and finds custom brushes without mutating the registry array passed in", () => {
    const custom = duplicateSprayBrush(getSprayCapPreset("soft-fade"), "Studio Mist");
    const registry = addCustomSprayBrush(EMPTY_CUSTOM_SPRAY_REGISTRY, custom);
    expect(EMPTY_CUSTOM_SPRAY_REGISTRY).toHaveLength(0);
    expect(registry).toHaveLength(1);
    expect(findCustomSprayBrush(registry, custom.preset.id)).toEqual(custom);
  });

  it("updateCustomSprayBrush replaces one entry without disturbing the rest", () => {
    const a = duplicateSprayBrush(getSprayCapPreset("needle"), "A");
    const b = duplicateSprayBrush(getSprayCapPreset("level-1"), "B");
    let registry = addCustomSprayBrush(EMPTY_CUSTOM_SPRAY_REGISTRY, a);
    registry = addCustomSprayBrush(registry, b);
    const renamedA = renameCustomSprayBrush(a, "A renamed");
    registry = updateCustomSprayBrush(registry, a.preset.id, renamedA);
    expect(findCustomSprayBrush(registry, a.preset.id)?.preset.name).toBe("A renamed");
    expect(findCustomSprayBrush(registry, b.preset.id)?.preset.name).toBe("B");
  });
});
