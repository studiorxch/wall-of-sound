// Track Beat Map Foundation — stable warning taxonomy (§15).

import type { BeatMapWarningCode } from "../../data/beatMapTypes";

export const BEAT_MAP_WARNING_CODES: BeatMapWarningCode[] = [
  "BEAT_MAP_MISSING",
  "BEAT_MAP_LOW_CONFIDENCE",
  "BEAT_MAP_FIRST_BEAT_UNCERTAIN",
  "BEAT_MAP_DOWNBEAT_UNCERTAIN",
  "BEAT_MAP_BAR_ALIGNMENT_UNCERTAIN",
  "BEAT_MAP_TEMPO_DRIFT",
  "BEAT_MAP_TEMPO_CHANGE",
  "BEAT_MAP_IRREGULAR_METER",
  "BEAT_MAP_SPARSE_INTRO",
  "BEAT_MAP_NO_CLEAN_INTRO",
  "BEAT_MAP_NO_CLEAN_OUTRO",
  "BEAT_MAP_AUDIO_TOO_SHORT",
  "BEAT_MAP_INSUFFICIENT_ONSETS",
  "BEAT_MAP_DETECTOR_STALE",
  "BEAT_MAP_DOWNBEAT_PHASE_AMBIGUOUS",
  "BEAT_MAP_BAR_PHASE_AMBIGUOUS",
  "BEAT_MAP_DOWNBEAT_EVIDENCE_CONFLICT",
  "BEAT_MAP_BAR_PHASE_UNSTABLE",
  "BEAT_MAP_METER_UNCERTAIN",
];

export interface BeatMapWarningInputs {
  beatCount: number;
  firstBeatSeconds?: number;
  firstDownbeatSeconds?: number;
  barCount: number;
  overallConfidence: number;
  tempoStabilityScore: number;
  tempoSegmentCount: number;
  hasIntroRegion: boolean;
  hasOutroRegion: boolean;
  durationSeconds: number;
}

const MIN_ANALYZABLE_DURATION_SECONDS = 8;
const LOW_CONFIDENCE_THRESHOLD = 0.5;

export function assembleBeatMapWarnings(inputs: BeatMapWarningInputs): BeatMapWarningCode[] {
  const warnings: BeatMapWarningCode[] = [];

  if (inputs.durationSeconds < MIN_ANALYZABLE_DURATION_SECONDS) {
    warnings.push("BEAT_MAP_AUDIO_TOO_SHORT");
  }
  if (inputs.beatCount === 0) {
    warnings.push("BEAT_MAP_INSUFFICIENT_ONSETS");
  }
  if (inputs.overallConfidence < LOW_CONFIDENCE_THRESHOLD) {
    warnings.push("BEAT_MAP_LOW_CONFIDENCE");
  }
  if (inputs.firstBeatSeconds == null && inputs.beatCount > 0) {
    warnings.push("BEAT_MAP_FIRST_BEAT_UNCERTAIN");
  }
  if (inputs.firstDownbeatSeconds == null && inputs.beatCount >= 4) {
    warnings.push("BEAT_MAP_DOWNBEAT_UNCERTAIN");
  }
  if (inputs.barCount === 0 && inputs.beatCount >= 4) {
    warnings.push("BEAT_MAP_BAR_ALIGNMENT_UNCERTAIN");
  }
  if (inputs.tempoStabilityScore < 0.75 && inputs.tempoStabilityScore >= 0.25) {
    warnings.push("BEAT_MAP_TEMPO_DRIFT");
  }
  if (inputs.tempoStabilityScore < 0.25) {
    warnings.push("BEAT_MAP_IRREGULAR_METER");
  }
  if (inputs.tempoSegmentCount > 1) {
    warnings.push("BEAT_MAP_TEMPO_CHANGE");
  }
  if (!inputs.hasIntroRegion && inputs.barCount > 0) {
    warnings.push(inputs.beatCount > 0 ? "BEAT_MAP_NO_CLEAN_INTRO" : "BEAT_MAP_SPARSE_INTRO");
  }
  if (!inputs.hasOutroRegion && inputs.barCount > 0) {
    warnings.push("BEAT_MAP_NO_CLEAN_OUTRO");
  }

  return warnings;
}
