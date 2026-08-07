// Glyph Notes — Connection Grammar (docs/glyph-audio/0804_GLYPH_NOTES_Connection_Grammar_Spec_v0.1.0.md).
// Canonical types, taken verbatim from that spec §10/§12/§16/§24, plus a
// small number of input/output types the spec references by name
// (DecideConnectionInput, BuildGlyphRunsInput/Output, LayoutConnectionConstraints)
// but does not fully define — those are designed here to match the spec's
// own function signatures (§13, §14) as closely as possible.
//
// This layer never touches musical analysis, energy values, section IDs, or
// pulse count (§17 "Required invariant") — it only adds continuity and
// punctuation decisions on top of an already-generated glyph sequence.

import type { GlyphBounds, Point } from "./glyphStrokeTypes";
import type { BeatUnit, BoundaryUnit, SilenceUnit } from "./glyphAudioTypes";
import type { GeneratedGlyphInstance } from "./glyphGrammarTypes";

export type ConnectionMode =
  | "never"
  | "withinBar"
  | "withinPhrase"
  | "withinSection"
  | "always";

export type BoundaryBehavior =
  | "keepConnected"
  | "dot"
  | "smallGap"
  | "gap"
  | "break"
  | "dotAndGap"
  | "dotCluster"
  | "breakAndDot"
  | "breakAndDotCluster"
  | "largeGap"
  | "newRow"
  | "newOrbit"
  | "newPage"
  | "extendedGap"
  | "restMark";

export type ConnectorMode =
  | "straight"
  | "softSag"
  | "softRise"
  | "tensionCurve"
  | "inheritNeighboringCurvature";

export type ConnectionGrammar = {
  id: string;
  schemaVersion: 1;
  name: string;

  connectionMode: ConnectionMode;

  barBoundaryBehavior: BoundaryBehavior;
  phraseBoundaryBehavior: BoundaryBehavior;
  sectionBoundaryBehavior: BoundaryBehavior;
  silenceBoundaryBehavior: BoundaryBehavior;

  connectorMode: ConnectorMode;

  connectorDistanceMultiplier: number;
  maxBaselineDeltaMultiplier: number;
  allowMinorCrossings: boolean;
  allowConnectorOverrun: boolean;

  connectorSagAmount: number;
  connectorRiseAmount: number;
  connectorTension: number;
  connectorSmoothing: number;

  punctuationDotSize: number;
  punctuationGapSize: number;
  sectionGapMultiplier: number;
  restMarkScale: number;

  createdAt: string;
  updatedAt: string;
};

export type ConnectionResult = "connected" | "broken" | "punctuated";

export type ConnectionReason =
  | "chronologyMismatch"
  | "sameRun"
  | "barBoundary"
  | "phraseBoundary"
  | "sectionBoundary"
  | "silenceBoundary"
  | "manualOverride"
  | "connectionModeDenied"
  | "geometryIncompatible"
  | "distanceExceeded"
  | "baselineDeltaExceeded"
  | "collisionDetected"
  | "layoutBoundary"
  | "renderFallback";

export type PunctuationType = "dot" | "dotCluster" | "gap" | "restMark";

export type ConnectionDecision = {
  id: string;

  fromPulseId: string;
  toPulseId: string;

  fromGlyphInstanceId: string;
  toGlyphInstanceId: string;

  result: ConnectionResult;
  reason: ConnectionReason;

  connectorMode?: ConnectorMode;
  punctuation?: PunctuationType;
  // Connector geometry computed from the two pulses' own LOCAL (unplaced)
  // arch endpoints — present only when result is "connected". This is a
  // deterministic diagnostic/provenance value, not what actually gets drawn:
  // the real, placement-correct connector is recomputed at render time (both
  // preview and SVG export) from each glyph's PLACED endpoint coordinates,
  // via the exact same buildConnectorPath function
  // (connectorGeometry.ts) — the run-formation stage runs before manuscript
  // layout and therefore cannot know final placement/spacing yet.
  connectorPathData?: string;

  createdAt: string;
};

export type GlyphRun = {
  id: string;
  sectionId: string;
  phraseId: string | null;
  barIds: string[];

  pulseIds: string[];
  glyphInstanceIds: string[];

  connectionDecisions: ConnectionDecision[];

  startBeat: number;
  endBeat: number;

  rowIndex?: number;
  pageIndex?: number;
};

export type ConnectionOverride = {
  id: string;
  fromPulseId: string;
  toPulseId: string;
  action: "forceConnect" | "forceBreak" | "forceDot" | "forceGap" | "forceNewRow";
  createdAt: string;
  updatedAt: string;
};

// §12.1 — endpoints must come from canonical glyph geometry (buildArchStrokes
// via connectorGeometry.ts's getArchEndpoints), never inferred from rendered
// DOM. startTangent/endTangent, when present, store the actual adjacent
// stroke point (not a unit vector) — buildConnectorPath derives a direction
// by subtracting it from start/end respectively.
export type GlyphEndpoints = {
  start: Point;
  end: Point;
  startTangent?: Point;
  endTangent?: Point;
};

// §16 — a single placed punctuation mark. "dotCluster" is realized as
// multiple PunctuationMark entries (2-3 dots with deterministic spacing),
// not a single mark with a cluster flag.
export type PunctuationMark = {
  id: string;
  type: PunctuationType;
  x: number;
  y: number;
  radius?: number;
  scale?: number;
  sourceBoundaryId: string;
};

// §24 — inspectable, never blocks rendering unless geometry truly cannot be
// produced safely (renderFallback, handled as an ordinary broken decision).
export type ConnectionWarning =
  | { type: "distanceExceeded"; fromPulseId: string; toPulseId: string }
  | { type: "baselineDeltaExceeded"; fromPulseId: string; toPulseId: string }
  | { type: "collisionDetected"; fromPulseId: string; toPulseId: string }
  | { type: "layoutBoundary"; fromPulseId: string; toPulseId: string }
  | { type: "manualOverrideRejected"; fromPulseId: string; toPulseId: string; reason: string };

// Reserved for a future layout-aware second pass (§12.5 "never connect
// across different rows/pages/layout zones"). Run formation happens BEFORE
// manuscript layout assigns rows/pages in this pipeline (§17), so real
// per-pair values are not yet available this slice — the field exists for
// forward compatibility and is accepted as always-undefined today. Actual
// row-crossing suppression is instead enforced at render time (preview +
// SVG export), which does know each glyph's placed rowIndex.
export type LayoutConnectionConstraints = {
  crossesRow?: boolean;
  crossesPage?: boolean;
};

// The single strongest structural boundary tier crossed between two
// chronologically adjacent pulses, derived by glyphRunFormation.ts directly
// from adjacent BeatUnit.sectionId/phraseId/barId changes (section >
// phrase > bar precedence). null means no boundary — the two pulses share
// the same bar.
export type BoundaryTier = "bar" | "phrase" | "section" | null;

export type DecideConnectionInput = {
  fromPulse: BeatUnit;
  toPulse: BeatUnit;
  fromGlyphInstanceId: string;
  toGlyphInstanceId: string;
  fromEndpoints: GlyphEndpoints;
  toEndpoints: GlyphEndpoints;
  // A representative pulse width/height for this pair's geometry thresholds
  // (§12.2/§12.3) — glyphRunFormation.ts supplies the average of the two
  // adjacent generated glyph instances' own ArchGrammarParameters.width/height.
  basePulseWidth: number;
  localGlyphHeight: number;
  boundaryTier: BoundaryTier;
  hasSilenceBetween: boolean;
  grammar: ConnectionGrammar;
  override?: ConnectionOverride;
  layoutConstraints?: LayoutConnectionConstraints;
  createdAt: string;
};

export type BuildGlyphRunsInput = {
  pulses: BeatUnit[];
  glyphs: GeneratedGlyphInstance[];
  boundaries: BoundaryUnit[];
  silences: SilenceUnit[];
  grammar: ConnectionGrammar;
  overrides: ConnectionOverride[];
  layoutConstraints?: LayoutConnectionConstraints;
  createdAt: string;
};

export type BuildGlyphRunsOutput = {
  runs: GlyphRun[];
  decisions: ConnectionDecision[];
  warnings: ConnectionWarning[];
};

// §9 (docs/glyph-audio/0804_GLYPH_NOTES_Full_Canvas_Pulse_Truth_Drum_Layer_Spec_v0.1.0.md)
// — continuous shared-endpoint "mmmm" path geometry. Replaces the prior
// build's "independent arches + separate connector path" construction:
// arch[n].end is the SAME point object as arch[n+1].start, by construction
// (continuousGlyphRuns.ts), so a run is always exactly one continuous SVG
// path with no possibility of a visible gap or doubled line.
export type GlyphPathCommand =
  | { type: "M"; x: number; y: number }
  | { type: "L"; x: number; y: number }
  | { type: "Q"; cx: number; cy: number; x: number; y: number }
  | { type: "C"; c1x: number; c1y: number; c2x: number; c2y: number; x: number; y: number };

// 0804D (docs/glyph-audio/0804_GLYPH_NOTES_Silent_Bar_Spacing_Event_Dot_Reassignment_Spec_v0.1.0.md)
// — why THIS arch begins a fresh path segment (a pen-lift "M" rather than a
// continuous curve from the previous arch). "runStart" is the first arch of
// a ContinuousGlyphRun (always a fresh M, never a "gap" in the punctuation
// sense — nothing to count against the bar-boundary invariant); "bar" and
// "phrase" are silent spacing gaps inserted at those boundaries. Recording
// the reason (not just a boolean) is what lets diagnostics count bar gaps
// specifically without reverse-engineering intent from raw M commands.
export type GlyphSegmentBoundaryReason = "runStart" | "bar" | "phrase";

export type PulseArchGeometry = {
  pulseId: string;
  start: Point;
  crest: Point;
  end: Point;
  width: number;
  height: number;
  asymmetry: number;
  tension: number;
  // True whenever this arch's path commands must start with a fresh "M"
  // instead of continuing the previous arch's curve — i.e. whenever
  // segmentBoundaryReason is non-null. Kept alongside the reason for a
  // cheap boolean check at render time.
  startsNewSegment: boolean;
  segmentBoundaryReason: GlyphSegmentBoundaryReason | null;
};

export type ContinuousGlyphRun = {
  id: string;
  sectionId: string | null;
  pulseIds: string[];
  pathCommands: GlyphPathCommand[];
  startPoint: Point;
  endPoint: Point;
  bounds: GlyphBounds;
  // Beyond the spec's literal type (§9.3) — the per-pulse geometry that
  // pathCommands was built from, in this run's own pre-layout local ribbon
  // frame. Without this, fullCanvasLayout.ts could not re-segment a run
  // into rows without re-running per-pulse mapping from scratch; exposing
  // it keeps "one place computes arch shape" true end to end.
  archGeometries: PulseArchGeometry[];
};

export type GlyphDiagnostics = {
  sourcePulses: number;
  generatedArches: number;
  connectionCandidates: number;
  connectedPairs: number;
  brokenPairs: number;
  punctuatedBoundaries: number;
  runs: number;
  rows: number;
  pages: number;
  visiblePulses: number;
  // §24 (0804_GLYPH_NOTES_Full_Canvas_Pulse_Truth_Drum_Layer_Spec) additions
  // — optional so 0804B's summarizeGlyphRuns (which predates full-canvas
  // pulse truth) keeps compiling unchanged; populated by the full-canvas
  // pipeline's own diagnostics assembly in GlyphWorkspace.tsx.
  placedArches?: number;
  coveragePercent?: number;
  canvasShape?: string;
  canvasOverflow?: number;
  drumSource?: string;
  drumEventCount?: number;
};
