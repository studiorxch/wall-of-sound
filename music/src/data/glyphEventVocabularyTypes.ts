// Glyph Notes — Event Vocabulary
// (docs/glyph-audio/0804_GLYPH_NOTES_Event_Vocabulary_Laser_Layer_Spec_v0.1.0.md §6-8).
//
// A classified GlyphAudibleEvent is a SEPARATE record from the raw DrumEvent
// (glyphDrumLayerTypes.ts) it was derived from — this build never writes a
// definitive instrument label back into DrumEvent.classification. DrumEvent
// stays exactly what the onset detector produced (timing/strength/
// confidence only); GlyphAudibleEvent is where family/confidence/reasons
// live, with an explicit sourceDrumEventId so the classification can always
// be traced back to the exact onset it came from — required provenance,
// per the pre-implementation review, for when these detectors improve.

import type { Point } from "./glyphStrokeTypes";

export type GlyphEventFamily =
  | "lightTransient"
  | "drum"
  | "clap"
  | "accent"
  | "unknown";

export type GlyphEventSource =
  | "drumStem"
  | "separatedDrumStem"
  | "fullMix"
  | "existingAnalysis";

// §6.3 features — computed fresh per event (nothing in the existing drum
// layer provides these; see glyphEventVocabulary.ts's header comment for
// why this is genuinely feasible via the existing shared FFT).
export type GlyphAudibleEventFeatures = {
  lowBandEnergy?: number;
  midBandEnergy?: number;
  highBandEnergy?: number;
  transientSharpness?: number;
  spectralFlatness?: number;
  decaySeconds?: number;
};

export type GlyphAudibleEvent = {
  id: string;
  timeSeconds: number;
  durationSeconds?: number;
  family: GlyphEventFamily;
  strength: number;
  confidence: number;
  source: GlyphEventSource;
  sourceTrackId: string;
  sourceStemId?: string;
  nearestPulseId?: string;
  offsetFromPulseSeconds?: number;
  features?: GlyphAudibleEventFeatures;
  // Provenance (beyond the spec's literal §6.3 type, added per the
  // pre-implementation review's "required provenance" instruction).
  sourceDrumEventId: string;
  classificationReasons: string[];
};

// §8 — the classifier's own raw verdict before it's folded into a
// GlyphAudibleEvent. Kept as a separate type so classifyEvent's unit tests
// can assert on the decision itself, independent of record-building.
export type GlyphEventClassificationResult = {
  family: GlyphEventFamily;
  confidence: number;
  reasons: string[];
};

// §7 — pure shape/size, deliberately colorless (see glyphEventSymbolGeometry.ts
// header comment — color is a render-time concern only).
export type GlyphEventSymbolShape = "dot" | "ring";

export type GlyphEventSymbolSpec = {
  shape: GlyphEventSymbolShape;
  radius: number;
  haloEnabled: boolean;
};

// §19 "Event warnings".
export type GlyphEventVocabularyWarning =
  | "weakClapConfidence"
  | "allEventsUnclassified"
  | "sourceUnavailable"
  | "eventCountUnusuallyHigh"
  | "acceptedCountZero";

// A GlyphAudibleEvent joined against its already-placed canvas point (reused
// from DrumMark — see glyphEventSymbolGeometry.ts's placeAudibleEvents —
// never a second, independently-computed placement) plus its resolved
// symbol spec. The one shape both GlyphFullCanvasPreview.tsx and
// glyphSvgExport.ts consume, guaranteeing preview/export parity.
export type GlyphPlacedEvent = {
  eventId: string;
  family: GlyphEventFamily;
  point: Point;
  symbol: GlyphEventSymbolSpec;
};

export type GlyphEventVocabularyResult = {
  sourceTrackId: string;
  analyzerVersion: string;
  analyzedAt: string;
  events: GlyphAudibleEvent[];
  warnings: GlyphEventVocabularyWarning[];
};
