// Glyph Audio — stroke/path primitives, generalized from
// apps/glyphlab-reference/src/App.tsx:3-26 (read-only reference; that file
// is never modified — see docs/glyph-audio/12_GLYPH_AUDIO_Repository_Context.md).
// Deliberately free of any character/Unicode notion — a Glyph here is just
// a named bundle of strokes, identified elsewhere by an abstract
// GlyphInstanceId (glyphGrammarTypes.ts), never a code point.

export type Point = { x: number; y: number };
export type Stroke = { points: Point[]; mode?: "freehand" | "pen" };
export type Glyph = { strokes: Stroke[] };
export type GlyphBounds = { minX: number; minY: number; maxX: number; maxY: number; width: number; height: number };
