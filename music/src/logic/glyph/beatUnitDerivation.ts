// Glyph Audio — turns a BeatGridDraft (beatGridAdapter.ts) into a full
// MusicalAnalysisDocument. This slice populates only `energy` on each
// BeatUnit from real, measured data; every other per-beat measurement
// (attackSharpness, onsetDensity, sustain, pitchMovement,
// spectralBrightness, accentStrength) is held at a documented neutral
// value, never a fabricated real measurement, per approved decision 3
// (14_GLYPH_AUDIO_Approved_Decisions.md) and
// 03_GLYPH_AUDIO_Musical_Unit_Model.md's own per-property "Failure
// behavior" — attackSharpness's documented failure behavior is "a neutral
// rounded value" (0.5, since the arch-script curve continuum's rounded
// band is 0.00-0.35... a literal 0.5 sits in the "pointed" band, so the
// neutral value used here is chosen to be genuinely unopinionated rather
// than pre-selecting a shape family: see the inline comment below).
// Section/phrase detection is deferred (decision 13) — every beat belongs
// to one combined section and bar-only boundaries are derived
// arithmetically from beatsPerBar (decision 10, one combined beat
// representation).

import type { BeatGridDraft } from "./beatGridAdapter";
import type {
  MusicalAnalysisDocument, TrackUnit, SectionUnit, BarUnit, BeatUnit, BoundaryUnit, SilenceUnit, Confidence,
} from "../../data/glyphAudioTypes";

export const GLYPH_ANALYZER_VERSION = "glyph-beat-analyzer-v1";

function confidenceFrom(value: number): Confidence {
  return { value: Math.max(0, Math.min(1, value)), source: "analysis" };
}

export function deriveMusicalAnalysisDocument(input: {
  id: string;
  sourceAudioId: string;
  createdAt: string;
  grid: BeatGridDraft;
}): MusicalAnalysisDocument {
  const { grid } = input;
  const sectionId = "section-0";

  const track: TrackUnit = {
    id: "track",
    durationSeconds: grid.durationSeconds,
    detectedBpm: grid.bpm,
    // An unconfirmed default (grid.beatsPerBarConfirmed === false) is never
    // written into the analysis document as if it were a real detected
    // time signature — it stays null here; GlyphBeatGridReview.tsx is
    // responsible for showing the editable "4 (unconfirmed)" affordance
    // and only a person's explicit confirmation ever promotes it to a real
    // value on a re-derived document.
    timeSignature: grid.beatsPerBarConfirmed ? { beatsPerBar: grid.beatsPerBar, beatUnit: 4 } : null,
  };

  if (grid.beatTimesSeconds.length === 0) {
    return {
      id: input.id,
      schemaVersion: 1,
      analyzerVersion: GLYPH_ANALYZER_VERSION,
      sourceAudioId: input.sourceAudioId,
      createdAt: input.createdAt,
      track,
      sections: [],
      phrases: [],
      bars: [],
      beats: [],
      boundaries: [],
      silences: [],
    };
  }

  const meanEnergy = grid.energies.reduce((a, b) => a + b, 0) / Math.max(1, grid.energies.length);

  // One combined section spanning the whole confirmed grid (decision 13 —
  // section detection is optional/deferred).
  const sections: SectionUnit[] = [{
    id: sectionId,
    index: 0,
    startBeat: 0,
    durationBeats: grid.beatTimesSeconds.length,
    energy: meanEnergy,
    novelty: 0,
    confidence: confidenceFrom(grid.confidence),
  }];

  const beatsPerBar = Math.max(1, grid.beatsPerBar);
  const bars: BarUnit[] = [];
  const beats: BeatUnit[] = [];
  const boundaries: BoundaryUnit[] = [];

  grid.beatTimesSeconds.forEach((startSeconds, index) => {
    const barIndex = Math.floor(index / beatsPerBar);
    const indexWithinBar = index % beatsPerBar;
    const barId = `bar-${barIndex}`;

    if (indexWithinBar === 0) {
      bars.push({
        id: barId,
        sectionId,
        phraseId: null,
        index: barIndex,
        startBeat: barIndex * beatsPerBar,
        durationBeats: beatsPerBar,
        energy: grid.energies[index] ?? 0,
        confidence: confidenceFrom(grid.confidence),
      });
      boundaries.push({
        id: `boundary-bar-${barIndex}`,
        kind: "bar",
        startBeat: barIndex * beatsPerBar,
        strength: 1,
        confidence: confidenceFrom(grid.confidence),
      });
    }

    const window = grid.beatWindows[index];

    beats.push({
      id: `beat-${index}`,
      sectionId,
      phraseId: null,
      barId,
      index,
      indexWithinBar,
      startSeconds,
      durationSeconds: window ? Math.max(0, window.end - window.start) : 0,
      startBeat: index,
      durationBeats: 1,
      energy: grid.energies[index] ?? 0,
      // Deferred this slice (decision 3) — documented neutral values, never
      // a guessed real measurement:
      //   attackSharpness 0.5 — the midpoint of the 0-1 range, deliberately
      //     not pre-selecting rounded (<0.35) or clipped (>0.75); the arch
      //     grammar's own curveSharpness default parameter (not this beat
      //     measurement) is what actually shapes the glyph while this
      //     source is unmapped.
      //   onsetDensity 0 — "one arch" per spec's documented failure
      //     behavior; the default preset has no enabled onsetDensity rule
      //     this slice, so archCount comes entirely from the grammar's own
      //     default, unaffected by this value either way.
      //   sustain 0.5 — neutral midpoint.
      //   accentStrength 0 — no accent inferred.
      attackSharpness: 0.5,
      onsetDensity: 0,
      sustain: 0.5,
      pitchMovement: null,
      spectralBrightness: null,
      accentStrength: 0,
      confidence: confidenceFrom(grid.confidence),
    });
  });

  const silences: SilenceUnit[] = []; // deferred this slice

  return {
    id: input.id,
    schemaVersion: 1,
    analyzerVersion: GLYPH_ANALYZER_VERSION,
    sourceAudioId: input.sourceAudioId,
    createdAt: input.createdAt,
    track,
    sections,
    phrases: [],
    bars,
    beats,
    boundaries,
    silences,
  };
}
