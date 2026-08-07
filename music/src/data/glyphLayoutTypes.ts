// Glyph Audio — Layout Specification (docs/glyph-audio/07_GLYPH_AUDIO_Layout_Spec.md).
// Canonical types, taken verbatim from that spec. Layout arranges an
// already-generated glyph sequence — it must never reanalyze the music or
// change glyph meanings.
//
// ManuscriptLayoutPreset.type stays a single literal for this
// implementation. A dedicated square-cover layout preset (approved decision
// 14, 14_GLYPH_AUDIO_Approved_Decisions.md — a distinct preset, never a
// crop of the row manuscript) is real future scope: when built, `type`
// widens to a union and a second preset shape is added alongside this one.
// Not built in this slice.

export type GlyphSequenceItem = {
  glyphInstanceId: string;
  beatUnitId: string;
  startBeat: number;
  durationBeats: number;
  barIndex: number;
  phraseIndex: number | null;
  sectionIndex: number;
  spacingBefore: number;
  spacingAfter: number;
};

export type PlacedGlyph = {
  glyphInstanceId: string;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotationDegrees: number;
  rowIndex: number;
  orderIndex: number;
};

export type LayoutDocument = {
  schemaVersion: 1;
  layoutPresetId: string;
  page: { widthMm: number; heightMm: number; marginMm: number };
  placedGlyphs: PlacedGlyph[];
};

export type ManuscriptLayoutPreset = {
  id: string;
  type: "manuscriptRows";
  pageWidthMm: number;
  pageHeightMm: number;
  marginMm: number;
  barsPerRow: number;
  rowGapMm: number;
  baseBeatWidthMm: number;
  alignBars: boolean;
  sectionStartsNewRow: boolean;
  preserveSilence: boolean;
};
