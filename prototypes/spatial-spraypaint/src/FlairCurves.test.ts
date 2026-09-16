import { describe, expect, it } from "vitest";
import {
  FLAIR_CURVES,
  applyFlairOutputToPoint,
  getFlairProControlMetadata,
  inverseWidthExpansion,
  resolveDefaultFlairMode,
  resolveFlairModulation,
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
