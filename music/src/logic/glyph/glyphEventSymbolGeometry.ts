// Glyph Notes — Event symbol geometry
// (docs/glyph-audio/0804_GLYPH_NOTES_Event_Vocabulary_Laser_Layer_Spec_v0.1.0.md §7).
//
// Pure shape/size only — deliberately colorless. Color is a render-time
// concern (GlyphColorMode + a fixed preset lookup consumed only by
// GlyphFullCanvasPreview.tsx/glyphSvgExport.ts), never baked in here — see
// the pre-implementation review's "do not use fixed cover colors inside
// analysis or geometry" correction.

import type { GlyphAudibleEvent, GlyphEventFamily, GlyphEventSymbolSpec, GlyphPlacedEvent } from "../../data/glyphEventVocabularyTypes";
import type { DrumMark } from "./drumLayerLayout";

// Nominal units in the same pre-layout coordinate space as
// continuousGlyphRuns.ts's NOMINAL_PULSE_WIDTH — rescaled by the same
// canvas scale factor everything else uses at placement time.
const BASE_RADIUS = 1.5;
const LIGHT_TRANSIENT_RADIUS = 0.8;
const ACCENT_RADIUS_MULTIPLIER = 1.6;
const HALO_CONFIDENCE_THRESHOLD = 0.75;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function symbolForEvent(family: GlyphEventFamily, strength: number, confidence: number): GlyphEventSymbolSpec {
  const s = clamp01(strength);
  const c = clamp01(confidence);

  switch (family) {
    case "lightTransient":
      return { shape: "dot", radius: LIGHT_TRANSIENT_RADIUS, haloEnabled: false };
    case "clap":
      return { shape: "ring", radius: BASE_RADIUS + s * BASE_RADIUS, haloEnabled: c >= HALO_CONFIDENCE_THRESHOLD };
    case "accent": {
      // Accent keeps whatever shape its own confidence suggests (ring for a
      // strong clap-like accent, dot otherwise) but is always the largest
      // mark on the manuscript — never decorative complexity beyond size
      // + optional halo (§7 "avoid decorative complexity in the first slice").
      const asRing = c >= HALO_CONFIDENCE_THRESHOLD;
      return { shape: asRing ? "ring" : "dot", radius: (BASE_RADIUS + s * BASE_RADIUS) * ACCENT_RADIUS_MULTIPLIER, haloEnabled: asRing };
    }
    case "drum":
    case "unknown":
    default:
      return { shape: "dot", radius: BASE_RADIUS + s * BASE_RADIUS, haloEnabled: false };
  }
}

// Joins each classified GlyphAudibleEvent against its already-placed
// DrumMark (the SAME canvas placement drumEventDetection/drumLayerLayout
// already computed via sourceDrumEventId, matched to DrumMark.eventId) —
// never a second, independently-derived placement pass. An event whose
// underlying DrumEvent didn't get a placed mark (e.g. its timestamp fell
// outside the placed pulse range) is skipped, matching the same "drum
// events = visible drum events" honesty already required of DrumMark
// itself.
export function placeAudibleEvents(events: GlyphAudibleEvent[], drumMarks: DrumMark[]): GlyphPlacedEvent[] {
  const markById = new Map(drumMarks.map((m) => [m.eventId, m]));
  const placed: GlyphPlacedEvent[] = [];
  for (const event of events) {
    const mark = markById.get(event.sourceDrumEventId);
    if (!mark) continue;
    placed.push({
      eventId: event.id,
      family: event.family,
      point: mark.point,
      symbol: symbolForEvent(event.family, event.strength, event.confidence),
    });
  }
  return placed;
}
