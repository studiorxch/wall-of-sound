import { describe, it, expect } from "vitest";
import { buildGlyphSequence, layoutManuscriptRows } from "./manuscriptLayout";
import { DEFAULT_CONNECTION_GRAMMAR } from "./connectionGrammar";
import type { BeatUnit } from "../../data/glyphAudioTypes";
import type { GeneratedGlyphInstance } from "../../data/glyphGrammarTypes";
import type { ManuscriptLayoutPreset } from "../../data/glyphLayoutTypes";
import type { ConnectionDecision } from "../../data/glyphConnectionTypes";

function beat(id: string, index: number): BeatUnit {
  return {
    id, sectionId: "s0", phraseId: null, barId: `bar-${Math.floor(index / 4)}`, index, indexWithinBar: index % 4,
    startSeconds: index * 0.5, durationSeconds: 0.375, startBeat: index, durationBeats: 1,
    energy: 0.5, attackSharpness: 0.5, onsetDensity: 0, sustain: 0.5,
    pitchMovement: null, spectralBrightness: null, accentStrength: 0,
    confidence: { value: 0.9, source: "analysis" },
  };
}

function instance(beatUnitId: string): GeneratedGlyphInstance {
  return {
    id: `glyph-${beatUnitId}`, beatUnitId, grammarId: "arch-script-v1",
    parameters: {
      archCount: 1, width: 20, height: 10, curveSharpness: 0.2, asymmetry: 0, baselineOffset: 0,
      connectorLength: 4, connectorSag: 1, entryOvershoot: 2, exitOvershoot: 2, localCompression: 0,
      dotEnabled: false, dotSize: 1, dotOffset: 0, handmadeVariance: 0,
    },
    seed: 1,
  };
}

const preset: ManuscriptLayoutPreset = {
  id: "layout-1", type: "manuscriptRows", pageWidthMm: 210, pageHeightMm: 297, marginMm: 15,
  barsPerRow: 4, rowGapMm: 10, baseBeatWidthMm: 10, alignBars: true, sectionStartsNewRow: true, preserveSilence: true,
};

describe("buildGlyphSequence", () => {
  it("produces one sequence item per beat that has a matching glyph instance", () => {
    const beats = [beat("b0", 0), beat("b1", 1)];
    const instances = [instance("b0"), instance("b1")];
    const sequence = buildGlyphSequence(beats, instances, 4);
    expect(sequence).toHaveLength(2);
    expect(sequence[0].glyphInstanceId).toBe("glyph-b0");
  });

  it("drops a beat with no corresponding glyph instance rather than emitting an empty id", () => {
    const beats = [beat("b0", 0), beat("b1", 1)];
    const instances = [instance("b0")];
    const sequence = buildGlyphSequence(beats, instances, 4);
    expect(sequence).toHaveLength(1);
    expect(sequence[0].beatUnitId).toBe("b0");
  });

  it("computes barIndex from beatsPerBar", () => {
    const beats = [beat("b0", 0), beat("b4", 4)];
    const instances = [instance("b0"), instance("b4")];
    const sequence = buildGlyphSequence(beats, instances, 4);
    expect(sequence[0].barIndex).toBe(0);
    expect(sequence[1].barIndex).toBe(1);
  });

  function decision(toPulseId: string, overrides: Partial<ConnectionDecision> = {}): ConnectionDecision {
    return {
      id: `conn-${toPulseId}`, fromPulseId: "x", toPulseId,
      fromGlyphInstanceId: "gx", toGlyphInstanceId: `glyph-${toPulseId}`,
      result: "connected", reason: "sameRun", createdAt: "2026-08-04T00:00:00Z",
      ...overrides,
    };
  }

  it("without decisions/grammar, every spacingBefore stays 0 (unchanged default behavior)", () => {
    const beats = [beat("b0", 0), beat("b1", 1)];
    const instances = [instance("b0"), instance("b1")];
    const sequence = buildGlyphSequence(beats, instances, 4);
    expect(sequence.every((s) => s.spacingBefore === 0)).toBe(true);
  });

  it("a connected decision contributes zero spacingBefore", () => {
    const beats = [beat("b0", 0), beat("b1", 1)];
    const instances = [instance("b0"), instance("b1")];
    const decisions = [decision("b1", { result: "connected" })];
    const sequence = buildGlyphSequence(beats, instances, 4, decisions, DEFAULT_CONNECTION_GRAMMAR);
    expect(sequence[1].spacingBefore).toBe(0);
  });

  it("a punctuated dot contributes a smaller nudge than a full gap", () => {
    const beats = [beat("b0", 0), beat("b1", 1), beat("b2", 2)];
    const instances = beats.map((b) => instance(b.id));
    const decisions = [
      decision("b1", { result: "punctuated", punctuation: "dot" }),
      decision("b2", { result: "punctuated", punctuation: "gap" }),
    ];
    const sequence = buildGlyphSequence(beats, instances, 4, decisions, DEFAULT_CONNECTION_GRAMMAR);
    expect(sequence[1].spacingBefore).toBeGreaterThan(0);
    expect(sequence[2].spacingBefore).toBeGreaterThan(sequence[1].spacingBefore);
  });

  it("a broken decision contributes the largest spacing", () => {
    const beats = [beat("b0", 0), beat("b1", 1), beat("b2", 2)];
    const instances = beats.map((b) => instance(b.id));
    const decisions = [
      decision("b1", { result: "punctuated", punctuation: "gap" }),
      decision("b2", { result: "broken", reason: "sectionBoundary" }),
    ];
    const sequence = buildGlyphSequence(beats, instances, 4, decisions, DEFAULT_CONNECTION_GRAMMAR);
    expect(sequence[2].spacingBefore).toBeGreaterThan(sequence[1].spacingBefore);
  });
});

describe("layoutManuscriptRows", () => {
  it("places beats within the same bar on the same row, left to right", () => {
    const beats = [beat("b0", 0), beat("b1", 1), beat("b2", 2)];
    const instances = beats.map((b) => instance(b.id));
    const sequence = buildGlyphSequence(beats, instances, 4);
    const layout = layoutManuscriptRows(sequence, preset);

    expect(layout.placedGlyphs).toHaveLength(3);
    expect(layout.placedGlyphs.every((g) => g.rowIndex === 0)).toBe(true);
    expect(layout.placedGlyphs[1].x).toBeGreaterThan(layout.placedGlyphs[0].x);
    expect(layout.placedGlyphs[2].x).toBeGreaterThan(layout.placedGlyphs[1].x);
  });

  it("wraps to a new row exactly at a bar boundary once barsPerRow bars have been placed", () => {
    // 4 beats per bar, barsPerRow = 1 -> row wraps every 4 beats, never by
    // character count or any non-musical count.
    const onePerRowPreset: ManuscriptLayoutPreset = { ...preset, barsPerRow: 1 };
    const beats = Array.from({ length: 8 }, (_, i) => beat(`b${i}`, i));
    const instances = beats.map((b) => instance(b.id));
    const sequence = buildGlyphSequence(beats, instances, 4);
    const layout = layoutManuscriptRows(sequence, onePerRowPreset);

    expect(layout.placedGlyphs.slice(0, 4).every((g) => g.rowIndex === 0)).toBe(true);
    expect(layout.placedGlyphs.slice(4, 8).every((g) => g.rowIndex === 1)).toBe(true);
  });

  it("assigns strictly increasing orderIndex matching the input sequence order", () => {
    const beats = [beat("b0", 0), beat("b1", 1)];
    const instances = beats.map((b) => instance(b.id));
    const sequence = buildGlyphSequence(beats, instances, 4);
    const layout = layoutManuscriptRows(sequence, preset);
    expect(layout.placedGlyphs.map((g) => g.orderIndex)).toEqual([0, 1]);
  });

  it("grows page height to fit the number of rows produced", () => {
    const onePerRowPreset: ManuscriptLayoutPreset = { ...preset, barsPerRow: 1, pageHeightMm: 10 };
    const beats = Array.from({ length: 12 }, (_, i) => beat(`b${i}`, i));
    const instances = beats.map((b) => instance(b.id));
    const sequence = buildGlyphSequence(beats, instances, 4);
    const layout = layoutManuscriptRows(sequence, onePerRowPreset);
    expect(layout.page.heightMm).toBeGreaterThan(10);
  });

  it("carries the page width/margin from the preset unchanged", () => {
    const layout = layoutManuscriptRows([], preset);
    expect(layout.page.widthMm).toBe(210);
    expect(layout.page.marginMm).toBe(15);
    expect(layout.layoutPresetId).toBe("layout-1");
  });

  it("adds spacingBefore as real extra distance, shifting later glyphs rather than overlapping them", () => {
    const beats = [beat("b0", 0), beat("b1", 1), beat("b2", 2)];
    const instances = beats.map((b) => instance(b.id));
    const plainSequence = buildGlyphSequence(beats, instances, 4);
    const spacedSequence = plainSequence.map((item, i) => (i === 2 ? { ...item, spacingBefore: 20 } : item));

    const plainLayout = layoutManuscriptRows(plainSequence, preset);
    const spacedLayout = layoutManuscriptRows(spacedSequence, preset);

    const gapPlain = plainLayout.placedGlyphs[2].x - plainLayout.placedGlyphs[1].x;
    const gapSpaced = spacedLayout.placedGlyphs[2].x - spacedLayout.placedGlyphs[1].x;
    expect(gapSpaced).toBeCloseTo(gapPlain + 20, 5);
  });
});
