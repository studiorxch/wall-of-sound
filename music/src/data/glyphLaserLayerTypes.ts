// Glyph Notes — Laser / Synth-Motion Layer
// (docs/glyph-audio/0804_GLYPH_NOTES_Event_Vocabulary_Laser_Layer_Spec_v0.1.0.md §9-12).
//
// The laser layer is continuous behavior, not pulse marks — analyzed as a
// full-duration frame series (§10), placed as row-broken canvas geometry
// (§11), and rendered as either an oscillating line or a segmented beam
// (§9). Every type here is deliberately colorless: color is a render-time
// concern (glyphCompositionTypes.ts's GlyphColorMode + a fixed preset
// lookup consumed only by GlyphFullCanvasPreview.tsx/glyphSvgExport.ts),
// never baked into analysis or geometry — see the pre-implementation
// review's "do not use fixed cover colors inside analysis or geometry"
// correction.

import type { GlyphBounds } from "./glyphStrokeTypes";

export type LaserRenderMode = "oscillationLine" | "segmentedBeam";

// §10 — one frame's worth of continuous analysis. Computed for EVERY frame
// across the full track regardless of activity level (§10 "only render
// frames above an activity threshold" is a LAYOUT/render-time filter, not
// an analysis-time one — see the pre-implementation review's "laser
// coverage must not mean continuous visibility" correction: the analyzer
// itself always covers 100%, independent of how much of that ends up
// visible).
export type LaserActivityFrame = {
  timeSeconds: number;
  activity: number;
  highBandEnergy: number;
  spectralFlux: number;
  modulationAmount: number;
  modulationRate: number;
  sweepDirection: -1 | 0 | 1;
  confidence: number;
};

export type LaserLayerSource = "otherStem" | "instrumentalStem" | "fullMix";

// §19 "Laser warnings".
export type LaserLayerWarning =
  | "noSuitableStem"
  | "fullMixFallbackActive"
  | "sourceDurationMismatch"
  | "coverageBelow100"
  | "noVisibleActivity"
  | "thresholdRemovesAllFrames"
  | "droppedGeometrySegments";

export type LaserLayerResult = {
  sourceTrackId: string;
  sourceStemId?: string;
  source: LaserLayerSource;
  frameDurationSeconds: number;
  frames: LaserActivityFrame[];
  coverageStartSeconds: number;
  coverageEndSeconds: number;
  coveragePercent: number;
  analyzerVersion: string;
  analyzedAt: string;
  warnings: LaserLayerWarning[];
};

// §11 — placed (post-layout) laser geometry, in the same canvas coordinate
// space as PlacedGlyphRun (glyphCanvasTypes.ts), via the same
// timeToCanvasPosition mapping pulses and drum marks already use.
export type LaserPathPoint = {
  timeSeconds: number;
  x: number;
  y: number;
  activity: number;
  intensity: number;
  // Beyond the spec's literal §11 type — carried through from the
  // originating LaserActivityFrame so laserLayerGeometry.ts's
  // oscillationLine mode can honor the §9 mapping ("modulation amount ->
  // oscillation amplitude, modulation rate -> wavelength") per-point,
  // rather than losing that data at placement time. Same disclosed-
  // extension pattern already used for PulseArchGeometry/ContinuousGlyphRun.
  modulationAmount: number;
  modulationRate: number;
};

export type LaserPlacedSegment = {
  id: string;
  rowIndex: number;
  sectionId: string | null;
  points: LaserPathPoint[];
  bounds: GlyphBounds;
};

// Beyond the spec's literal §11 type — layout diagnostics distinguishing
// "analyzed" (always 100%) from "above threshold" from "actually placed"
// from "dropped due to a real layout failure" (should always be 0),
// directly backing the required "laser dropped segments = 0" invariant
// with two independently-meaningful counts rather than one conflated
// number.
export type LaserLayoutResult = {
  segments: LaserPlacedSegment[];
  framesAnalyzed: number;
  framesAboveThreshold: number;
  placedSegmentCount: number;
  visibleSegmentCount: number;
  droppedSegmentCount: number;
  activityThreshold: number;
};

// §13/§15 — persisted render settings. Deliberately no color field (see
// this file's header comment) — mode/threshold/amplitude/smoothing/offset/
// strokeWidth only.
export type LaserRenderSettings = {
  mode: LaserRenderMode;
  activityThreshold: number;
  amplitude: number;
  smoothing: number;
  verticalOffset: number;
  strokeWidth: number;
};
