// Glyph Notes — Laser source-priority selection
// (docs/glyph-audio/0804_GLYPH_NOTES_Event_Vocabulary_Laser_Layer_Spec_v0.1.0.md §10).
//
// Mirrors drumEventDetection.ts's selectDrumAudioSource exactly: a pure,
// generic tier-based selector, read-only against whatever the caller
// supplies. Per the pre-implementation review, "otherStem" (tier 1) is the
// only real, populated tier in this build — StemRole (trackStemTypes.ts)
// has no second non-vocals/drums/bass role, so "instrumentalStem" (tier 2)
// exists in the selection logic for future-proofing (mirroring how 0804C's
// own tier-2 drum-stem decoder was left real-but-unwired) but is never
// actually supplied by GlyphWorkspace.tsx's wiring this build. Never
// broadens to vocals or bass automatically — an ambiguous source is worse
// than an honest full-mix fallback.

import type { LaserLayerSource } from "../../data/glyphLaserLayerTypes";

export async function selectLaserAudioSource(options: {
  hasOtherStem: boolean;
  hasInstrumentalStem?: boolean;
  decodeOtherStemAudio?: () => Promise<{ mono: Float32Array; sampleRate: number }>;
  decodeInstrumentalStemAudio?: () => Promise<{ mono: Float32Array; sampleRate: number }>;
  decodeFullMixAudio: () => Promise<{ mono: Float32Array; sampleRate: number }>;
}): Promise<{ source: LaserLayerSource; audio: { mono: Float32Array; sampleRate: number } }> {
  if (options.hasOtherStem && options.decodeOtherStemAudio) {
    return { source: "otherStem", audio: await options.decodeOtherStemAudio() };
  }
  if (options.hasInstrumentalStem && options.decodeInstrumentalStemAudio) {
    return { source: "instrumentalStem", audio: await options.decodeInstrumentalStemAudio() };
  }
  return { source: "fullMix", audio: await options.decodeFullMixAudio() };
}
