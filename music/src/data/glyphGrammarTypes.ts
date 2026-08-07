// Glyph Audio — Glyph Grammar 01: Arch Script
// (docs/glyph-audio/06_GLYPH_AUDIO_Glyph_Grammar_01.md). Canonical types,
// taken verbatim from that spec. Glyph identity is an abstract
// GlyphInstanceId, never a Unicode character — this is the direct
// replacement for GlyphLab's A–Z CHARACTER_SET model
// (docs/glyph-audio/08_GLYPH_AUDIO_GlyphLab_Reuse_Audit.md §3).

import type { Stroke } from "./glyphStrokeTypes";

export type ArchGrammarParameters = {
  archCount: number;
  width: number;
  height: number;
  curveSharpness: number;
  asymmetry: number;
  baselineOffset: number;
  connectorLength: number;
  connectorSag: number;
  entryOvershoot: number;
  exitOvershoot: number;
  localCompression: number;
  dotEnabled: boolean;
  dotSize: number;
  dotOffset: number;
  handmadeVariance: number;
};

export type GlyphInstanceId = string;

export type GeneratedGlyphInstance = {
  id: GlyphInstanceId;
  beatUnitId: string;
  grammarId: "arch-script-v1";
  parameters: ArchGrammarParameters;
  // The one global seed for this composition (approved decision 12,
  // 14_GLYPH_AUDIO_Approved_Decisions.md) — never an independently-seeded
  // per-glyph value.
  seed: number;
};

// Envelope around ArchGrammarParameters so "which grammar is active" and its
// saved, user-editable base-gesture override are addressable as one record,
// mirroring MappingPreset's shape.
export type GlyphGrammar = {
  id: string;
  schemaVersion: 1;
  grammarType: "arch-script-v1";
  name: string;
  // Optional manually-drawn/edited base gesture overriding the procedural
  // arch generator for this grammar record. Absent = fully procedural.
  baseGestureOverride?: Stroke[];
  defaultParameters: ArchGrammarParameters;
  createdAt: string;
  updatedAt: string;
};
