import { describe, it, expect } from "vitest";
import { buildGlyphRuns, summarizeGlyphRuns, describeConnectionFallbacks } from "./glyphRunFormation";
import { DEFAULT_CONNECTION_GRAMMAR } from "./connectionGrammar";
import type { BeatUnit, SilenceUnit } from "../../data/glyphAudioTypes";
import type { GeneratedGlyphInstance } from "../../data/glyphGrammarTypes";
import type { ConnectionGrammar, ConnectionOverride } from "../../data/glyphConnectionTypes";

function beat(id: string, index: number, overrides: Partial<BeatUnit> = {}): BeatUnit {
  return {
    id, sectionId: "s0", phraseId: null, barId: `bar-${Math.floor(index / 4)}`, index, indexWithinBar: index % 4,
    startSeconds: index * 0.5, durationSeconds: 0.375, startBeat: index, durationBeats: 1,
    energy: 0.5, attackSharpness: 0.5, onsetDensity: 0, sustain: 0.5,
    pitchMovement: null, spectralBrightness: null, accentStrength: 0,
    confidence: { value: 0.9, source: "analysis" },
    ...overrides,
  };
}

function instance(beatUnitId: string): GeneratedGlyphInstance {
  return {
    id: `glyph-${beatUnitId}`, beatUnitId, grammarId: "arch-script-v1",
    parameters: {
      archCount: 1, width: 10, height: 10, curveSharpness: 0.2, asymmetry: 0, baselineOffset: 0,
      connectorLength: 4, connectorSag: 1, entryOvershoot: 1, exitOvershoot: 1, localCompression: 0,
      dotEnabled: false, dotSize: 1, dotOffset: 0, handmadeVariance: 0,
    },
    seed: 1,
  };
}

function makeBeats(count: number, overrides: (i: number) => Partial<BeatUnit> = () => ({})): BeatUnit[] {
  return Array.from({ length: count }, (_, i) => beat(`b${i}`, i, overrides(i)));
}

describe("buildGlyphRuns — basic coverage", () => {
  it("produces exactly one run and pulses.length - 1 decisions for a single steady bar-4 sequence with no boundaries", () => {
    const beats = makeBeats(4);
    const glyphs = beats.map((b) => instance(b.id));
    const out = buildGlyphRuns({
      pulses: beats, glyphs, boundaries: [], silences: [],
      grammar: DEFAULT_CONNECTION_GRAMMAR, overrides: [], createdAt: "2026-08-04T00:00:00Z",
    });
    expect(out.decisions).toHaveLength(3);
    // All within the same bar (bar-0) — every decision connects.
    expect(out.decisions.every((d) => d.result === "connected")).toBe(true);
    expect(out.runs).toHaveLength(1);
    expect(out.runs[0].pulseIds).toEqual(["b0", "b1", "b2", "b3"]);
  });

  it("preserves every source pulse across pulseIds of all runs combined", () => {
    const beats = makeBeats(16);
    const glyphs = beats.map((b) => instance(b.id));
    const out = buildGlyphRuns({
      pulses: beats, glyphs, boundaries: [], silences: [],
      grammar: DEFAULT_CONNECTION_GRAMMAR, overrides: [], createdAt: "2026-08-04T00:00:00Z",
    });
    const allPulseIds = out.runs.flatMap((r) => r.pulseIds);
    expect(new Set(allPulseIds).size).toBe(16);
    expect(allPulseIds).toHaveLength(16);
  });

  it("bar crossings punctuate (dot) without closing the run under the default grammar", () => {
    const beats = makeBeats(8); // 2 bars of 4
    const glyphs = beats.map((b) => instance(b.id));
    const out = buildGlyphRuns({
      pulses: beats, glyphs, boundaries: [], silences: [],
      grammar: DEFAULT_CONNECTION_GRAMMAR, overrides: [], createdAt: "2026-08-04T00:00:00Z",
    });
    const barCrossing = out.decisions.find((d) => d.fromPulseId === "b3" && d.toPulseId === "b4");
    expect(barCrossing?.result).toBe("punctuated");
    expect(barCrossing?.reason).toBe("barBoundary");
    expect(out.runs).toHaveLength(1); // still one continuous run
  });

  it("phrase crossings widen (gap) and still keep one run under the default grammar", () => {
    const beats = makeBeats(6, (i) => (i >= 3 ? { phraseId: "phrase-1" } : { phraseId: "phrase-0" }));
    const glyphs = beats.map((b) => instance(b.id));
    const out = buildGlyphRuns({
      pulses: beats, glyphs, boundaries: [], silences: [],
      grammar: DEFAULT_CONNECTION_GRAMMAR, overrides: [], createdAt: "2026-08-04T00:00:00Z",
    });
    const phraseCrossing = out.decisions.find((d) => d.fromPulseId === "b2" && d.toPulseId === "b3");
    expect(phraseCrossing?.result).toBe("punctuated");
    expect(phraseCrossing?.reason).toBe("phraseBoundary");
    expect(out.runs).toHaveLength(1);
  });

  it("section crossings break — multiple sections produce multiple runs", () => {
    const beats = makeBeats(6, (i) => (i >= 3 ? { sectionId: "s1" } : { sectionId: "s0" }));
    const glyphs = beats.map((b) => instance(b.id));
    const out = buildGlyphRuns({
      pulses: beats, glyphs, boundaries: [], silences: [],
      grammar: DEFAULT_CONNECTION_GRAMMAR, overrides: [], createdAt: "2026-08-04T00:00:00Z",
    });
    expect(out.runs).toHaveLength(2);
    expect(out.runs[0].pulseIds).toEqual(["b0", "b1", "b2"]);
    expect(out.runs[1].pulseIds).toEqual(["b3", "b4", "b5"]);
    expect(out.runs[0].sectionId).toBe("s0");
    expect(out.runs[1].sectionId).toBe("s1");
  });

  it("silence between pulses applies silenceBoundaryBehavior", () => {
    const beats = makeBeats(3);
    const glyphs = beats.map((b) => instance(b.id));
    const silences: SilenceUnit[] = [{
      id: "sil-1", startBeat: 1.5, durationBeats: 0.5, context: "between-beats",
      confidence: { value: 0.9, source: "analysis" },
    }];
    const out = buildGlyphRuns({
      pulses: beats, glyphs, boundaries: [], silences,
      grammar: DEFAULT_CONNECTION_GRAMMAR, overrides: [], createdAt: "2026-08-04T00:00:00Z",
    });
    const silentPair = out.decisions.find((d) => d.fromPulseId === "b1" && d.toPulseId === "b2");
    expect(silentPair?.reason).toBe("silenceBoundary");
  });

  it("a single pulse produces one run with no decisions", () => {
    const beats = makeBeats(1);
    const glyphs = beats.map((b) => instance(b.id));
    const out = buildGlyphRuns({
      pulses: beats, glyphs, boundaries: [], silences: [],
      grammar: DEFAULT_CONNECTION_GRAMMAR, overrides: [], createdAt: "2026-08-04T00:00:00Z",
    });
    expect(out.decisions).toHaveLength(0);
    expect(out.runs).toHaveLength(1);
    expect(out.runs[0].pulseIds).toEqual(["b0"]);
  });

  it("an empty pulse list produces no runs", () => {
    const out = buildGlyphRuns({
      pulses: [], glyphs: [], boundaries: [], silences: [],
      grammar: DEFAULT_CONNECTION_GRAMMAR, overrides: [], createdAt: "2026-08-04T00:00:00Z",
    });
    expect(out.runs).toEqual([]);
    expect(out.decisions).toEqual([]);
  });

  it("sorts unsorted pulse input chronologically before deciding connections", () => {
    const beats = [beat("b2", 2), beat("b0", 0), beat("b1", 1)];
    const glyphs = beats.map((b) => instance(b.id));
    const out = buildGlyphRuns({
      pulses: beats, glyphs, boundaries: [], silences: [],
      grammar: DEFAULT_CONNECTION_GRAMMAR, overrides: [], createdAt: "2026-08-04T00:00:00Z",
    });
    expect(out.runs[0].pulseIds).toEqual(["b0", "b1", "b2"]);
  });

  it("excludes a pulse with no matching generated glyph instance rather than crashing", () => {
    const beats = makeBeats(3);
    const glyphs = [instance("b0"), instance("b2")]; // b1 missing
    const out = buildGlyphRuns({
      pulses: beats, glyphs, boundaries: [], silences: [],
      grammar: DEFAULT_CONNECTION_GRAMMAR, overrides: [], createdAt: "2026-08-04T00:00:00Z",
    });
    const allPulseIds = out.runs.flatMap((r) => r.pulseIds);
    expect(allPulseIds).toEqual(["b0", "b2"]);
  });
});

describe("buildGlyphRuns — mode never", () => {
  it("produces one run per pulse (every pulse isolated)", () => {
    const grammar: ConnectionGrammar = { ...DEFAULT_CONNECTION_GRAMMAR, connectionMode: "never" };
    const beats = makeBeats(4);
    const glyphs = beats.map((b) => instance(b.id));
    const out = buildGlyphRuns({
      pulses: beats, glyphs, boundaries: [], silences: [],
      grammar, overrides: [], createdAt: "2026-08-04T00:00:00Z",
    });
    expect(out.runs).toHaveLength(4);
    expect(out.runs.every((r) => r.pulseIds.length === 1)).toBe(true);
  });
});

describe("buildGlyphRuns — manual overrides", () => {
  it("forceBreak splits a run that would otherwise stay connected", () => {
    const beats = makeBeats(4);
    const glyphs = beats.map((b) => instance(b.id));
    const overrides: ConnectionOverride[] = [{
      id: "o1", fromPulseId: "b1", toPulseId: "b2", action: "forceBreak",
      createdAt: "2026-08-04T00:00:00Z", updatedAt: "2026-08-04T00:00:00Z",
    }];
    const out = buildGlyphRuns({
      pulses: beats, glyphs, boundaries: [], silences: [],
      grammar: DEFAULT_CONNECTION_GRAMMAR, overrides, createdAt: "2026-08-04T00:00:00Z",
    });
    expect(out.runs).toHaveLength(2);
    expect(out.runs[0].pulseIds).toEqual(["b0", "b1"]);
    expect(out.runs[1].pulseIds).toEqual(["b2", "b3"]);
  });

  it("a rejected forceConnect (impossible geometry) emits a manualOverrideRejected warning", () => {
    const beats = [beat("b0", 0, { sectionId: "s0" }), beat("b1", 1, { sectionId: "s1" })];
    const farInstance: GeneratedGlyphInstance = {
      ...instance("b1"),
      parameters: { ...instance("b1").parameters, width: 10000 },
    };
    const glyphs = [instance("b0"), farInstance];
    const overrides: ConnectionOverride[] = [{
      id: "o1", fromPulseId: "b0", toPulseId: "b1", action: "forceConnect",
      createdAt: "2026-08-04T00:00:00Z", updatedAt: "2026-08-04T00:00:00Z",
    }];
    const out = buildGlyphRuns({
      pulses: beats, glyphs, boundaries: [], silences: [],
      grammar: DEFAULT_CONNECTION_GRAMMAR, overrides, createdAt: "2026-08-04T00:00:00Z",
    });
    expect(out.warnings.some((w) => w.type === "manualOverrideRejected")).toBe(true);
  });
});

describe("buildGlyphRuns — determinism", () => {
  it("produces byte-identical output for identical input", () => {
    const beats = makeBeats(8);
    const glyphs = beats.map((b) => instance(b.id));
    const args = {
      pulses: beats, glyphs, boundaries: [], silences: [],
      grammar: DEFAULT_CONNECTION_GRAMMAR, overrides: [], createdAt: "2026-08-04T00:00:00Z",
    };
    expect(buildGlyphRuns(args)).toEqual(buildGlyphRuns(args));
  });
});

describe("summarizeGlyphRuns", () => {
  it("reports full pulse coverage with no silent truncation", () => {
    const beats = makeBeats(8, (i) => (i >= 4 ? { sectionId: "s1" } : { sectionId: "s0" }));
    const glyphs = beats.map((b) => instance(b.id));
    const out = buildGlyphRuns({
      pulses: beats, glyphs, boundaries: [], silences: [],
      grammar: DEFAULT_CONNECTION_GRAMMAR, overrides: [], createdAt: "2026-08-04T00:00:00Z",
    });
    const diagnostics = summarizeGlyphRuns(beats, glyphs, out);
    expect(diagnostics.sourcePulses).toBe(8);
    expect(diagnostics.generatedArches).toBe(8);
    expect(diagnostics.visiblePulses).toBe(8);
    expect(diagnostics.connectionCandidates).toBe(7);
    expect(diagnostics.runs).toBe(2);
    expect(diagnostics.connectedPairs + diagnostics.brokenPairs + diagnostics.punctuatedBoundaries).toBe(7);
  });
});

describe("describeConnectionFallbacks", () => {
  it("returns null when there are no renderFallback decisions", () => {
    const beats = makeBeats(2);
    const glyphs = beats.map((b) => instance(b.id));
    const out = buildGlyphRuns({
      pulses: beats, glyphs, boundaries: [], silences: [],
      grammar: DEFAULT_CONNECTION_GRAMMAR, overrides: [], createdAt: "2026-08-04T00:00:00Z",
    });
    expect(describeConnectionFallbacks(out.decisions)).toBeNull();
  });
});
