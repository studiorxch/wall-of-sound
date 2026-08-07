// Glyph Notes — Color presets
// (docs/glyph-audio/0804_GLYPH_NOTES_Event_Vocabulary_Laser_Layer_Spec_v0.1.0.md §12).
//
// The ONLY place actual color values live. GlyphFullCanvasPreview.tsx and
// glyphSvgExport.ts both import this SAME lookup so preview and export are
// guaranteed to render identical colors — never two independently-tuned
// palettes. No analysis, classification, or geometry module ever imports
// this file, per the pre-implementation review's "do not use fixed cover
// colors inside analysis or geometry" correction.

import type { GlyphColorMode } from "../../data/glyphCompositionTypes";

export type GlyphColorPalette = {
  background: string;
  pulseManuscript: string;
  drums: string;
  clapRings: string;
  laser: string;
};

// Monochrome values match DEFAULT_RENDER_PROFILE's pre-existing
// strokeColor ("#000000") exactly, so switching pulse-manuscript/drum
// rendering to read color from this palette instead of renderProfile
// directly is byte-identical for every composition saved before 0804E.
const MONOCHROME_PALETTE: GlyphColorPalette = {
  background: "none",
  pulseManuscript: "#000000",
  drums: "#000000",
  clapRings: "#000000",
  laser: "#000000",
};

// §12 "Suggested Frank preset."
export const FRANK_COVER_PRESET_ID = "frank-preset-v1";
const COVER_PALETTE: GlyphColorPalette = {
  background: "#0a0a0a",
  pulseManuscript: "#f5efe0",
  drums: "#fdf6ec",
  clapRings: "#e8c98a",
  laser: "#4dd0c8",
};

export function resolveColorPalette(mode: GlyphColorMode): GlyphColorPalette {
  return mode === "cover" ? COVER_PALETTE : MONOCHROME_PALETTE;
}
