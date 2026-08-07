import { describe, it, expect } from "vitest";
import { deriveMusicalAnalysisDocument, GLYPH_ANALYZER_VERSION } from "./beatUnitDerivation";
import type { BeatGridDraft } from "./beatGridAdapter";

function grid(overrides: Partial<BeatGridDraft>): BeatGridDraft {
  return {
    beatTimesSeconds: [], beatWindows: [], rawEnergies: [], energies: [],
    bpm: 120, beatsPerBar: 4, beatsPerBarConfirmed: true, durationSeconds: 10, confidence: 0.9,
    ...overrides,
  };
}

describe("deriveMusicalAnalysisDocument", () => {
  it("returns an empty-but-valid document for an empty beat grid", () => {
    const doc = deriveMusicalAnalysisDocument({
      id: "a1", sourceAudioId: "track-1", createdAt: "2026-01-01T00:00:00Z",
      grid: grid({ beatTimesSeconds: [], beatsPerBarConfirmed: false, confidence: 0 }),
    });
    expect(doc.id).toBe("a1");
    expect(doc.schemaVersion).toBe(1);
    expect(doc.analyzerVersion).toBe(GLYPH_ANALYZER_VERSION);
    expect(doc.beats).toEqual([]);
    expect(doc.sections).toEqual([]);
    expect(doc.track.timeSignature).toBeNull();
  });

  it("produces one BeatUnit per beat timestamp, carrying only real (energy) measurement plus documented neutral values", () => {
    const doc = deriveMusicalAnalysisDocument({
      id: "a1", sourceAudioId: "track-1", createdAt: "2026-01-01T00:00:00Z",
      grid: grid({
        beatTimesSeconds: [0, 0.5, 1.0, 1.5],
        beatWindows: [{ start: 0, end: 0.375 }, { start: 0.5, end: 0.875 }, { start: 1.0, end: 1.375 }, { start: 1.5, end: 1.875 }],
        energies: [0.2, 0.8, 0.5, 0.9],
      }),
    });

    expect(doc.beats).toHaveLength(4);
    expect(doc.beats[1].energy).toBe(0.8);
    expect(doc.beats[1].attackSharpness).toBe(0.5);
    expect(doc.beats[1].onsetDensity).toBe(0);
    expect(doc.beats[1].sustain).toBe(0.5);
    expect(doc.beats[1].pitchMovement).toBeNull();
    expect(doc.beats[1].spectralBrightness).toBeNull();
    expect(doc.beats[1].accentStrength).toBe(0);
    expect(doc.beats[1].confidence.value).toBe(0.9);
    expect(doc.beats[1].confidence.source).toBe("analysis");
  });

  it("groups beats into bars using beatsPerBar and emits one bar boundary per bar", () => {
    const doc = deriveMusicalAnalysisDocument({
      id: "a1", sourceAudioId: "track-1", createdAt: "2026-01-01T00:00:00Z",
      grid: grid({
        beatTimesSeconds: [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5],
        beatWindows: Array.from({ length: 8 }, (_, i) => ({ start: i * 0.5, end: i * 0.5 + 0.375 })),
        energies: Array(8).fill(0.5),
        beatsPerBar: 4,
      }),
    });

    expect(doc.bars).toHaveLength(2);
    expect(doc.bars[0].startBeat).toBe(0);
    expect(doc.bars[1].startBeat).toBe(4);
    expect(doc.boundaries.filter((b) => b.kind === "bar")).toHaveLength(2);
    expect(doc.beats[0].barId).toBe(doc.bars[0].id);
    expect(doc.beats[4].barId).toBe(doc.bars[1].id);
    expect(doc.beats[4].indexWithinBar).toBe(0);
  });

  it("uses one combined section spanning the whole grid (section detection deferred)", () => {
    const doc = deriveMusicalAnalysisDocument({
      id: "a1", sourceAudioId: "track-1", createdAt: "2026-01-01T00:00:00Z",
      grid: grid({
        beatTimesSeconds: [0, 0.5, 1.0],
        beatWindows: [{ start: 0, end: 0.375 }, { start: 0.5, end: 0.875 }, { start: 1.0, end: 1.375 }],
        energies: [0.4, 0.6, 0.5],
      }),
    });
    expect(doc.sections).toHaveLength(1);
    expect(doc.sections[0].durationBeats).toBe(3);
    expect(doc.phrases).toEqual([]);
    expect(doc.silences).toEqual([]);
  });

  it("leaves track.timeSignature null when the beat grid's beatsPerBar is an unconfirmed default", () => {
    const doc = deriveMusicalAnalysisDocument({
      id: "a1", sourceAudioId: "track-1", createdAt: "2026-01-01T00:00:00Z",
      grid: grid({
        beatTimesSeconds: [0, 0.5], beatWindows: [{ start: 0, end: 0.375 }, { start: 0.5, end: 0.875 }],
        energies: [0.5, 0.5], beatsPerBarConfirmed: false,
      }),
    });
    expect(doc.track.timeSignature).toBeNull();
  });
});
