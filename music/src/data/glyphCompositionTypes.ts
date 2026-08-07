// Glyph Audio — saved composition, render profile, and export record types.
// New — no direct precedent in the handoff spec docs (00-12); designed per
// docs/glyph-audio/13_GLYPH_AUDIO_Consolidated_Implementation_Plan.md and
// finalized per docs/glyph-audio/14_GLYPH_AUDIO_Approved_Decisions.md.
//
// GlyphComposition never embeds a full MusicalAnalysisDocument (approved
// decisions 6/7) — it references one by analysisId into
// PlayProject.glyphAnalyses[]. Reproducibility across later edits to a
// shared MappingPreset/GlyphGrammar/ManuscriptLayoutPreset is guaranteed by
// storing an immutable snapshot of each alongside the live id (approved
// decision 5) — editing the live preset after a composition is saved must
// never change what that composition regenerates to.

import type { MusicalAnalysisDocument } from "./glyphAudioTypes";
import type { MappingPreset } from "./glyphMappingTypes";
import type { GlyphGrammar } from "./glyphGrammarTypes";
import type { LayoutDocument, ManuscriptLayoutPreset } from "./glyphLayoutTypes";
import type { ConnectionGrammar, ConnectionOverride } from "./glyphConnectionTypes";
import type { PulseTruthResult } from "./glyphPulseTruthTypes";
import type { GlyphCanvasPreset, GlyphViewportMode } from "./glyphCanvasTypes";
import type { DrumLayerResult } from "./glyphDrumLayerTypes";
import type { GlyphAudibleEvent } from "./glyphEventVocabularyTypes";
import type { LaserLayerResult, LaserRenderSettings } from "./glyphLaserLayerTypes";

// §19/§21 (0804_GLYPH_NOTES_Full_Canvas_Pulse_Truth_Drum_Layer_Spec) — which
// layers render, independent of whether their underlying data exists (a
// drum layer can be persisted but toggled off, for example).
export type GlyphLayerVisibility = {
  pulseManuscript: boolean;
  drumEvents: boolean;
  // 0804E (docs/glyph-audio/0804_GLYPH_NOTES_Event_Vocabulary_Laser_Layer_Spec_v0.1.0.md §13).
  clapEvents: boolean;
  accentEvents: boolean;
  laserLayer: boolean;
  sections: boolean;
  // Deprecated as of 0804D (docs/glyph-audio/0804_GLYPH_NOTES_Silent_Bar_Spacing_Event_Dot_Reassignment_Spec_v0.1.0.md)
  // — bars are now represented as silent spacing, never a dot, so there is
  // nothing left for this layer to toggle. Optional (not removed) purely so
  // a GlyphComposition saved by 0804C still type-checks and loads without a
  // migration step; no code reads this field anymore, and no code writes
  // it on a new save.
  barPunctuation?: boolean;
  safeArea: boolean;
};

// §12 — cross-cutting render mode (affects drums/claps/laser stroke color,
// never geometry). Lives here rather than in glyphLaserLayerTypes.ts
// because it's a composition-level setting, not laser-specific. The actual
// color VALUES for each mode are a fixed constant lookup consumed only by
// the render layer (GlyphFullCanvasPreview.tsx / glyphSvgExport.ts) — never
// imported by any analysis/classification/geometry module.
export type GlyphColorMode = "monochrome" | "cover";

// A plain foreign key into Track.trackId (trackTypes.ts), the same identity
// field every other MUSIC domain (LoopAsset.sourceTrackId,
// SongSection.sourceTrackId) already keys off of. "local_import" covers a
// session-only, ephemeral Track built from a file picker, never written
// into the persisted library track list. Not used by this slice (local
// import is deferred), but the type is defined now so GlyphComposition's
// shape doesn't need to change later.
export type GlyphSourceRef =
  | { kind: "library_track"; trackId: string }
  | { kind: "local_import"; importId: string; filename: string };

export type GlyphComposition = {
  id: string;
  schemaVersion: 1;
  name: string;
  source: GlyphSourceRef;
  sourceDurationSeconds: number;

  // Reference into PlayProject.glyphAnalyses[] — never a duplicated embed.
  analysisId: string;

  // Live reference (for "based on preset X" display and for reopening the
  // live, currently-editable preset to derive a NEW composition) plus an
  // immutable snapshot (the actual source of truth for regeneration).
  mappingPresetId: string;
  mappingPresetSnapshot: MappingPreset;

  grammarId: string;
  grammarSnapshot: GlyphGrammar;

  // Connection Grammar (docs/glyph-audio/0804_GLYPH_NOTES_Connection_Grammar_Spec_v0.1.0.md
  // §21) — same live-id + immutable-snapshot reproducibility pattern as
  // mapping/grammar/layout above. connectionOverrides is always [] this
  // slice (no manual-override UI yet, §30 deferred controls) but the field
  // is real, persisted data, not a placeholder.
  connectionGrammarId: string;
  connectionGrammarSnapshot: ConnectionGrammar;
  connectionOverrides: ConnectionOverride[];

  layoutPresetId: string;
  layoutPresetSnapshot: ManuscriptLayoutPreset;

  // Full Canvas / Pulse Truth / Drum Layer (0804_GLYPH_NOTES_Full_Canvas_Pulse_Truth_Drum_Layer_Spec_v0.1.0.md
  // §21) — pulseTruthSnapshot replaces reliance on a track's own possibly-
  // empty beatMap; canvasPresetSnapshot + viewportMode capture the full
  // square/portrait canvas fit; drumLayerSnapshot is optional since drum
  // detection can be skipped or fail without blocking the pulse manuscript
  // itself; layerVisibility is real persisted state, not a UI-only default.
  pulseTruthSnapshot: PulseTruthResult;
  canvasPresetSnapshot: GlyphCanvasPreset;
  viewportMode: GlyphViewportMode;
  drumLayerSnapshot?: DrumLayerResult;
  layerVisibility: GlyphLayerVisibility;

  // 0804E (docs/glyph-audio/0804_GLYPH_NOTES_Event_Vocabulary_Laser_Layer_Spec_v0.1.0.md
  // §15) — all optional, so a GlyphComposition saved by 0804C or 0804D
  // (none of which ever wrote these fields) still type-checks and loads
  // with no migration step, exactly the same compatibility pattern 0804D
  // established for barPunctuation.
  eventVocabularySnapshot?: {
    analyzerVersion: string;
    events: GlyphAudibleEvent[];
  };
  laserLayerSnapshot?: LaserLayerResult;
  laserRenderSettings?: LaserRenderSettings;
  colorMode?: GlyphColorMode;

  // The one global seed (approved decision 12) — bounded, deterministic
  // local variation is derived from this single value, never a second
  // independent seed source.
  seed: number;

  // Deterministic, computed by computeGlyphCacheKey (glyphCacheKey.ts) from
  // analysisId + the three snapshots + seed + rendererVersion (approved
  // decision 8). cachedLayout is valid exactly when cacheKey still matches
  // a freshly recomputed key against this composition's current fields.
  cacheKey: string;
  cachedLayout?: LayoutDocument;

  createdAt: string;
  updatedAt: string;
};

export type RenderProfile = {
  id: string;
  schemaVersion: 1;
  name: string;
  strokeWidthMm: number;
  strokeColor: string;
  dotRadiusMm: number;
  roundCapsAndJoins: true;
  backgroundColor: "none";
};

export type ExportRecord = {
  id: string;
  compositionId: string;
  exportedAt: string;
  format: "svg";
  renderProfileId: string;
  fileName: string;
  // The composition's exact cacheKey at export time, for full traceability
  // from an exported file back to the exact inputs that produced it.
  cacheKey: string;
  metadata: {
    compositionId: string;
    compositionUpdatedAt: string;
    analysisId: string;
    analyzerVersion: string;
    mappingPresetId: string;
    grammarId: string;
    layoutPresetId: string;
    seed: number;
    rendererVersion: string;
  };
};

// Re-exported here only so callers of glyphCompositionTypes.ts don't also
// need to import glyphAudioTypes.ts directly for the one field they most
// commonly need (analysisId lookups) — a documentation convenience, not a
// new type.
export type { MusicalAnalysisDocument };
