import { describe, expect, it } from "vitest";
import {
  FLAIR_CURVES,
  applyFlairDensityToCap,
  applyFlairOutputToPoint,
  getFlairBloomTierMultiplier,
  getFlairCapTier,
  getFlairProControlMetadata,
  getFlairSizeDefaults,
  getFlairStartPositionDefault,
  inverseEffectiveFlairDistance,
  inverseWidthExpansion,
  normalizeFlairSize,
  resolveDefaultFlairMode,
  resolveFlairModulation,
  resolveFlairModulationWithParams,
  resolveFlairSize,
  resolveFlairStartDistance,
  type EffectiveFlairParams,
} from "./FlairCurves";
import { getSprayCapPreset } from "./SprayCapPresets";
import type { FlairModeId } from "./ToolTaxonomy";
import type { StrokePoint } from "./types";

const SAMPLE_T = [0, 0.25, 0.5, 0.75, 1];
const TRACK_MARKS_BASE_RADIUS = 42;
const NEEDLE_LIKE_BASE_RADIUS = 5;

function isMonotonicNonDecreasing(values: number[]): boolean {
  return values.every((value, index) => index === 0 || value >= values[index - 1]);
}

/** Full EffectiveFlairParams for a mode, cap-relative to `capBaseRadius`, with optional overrides layered on top -- keeps tests concise now that the bundle carries the size envelope too. */
function fullParams(mode: FlairModeId, capBaseRadius: number, overrides: Partial<EffectiveFlairParams> = {}): EffectiveFlairParams {
  const scalars = getFlairProControlMetadata(mode);
  const size = getFlairSizeDefaults(mode, capBaseRadius);
  return {
    ...scalars,
    flairMinSize: size.min,
    flairMaxSize: size.max,
    flairStartPosition: getFlairStartPositionDefault(mode),
    ...overrides,
  };
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

  it("resolveFlairModulationWithParams also stays identity for off, regardless of any params passed", () => {
    const params = fullParams("off", TRACK_MARKS_BASE_RADIUS, { flairMinSize: 1, flairMaxSize: 999 });
    const result = resolveFlairModulationWithParams("off", params, { distance01: 0.42, output: 0.9, velocity: 0, angle: 0 });
    expect(result.width01).toBeCloseTo(0.42, 10);
    expect(result.output).toBeCloseTo(0.9, 10);
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

  it("Pink Dot's own size/coverage math never touches any Flair envelope function", () => {
    // Pink Dot's Flare V1 sizing lives entirely in main.ts's legacy linear
    // path (adjustSimulatedSprayDistance); nothing in FlairCurves.ts is ever
    // called with capId "pink-dot-fat" for width resolution. This test
    // simply documents/locks that `resolveFlairSize` and friends are
    // cap-agnostic pure math -- callers are what gate Pink Dot out, not this
    // module -- consistent with `applyFlairOutputToPoint`'s own gate above.
    const params = fullParams("wall", TRACK_MARKS_BASE_RADIUS);
    expect(() => resolveFlairSize(0.5, params)).not.toThrow();
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
  it("derives all fields for every mode without throwing -- flairRange is GONE (replaced by explicit Min/Max Size, see FlairSizeEnvelope)", () => {
    for (const mode of ["off", "wall", "blackbook", "wild"] as const) {
      const metadata = getFlairProControlMetadata(mode);
      expect(Object.keys(metadata).sort()).toEqual(
        ["bloomResponse", "depthResponse", "flairAmount", "flairSmoothing", "outputFalloff"].sort(),
      );
    }
  });

  it("off has zero bloom and zero output falloff", () => {
    const metadata = getFlairProControlMetadata("off");
    expect(metadata.bloomResponse).toBe(0);
    expect(metadata.outputFalloff).toBe(0);
  });
});

describe("explicit size envelope -- getFlairSizeDefaults (build brief sections 1-2)", () => {
  it("is cap-relative: a larger cap baseRadius yields a larger envelope, same mode", () => {
    const trackMarks = getFlairSizeDefaults("wall", TRACK_MARKS_BASE_RADIUS);
    const needleLike = getFlairSizeDefaults("wall", NEEDLE_LIKE_BASE_RADIUS);
    expect(trackMarks.min).toBeGreaterThan(needleLike.min);
    expect(trackMarks.max).toBeGreaterThan(needleLike.max);
  });

  it("min is always strictly less than max, for every mode", () => {
    for (const mode of ["off", "wall", "blackbook", "wild"] as const) {
      const { min, max } = getFlairSizeDefaults(mode, TRACK_MARKS_BASE_RADIUS);
      expect(max).toBeGreaterThan(min);
    }
  });

  it("wild's default max exceeds wall's, matching its own 'extended' curve personality", () => {
    const wall = getFlairSizeDefaults("wall", TRACK_MARKS_BASE_RADIUS);
    const wild = getFlairSizeDefaults("wild", TRACK_MARKS_BASE_RADIUS);
    expect(wild.max).toBeGreaterThan(wall.max);
  });
});

describe("resolveFlairSize / normalizeFlairSize -- the sole size-envelope authority", () => {
  it("width01=0 resolves to exactly Min, width01=1 resolves to exactly Max", () => {
    const params = fullParams("wall", TRACK_MARKS_BASE_RADIUS);
    expect(resolveFlairSize(0, params)).toBeCloseTo(params.flairMinSize, 6);
    expect(resolveFlairSize(1, params)).toBeCloseTo(params.flairMaxSize, 6);
  });

  it("never produces a size outside [Min, Max] for any width01 in [0,1], even out-of-range input (clamped)", () => {
    const params = fullParams("wall", TRACK_MARKS_BASE_RADIUS);
    for (const width01 of [-0.5, 0, 0.3, 0.7, 1, 1.5]) {
      const size = resolveFlairSize(width01, params);
      expect(size).toBeGreaterThanOrEqual(params.flairMinSize - 1e-9);
      expect(size).toBeLessThanOrEqual(params.flairMaxSize + 1e-9);
    }
  });

  it("normalize/resolve round-trip", () => {
    const params = fullParams("wild", TRACK_MARKS_BASE_RADIUS);
    for (const size of [params.flairMinSize, (params.flairMinSize + params.flairMaxSize) / 2, params.flairMaxSize]) {
      const width01 = normalizeFlairSize(size, params);
      expect(resolveFlairSize(width01, params)).toBeCloseTo(size, 6);
    }
  });
});

describe("resolveFlairModulationWithParams -- Brush Studio Flair controls math", () => {
  it("width01 output is always a clean [0,1] shape fraction now (envelope-independent) -- denormalize separately with resolveFlairSize", () => {
    for (const mode of ["wall", "blackbook", "wild"] as const) {
      const params = fullParams(mode, TRACK_MARKS_BASE_RADIUS);
      for (const t of SAMPLE_T) {
        const result = resolveFlairModulationWithParams(mode, params, { distance01: t, output: 1, velocity: 0, angle: 0 });
        expect(result.width01).toBeGreaterThanOrEqual(0);
        expect(result.width01).toBeLessThanOrEqual(1);
      }
    }
  });

  it("uses flairAmount/flairSmoothing directly -- these were already exactly distanceSensitivity/transitionSmoothing, no scaling needed", () => {
    const defaults = getFlairProControlMetadata("blackbook");
    expect(defaults.flairAmount).toBe(FLAIR_CURVES.blackbook.distanceSensitivity);
    expect(defaults.flairSmoothing).toBe(FLAIR_CURVES.blackbook.transitionSmoothing);
  });

  it("scales output falloff proportionally for wall (which has a real canonical falloff shape to scale)", () => {
    const defaults = fullParams("wall", TRACK_MARKS_BASE_RADIUS);
    const halvedFalloff = { ...defaults, outputFalloff: defaults.outputFalloff / 2 };
    const full = resolveFlairModulationWithParams("wall", defaults, { distance01: 1, output: 1, velocity: 0, angle: 0 });
    const half = resolveFlairModulationWithParams("wall", halvedFalloff, { distance01: 1, output: 1, velocity: 0, angle: 0 });
    expect(1 - half.output).toBeCloseTo((1 - full.output) / 2, 6);
  });

  it("Wild now has a real (small default, fully scalable) falloff shape -- an overridden outputFalloff genuinely attenuates output", () => {
    const defaults = fullParams("wild", TRACK_MARKS_BASE_RADIUS);
    const boostedFalloff = { ...defaults, outputFalloff: defaults.outputFalloff * 3 };
    const result = resolveFlairModulationWithParams("wild", boostedFalloff, { distance01: 1, output: 1, velocity: 0, angle: 0 });
    expect(result.output).toBeLessThan(1);
  });
});

describe("output falloff is independent from width (build brief section 4/8)", () => {
  it("changing outputFalloff never changes width01, for the same distance/mode", () => {
    const low = fullParams("wall", TRACK_MARKS_BASE_RADIUS, { outputFalloff: 0.05 });
    const high = fullParams("wall", TRACK_MARKS_BASE_RADIUS, { outputFalloff: 0.8 });
    for (const t of SAMPLE_T) {
      const lowResult = resolveFlairModulationWithParams("wall", low, { distance01: t, output: 1, velocity: 0, angle: 0 });
      const highResult = resolveFlairModulationWithParams("wall", high, { distance01: t, output: 1, velocity: 0, angle: 0 });
      expect(lowResult.width01).toBeCloseTo(highResult.width01, 10);
    }
  });

  it("changing flairMinSize/flairMaxSize never changes the resolved output multiplier", () => {
    const narrow = fullParams("wall", TRACK_MARKS_BASE_RADIUS, { flairMinSize: 10, flairMaxSize: 20 });
    const wide = fullParams("wall", TRACK_MARKS_BASE_RADIUS, { flairMinSize: 5, flairMaxSize: 150 });
    for (const t of SAMPLE_T) {
      const narrowResult = resolveFlairModulationWithParams("wall", narrow, { distance01: t, output: 1, velocity: 0, angle: 0 });
      const wideResult = resolveFlairModulationWithParams("wall", wide, { distance01: t, output: 1, velocity: 0, angle: 0 });
      expect(narrowResult.output).toBeCloseTo(wideResult.output, 10);
    }
  });

  it("farther distance can produce wider AND lighter spray simultaneously (wall, far-wide)", () => {
    const params = fullParams("wall", TRACK_MARKS_BASE_RADIUS);
    const near = resolveFlairModulationWithParams("wall", params, { distance01: 0, output: 1, velocity: 0, angle: 0 });
    const far = resolveFlairModulationWithParams("wall", params, { distance01: 1, output: 1, velocity: 0, angle: 0 });
    expect(resolveFlairSize(far.width01, params)).toBeGreaterThan(resolveFlairSize(near.width01, params));
    expect(far.output).toBeLessThan(near.output);
  });

  it("farther distance can produce narrower spray while REMAINING dense (near-wide polarity)", () => {
    const params = fullParams("wall", TRACK_MARKS_BASE_RADIUS, { depthResponse: "near-wide" });
    const near = resolveFlairModulationWithParams("wall", params, { distance01: 0, output: 1, velocity: 0, angle: 0 });
    const far = resolveFlairModulationWithParams("wall", params, { distance01: 1, output: 1, velocity: 0, angle: 0 });
    expect(resolveFlairSize(far.width01, params)).toBeLessThan(resolveFlairSize(near.width01, params));
    expect(far.output).toBeGreaterThanOrEqual(near.output); // no MORE attenuated when narrow -- stays dense
  });
});

describe("inverseEffectiveFlairDistance -- seeding from an absolute size, envelope-aware", () => {
  it("round-trips through resolveFlairModulationWithParams's own resolved size for a custom envelope", () => {
    const params = fullParams("wall", TRACK_MARKS_BASE_RADIUS, { flairMinSize: 8, flairMaxSize: 90 });
    for (const targetSize of [8, 30, 60, 90]) {
      const seededT = inverseEffectiveFlairDistance("wall", params, targetSize);
      const result = resolveFlairModulationWithParams("wall", params, { distance01: seededT, output: 1, velocity: 0, angle: 0 });
      expect(resolveFlairSize(result.width01, params)).toBeCloseTo(targetSize, 2);
    }
  });

  it("correctly seeds distance01 under near-wide too (polarity-aware round trip)", () => {
    const params = fullParams("wall", TRACK_MARKS_BASE_RADIUS, { depthResponse: "near-wide" });
    for (const targetSize of [params.flairMinSize, (params.flairMinSize + params.flairMaxSize) / 2, params.flairMaxSize]) {
      const seededT = inverseEffectiveFlairDistance("wall", params, targetSize);
      const result = resolveFlairModulationWithParams("wall", params, { distance01: seededT, output: 1, velocity: 0, angle: 0 });
      expect(resolveFlairSize(result.width01, params)).toBeCloseTo(targetSize, 2);
    }
  });
});

describe("Depth Response -- mapping polarity (Flair Stabilization build brief, section A2)", () => {
  it("Wall's default polarity is far-wide", () => {
    expect(getFlairProControlMetadata("wall").depthResponse).toBe("far-wide");
  });

  it("Blackbook's default polarity is near-wide", () => {
    expect(getFlairProControlMetadata("blackbook").depthResponse).toBe("near-wide");
  });

  it("Wild defaults to far-wide but is editable (accepts an explicit near-wide override)", () => {
    expect(getFlairProControlMetadata("wild").depthResponse).toBe("far-wide");
    const params = fullParams("wild", TRACK_MARKS_BASE_RADIUS, { depthResponse: "near-wide" });
    const near0 = resolveFlairModulationWithParams("wild", params, { distance01: 0, output: 1, velocity: 0, angle: 0 });
    const far1 = resolveFlairModulationWithParams("wild", params, { distance01: 1, output: 1, velocity: 0, angle: 0 });
    expect(near0.width01).toBeGreaterThan(far1.width01); // near-wide: near (0) is WIDER than far (1)
  });

  it("far-wide maps monotonically MIN -> MAX as distance sweeps near -> far (acceptance item 6)", () => {
    const params = fullParams("wall", TRACK_MARKS_BASE_RADIUS, { depthResponse: "far-wide" });
    const sizes = SAMPLE_T.map((t) => resolveFlairSize(
      resolveFlairModulationWithParams("wall", params, { distance01: t, output: 1, velocity: 0, angle: 0 }).width01,
      params,
    ));
    expect(isMonotonicNonDecreasing(sizes)).toBe(true);
    expect(sizes[0]).toBeCloseTo(params.flairMinSize, 6);
    expect(sizes[sizes.length - 1]).toBeCloseTo(params.flairMaxSize, 6);
  });

  it("near-wide maps monotonically MAX -> MIN as distance sweeps near -> far (acceptance item 7)", () => {
    const params = fullParams("wall", TRACK_MARKS_BASE_RADIUS, { depthResponse: "near-wide" });
    const sizes = SAMPLE_T.map((t) => resolveFlairSize(
      resolveFlairModulationWithParams("wall", params, { distance01: t, output: 1, velocity: 0, angle: 0 }).width01,
      params,
    ));
    const isMonotonicNonIncreasing = sizes.every((v, i) => i === 0 || v <= sizes[i - 1]);
    expect(isMonotonicNonIncreasing).toBe(true);
    expect(sizes[0]).toBeCloseTo(params.flairMaxSize, 6);
    expect(sizes[sizes.length - 1]).toBeCloseTo(params.flairMinSize, 6);
  });

  it("far-wide gives thin -> broad -> thin as distance sweeps near -> far -> near", () => {
    const params = fullParams("wall", TRACK_MARKS_BASE_RADIUS, { depthResponse: "far-wide" });
    const near = resolveFlairModulationWithParams("wall", params, { distance01: 0, output: 1, velocity: 0, angle: 0 });
    const far = resolveFlairModulationWithParams("wall", params, { distance01: 1, output: 1, velocity: 0, angle: 0 });
    const nearAgain = resolveFlairModulationWithParams("wall", params, { distance01: 0, output: 1, velocity: 0, angle: 0 });
    expect(near.width01).toBeLessThan(far.width01);
    expect(nearAgain.width01).toBeLessThan(far.width01);
    expect(nearAgain.width01).toBeCloseTo(near.width01, 10);
  });

  it("near-wide gives broad -> thin -> broad for the exact same near -> far -> near input", () => {
    const params = fullParams("wall", TRACK_MARKS_BASE_RADIUS, { depthResponse: "near-wide" });
    const near = resolveFlairModulationWithParams("wall", params, { distance01: 0, output: 1, velocity: 0, angle: 0 });
    const far = resolveFlairModulationWithParams("wall", params, { distance01: 1, output: 1, velocity: 0, angle: 0 });
    const nearAgain = resolveFlairModulationWithParams("wall", params, { distance01: 0, output: 1, velocity: 0, angle: 0 });
    expect(near.width01).toBeGreaterThan(far.width01);
    expect(nearAgain.width01).toBeGreaterThan(far.width01);
    expect(nearAgain.width01).toBeCloseTo(near.width01, 10);
  });

  it("transitions are smooth across the polarity, not piecewise -- width is monotonic across the full sampled sweep in both directions", () => {
    const farWide = fullParams("wall", TRACK_MARKS_BASE_RADIUS, { depthResponse: "far-wide" });
    const nearWide = fullParams("wall", TRACK_MARKS_BASE_RADIUS, { depthResponse: "near-wide" });
    const farWideWidths = SAMPLE_T.map((t) => resolveFlairModulationWithParams("wall", farWide, { distance01: t, output: 1, velocity: 0, angle: 0 }).width01);
    const nearWideWidths = SAMPLE_T.map((t) => resolveFlairModulationWithParams("wall", nearWide, { distance01: t, output: 1, velocity: 0, angle: 0 }).width01);
    expect(farWideWidths.every((v, i) => i === 0 || v >= farWideWidths[i - 1])).toBe(true); // non-decreasing
    expect(nearWideWidths.every((v, i) => i === 0 || v <= nearWideWidths[i - 1])).toBe(true); // non-increasing
  });

  it("one continuous arc's own achievable size range is identical under both polarities -- polarity flips DIRECTION, not RANGE", () => {
    const farWide = fullParams("wall", TRACK_MARKS_BASE_RADIUS, { depthResponse: "far-wide" });
    const nearWide = fullParams("wall", TRACK_MARKS_BASE_RADIUS, { depthResponse: "near-wide" });
    expect(nearWide.flairMinSize).toBe(farWide.flairMinSize);
    expect(nearWide.flairMaxSize).toBe(farWide.flairMaxSize);
  });

  it("off remains identity regardless of any depthResponse override", () => {
    for (const depthResponse of ["far-wide", "near-wide"] as const) {
      const params = fullParams("off", TRACK_MARKS_BASE_RADIUS, { depthResponse });
      const result = resolveFlairModulationWithParams("off", params, { distance01: 0.7, output: 0.8, velocity: 0, angle: 0 });
      expect(result.width01).toBeCloseTo(0.7, 10);
      expect(result.output).toBeCloseTo(0.8, 10);
    }
  });
});

describe("stroke-start policy -- reset-to-start (build brief sections 1/5, acceptance items 1-5)", () => {
  it("resolveFlairStartDistance is pure and deterministic -- calling it twice with the same params always gives the same answer, regardless of any 'previous stroke' state (there is none to read)", () => {
    const params = fullParams("wall", TRACK_MARKS_BASE_RADIUS);
    const first = resolveFlairStartDistance("wall", params);
    const second = resolveFlairStartDistance("wall", params);
    expect(first).toBe(second);
  });

  it("start=min resolves to exactly the Min size", () => {
    const params = fullParams("wall", TRACK_MARKS_BASE_RADIUS, { flairStartPosition: "min" });
    const distance01 = resolveFlairStartDistance("wall", params);
    const modulation = resolveFlairModulationWithParams("wall", params, { distance01, output: 1, velocity: 0, angle: 0 });
    expect(resolveFlairSize(modulation.width01, params)).toBeCloseTo(params.flairMinSize, 2);
  });

  it("start=max resolves to exactly the Max size", () => {
    const params = fullParams("wall", TRACK_MARKS_BASE_RADIUS, { flairStartPosition: "max" });
    const distance01 = resolveFlairStartDistance("wall", params);
    const modulation = resolveFlairModulationWithParams("wall", params, { distance01, output: 1, velocity: 0, angle: 0 });
    expect(resolveFlairSize(modulation.width01, params)).toBeCloseTo(params.flairMaxSize, 2);
  });

  it("start=center resolves to the midpoint between Min and Max", () => {
    const params = fullParams("wall", TRACK_MARKS_BASE_RADIUS, { flairStartPosition: "center" });
    const distance01 = resolveFlairStartDistance("wall", params);
    const modulation = resolveFlairModulationWithParams("wall", params, { distance01, output: 1, velocity: 0, angle: 0 });
    const resolvedSize = resolveFlairSize(modulation.width01, params);
    expect(resolvedSize).toBeCloseTo((params.flairMinSize + params.flairMaxSize) / 2, 1);
  });

  it("start=min/max/center all work correctly under near-wide too (start position is about the SIZE, not the distance direction)", () => {
    const min = fullParams("blackbook", TRACK_MARKS_BASE_RADIUS, { flairStartPosition: "min" });
    const max = fullParams("blackbook", TRACK_MARKS_BASE_RADIUS, { flairStartPosition: "max" });
    const minResult = resolveFlairModulationWithParams("blackbook", min, { distance01: resolveFlairStartDistance("blackbook", min), output: 1, velocity: 0, angle: 0 });
    const maxResult = resolveFlairModulationWithParams("blackbook", max, { distance01: resolveFlairStartDistance("blackbook", max), output: 1, velocity: 0, angle: 0 });
    expect(resolveFlairSize(minResult.width01, min)).toBeCloseTo(min.flairMinSize, 2);
    expect(resolveFlairSize(maxResult.width01, max)).toBeCloseTo(max.flairMaxSize, 2);
  });

  it("width never exceeds the configured Min/Max envelope for a full sweep, at any start position", () => {
    for (const flairStartPosition of ["min", "center", "max"] as const) {
      const params = fullParams("wild", TRACK_MARKS_BASE_RADIUS, { flairStartPosition });
      for (const t of SAMPLE_T) {
        const modulation = resolveFlairModulationWithParams("wild", params, { distance01: t, output: 1, velocity: 0, angle: 0 });
        const size = resolveFlairSize(modulation.width01, params);
        expect(size).toBeGreaterThanOrEqual(params.flairMinSize - 1e-9);
        expect(size).toBeLessThanOrEqual(params.flairMaxSize + 1e-9);
      }
    }
  });
});

describe("Needle-shaped envelope validation -- math/schema only, no runtime wiring (build brief section 7)", () => {
  it("a very small minimum remains usable -- never collapses to zero or a negative size", () => {
    const params = fullParams("wall", NEEDLE_LIKE_BASE_RADIUS);
    expect(params.flairMinSize).toBeGreaterThan(0);
  });

  it("maximum can expand significantly beyond the cap's own tiny baseRadius", () => {
    const params = fullParams("wild", NEEDLE_LIKE_BASE_RADIUS);
    expect(params.flairMaxSize).toBeGreaterThan(NEEDLE_LIKE_BASE_RADIUS);
  });

  it("no jump on stroke start -- resolveFlairStartDistance -> resolved size lands exactly on the requested start position, for every polarity", () => {
    for (const depthResponse of ["far-wide", "near-wide"] as const) {
      const params = fullParams("wall", NEEDLE_LIKE_BASE_RADIUS, { depthResponse, flairStartPosition: "min" });
      const distance01 = resolveFlairStartDistance("wall", params);
      const modulation = resolveFlairModulationWithParams("wall", params, { distance01, output: 1, velocity: 0, angle: 0 });
      expect(resolveFlairSize(modulation.width01, params)).toBeCloseTo(params.flairMinSize, 2);
    }
  });

  it("a full near->far->near sweep stays numerically stable (no NaN, no Infinity) across a tight thin-cap envelope", () => {
    const params = fullParams("wild", NEEDLE_LIKE_BASE_RADIUS);
    for (const t of [...SAMPLE_T, ...SAMPLE_T.slice().reverse()]) {
      const modulation = resolveFlairModulationWithParams("wild", params, { distance01: t, output: 1, velocity: 0, angle: 0 });
      const size = resolveFlairSize(modulation.width01, params);
      expect(Number.isFinite(size)).toBe(true);
      expect(Number.isNaN(size)).toBe(false);
    }
  });
});

describe("cap-family response tiers (Real Spray Pass build brief, sections 4/5/B)", () => {
  it("getFlairCapTier maps Track Marks to fat, and any other cap id to mid (no runtime wiring for anything else)", () => {
    expect(getFlairCapTier("track-marks")).toBe("fat");
    expect(getFlairCapTier("pink-dot-fat")).toBe("mid");
    expect(getFlairCapTier("needle")).toBe("mid");
  });

  it("fat's max ratio exceeds mid's, which exceeds thin's, for every real mode -- fat opens up the most, thin the least", () => {
    for (const mode of ["wall", "blackbook", "wild"] as const) {
      const fat = getFlairSizeDefaults(mode, TRACK_MARKS_BASE_RADIUS, "fat");
      const mid = getFlairSizeDefaults(mode, TRACK_MARKS_BASE_RADIUS, "mid");
      const thin = getFlairSizeDefaults(mode, TRACK_MARKS_BASE_RADIUS, "thin");
      expect(fat.max).toBeGreaterThan(mid.max);
      expect(mid.max).toBeGreaterThan(thin.max);
    }
  });

  it("thin's own minimum stays proportionately usable (a larger fraction of its own baseRadius than fat's) -- never a collapsed sliver", () => {
    // A slightly larger reference radius than NEEDLE_LIKE_BASE_RADIUS (5) so
    // the ratio difference shows before both tiers hit the same shared
    // absolute floor (2 wall units) -- at radius 5, fat's own ratio (0.1 ->
    // 0.5) is already below the floor, so it and thin's (0.35 -> 1.75, also
    // below the floor) would tie at exactly 2, which is a floor artifact,
    // not evidence the ratios themselves are ordered correctly.
    const referenceRadius = 12;
    const fat = getFlairSizeDefaults("wall", referenceRadius, "fat");
    const thin = getFlairSizeDefaults("wall", referenceRadius, "thin");
    expect(thin.min).toBeGreaterThan(fat.min);
    expect(thin.min).toBeGreaterThan(0);
    // At the genuinely tiny Needle-like radius, the shared floor still keeps
    // thin usable (never a collapsed sliver, per section 7's own wording) —
    // this is the actual invariant that matters, not the tier ordering.
    const thinAtNeedleRadius = getFlairSizeDefaults("wall", NEEDLE_LIKE_BASE_RADIUS, "thin");
    expect(thinAtNeedleRadius.min).toBeGreaterThan(0);
  });

  it("thin caps get a STRONGER bloom multiplier than fat -- texture/mist compensates for their deliberately modest width growth", () => {
    expect(getFlairBloomTierMultiplier("thin")).toBeGreaterThan(getFlairBloomTierMultiplier("fat"));
    expect(getFlairBloomTierMultiplier("fat")).toBeGreaterThan(getFlairBloomTierMultiplier("mid"));
  });

  it("thin's own width growth, relative to its own baseRadius, is genuinely modest -- it does not 'suddenly behave like a giant fat cap'", () => {
    const thin = getFlairSizeDefaults("wild", NEEDLE_LIKE_BASE_RADIUS, "thin");
    const fat = getFlairSizeDefaults("wild", NEEDLE_LIKE_BASE_RADIUS, "fat");
    const thinGrowthRatio = thin.max / NEEDLE_LIKE_BASE_RADIUS;
    const fatGrowthRatio = fat.max / NEEDLE_LIKE_BASE_RADIUS;
    expect(thinGrowthRatio).toBeLessThan(fatGrowthRatio);
  });
});

describe("applyFlairDensityToCap -- coupled deposition response (live-report fix #2: 'wide flair body is too opaque')", () => {
  const trackMarksCap = getSprayCapPreset("track-marks");
  const pinkDotCap = getSprayCapPreset("pink-dot-fat");

  it("is a strict identity (same object) for any non-Track-Marks cap, regardless of mode/bloom", () => {
    expect(applyFlairDensityToCap(pinkDotCap, "pink-dot-fat", "wall", 0.9)).toBe(pinkDotCap);
    expect(applyFlairDensityToCap(pinkDotCap, "new-york-fat", "wild", 1)).toBe(pinkDotCap);
  });

  it("is a strict identity (same object) for Track Marks with Flair off, regardless of bloom", () => {
    expect(applyFlairDensityToCap(trackMarksCap, "track-marks", "off", 0.9)).toBe(trackMarksCap);
  });

  it("is a strict identity (same object) for Track Marks with an active mode but bloom01 <= 0", () => {
    expect(applyFlairDensityToCap(trackMarksCap, "track-marks", "wall", 0)).toBe(trackMarksCap);
    expect(applyFlairDensityToCap(trackMarksCap, "track-marks", "wall", -0.2)).toBe(trackMarksCap);
  });

  it("reduces core density (coreOpacity, coreDensity) as bloom rises -- the core must lose density, not just dim uniformly", () => {
    const low = applyFlairDensityToCap(trackMarksCap, "track-marks", "wall", 0.2);
    const high = applyFlairDensityToCap(trackMarksCap, "track-marks", "wall", 0.9);
    expect(low.coreOpacity).toBeLessThan(trackMarksCap.coreOpacity);
    expect(high.coreOpacity).toBeLessThan(low.coreOpacity);
    expect(high.coreDensity).toBeLessThan(trackMarksCap.coreDensity);
  });

  it("softens the edge (LOWER edgeFalloff = softer, per its own doc) as bloom rises, never below the floor", () => {
    const high = applyFlairDensityToCap(trackMarksCap, "track-marks", "wall", 1);
    expect(high.edgeFalloff).toBeLessThan(trackMarksCap.edgeFalloff);
    expect(high.edgeFalloff).toBeGreaterThan(0);
  });

  it("increases mist reach and strength (plumeMistOpacity, plumeMistRadius) as bloom rises", () => {
    const high = applyFlairDensityToCap(trackMarksCap, "track-marks", "wall", 1);
    expect(high.plumeMistOpacity).toBeGreaterThan(trackMarksCap.plumeMistOpacity);
    expect(high.plumeMistRadius).toBeGreaterThan(trackMarksCap.plumeMistRadius);
  });

  it("softens the ring band (plumeRingOpacity down) -- a crisp ring would itself read as a hard balloon edge", () => {
    const high = applyFlairDensityToCap(trackMarksCap, "track-marks", "wall", 1);
    expect(high.plumeRingOpacity).toBeLessThan(trackMarksCap.plumeRingOpacity);
  });

  it("every adjustment is monotonic in bloom01 across a full sweep -- no reversal partway through opening", () => {
    const samples = [0.1, 0.3, 0.5, 0.7, 0.9, 1].map((b) => applyFlairDensityToCap(trackMarksCap, "track-marks", "wall", b));
    for (let i = 1; i < samples.length; i++) {
      expect(samples[i].coreOpacity).toBeLessThanOrEqual(samples[i - 1].coreOpacity);
      expect(samples[i].edgeFalloff).toBeLessThanOrEqual(samples[i - 1].edgeFalloff);
      expect(samples[i].plumeMistOpacity).toBeGreaterThanOrEqual(samples[i - 1].plumeMistOpacity);
    }
  });

  it("never mutates the canonical preset object itself (SPRAY_CAP_PRESETS stays untouched)", () => {
    const before = { ...trackMarksCap };
    applyFlairDensityToCap(trackMarksCap, "track-marks", "wall", 1);
    expect(trackMarksCap).toEqual(before);
  });
});
