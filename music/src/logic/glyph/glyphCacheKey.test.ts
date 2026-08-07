import { describe, it, expect } from "vitest";
import { computeGlyphCacheKey, computeFullCanvasCacheKey, type GlyphCacheKeyInput, type FullCanvasCacheKeyInput } from "./glyphCacheKey";
import { DEFAULT_CONNECTION_GRAMMAR } from "./connectionGrammar";
import type { MappingPreset } from "../../data/glyphMappingTypes";
import type { GlyphGrammar } from "../../data/glyphGrammarTypes";
import type { ManuscriptLayoutPreset } from "../../data/glyphLayoutTypes";
import type { ConnectionGrammar } from "../../data/glyphConnectionTypes";
import type { GlyphCanvasPreset } from "../../data/glyphCanvasTypes";
import { SQUARE_CANVAS_PRESET } from "../../data/glyphCanvasTypes";

const mappingPresetSnapshot: MappingPreset = {
  id: "p1", schemaVersion: 1, name: "Default", description: "", grammarId: "arch-script-v1",
  rules: [{
    id: "r1", name: "energy-to-height", source: "energy", target: "glyphHeight",
    inputRange: [0, 1], outputRange: [5, 25], curve: "linear", invert: false, clamp: true, enabled: true, priority: 0,
  }],
  boundaryRules: [], createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
};

const grammarSnapshot: GlyphGrammar = {
  id: "g1", schemaVersion: 1, grammarType: "arch-script-v1", name: "Arch Script",
  defaultParameters: {
    archCount: 1, width: 20, height: 10, curveSharpness: 0.2, asymmetry: 0, baselineOffset: 0,
    connectorLength: 4, connectorSag: 1, entryOvershoot: 2, exitOvershoot: 2, localCompression: 0,
    dotEnabled: false, dotSize: 1, dotOffset: 0, handmadeVariance: 0,
  },
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
};

const layoutPresetSnapshot: ManuscriptLayoutPreset = {
  id: "l1", type: "manuscriptRows", pageWidthMm: 210, pageHeightMm: 297, marginMm: 15,
  barsPerRow: 4, rowGapMm: 10, baseBeatWidthMm: 10, alignBars: true, sectionStartsNewRow: true, preserveSilence: true,
};

const connectionGrammarSnapshot: ConnectionGrammar = DEFAULT_CONNECTION_GRAMMAR;

function input(overrides: Partial<GlyphCacheKeyInput> = {}): GlyphCacheKeyInput {
  return {
    analysisId: "a1", analysisVersion: "glyph-beat-analyzer-v1",
    mappingPresetSnapshot, grammarSnapshot, connectionGrammarSnapshot, layoutPresetSnapshot,
    seed: 42, rendererVersion: "glyph-svg-export-v1",
    ...overrides,
  };
}

describe("computeGlyphCacheKey", () => {
  it("is deterministic for identical input", () => {
    expect(computeGlyphCacheKey(input())).toBe(computeGlyphCacheKey(input()));
  });

  it("changes when analysisId changes", () => {
    expect(computeGlyphCacheKey(input())).not.toBe(computeGlyphCacheKey(input({ analysisId: "a2" })));
  });

  it("changes when the mapping preset snapshot's rules change", () => {
    const changed: MappingPreset = { ...mappingPresetSnapshot, rules: [{ ...mappingPresetSnapshot.rules[0], outputRange: [0, 100] }] };
    expect(computeGlyphCacheKey(input())).not.toBe(computeGlyphCacheKey(input({ mappingPresetSnapshot: changed })));
  });

  it("changes when the grammar snapshot's default parameters change", () => {
    const changed: GlyphGrammar = { ...grammarSnapshot, defaultParameters: { ...grammarSnapshot.defaultParameters, archCount: 3 } };
    expect(computeGlyphCacheKey(input())).not.toBe(computeGlyphCacheKey(input({ grammarSnapshot: changed })));
  });

  it("changes when the layout preset snapshot's geometry changes", () => {
    const changed: ManuscriptLayoutPreset = { ...layoutPresetSnapshot, barsPerRow: 2 };
    expect(computeGlyphCacheKey(input())).not.toBe(computeGlyphCacheKey(input({ layoutPresetSnapshot: changed })));
  });

  it("changes when the seed changes", () => {
    expect(computeGlyphCacheKey(input())).not.toBe(computeGlyphCacheKey(input({ seed: 43 })));
  });

  it("changes when the renderer version changes", () => {
    expect(computeGlyphCacheKey(input())).not.toBe(computeGlyphCacheKey(input({ rendererVersion: "glyph-svg-export-v2" })));
  });

  it("does NOT change when only a cosmetic field (name) on the mapping preset snapshot changes", () => {
    const renamed: MappingPreset = { ...mappingPresetSnapshot, name: "Renamed Preset" };
    expect(computeGlyphCacheKey(input())).toBe(computeGlyphCacheKey(input({ mappingPresetSnapshot: renamed })));
  });

  it("does NOT change when only the layout preset snapshot's id changes", () => {
    const reIded: ManuscriptLayoutPreset = { ...layoutPresetSnapshot, id: "l2" };
    expect(computeGlyphCacheKey(input())).toBe(computeGlyphCacheKey(input({ layoutPresetSnapshot: reIded })));
  });

  it("changes when the connection grammar's connection mode changes", () => {
    const changed: ConnectionGrammar = { ...connectionGrammarSnapshot, connectionMode: "withinBar" };
    expect(computeGlyphCacheKey(input())).not.toBe(computeGlyphCacheKey(input({ connectionGrammarSnapshot: changed })));
  });

  it("changes when a boundary behavior changes", () => {
    const changed: ConnectionGrammar = { ...connectionGrammarSnapshot, barBoundaryBehavior: "break" };
    expect(computeGlyphCacheKey(input())).not.toBe(computeGlyphCacheKey(input({ connectionGrammarSnapshot: changed })));
  });

  it("changes when the connector style changes", () => {
    const changed: ConnectionGrammar = { ...connectionGrammarSnapshot, connectorMode: "straight" };
    expect(computeGlyphCacheKey(input())).not.toBe(computeGlyphCacheKey(input({ connectionGrammarSnapshot: changed })));
  });

  it("changes when a geometry threshold changes", () => {
    const changed: ConnectionGrammar = { ...connectionGrammarSnapshot, connectorDistanceMultiplier: 3 };
    expect(computeGlyphCacheKey(input())).not.toBe(computeGlyphCacheKey(input({ connectionGrammarSnapshot: changed })));
  });

  it("changes when a punctuation size changes", () => {
    const changed: ConnectionGrammar = { ...connectionGrammarSnapshot, punctuationDotSize: 5 };
    expect(computeGlyphCacheKey(input())).not.toBe(computeGlyphCacheKey(input({ connectionGrammarSnapshot: changed })));
  });

  it("does NOT change when only the connection grammar snapshot's name changes", () => {
    const renamed: ConnectionGrammar = { ...connectionGrammarSnapshot, name: "Renamed" };
    expect(computeGlyphCacheKey(input())).toBe(computeGlyphCacheKey(input({ connectionGrammarSnapshot: renamed })));
  });
});

const canvasPresetSnapshot: GlyphCanvasPreset = SQUARE_CANVAS_PRESET;

function fullCanvasInput(overrides: Partial<FullCanvasCacheKeyInput> = {}): FullCanvasCacheKeyInput {
  return {
    analysisId: "a1", analysisVersion: "glyph-beat-analyzer-v1",
    confirmedBpm: 128, pulseTruthVersion: "pulse-truth-v1", phaseOffsetSeconds: 0.05,
    mappingPresetSnapshot, glyphGrammarSnapshot: grammarSnapshot, connectionGrammarSnapshot,
    canvasPresetSnapshot, layoutSettings: { minPulseWidth: 10, maxPulseWidth: 60, rowGap: 20, sectionGap: 60 },
    drumLayerAnalyzerVersion: "glyph-drum-detector-v1", drumLayerSource: "fullMix",
    eventVocabularyAnalyzerVersion: "glyph-event-vocabulary-v1", eventClassificationThresholds: "clap-thresholds-v1",
    laserAnalyzerVersion: "glyph-laser-analyzer-v1", laserSource: "fullMix", laserRenderMode: "oscillationLine",
    laserActivityThreshold: 0.15, laserAmplitude: 10, laserSmoothing: 0.5, laserVerticalOffset: 60, laserStrokeWidth: 0.3,
    colorMode: "monochrome", coverAccent: null,
    seed: 1, rendererVersion: "glyph-svg-export-v1",
    ...overrides,
  };
}

describe("computeFullCanvasCacheKey", () => {
  it("is deterministic for identical input", () => {
    expect(computeFullCanvasCacheKey(fullCanvasInput())).toBe(computeFullCanvasCacheKey(fullCanvasInput()));
  });

  it("changes when confirmedBpm changes", () => {
    expect(computeFullCanvasCacheKey(fullCanvasInput())).not.toBe(computeFullCanvasCacheKey(fullCanvasInput({ confirmedBpm: 130 })));
  });

  it("changes when phaseOffsetSeconds changes", () => {
    expect(computeFullCanvasCacheKey(fullCanvasInput())).not.toBe(computeFullCanvasCacheKey(fullCanvasInput({ phaseOffsetSeconds: 0.1 })));
  });

  it("changes when the canvas preset shape changes", () => {
    const changed: GlyphCanvasPreset = { ...canvasPresetSnapshot, shape: "portrait", widthUnits: 2400 };
    expect(computeFullCanvasCacheKey(fullCanvasInput())).not.toBe(computeFullCanvasCacheKey(fullCanvasInput({ canvasPresetSnapshot: changed })));
  });

  it("changes when layout density settings change", () => {
    expect(computeFullCanvasCacheKey(fullCanvasInput())).not.toBe(
      computeFullCanvasCacheKey(fullCanvasInput({ layoutSettings: { minPulseWidth: 5, maxPulseWidth: 60, rowGap: 20, sectionGap: 60 } })),
    );
  });

  it("changes when the drum layer source changes", () => {
    expect(computeFullCanvasCacheKey(fullCanvasInput())).not.toBe(computeFullCanvasCacheKey(fullCanvasInput({ drumLayerSource: "drumStem" })));
  });

  it("changes when the renderer version changes", () => {
    expect(computeFullCanvasCacheKey(fullCanvasInput())).not.toBe(computeFullCanvasCacheKey(fullCanvasInput({ rendererVersion: "glyph-svg-export-v2" })));
  });

  it("does NOT change when only the canvas preset's cosmetic name changes", () => {
    const renamed: GlyphCanvasPreset = { ...canvasPresetSnapshot, name: "Renamed" };
    expect(computeFullCanvasCacheKey(fullCanvasInput())).toBe(computeFullCanvasCacheKey(fullCanvasInput({ canvasPresetSnapshot: renamed })));
  });

  // 0804E (docs/glyph-audio/0804_GLYPH_NOTES_Event_Vocabulary_Laser_Layer_Spec_v0.1.0.md §16).
  it("changes when the event classification threshold version changes", () => {
    expect(computeFullCanvasCacheKey(fullCanvasInput())).not.toBe(
      computeFullCanvasCacheKey(fullCanvasInput({ eventClassificationThresholds: "clap-thresholds-v2" })),
    );
  });

  it("changes when the laser source changes", () => {
    expect(computeFullCanvasCacheKey(fullCanvasInput())).not.toBe(computeFullCanvasCacheKey(fullCanvasInput({ laserSource: "otherStem" })));
  });

  it("changes when the laser render mode changes", () => {
    expect(computeFullCanvasCacheKey(fullCanvasInput())).not.toBe(computeFullCanvasCacheKey(fullCanvasInput({ laserRenderMode: "segmentedBeam" })));
  });

  it("changes when the laser activity threshold changes", () => {
    expect(computeFullCanvasCacheKey(fullCanvasInput())).not.toBe(computeFullCanvasCacheKey(fullCanvasInput({ laserActivityThreshold: 0.3 })));
  });

  it("changes when colorMode changes", () => {
    expect(computeFullCanvasCacheKey(fullCanvasInput())).not.toBe(computeFullCanvasCacheKey(fullCanvasInput({ colorMode: "cover", coverAccent: "frank-preset-v1" })));
  });

  it("does not change when only preview-only settings are absent from both sides (laser layer never analyzed)", () => {
    const unanalyzed = { laserAnalyzerVersion: null, laserSource: null, laserRenderMode: null, laserActivityThreshold: null, laserAmplitude: null, laserSmoothing: null, laserVerticalOffset: null, laserStrokeWidth: null };
    expect(computeFullCanvasCacheKey(fullCanvasInput(unanalyzed))).toBe(computeFullCanvasCacheKey(fullCanvasInput(unanalyzed)));
  });
});
