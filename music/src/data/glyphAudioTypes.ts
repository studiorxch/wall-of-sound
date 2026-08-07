// Glyph Audio — Musical Unit Model (docs/glyph-audio/03_GLYPH_AUDIO_Musical_Unit_Model.md).
// Canonical types, taken verbatim from that spec, with one approved addition:
// MusicalAnalysisDocument.id (docs/glyph-audio/14_GLYPH_AUDIO_Approved_Decisions.md
// item 6/7) — required so PlayProject.glyphAnalyses[] can be referenced by
// GlyphComposition.analysisId; absent from the original spec, added here as
// the smallest necessary correction, not a broader reshape.

export type UnitId = string;

export type Confidence = {
  value: number; // 0.0–1.0
  source: "analysis" | "manual" | "derived";
};

export type TrackUnit = {
  id: UnitId;
  durationSeconds: number;
  detectedBpm: number | null;
  timeSignature: { beatsPerBar: number; beatUnit: number } | null;
};

export type SectionUnit = {
  id: UnitId;
  index: number;
  startBeat: number;
  durationBeats: number;
  energy: number;
  novelty: number;
  confidence: Confidence;
};

export type PhraseUnit = {
  id: UnitId;
  sectionId: UnitId;
  index: number;
  startBeat: number;
  durationBeats: number;
  confidence: Confidence;
};

export type BarUnit = {
  id: UnitId;
  sectionId: UnitId;
  phraseId: UnitId | null;
  index: number;
  startBeat: number;
  durationBeats: number;
  energy: number;
  confidence: Confidence;
};

export type BeatUnit = {
  id: UnitId;
  sectionId: UnitId;
  phraseId: UnitId | null;
  barId: UnitId;
  index: number;
  indexWithinBar: number;
  startSeconds: number;
  durationSeconds: number;
  startBeat: number;
  durationBeats: number;
  energy: number;
  attackSharpness: number;
  onsetDensity: number;
  sustain: number;
  pitchMovement: number | null;
  spectralBrightness: number | null;
  accentStrength: number;
  confidence: Confidence;
};

export type BoundaryUnit = {
  id: UnitId;
  kind: "bar" | "phrase" | "section";
  startBeat: number;
  strength: number;
  confidence: Confidence;
};

export type SilenceUnit = {
  id: UnitId;
  startBeat: number;
  durationBeats: number;
  context: "within-beat" | "between-beats" | "between-bars" | "between-phrases" | "between-sections";
  confidence: Confidence;
};

export type MusicalAnalysisDocument = {
  // Approved addition — identity for PlayProject.glyphAnalyses[] and
  // GlyphComposition.analysisId (see file header comment).
  id: string;
  schemaVersion: 1;
  analyzerVersion: string;
  sourceAudioId: string;
  createdAt: string;
  track: TrackUnit;
  sections: SectionUnit[];
  phrases: PhraseUnit[];
  bars: BarUnit[];
  beats: BeatUnit[];
  boundaries: BoundaryUnit[];
  silences: SilenceUnit[];
};
