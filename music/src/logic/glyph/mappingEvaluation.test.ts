import { describe, it, expect } from "vitest";
import { evaluateMappingForBeat } from "./mappingEvaluation";
import type { BeatUnit } from "../../data/glyphAudioTypes";
import type { MappingPreset, MappingRule, GlyphParameterSet, MappingCurve } from "../../data/glyphMappingTypes";

function beat(overrides: Partial<BeatUnit> = {}): BeatUnit {
  return {
    id: "beat-0", sectionId: "s0", phraseId: null, barId: "bar-0", index: 0, indexWithinBar: 0,
    startSeconds: 0, durationSeconds: 0.375, startBeat: 0, durationBeats: 1,
    energy: 0.5, attackSharpness: 0.5, onsetDensity: 0, sustain: 0.5,
    pitchMovement: null, spectralBrightness: null, accentStrength: 0,
    confidence: { value: 0.9, source: "analysis" },
    ...overrides,
  };
}

function rule(overrides: Partial<MappingRule>): MappingRule {
  return {
    id: "r1", name: "rule", source: "energy", target: "glyphHeight",
    inputRange: [0, 1], outputRange: [0, 1], curve: "linear",
    invert: false, clamp: true, enabled: true, priority: 0,
    ...overrides,
  };
}

function preset(rules: MappingRule[]): MappingPreset {
  return {
    id: "p1", schemaVersion: 1, name: "test", description: "", grammarId: "arch-script-v1",
    rules, boundaryRules: [], createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
  };
}

const baseParams: GlyphParameterSet = {
  height: 10, width: 10, curveSharpness: 0.2, archCount: 1, baselineOffset: 0,
  spacingBefore: 0, spacingAfter: 0, connectorLength: 0, connectorSag: 0,
  dotSize: 0, dotOffset: 0, asymmetry: 0, localCompression: 0, handmadeVariance: 0,
};

describe("evaluateMappingForBeat", () => {
  it("returns the base parameters unchanged when no rules are enabled", () => {
    const { parameters, trace } = evaluateMappingForBeat(beat(), preset([rule({ enabled: false })]), baseParams);
    expect(parameters).toEqual(baseParams);
    expect(trace.appliedRules).toEqual([]);
  });

  it("maps energy to glyphHeight linearly within the configured ranges", () => {
    const { parameters, trace } = evaluateMappingForBeat(
      beat({ energy: 0.75 }),
      preset([rule({ source: "energy", target: "glyphHeight", inputRange: [0, 1], outputRange: [5, 25], curve: "linear" })]),
      baseParams,
    );
    expect(parameters.height).toBeCloseTo(5 + 0.75 * 20, 5);
    expect(trace.appliedRules).toHaveLength(1);
    expect(trace.appliedRules[0]).toMatchObject({ ruleId: "r1", sourceValue: 0.75, target: "glyphHeight" });
  });

  it("clamps out-of-range input when clamp is true", () => {
    const { parameters } = evaluateMappingForBeat(
      beat({ energy: 1.5 }),
      preset([rule({ inputRange: [0, 1], outputRange: [0, 100], clamp: true })]),
      baseParams,
    );
    expect(parameters.height).toBe(100);
  });

  it("does not clamp when clamp is false, allowing extrapolation", () => {
    const { parameters } = evaluateMappingForBeat(
      beat({ energy: 1.5 }),
      preset([rule({ inputRange: [0, 1], outputRange: [0, 100], clamp: false })]),
      baseParams,
    );
    expect(parameters.height).toBeGreaterThan(100);
  });

  it("inverts the normalized value when invert is true", () => {
    const { parameters } = evaluateMappingForBeat(
      beat({ energy: 0.2 }),
      preset([rule({ inputRange: [0, 1], outputRange: [0, 100], invert: true, curve: "linear" })]),
      baseParams,
    );
    expect(parameters.height).toBeCloseTo(80, 5);
  });

  it("applies every mapping curve without throwing and stays within [outMin, outMax] when clamped", () => {
    const curves: MappingCurve[] = ["linear", "easeIn", "easeOut", "easeInOut", "smoothStep", "stepped"];
    for (const curve of curves) {
      const { parameters } = evaluateMappingForBeat(
        beat({ energy: 0.6 }),
        preset([rule({ curve, outputRange: [0, 10] })]),
        baseParams,
      );
      expect(parameters.height).toBeGreaterThanOrEqual(0);
      expect(parameters.height).toBeLessThanOrEqual(10);
    }
  });

  it("skips a rule whose source measurement is unavailable (null) rather than fabricating a value", () => {
    const { parameters, trace } = evaluateMappingForBeat(
      beat({ pitchMovement: null }),
      preset([rule({ source: "pitchMovement", target: "baselineOffset", outputRange: [-5, 5] })]),
      baseParams,
    );
    expect(parameters.baselineOffset).toBe(baseParams.baselineOffset);
    expect(trace.appliedRules).toEqual([]);
  });

  it("evaluates enabled rules in ascending priority order, later rules winning on a shared target", () => {
    const { parameters, trace } = evaluateMappingForBeat(
      beat({ energy: 1, sustain: 0 }),
      preset([
        rule({ id: "low", source: "energy", target: "glyphWidth", outputRange: [0, 1], priority: 0 }),
        rule({ id: "high", source: "sustain", target: "glyphWidth", outputRange: [50, 100], priority: 1 }),
      ]),
      baseParams,
    );
    expect(parameters.width).toBeCloseTo(50, 5);
    expect(trace.appliedRules.map((r) => r.ruleId)).toEqual(["low", "high"]);
  });

  it("rounds archCount to the nearest integer, minimum 1", () => {
    const { parameters } = evaluateMappingForBeat(
      beat({ energy: 0.1 }),
      preset([rule({ source: "energy", target: "archCount", outputRange: [0, 0.4] })]),
      baseParams,
    );
    expect(parameters.archCount).toBe(1);
  });
});
