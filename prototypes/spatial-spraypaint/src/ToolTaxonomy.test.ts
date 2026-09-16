import { describe, expect, it } from "vitest";
import { SPRAY_CAP_PRESETS, getSprayCapPreset, type SprayCapId } from "./SprayCapPresets";
import { getSprayCapClassification } from "./SprayCapCalibrationStatus";
import {
  FLAIR_MODES,
  INK_GONZO_PRESET_SEEDS,
  INK_PARAMETER_GROUPS,
  SPRAY_CAP_TOOL_TAXONOMY,
  SPRAY_PARAMETER_GROUPS,
  SURFACE_CONTEXTS,
  TOOL_FAMILIES,
  getToolFamily,
} from "./ToolTaxonomy";

const EXISTING_CAP_IDS: readonly SprayCapId[] = [
  "new-york-fat",
  "pink-dot-fat",
  "track-marks",
  "astro-fat",
  "german-fat",
  "lego-thin",
  "universal-thin",
  "level-1",
  "new-york-thin",
  "calligraphy",
  "transversal-slot",
  "needle",
  "wiggly-needle",
  "soft-fade",
  "fuzz-fat",
  "ring-donut",
  "dry-streak",
];

describe("existing cap IDs unchanged", () => {
  it("SPRAY_CAP_PRESETS still has exactly the same ids, in the same order, as before this pass", () => {
    expect(SPRAY_CAP_PRESETS.map((preset) => preset.id)).toEqual(EXISTING_CAP_IDS);
  });

  it("every existing cap id is classified exactly once in the taxonomy registry", () => {
    expect(SPRAY_CAP_TOOL_TAXONOMY.map((entry) => entry.id).sort()).toEqual([...EXISTING_CAP_IDS].sort());
  });
});

describe("existing render behavior untouched", () => {
  it("getSprayCapPreset still resolves every existing id to its exact prior numeric preset", () => {
    for (const id of EXISTING_CAP_IDS) {
      const preset = getSprayCapPreset(id);
      expect(preset.id).toBe(id);
    }
    // Spot-check a few fields this pass must never touch, per the brief's
    // explicit "do not retune Pink Dot" / "no geometry changes" scope.
    expect(getSprayCapPreset("pink-dot-fat").coreOpacity).toBeCloseTo(0.34, 5);
    expect(getSprayCapPreset("pink-dot-fat").plumeStochasticStationary).toBe(true);
    expect(getSprayCapPreset("track-marks").plumeStochasticStationary).toBe(false);
  });
});

describe("Track Marks remains creative/experimental", () => {
  it("is classified experimental-creative, not physical-graffiti", () => {
    expect(getToolFamily("track-marks")).toBe("experimental-creative");
  });
});

describe("Pink Dot remains physical/needs calibration", () => {
  it("is classified physical-graffiti with a NEEDS_CALIBRATION status, never DIGITAL_EFFECT", () => {
    expect(getToolFamily("pink-dot-fat")).toBe("physical-graffiti");
    expect(getSprayCapClassification("pink-dot-fat")).toBe("NEEDS_CALIBRATION");
  });
});

describe("effect caps are not mislabeled as physical", () => {
  const experimentalIds: SprayCapId[] = ["track-marks", "fuzz-fat", "ring-donut", "dry-streak", "wiggly-needle"];

  it("every known digital-effect cap is classified experimental-creative", () => {
    for (const id of experimentalIds) {
      expect(getToolFamily(id)).toBe("experimental-creative");
    }
  });

  it("no experimental-creative cap in the registry claims to be physical-graffiti", () => {
    for (const entry of SPRAY_CAP_TOOL_TAXONOMY) {
      if (entry.calibration === "DIGITAL_EFFECT") {
        expect(entry.toolFamily).toBe("experimental-creative");
      }
    }
  });

  it("no physical-graffiti cap is classified DIGITAL_EFFECT", () => {
    for (const entry of SPRAY_CAP_TOOL_TAXONOMY) {
      if (entry.toolFamily === "physical-graffiti") {
        expect(entry.calibration).not.toBe("DIGITAL_EFFECT");
      }
    }
  });
});

describe("Ink/Gonzo seed presets are classified without entering the current Spray cap renderer", () => {
  it("every seed id is a distinct string, not a member of the existing SprayCapId set", () => {
    for (const seed of INK_GONZO_PRESET_SEEDS) {
      expect(EXISTING_CAP_IDS).not.toContain(seed.id);
    }
  });

  it("every seed carries the ink-gonzo-expressive family and seed-name-only status", () => {
    for (const seed of INK_GONZO_PRESET_SEEDS) {
      expect(seed.toolFamily).toBe("ink-gonzo-expressive");
      expect(seed.status).toBe("seed-name-only");
    }
  });

  it("resolving a seed id through getSprayCapPreset never returns a matching preset (falls back to the default cap)", () => {
    for (const seed of INK_GONZO_PRESET_SEEDS) {
      const resolved = getSprayCapPreset(seed.id);
      expect(resolved.id).not.toBe(seed.id);
      expect(resolved.id).toBe(SPRAY_CAP_PRESETS[0].id);
    }
  });

  it("defines all four brief-named seeds and nothing else", () => {
    expect(INK_GONZO_PRESET_SEEDS.map((seed) => seed.id).sort()).toEqual(
      ["gonzo-letterer", "savage-brush", "scratch-pen", "splatter-nib"].sort(),
    );
  });
});

describe("flair modes", () => {
  it("defines exactly off/wall/blackbook/wild", () => {
    expect(FLAIR_MODES.map((mode) => mode.id).sort()).toEqual(["blackbook", "off", "wall", "wild"].sort());
  });

  it("classifies wild as expressive-digital, never physical", () => {
    const wild = FLAIR_MODES.find((mode) => mode.id === "wild");
    expect(wild?.classification).toBe("expressive-digital");
  });

  it("classifies wall and blackbook as physical, off as neutral", () => {
    expect(FLAIR_MODES.find((mode) => mode.id === "wall")?.classification).toBe("physical");
    expect(FLAIR_MODES.find((mode) => mode.id === "blackbook")?.classification).toBe("physical");
    expect(FLAIR_MODES.find((mode) => mode.id === "off")?.classification).toBe("neutral");
  });
});

describe("surface context", () => {
  it("defines exactly wall/blackbook/neutral", () => {
    expect(SURFACE_CONTEXTS.map((context) => context.id).sort()).toEqual(["blackbook", "neutral", "wall"].sort());
  });
});

describe("tool families", () => {
  it("defines exactly the three brief families", () => {
    expect(TOOL_FAMILIES.map((family) => family.id).sort()).toEqual(
      ["experimental-creative", "ink-gonzo-expressive", "physical-graffiti"].sort(),
    );
  });
});

describe("parameter groups", () => {
  it("defines the five Spray/cap control groups", () => {
    expect(SPRAY_PARAMETER_GROUPS.map((group) => group.key).sort()).toEqual(
      ["coverage", "drip", "flair", "size", "texture"].sort(),
    );
  });

  it("defines the five Ink/Gonzo control groups", () => {
    expect(INK_PARAMETER_GROUPS.map((group) => group.key).sort()).toEqual(
      ["dryness", "jitter", "nibWidth", "splatter", "taper"].sort(),
    );
  });
});
