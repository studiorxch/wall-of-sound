import { describe, expect, it } from "vitest";
import {
  FLAIR_CURVES,
  applyFlairOutputToPoint,
  denormalizeTrackMarksFlairWidth,
  getFlairProControlMetadata,
  inverseEffectiveWidthExpansion,
  inverseWidthExpansion,
  normalizeTrackMarksFlairWidth,
  resolveDefaultFlairMode,
  resolveFlairModulation,
  resolveFlairModulationWithParams,
  resolveTrackMarksFlairSizeRange,
} from "./FlairCurves";
import type { StrokePoint } from "./types";

const SAMPLE_T = [0, 0.25, 0.5, 0.75, 1];

function isMonotonicNonDecreasing(values: number[]): boolean {
  return values.every((value, index) => index === 0 || value >= values[index - 1]);
}

describe("off is identity", () => {
  it("width expansion is the identity function", () => {
    for (const t of SAMPLE_T) {
      expect(FLAIR_CURVES.off.widthExpansion(t)).toBeCloseTo(t, 10);
    }
  });

  it("has no texture bloom, no output attenuation, no endpoint authority, and instant transitions", () => {
    expect(FLAIR_CURVES.off.textureBloom(1)).toBe(0);
    expect(FLAIR_CURVES.off.outputAttenuation(1)).toBe(1);
    expect(FLAIR_CURVES.off.endpointShapingAuthority).toBe(0);
    expect(FLAIR_CURVES.off.transitionSmoothing).toBe(1);
  });

  it("resolveFlairModulation leaves output and width01 unmodulated for off", () => {
    const result = resolveFlairModulation("off", { distance01: 0.6, output: 0.8, velocity: 0.2, angle: 15 });
    expect(result.output).toBeCloseTo(0.8, 10);
    expect(result.width01).toBeCloseTo(0.6, 10);
    expect(result.velocity).toBe(0.2);
    expect(result.angle).toBe(15);
  });
});

describe("wall expands width monotonically with simulated distance", () => {
  it("widthExpansion(t) is non-decreasing across the sampled range", () => {
    const values = SAMPLE_T.map((t) => FLAIR_CURVES.wall.widthExpansion(t));
    expect(isMonotonicNonDecreasing(values)).toBe(true);
    expect(values[values.length - 1]).toBeGreaterThan(values[0]);
  });

  it("never exceeds the physically-bounded max of 1", () => {
    for (const t of SAMPLE_T) {
      expect(FLAIR_CURVES.wall.widthExpansion(t)).toBeLessThanOrEqual(1);
    }
  });
});

describe("blackbook has a narrower width range than wall", () => {
  it("blackbook's max width (at t=1) is below wall's", () => {
    expect(FLAIR_CURVES.blackbook.widthExpansion(1)).toBeLessThan(FLAIR_CURVES.wall.widthExpansion(1));
  });

  it("blackbook's own range (max minus min) is narrower than wall's", () => {
    const blackbookRange = FLAIR_CURVES.blackbook.widthExpansion(1) - FLAIR_CURVES.blackbook.widthExpansion(0);
    const wallRange = FLAIR_CURVES.wall.widthExpansion(1) - FLAIR_CURVES.wall.widthExpansion(0);
    expect(blackbookRange).toBeLessThan(wallRange);
  });
});

describe("wild exceeds wall range", () => {
  it("wild's max width (at t=1) is greater than wall's", () => {
    expect(FLAIR_CURVES.wild.widthExpansion(1)).toBeGreaterThan(FLAIR_CURVES.wall.widthExpansion(1));
  });

  it("wild's max width genuinely exceeds the physically-bounded ceiling of 1", () => {
    expect(FLAIR_CURVES.wild.widthExpansion(1)).toBeGreaterThan(1);
  });
});

describe("output attenuation occurs in wall", () => {
  it("wall's output multiplier decreases as simulated distance increases", () => {
    expect(FLAIR_CURVES.wall.outputAttenuation(1)).toBeLessThan(FLAIR_CURVES.wall.outputAttenuation(0));
  });

  it("resolveFlairModulation reduces output for wall at full distance", () => {
    const result = resolveFlairModulation("wall", { distance01: 1, output: 1, velocity: 0, angle: 0 });
    expect(result.output).toBeLessThan(1);
  });
});

describe("blackbook transitions respond faster than wall", () => {
  it("blackbook's transitionSmoothing rate is higher than wall's", () => {
    expect(FLAIR_CURVES.blackbook.transitionSmoothing).toBeGreaterThan(FLAIR_CURVES.wall.transitionSmoothing);
  });
});

describe("Track Marks alone consumes Flair at runtime", () => {
  const baselinePoint: StrokePoint = { x: 0, y: 0, timestamp: 0, velocity: 0, width: 10, opacity: 0.8 };

  it("modulates opacity for track-marks with a non-off mode", () => {
    const result = applyFlairOutputToPoint(baselinePoint, "track-marks", "wall", 0.5);
    expect(result.opacity).toBeCloseTo(0.4, 10);
    expect(result).not.toBe(baselinePoint);
  });

  it("leaves every other cap id completely untouched, regardless of mode or multiplier", () => {
    const otherCapIds = ["pink-dot-fat", "new-york-fat", "astro-fat", "german-fat", "lego-thin", "needle", "soft-fade"];
    for (const capId of otherCapIds) {
      const result = applyFlairOutputToPoint(baselinePoint, capId, "wild", 0.1);
      expect(result).toBe(baselinePoint);
      expect(result.opacity).toBe(0.8);
    }
  });

  it("leaves Track Marks untouched when its own Flair mode is off", () => {
    const result = applyFlairOutputToPoint(baselinePoint, "track-marks", "off", 0.1);
    expect(result).toBe(baselinePoint);
    expect(result.opacity).toBe(0.8);
  });
});

describe("Pink Dot and other physical caps are unaffected by Flair", () => {
  const baselinePoint: StrokePoint = { x: 5, y: 5, timestamp: 100, velocity: 0.1, width: 40, opacity: 0.6 };

  it("pink-dot-fat's opacity is never modified by applyFlairOutputToPoint under any mode", () => {
    for (const mode of ["off", "wall", "blackbook", "wild"] as const) {
      const result = applyFlairOutputToPoint(baselinePoint, "pink-dot-fat", mode, 0.01);
      expect(result).toBe(baselinePoint);
    }
  });
});

describe("surface context selects Flair defaults", () => {
  it("wall -> wall, blackbook -> blackbook, neutral -> off", () => {
    expect(resolveDefaultFlairMode("wall")).toBe("wall");
    expect(resolveDefaultFlairMode("blackbook")).toBe("blackbook");
    expect(resolveDefaultFlairMode("neutral")).toBe("off");
  });
});

describe("no sudden jumps — inverseWidthExpansion seeds a continuous restart", () => {
  it("round-trips through widthExpansion for every real mode across a sampled range", () => {
    for (const mode of ["wall", "blackbook", "wild"] as const) {
      const modeMax = FLAIR_CURVES[mode].widthExpansion(1);
      for (const width01 of [0, 0.1 * modeMax, 0.3 * modeMax, 0.6 * modeMax, modeMax]) {
        const seededT = inverseWidthExpansion(mode, width01);
        expect(FLAIR_CURVES[mode].widthExpansion(seededT)).toBeCloseTo(width01, 3);
      }
    }
  });

  it("clamps to t=1 for a width beyond the mode's own max (never extrapolates past 1)", () => {
    expect(inverseWidthExpansion("wall", 5)).toBeCloseTo(1, 5);
  });

  it("is the true identity inverse for off", () => {
    expect(inverseWidthExpansion("off", 0.42)).toBeCloseTo(0.42, 3);
  });
});

describe("pro-control metadata", () => {
  it("derives all five fields for every mode without throwing", () => {
    for (const mode of ["off", "wall", "blackbook", "wild"] as const) {
      const metadata = getFlairProControlMetadata(mode);
      expect(Object.keys(metadata).sort()).toEqual(
        ["bloomResponse", "flairAmount", "flairRange", "flairSmoothing", "outputFalloff"].sort(),
      );
    }
  });

  it("off has zero flairRange growth beyond identity, zero bloom, and zero output falloff", () => {
    const metadata = getFlairProControlMetadata("off");
    expect(metadata.flairRange).toBe(1);
    expect(metadata.bloomResponse).toBe(0);
    expect(metadata.outputFalloff).toBe(0);
  });
});

describe("resolveFlairModulationWithParams -- Brush Studio Flair controls math", () => {
  it("matches resolveFlairModulation exactly when params equal the mode's own canonical defaults (no override applied)", () => {
    for (const mode of ["off", "wall", "blackbook", "wild"] as const) {
      const params = getFlairProControlMetadata(mode);
      for (const t of SAMPLE_T) {
        const input = { distance01: t, output: 1, velocity: 0, angle: 0 };
        const plain = resolveFlairModulation(mode, input);
        const withParams = resolveFlairModulationWithParams(mode, params, input);
        expect(withParams.width01).toBeCloseTo(plain.width01, 10);
        expect(withParams.bloom01).toBeCloseTo(plain.bloom01, 10);
        expect(withParams.output).toBeCloseTo(plain.output, 10);
      }
    }
  });

  it("scales the width range proportionally when flairRange is overridden, preserving the canonical curve's SHAPE (not a new equation)", () => {
    const defaults = getFlairProControlMetadata("wall");
    const doubledRange = { ...defaults, flairRange: defaults.flairRange * 2 };
    for (const t of [0.25, 0.5, 0.75, 1]) {
      const canonical = resolveFlairModulationWithParams("wall", defaults, { distance01: t, output: 1, velocity: 0, angle: 0 });
      const scaled = resolveFlairModulationWithParams("wall", doubledRange, { distance01: t, output: 1, velocity: 0, angle: 0 });
      expect(scaled.width01).toBeCloseTo(canonical.width01 * 2, 6);
    }
  });

  it("uses flairAmount/flairSmoothing directly -- these were already exactly distanceSensitivity/transitionSmoothing, no scaling needed", () => {
    const defaults = getFlairProControlMetadata("blackbook");
    expect(defaults.flairAmount).toBe(FLAIR_CURVES.blackbook.distanceSensitivity);
    expect(defaults.flairSmoothing).toBe(FLAIR_CURVES.blackbook.transitionSmoothing);
  });

  it("scales output falloff proportionally for wall (which has a real canonical falloff shape to scale)", () => {
    const defaults = getFlairProControlMetadata("wall");
    const halvedFalloff = { ...defaults, outputFalloff: defaults.outputFalloff / 2 };
    const full = resolveFlairModulationWithParams("wall", defaults, { distance01: 1, output: 1, velocity: 0, angle: 0 });
    const half = resolveFlairModulationWithParams("wall", halvedFalloff, { distance01: 1, output: 1, velocity: 0, angle: 0 });
    expect(1 - half.output).toBeCloseTo((1 - full.output) / 2, 6);
  });

  it("leaves wild's output un-attenuated even with an overridden outputFalloff -- wild's canonical shape has no falloff to scale (honest, not faked)", () => {
    const defaults = getFlairProControlMetadata("wild");
    const boostedFalloff = { ...defaults, outputFalloff: 0.9 };
    const result = resolveFlairModulationWithParams("wild", boostedFalloff, { distance01: 1, output: 1, velocity: 0, angle: 0 });
    expect(result.output).toBe(1);
  });
});

describe("inverseEffectiveWidthExpansion -- seeding under an overridden Range", () => {
  it("round-trips through resolveFlairModulationWithParams's own width01 for a rescaled range", () => {
    const defaults = getFlairProControlMetadata("wall");
    const params = { ...defaults, flairRange: defaults.flairRange * 1.5 };
    for (const target of [0, 0.3, 0.9, params.flairRange]) {
      const seededT = inverseEffectiveWidthExpansion("wall", params, target);
      const result = resolveFlairModulationWithParams("wall", params, { distance01: seededT, output: 1, velocity: 0, angle: 0 });
      expect(result.width01).toBeCloseTo(target, 3);
    }
  });
});

describe("Track Marks size denormalization", () => {
  it("normalize/denormalize round-trip", () => {
    for (const width01 of [0, 0.4, 1, 1.6]) {
      const size = denormalizeTrackMarksFlairWidth(width01);
      expect(normalizeTrackMarksFlairWidth(size)).toBeCloseTo(width01, 8);
    }
  });

  it("Wild's default effective range genuinely exceeds the generic 72-unit display boundary, with no clamping in the resolved value", () => {
    const params = getFlairProControlMetadata("wild");
    const range = resolveTrackMarksFlairSizeRange("wild", params);
    expect(range.max).toBeGreaterThan(72);
    // The exact unclamped value denormalizeTrackMarksFlairWidth produces at width01=1.6 -- proves nothing along the way silently clamps to 72.
    expect(range.max).toBeCloseTo(denormalizeTrackMarksFlairWidth(1.6), 6);
  });

  it("Wall and Blackbook's default effective ranges stay within the generic 72-unit boundary", () => {
    expect(resolveTrackMarksFlairSizeRange("wall", getFlairProControlMetadata("wall")).max).toBeLessThanOrEqual(72);
    expect(resolveTrackMarksFlairSizeRange("blackbook", getFlairProControlMetadata("blackbook")).max).toBeLessThanOrEqual(72);
  });
});
