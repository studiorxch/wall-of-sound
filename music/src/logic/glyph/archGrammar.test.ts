import { describe, it, expect } from "vitest";
import { buildArchStrokes, generateGlyphInstances } from "./archGrammar";
import type { ArchGrammarParameters, GlyphGrammar } from "../../data/glyphGrammarTypes";
import type { MappingPreset, MappingRule } from "../../data/glyphMappingTypes";
import type { BeatUnit } from "../../data/glyphAudioTypes";

function archParams(overrides: Partial<ArchGrammarParameters> = {}): ArchGrammarParameters {
  return {
    archCount: 1, width: 20, height: 10, curveSharpness: 0.2, asymmetry: 0,
    baselineOffset: 0, connectorLength: 4, connectorSag: 1, entryOvershoot: 2, exitOvershoot: 2,
    localCompression: 0, dotEnabled: false, dotSize: 1, dotOffset: 0, handmadeVariance: 0,
    ...overrides,
  };
}

describe("buildArchStrokes", () => {
  it("returns exactly one monoline stroke", () => {
    const strokes = buildArchStrokes(archParams());
    expect(strokes).toHaveLength(1);
    expect(strokes[0].mode).toBe("freehand");
  });

  it("produces valid, non-self-intersecting geometry for every arch count 1 through 6", () => {
    for (let archCount = 1; archCount <= 6; archCount++) {
      const strokes = buildArchStrokes(archParams({ archCount }));
      const xs = strokes[0].points.map((p) => p.x);
      expect(strokes[0].points.length).toBeGreaterThan(2);
      // Monotonically non-decreasing x across the whole stroke is the
      // structural guarantee against self-intersection.
      for (let i = 1; i < xs.length; i++) {
        expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1] - 1e-9);
      }
    }
  });

  it("produces visibly distinct point patterns across the curveSharpness continuum (rounded / pointed / clipped)", () => {
    const rounded = buildArchStrokes(archParams({ curveSharpness: 0.1, archCount: 1 }));
    const pointed = buildArchStrokes(archParams({ curveSharpness: 0.5, archCount: 1 }));
    const clipped = buildArchStrokes(archParams({ curveSharpness: 0.9, archCount: 1 }));

    // Rounded uses several interpolated shoulder points per arch; pointed
    // uses exactly one peak point; clipped uses two (a flat plateau).
    expect(rounded[0].points.length).toBeGreaterThan(pointed[0].points.length);
    expect(clipped[0].points.length).toBeGreaterThan(pointed[0].points.length);
  });

  it("reaches approximately the requested height at the peak", () => {
    const strokes = buildArchStrokes(archParams({ height: 15, curveSharpness: 0.5, archCount: 1 }));
    const minY = Math.min(...strokes[0].points.map((p) => p.y));
    expect(Math.abs(minY)).toBeCloseTo(15, 5);
  });
});

describe("generateGlyphInstances", () => {
  function beat(id: string, index: number, energy: number): BeatUnit {
    return {
      id, sectionId: "s0", phraseId: null, barId: "bar-0", index, indexWithinBar: index,
      startSeconds: index * 0.5, durationSeconds: 0.375, startBeat: index, durationBeats: 1,
      energy, attackSharpness: 0.5, onsetDensity: 0, sustain: 0.5,
      pitchMovement: null, spectralBrightness: null, accentStrength: 0,
      confidence: { value: 0.9, source: "analysis" },
    };
  }

  const rule: MappingRule = {
    id: "r1", name: "energy-to-height", source: "energy", target: "glyphHeight",
    inputRange: [0, 1], outputRange: [5, 25], curve: "linear",
    invert: false, clamp: true, enabled: true, priority: 0,
  };

  const preset: MappingPreset = {
    id: "p1", schemaVersion: 1, name: "default", description: "", grammarId: "arch-script-v1",
    rules: [rule], boundaryRules: [], createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
  };

  const grammar: GlyphGrammar = {
    id: "g1", schemaVersion: 1, grammarType: "arch-script-v1", name: "Arch Script",
    defaultParameters: archParams({ handmadeVariance: 0 }),
    createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
  };

  it("produces one glyph instance per beat, referencing the correct beatUnitId", () => {
    const beats = [beat("b0", 0, 0.2), beat("b1", 1, 0.8)];
    const instances = generateGlyphInstances(beats, preset, grammar, 1);
    expect(instances).toHaveLength(2);
    expect(instances[0].beatUnitId).toBe("b0");
    expect(instances[1].beatUnitId).toBe("b1");
    expect(instances[0].grammarId).toBe("arch-script-v1");
  });

  it("produces visibly distinct heights for a low-energy beat and a high-energy beat", () => {
    const beats = [beat("b0", 0, 0.1), beat("b1", 1, 0.9)];
    const instances = generateGlyphInstances(beats, preset, grammar, 1);
    expect(instances[1].parameters.height).toBeGreaterThan(instances[0].parameters.height);
  });

  it("preserves grammar-default fields the mapping preset never targets (entryOvershoot, dotEnabled)", () => {
    const beats = [beat("b0", 0, 0.5)];
    const instances = generateGlyphInstances(beats, preset, grammar, 1);
    expect(instances[0].parameters.entryOvershoot).toBe(grammar.defaultParameters.entryOvershoot);
    expect(instances[0].parameters.dotEnabled).toBe(grammar.defaultParameters.dotEnabled);
  });

  it("is deterministic for a fixed seed", () => {
    const beats = [beat("b0", 0, 0.5)];
    const a = generateGlyphInstances(beats, preset, grammar, 42);
    const b = generateGlyphInstances(beats, preset, grammar, 42);
    expect(a).toEqual(b);
  });
});
