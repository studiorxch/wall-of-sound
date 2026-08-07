// Glyph Audio — deterministic composition cache key (approved decision 8,
// 14_GLYPH_AUDIO_Approved_Decisions.md). GlyphComposition.cacheKey is valid
// exactly when a freshly recomputed key still matches the stored one —
// there is no separate "invalidation heuristic" to design, the key IS the
// invalidation check. Only the documented inputs affect the key: cosmetic
// fields on a snapshot (name, id, createdAt/updatedAt) are deliberately
// excluded via the *KeyPart helpers below, so renaming a preset never
// spuriously invalidates every composition built from it.

import type { MappingPreset } from "../../data/glyphMappingTypes";
import type { GlyphGrammar } from "../../data/glyphGrammarTypes";
import type { ManuscriptLayoutPreset } from "../../data/glyphLayoutTypes";
import type { ConnectionGrammar } from "../../data/glyphConnectionTypes";
import type { GlyphCanvasPreset } from "../../data/glyphCanvasTypes";

export type GlyphCacheKeyInput = {
  analysisId: string;
  analysisVersion: string;
  mappingPresetSnapshot: MappingPreset;
  grammarSnapshot: GlyphGrammar;
  connectionGrammarSnapshot: ConnectionGrammar;
  layoutPresetSnapshot: ManuscriptLayoutPreset;
  seed: number;
  rendererVersion: string;
};

function mappingPresetKeyPart(preset: MappingPreset) {
  return { grammarId: preset.grammarId, rules: preset.rules, boundaryRules: preset.boundaryRules };
}

function grammarKeyPart(grammar: GlyphGrammar) {
  return {
    grammarType: grammar.grammarType,
    baseGestureOverride: grammar.baseGestureOverride ?? null,
    defaultParameters: grammar.defaultParameters,
  };
}

function layoutKeyPart(layout: ManuscriptLayoutPreset) {
  const { id: _id, ...functionalFields } = layout;
  return functionalFields;
}

function connectionGrammarKeyPart(grammar: ConnectionGrammar) {
  const { id: _id, name: _name, createdAt: _createdAt, updatedAt: _updatedAt, ...functionalFields } = grammar;
  return functionalFields;
}

// Stable JSON serialization — object keys sorted so property order never
// changes the key.
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`).join(",")}}`;
}

// FNV-1a — small, dependency-free, synchronous. Determinism is the
// requirement, not cryptographic strength.
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function computeGlyphCacheKey(input: GlyphCacheKeyInput): string {
  const serialized = stableStringify({
    analysisId: input.analysisId,
    analysisVersion: input.analysisVersion,
    mapping: mappingPresetKeyPart(input.mappingPresetSnapshot),
    grammar: grammarKeyPart(input.grammarSnapshot),
    connectionGrammar: connectionGrammarKeyPart(input.connectionGrammarSnapshot),
    layout: layoutKeyPart(input.layoutPresetSnapshot),
    seed: input.seed,
    rendererVersion: input.rendererVersion,
  });
  return fnv1a(serialized);
}

// Full Canvas / Pulse Truth / Drum Layer
// (docs/glyph-audio/0804_GLYPH_NOTES_Full_Canvas_Pulse_Truth_Drum_Layer_Spec_v0.1.0.md
// §22) — a separate cache-key function for the new pulse-truth-driven
// pipeline (GlyphWorkspace.tsx's primary path from this build forward),
// rather than folding these fields into computeGlyphCacheKey/
// GlyphCacheKeyInput above, which stays exactly as 0804B left it for any
// composition still using the manuscriptRows-layout pipeline. Density
// settings (minPulseWidth/maxPulseWidth/rowGap/sectionGap) participate as
// plain scalars rather than a new persisted "layout preset" type — the
// spec's own §22 "layoutPresetSnapshot" field, reinterpreted for a system
// that does not otherwise have a separate layout-preset record. Viewport
// zoom is deliberately NOT included — "Viewport zoom alone must not change
// exported geometry."
export type FullCanvasCacheKeyInput = {
  analysisId: string;
  analysisVersion: string;
  confirmedBpm: number;
  pulseTruthVersion: string;
  phaseOffsetSeconds: number;
  mappingPresetSnapshot: MappingPreset;
  glyphGrammarSnapshot: GlyphGrammar;
  connectionGrammarSnapshot: ConnectionGrammar;
  canvasPresetSnapshot: GlyphCanvasPreset;
  layoutSettings: { minPulseWidth: number; maxPulseWidth: number; rowGap: number; sectionGap: number };
  drumLayerAnalyzerVersion: string | null;
  drumLayerSource: string | null;
  // 0804E (docs/glyph-audio/0804_GLYPH_NOTES_Event_Vocabulary_Laser_Layer_Spec_v0.1.0.md
  // §16) — null fields mean that layer wasn't analyzed/isn't in cover mode
  // for this composition; a genuine absence still participates in the key
  // (analyzing it later, or switching color modes, correctly changes the
  // hash). Preview-only viewport zoom is deliberately excluded, same as
  // canvasPresetSnapshot above.
  eventVocabularyAnalyzerVersion: string | null;
  eventClassificationThresholds: string | null;
  laserAnalyzerVersion: string | null;
  laserSource: string | null;
  laserRenderMode: string | null;
  laserActivityThreshold: number | null;
  laserAmplitude: number | null;
  laserSmoothing: number | null;
  laserVerticalOffset: number | null;
  laserStrokeWidth: number | null;
  colorMode: string;
  coverAccent: string | null;
  seed: number;
  rendererVersion: string;
};

function canvasPresetKeyPart(preset: GlyphCanvasPreset) {
  const { id: _id, name: _name, ...functionalFields } = preset;
  return functionalFields;
}

export function computeFullCanvasCacheKey(input: FullCanvasCacheKeyInput): string {
  const serialized = stableStringify({
    analysisId: input.analysisId,
    analysisVersion: input.analysisVersion,
    confirmedBpm: input.confirmedBpm,
    pulseTruthVersion: input.pulseTruthVersion,
    phaseOffsetSeconds: input.phaseOffsetSeconds,
    mapping: mappingPresetKeyPart(input.mappingPresetSnapshot),
    grammar: grammarKeyPart(input.glyphGrammarSnapshot),
    connectionGrammar: connectionGrammarKeyPart(input.connectionGrammarSnapshot),
    canvas: canvasPresetKeyPart(input.canvasPresetSnapshot),
    layoutSettings: input.layoutSettings,
    drumLayerAnalyzerVersion: input.drumLayerAnalyzerVersion,
    drumLayerSource: input.drumLayerSource,
    eventVocabularyAnalyzerVersion: input.eventVocabularyAnalyzerVersion,
    eventClassificationThresholds: input.eventClassificationThresholds,
    laserAnalyzerVersion: input.laserAnalyzerVersion,
    laserSource: input.laserSource,
    laserRenderMode: input.laserRenderMode,
    laserActivityThreshold: input.laserActivityThreshold,
    laserAmplitude: input.laserAmplitude,
    laserSmoothing: input.laserSmoothing,
    laserVerticalOffset: input.laserVerticalOffset,
    laserStrokeWidth: input.laserStrokeWidth,
    colorMode: input.colorMode,
    coverAccent: input.coverAccent,
    seed: input.seed,
    rendererVersion: input.rendererVersion,
  });
  return fnv1a(serialized);
}
