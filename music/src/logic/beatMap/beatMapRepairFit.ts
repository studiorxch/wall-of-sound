// Track Beat Map Foundation — Playlist Repair consumption hooks (§19).
// Exposes beat-map evidence as scoring fields WITHOUT touching Playlist
// Repair's actual candidate-ranking weights (protected scope, §28) — this
// build only adds the shared helper; a later build may activate beat-aware
// ranking. Missing/untrusted beat maps produce neutral (0.5) fits so
// existing repair scoring is unaffected when called defensively.

import type { TrackBeatMap, BeatMapRepairFit } from "../../data/beatMapTypes";
import { isBeatMapTrustedForAnalysis } from "./beatMapTrust";

const NEUTRAL_FIT: BeatMapRepairFit = {
  beatAlignmentFit: 0.5, barCompatibilityFit: 0.5, tempoStabilityFit: 0.5, introOutroFit: 0.5, confidence: 0,
};

export function computeBeatMapRepairFit(beatMap?: TrackBeatMap, neighborBeatMap?: TrackBeatMap): BeatMapRepairFit {
  if (!isBeatMapTrustedForAnalysis(beatMap) || !beatMap) return NEUTRAL_FIT;

  const tempoStabilityFit = beatMap.tempoStabilityScore;
  const barCompatibilityFit = beatMap.barStartTimesSeconds.length > 0 ? Math.min(1, beatMap.confidence + 0.2) : 0.5;
  const introOutroFit = beatMap.introRegion && beatMap.outroRegion
    ? Math.min(1, (beatMap.introRegion.confidence + beatMap.outroRegion.confidence) / 2 + 0.2)
    : 0.5;

  // Beat alignment relative to a neighbor track, when its beat map is also
  // trusted — compares beat-period compatibility (same evidence style as
  // the existing BPM-transition scoring, but never touches that module).
  let beatAlignmentFit = 0.5;
  if (neighborBeatMap && isBeatMapTrustedForAnalysis(neighborBeatMap) && beatMap.bpm && neighborBeatMap.bpm) {
    const ratio = beatMap.bpm / neighborBeatMap.bpm;
    const nearestInt = Math.round(ratio);
    const deviation = nearestInt > 0 ? Math.abs(ratio - nearestInt) / nearestInt : 1;
    beatAlignmentFit = Math.max(0, Math.min(1, 1 - deviation * 4));
  }

  return {
    beatAlignmentFit: +beatAlignmentFit.toFixed(3),
    barCompatibilityFit: +barCompatibilityFit.toFixed(3),
    tempoStabilityFit: +tempoStabilityFit.toFixed(3),
    introOutroFit: +introOutroFit.toFixed(3),
    confidence: beatMap.confidence,
  };
}
