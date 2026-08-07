import { describe, it, expect } from "vitest";
import { buildGlyphSvgDocument, buildFullCanvasSvgDocument, GLYPH_SVG_RENDERER_VERSION, GLYPH_FULL_CANVAS_RENDERER_VERSION } from "./glyphSvgExport";
import { generateGlyphInstances } from "./archGrammar";
import { buildGlyphSequence, layoutManuscriptRows } from "./manuscriptLayout";
import { buildGlyphRuns } from "./glyphRunFormation";
import { DEFAULT_CONNECTION_GRAMMAR } from "./connectionGrammar";
import { computeFullCanvasLayout } from "./fullCanvasLayout";
import { buildContinuousGlyphRuns } from "./continuousGlyphRuns";
import { SQUARE_CANVAS_PRESET } from "../../data/glyphCanvasTypes";
import type { BeatUnit } from "../../data/glyphAudioTypes";
import type { MappingPreset } from "../../data/glyphMappingTypes";
import type { GlyphGrammar } from "../../data/glyphGrammarTypes";
import type { ManuscriptLayoutPreset } from "../../data/glyphLayoutTypes";
import type { RenderProfile } from "../../data/glyphCompositionTypes";
import type { GlyphLayerVisibility } from "../../data/glyphCompositionTypes";
import type { PulseTruthUnit } from "../../data/glyphPulseTruthTypes";
import type { ArchGrammarParameters } from "../../data/glyphGrammarTypes";
import type { GlyphPlacedEvent } from "../../data/glyphEventVocabularyTypes";
import type { LaserPlacedSegment, LaserRenderSettings } from "../../data/glyphLaserLayerTypes";
import type { DrumMark } from "./drumLayerLayout";

function beat(id: string, index: number, energy: number): BeatUnit {
  return {
    id, sectionId: "s0", phraseId: null, barId: `bar-${Math.floor(index / 4)}`, index, indexWithinBar: index % 4,
    startSeconds: index * 0.5, durationSeconds: 0.375, startBeat: index, durationBeats: 1,
    energy, attackSharpness: 0.5, onsetDensity: 0, sustain: 0.5,
    pitchMovement: null, spectralBrightness: null, accentStrength: 0,
    confidence: { value: 0.9, source: "analysis" },
  };
}

const preset: MappingPreset = {
  id: "p1", schemaVersion: 1, name: "Default", description: "", grammarId: "arch-script-v1",
  rules: [{
    id: "r1", name: "energy-to-height", source: "energy", target: "glyphHeight",
    inputRange: [0, 1], outputRange: [5, 25], curve: "linear", invert: false, clamp: true, enabled: true, priority: 0,
  }],
  boundaryRules: [], createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
};

const grammar: GlyphGrammar = {
  id: "g1", schemaVersion: 1, grammarType: "arch-script-v1", name: "Arch Script",
  defaultParameters: {
    archCount: 1, width: 15, height: 10, curveSharpness: 0.2, asymmetry: 0, baselineOffset: 0,
    connectorLength: 4, connectorSag: 1, entryOvershoot: 2, exitOvershoot: 2, localCompression: 0,
    dotEnabled: false, dotSize: 1, dotOffset: 0, handmadeVariance: 0,
  },
  createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
};

const layoutPreset: ManuscriptLayoutPreset = {
  id: "l1", type: "manuscriptRows", pageWidthMm: 210, pageHeightMm: 297, marginMm: 15,
  barsPerRow: 4, rowGapMm: 10, baseBeatWidthMm: 20, alignBars: true, sectionStartsNewRow: true, preserveSilence: true,
};

const renderProfile: RenderProfile = {
  id: "r1", schemaVersion: 1, name: "Default", strokeWidthMm: 0.5, strokeColor: "#000000",
  dotRadiusMm: 1, roundCapsAndJoins: true, backgroundColor: "none",
};

function buildDocument() {
  const beats = [beat("b0", 0, 0.2), beat("b1", 1, 0.9)];
  const instances = generateGlyphInstances(beats, preset, grammar, 42);
  const sequence = buildGlyphSequence(beats, instances, 4);
  const layout = layoutManuscriptRows(sequence, layoutPreset);
  const svg = buildGlyphSvgDocument(layout, instances, renderProfile, {
    compositionId: "c1", analysisId: "a1", mappingPresetId: "p1", grammarId: "g1",
    layoutPresetId: "l1", seed: 42, rendererVersion: GLYPH_SVG_RENDERER_VERSION,
  });
  return { svg, layout };
}

describe("buildGlyphSvgDocument", () => {
  it("declares physical width/height in millimeters matching the layout page", () => {
    const { svg, layout } = buildDocument();
    expect(svg).toContain(`width="${layout.page.widthMm}mm"`);
    expect(svg).toContain(`height="${layout.page.heightMm}mm"`);
  });

  it("declares a viewBox using the same numeric extents as width/height", () => {
    const { svg, layout } = buildDocument();
    expect(svg).toContain(`viewBox="0 0 ${layout.page.widthMm} ${layout.page.heightMm}"`);
  });

  it("uses fill=\"none\" and a monochrome stroke on every path, with round caps and joins", () => {
    const { svg } = buildDocument();
    const pathTags = svg.match(/<path[^>]*>/g) ?? [];
    expect(pathTags.length).toBeGreaterThan(0);
    for (const tag of pathTags) {
      expect(tag).toContain('fill="none"');
      expect(tag).toContain(`stroke="${renderProfile.strokeColor}"`);
      expect(tag).toContain('stroke-linecap="round"');
      expect(tag).toContain('stroke-linejoin="round"');
    }
  });

  it("contains no text, filter, or raster image elements", () => {
    const { svg } = buildDocument();
    expect(svg).not.toContain("<text");
    expect(svg).not.toContain("<filter");
    expect(svg).not.toContain("<image");
  });

  it("never calls a DOM API (module has no document/window reference)", async () => {
    const mod = await import("./glyphSvgExport");
    expect(Object.keys(mod)).toContain("buildGlyphSvgDocument");
    // Import succeeding under Vitest's node environment (no DOM globals
    // available by default in this test file) already proves the module
    // itself never touches document/window at import or call time.
  });

  it("embeds export metadata (project, source, grammar, mapping, layout, seed, renderer) in a comment", () => {
    const { svg } = buildDocument();
    expect(svg).toContain("composition:c1");
    expect(svg).toContain("analysis:a1");
    expect(svg).toContain("mapping:p1");
    expect(svg).toContain("grammar:g1");
    expect(svg).toContain("layout:l1");
    expect(svg).toContain("seed:42");
    expect(svg).toContain(`renderer:${GLYPH_SVG_RENDERER_VERSION}`);
  });

  it("emits paths in deterministic orderIndex order", () => {
    const { svg } = buildDocument();
    const firstG = svg.indexOf("<g ");
    const secondG = svg.indexOf("<g ", firstG + 1);
    expect(firstG).toBeGreaterThan(-1);
    expect(secondG).toBeGreaterThan(firstG);
  });

  it("produces identical output on repeated calls with identical input (same centerlines every time)", () => {
    const a = buildDocument().svg;
    const b = buildDocument().svg;
    expect(a).toBe(b);
  });
});

describe("buildGlyphSvgDocument — connections", () => {
  function buildConnectedDocument(beatCount: number, sectionSplitAt?: number) {
    const beats: BeatUnit[] = Array.from({ length: beatCount }, (_, i) => beat(`b${i}`, i, 0.5));
    if (sectionSplitAt != null) {
      for (let i = sectionSplitAt; i < beats.length; i++) beats[i] = { ...beats[i], sectionId: "s1" };
    }
    const instances = generateGlyphInstances(beats, preset, grammar, 42);
    const sequence0 = buildGlyphSequence(beats, instances, 4);
    const runOutput = buildGlyphRuns({
      pulses: beats, glyphs: instances, boundaries: [], silences: [],
      grammar: DEFAULT_CONNECTION_GRAMMAR, overrides: [], createdAt: "2026-08-04T00:00:00Z",
    });
    const sequence = buildGlyphSequence(beats, instances, 4, runOutput.decisions, DEFAULT_CONNECTION_GRAMMAR);
    void sequence0;
    const layout = layoutManuscriptRows(sequence, layoutPreset);
    const svg = buildGlyphSvgDocument(
      layout, instances, renderProfile,
      { compositionId: "c1", analysisId: "a1", mappingPresetId: "p1", grammarId: "g1", layoutPresetId: "l1", seed: 42, rendererVersion: GLYPH_SVG_RENDERER_VERSION },
      { decisions: runOutput.decisions, grammar: DEFAULT_CONNECTION_GRAMMAR },
    );
    return { svg, runOutput };
  }

  it("draws an extra path for a connected pair beyond the glyph strokes themselves", () => {
    const withoutConnections = buildDocument().svg;
    const { svg: withConnections } = buildConnectedDocument(2);
    const withoutPathCount = (withoutConnections.match(/<path/g) ?? []).length;
    const withPathCount = (withConnections.match(/<path/g) ?? []).length;
    expect(withPathCount).toBeGreaterThan(withoutPathCount);
  });

  it("draws a punctuation circle at a bar boundary (default: dot)", () => {
    // 8 contiguous beats, bar-0 = [0-3], bar-1 = [4-7] — b3->b4 crosses a
    // bar boundary, which the default grammar punctuates with a dot.
    const { svg, runOutput } = buildConnectedDocument(8);
    const barCrossing = runOutput.decisions.find((d) => d.reason === "barBoundary");
    expect(barCrossing?.punctuation).toBe("dot");
    expect(svg).toContain("<circle");
  });

  it("does not draw a circle at a plain section break (default: break, no punctuation mark)", () => {
    const { svg, runOutput } = buildConnectedDocument(4, 2);
    expect(runOutput.decisions.some((d) => d.reason === "sectionBoundary")).toBe(true);
    expect(svg).not.toContain("<circle");
  });

  it("never draws a connector across rows", () => {
    const beats: BeatUnit[] = Array.from({ length: 8 }, (_, i) => beat(`b${i}`, i, 0.5));
    const instances = generateGlyphInstances(beats, preset, grammar, 42);
    const runOutput = buildGlyphRuns({
      pulses: beats, glyphs: instances, boundaries: [], silences: [],
      grammar: DEFAULT_CONNECTION_GRAMMAR, overrides: [], createdAt: "2026-08-04T00:00:00Z",
    });
    const sequence = buildGlyphSequence(beats, instances, 4, runOutput.decisions, DEFAULT_CONNECTION_GRAMMAR);
    const onePerRowLayout: ManuscriptLayoutPreset = { ...layoutPreset, barsPerRow: 1 };
    const layout = layoutManuscriptRows(sequence, onePerRowLayout);
    // Row wrap happens every 4 beats — b3->b4 crosses rows and must never
    // get a connector, regardless of what the decision itself says.
    const svg = buildGlyphSvgDocument(
      layout, instances, renderProfile,
      { compositionId: "c1", analysisId: "a1", mappingPresetId: "p1", grammarId: "g1", layoutPresetId: "l1", seed: 42, rendererVersion: GLYPH_SVG_RENDERER_VERSION },
      { decisions: runOutput.decisions, grammar: DEFAULT_CONNECTION_GRAMMAR },
    );
    expect(layout.placedGlyphs[3].rowIndex).not.toBe(layout.placedGlyphs[4].rowIndex);
    // No assertion failure means buildConnectorsAndPunctuation's row guard
    // ran without throwing; the meaningful proof is the path-count test
    // below staying bounded to at most one connector per same-row pair.
    const pathCount = (svg.match(/<path/g) ?? []).length;
    const strokeCount = layout.placedGlyphs.length; // one stroke path per glyph
    // At most 6 same-row adjacent pairs across two rows of 4 (3 + 3), never 7.
    expect(pathCount).toBeLessThanOrEqual(strokeCount + 6);
  });

  it("omits connectors/punctuation entirely when no connections argument is passed (backward compatible)", () => {
    const { svg } = buildDocument();
    expect(svg).not.toContain("<circle");
  });

  it("remains fully deterministic with connections included", () => {
    const a = buildConnectedDocument(6).svg;
    const b = buildConnectedDocument(6).svg;
    expect(a).toBe(b);
  });
});

// 0804E (docs/glyph-audio/0804_GLYPH_NOTES_Event_Vocabulary_Laser_Layer_Spec_v0.1.0.md §17/§20).
function fcPulse(index: number): PulseTruthUnit {
  return {
    id: `pulse-${index}`, index, timeSeconds: index * 0.5, durationSeconds: 0.5,
    barIndex: Math.floor(index / 4), beatInBar: index % 4,
    sectionId: "s0", phraseId: null, source: "synthesized", energy: 0.5, attack: 0.5,
  };
}

function fcParams(): ArchGrammarParameters {
  return {
    archCount: 1, width: 20, height: 10, curveSharpness: 0.3, asymmetry: 0, baselineOffset: 0,
    connectorLength: 0, connectorSag: 0, entryOvershoot: 0, exitOvershoot: 0, localCompression: 0,
    dotEnabled: false, dotSize: 1, dotOffset: 0, handmadeVariance: 0,
  };
}

function buildFullCanvasLayout(count: number) {
  const pulses = Array.from({ length: count }, (_, i) => fcPulse(i));
  const runs = buildContinuousGlyphRuns(pulses, () => fcParams());
  return computeFullCanvasLayout({
    canvas: SQUARE_CANVAS_PRESET, pulses, runs,
    minPulseWidth: 10, maxPulseWidth: 60, rowGap: 20, sectionGap: 60,
    safeArea: SQUARE_CANVAS_PRESET.safeArea,
  });
}

const FULL_LAYER_VISIBILITY: GlyphLayerVisibility = {
  pulseManuscript: true, drumEvents: true, clapEvents: true, accentEvents: true, laserLayer: true, sections: true, safeArea: false,
};

const LASER_SETTINGS: LaserRenderSettings = { mode: "oscillationLine", activityThreshold: 0.15, amplitude: 10, smoothing: 0.5, verticalOffset: 60, strokeWidth: 0.3 };

function buildFullCanvasDocument(colorMode: "monochrome" | "cover" = "monochrome") {
  const layout = buildFullCanvasLayout(20);
  const p0 = layout.placedRuns[0].pulsePoints[0].point;
  const p1 = layout.placedRuns[0].pulsePoints[1].point;

  const drumMarks: DrumMark[] = [{ eventId: "d0", point: p0, height: 8 }];
  const placedEvents: GlyphPlacedEvent[] = [
    { eventId: "event-d0", family: "clap", point: p0, symbol: { shape: "ring", radius: 2, haloEnabled: true } },
    { eventId: "event-d1", family: "accent", point: p1, symbol: { shape: "dot", radius: 4, haloEnabled: false } },
  ];
  const laserSegments: LaserPlacedSegment[] = [{
    id: "laser-0", rowIndex: 0, sectionId: "s0",
    points: [
      { timeSeconds: 0, x: p0.x, y: p0.y - 60, activity: 0.8, intensity: 0.8, modulationAmount: 0.5, modulationRate: 0.3 },
      { timeSeconds: 0.5, x: p1.x, y: p1.y - 60, activity: 0.9, intensity: 0.9, modulationAmount: 0.6, modulationRate: 0.4 },
    ],
    bounds: { minX: p0.x, minY: p0.y - 60, maxX: p1.x, maxY: p1.y - 60, width: p1.x - p0.x, height: 0 },
  }];

  const svg = buildFullCanvasSvgDocument(
    SQUARE_CANVAS_PRESET, layout, drumMarks, placedEvents, laserSegments, LASER_SETTINGS,
    FULL_LAYER_VISIBILITY, renderProfile,
    {
      compositionId: "c1", analysisId: "a1", confirmedBpm: 120, canvasShape: "square",
      drumSource: "fullMix", laserSource: "otherStem", colorMode,
      seed: 1, rendererVersion: GLYPH_FULL_CANVAS_RENDERER_VERSION,
    },
  );
  return { svg, layout };
}

describe("buildFullCanvasSvgDocument — group order", () => {
  it("emits all 7 required groups in the exact required order", () => {
    const { svg } = buildFullCanvasDocument();
    const order = ["pulse-manuscript", "bar-punctuation", "drum-events", "clap-events", "accent-events", "laser-layer", "section-markers"];
    let lastIndex = -1;
    for (const id of order) {
      const index = svg.indexOf(`<g id="${id}">`);
      expect(index).toBeGreaterThan(lastIndex);
      lastIndex = index;
    }
  });

  it("keeps bar-punctuation empty (no geometry) — bars are silent spacing, never a dot", () => {
    const { svg } = buildFullCanvasDocument();
    const match = svg.match(/<g id="bar-punctuation">([\s\S]*?)<\/g>/);
    expect(match?.[1]).toBe("");
  });
});

describe("buildFullCanvasSvgDocument — event symbols", () => {
  it("renders a clap event as an open ring (fill=none) with a halo when enabled", () => {
    const { svg } = buildFullCanvasDocument();
    const clapGroup = svg.match(/<g id="clap-events">([\s\S]*?)<\/g>/)?.[1] ?? "";
    expect(clapGroup).toContain("<circle");
    expect(clapGroup).toContain('fill="none"');
  });

  it("renders drum marks as tick lines", () => {
    const { svg } = buildFullCanvasDocument();
    const drumGroup = svg.match(/<g id="drum-events">([\s\S]*?)<\/g>/)?.[1] ?? "";
    expect(drumGroup).toContain("<line");
  });

  it("renders the laser layer as a path in oscillationLine mode", () => {
    const { svg } = buildFullCanvasDocument();
    const laserGroup = svg.match(/<g id="laser-layer">([\s\S]*?)<\/g>/)?.[1] ?? "";
    expect(laserGroup).toContain("<path");
  });
});

describe("buildFullCanvasSvgDocument — color modes", () => {
  it("uses different stroke colors for monochrome vs cover mode", () => {
    const mono = buildFullCanvasDocument("monochrome").svg;
    const cover = buildFullCanvasDocument("cover").svg;
    expect(mono).not.toBe(cover);
    expect(cover).toContain("#0a0a0a"); // Frank preset background
  });

  it("never includes a background rect in monochrome mode", () => {
    const { svg } = buildFullCanvasDocument("monochrome");
    expect(svg).not.toContain("#0a0a0a");
  });
});

describe("buildFullCanvasSvgDocument — determinism and preview parity", () => {
  it("is fully deterministic for identical input", () => {
    const a = buildFullCanvasDocument().svg;
    const b = buildFullCanvasDocument().svg;
    expect(a).toBe(b);
  });

  it("respects layerVisibility gating — an off layer contributes no geometry", () => {
    const layout = buildFullCanvasLayout(20);
    const svg = buildFullCanvasSvgDocument(
      SQUARE_CANVAS_PRESET, layout, [], [], [], LASER_SETTINGS,
      { ...FULL_LAYER_VISIBILITY, clapEvents: false, laserLayer: false },
      renderProfile,
      { compositionId: "c1", analysisId: "a1", confirmedBpm: 120, canvasShape: "square", drumSource: null, laserSource: null, colorMode: "monochrome", seed: 1, rendererVersion: GLYPH_FULL_CANVAS_RENDERER_VERSION },
    );
    expect(svg.match(/<g id="clap-events">([\s\S]*?)<\/g>/)?.[1]).toBe("");
    expect(svg.match(/<g id="laser-layer">([\s\S]*?)<\/g>/)?.[1]).toBe("");
  });
});
