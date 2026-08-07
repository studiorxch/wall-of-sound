// Glyph Notes — Full Canvas system (docs/glyph-audio/0804_GLYPH_NOTES_Full_Canvas_Pulse_Truth_Drum_Layer_Spec_v0.1.0.md
// §11-12, §18). Canvas geometry is expressed in logical "units" — a large,
// stable coordinate space independent of screen pixels — converted to
// physical millimeters at export time via `unitsToMm` (so the SVG's
// physical width/height stays deterministic regardless of on-screen zoom,
// §22 "Viewport zoom alone must not change exported geometry").

import type { GlyphBounds, Point } from "./glyphStrokeTypes";
import type { GlyphPathCommand } from "./glyphConnectionTypes";

export type GlyphCanvasShape = "square" | "portrait";

export type CanvasInsets = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type GlyphCanvasPreset = {
  id: string;
  name: string;
  shape: GlyphCanvasShape;
  widthUnits: number;
  heightUnits: number;
  // Physical export scale — 1 logical unit = unitsToMm millimeters.
  unitsToMm: number;
  safeArea: CanvasInsets;
};

export type GlyphViewportMode = "fitCanvas" | "fitWidth" | "actualSize";

// A single row-segment of an originally-continuous section run, re-anchored
// into real canvas coordinates by fullCanvasLayout.ts. Carries its own
// complete path commands (never a re-use of the pre-layout ribbon's raw
// coordinates) plus a direct per-pulse point lookup — the one mechanism
// timeToCanvasPosition.ts, the playhead, and drum-lane placement all share,
// rather than three separate re-derivations of the same placement math.
export type PlacedGlyphRun = {
  id: string;
  sourceRunId: string;
  sectionId: string | null;
  pulseIds: string[];
  pathCommands: GlyphPathCommand[];
  rowIndex: number;
  bounds: GlyphBounds;
  pulsePoints: Array<{ pulseId: string; timeSeconds: number; point: Point }>;
};

export type FullCanvasLayoutInput = {
  canvas: GlyphCanvasPreset;
  pulses: import("./glyphPulseTruthTypes").PulseTruthUnit[];
  runs: import("./glyphConnectionTypes").ContinuousGlyphRun[];
  preferredPulsesPerRow?: number;
  minPulseWidth: number;
  maxPulseWidth: number;
  rowGap: number;
  sectionGap: number;
  safeArea: CanvasInsets;
};

export type GlyphCanvasWarning =
  | "minimumPulseWidthReached"
  | "contentStillOverflows"
  | "notationTooDenseForCanvas"
  | "safeAreaTooSmall";

export type FullCanvasLayoutResult = {
  placedRuns: PlacedGlyphRun[];
  pulseWidth: number;
  rowHeight: number;
  rowCount: number;
  contentBounds: GlyphBounds;
  canvasBounds: GlyphBounds;
  safeBounds: GlyphBounds;
  overflowRight: number;
  overflowBottom: number;
  allPulsesPlaced: boolean;
  allPulsesVisible: boolean;
  warnings: GlyphCanvasWarning[];
  // §23 — the start point of each section's first placed row, derived from
  // the exact same per-row transform placedRuns themselves were built with.
  // Bars are no longer punctuated with a placed mark (0804D — bars are
  // silent spacing, not a dot); see barBoundaryCount/insertedBarGapCount
  // below for the diagnostic replacement.
  sectionStartPoints: Array<{ sectionId: string | null; point: Point }>;
  // 0804D diagnostics (docs/glyph-audio/0804_GLYPH_NOTES_Silent_Bar_Spacing_Event_Dot_Reassignment_Spec_v0.1.0.md)
  // — two independently-derived counts that must match by construction:
  // barBoundaryCount counts bar-index transitions directly from the input
  // pulses (the "should exist" source of truth); insertedBarGapCount counts
  // how many archGeometries actually carry segmentBoundaryReason === "bar"
  // across all placed runs (the "actually built" measurement). A mismatch
  // would mean a real bug in gap insertion, not a rendering choice.
  barBoundaryCount: number;
  insertedBarGapCount: number;
};

export const SQUARE_CANVAS_PRESET: GlyphCanvasPreset = {
  id: "canvas-square-v1",
  name: "Square",
  shape: "square",
  widthUnits: 3000,
  heightUnits: 3000,
  unitsToMm: 0.1, // 300mm x 300mm physical
  safeArea: { top: 150, right: 150, bottom: 150, left: 150 },
};

export const PORTRAIT_CANVAS_PRESET: GlyphCanvasPreset = {
  id: "canvas-portrait-v1",
  name: "Portrait",
  shape: "portrait",
  widthUnits: 2400,
  heightUnits: 3000,
  unitsToMm: 0.1, // 240mm x 300mm physical
  safeArea: { top: 150, right: 150, bottom: 150, left: 150 },
};
