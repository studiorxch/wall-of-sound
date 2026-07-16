// Track Playback Bounds — end-boundary detection (§8, §9, §15, §16).
// Mirrors startBoundary.ts's technical-silence-vs-musical-quiet
// distinction, applied near the track ending.

import type { PlaybackBoundaryClassification } from "../../data/playbackBoundsTypes";
import type { RmsWindows } from "./silenceDetection";
import { detectLeadingTrailingSilence } from "./silenceDetection";
import { detectFadeOut } from "./fadeDetection";

const TECHNICAL_SILENCE_ABSOLUTE_FLOOR = 0.01;
const MAX_OUTRO_SNAP_SECONDS = 30; // how far before the end a mix-out region may reasonably start

export interface EndBoundaryResult {
  audibleEndSeconds: number;
  preferredEndSeconds: number;
  endClassification: PlaybackBoundaryClassification;
  endConfidence: number;
  trailingSilenceSeconds: number;
}

export interface EndBoundaryBeatEvidence {
  trusted: boolean;
  lastBeatSeconds?: number;
  outroRegion?: { startSeconds: number; endSeconds: number; confidence: number };
}

export function computeEndBoundary(rms: RmsWindows, durationSeconds: number, beatEvidence?: EndBoundaryBeatEvidence): EndBoundaryResult {
  const { trailingSeconds, noiseFloor, trailingLevel } = detectLeadingTrailingSilence(rms);
  const fadeOut = detectFadeOut(rms, durationSeconds);

  let audibleEndSeconds = durationSeconds;
  let endClassification: PlaybackBoundaryClassification = "musical_outro";
  let endConfidence = 0.5;

  if (trailingSeconds > 0) {
    const isTrueDigitalSilence = trailingLevel < TECHNICAL_SILENCE_ABSOLUTE_FLOOR;
    if (isTrueDigitalSilence) {
      audibleEndSeconds = durationSeconds - trailingSeconds;
      endClassification = "technical_silence";
      endConfidence = 0.85;
    } else {
      // Non-negligible trailing quiet — likely a reverb tail or intentional
      // ambience. Preserve it: audibleEnd stays at source duration.
      audibleEndSeconds = durationSeconds;
      endClassification = "reverb_tail";
      endConfidence = 0.6;
    }
  } else if (fadeOut) {
    audibleEndSeconds = durationSeconds;
    endClassification = "fade";
    endConfidence = fadeOut.confidence;
  } else {
    const lastWindowLevel = rms.values[rms.values.length - 1] ?? 0;
    endClassification = lastWindowLevel >= noiseFloor * 0.7 ? "abrupt_end" : "musical_outro";
    endConfidence = 0.6;
  }

  // §15/§16 — preferred end snaps to trusted evidence, never forced past a
  // meaningful musical decay.
  let preferredEndSeconds = audibleEndSeconds;
  if (beatEvidence?.outroRegion && beatEvidence.outroRegion.endSeconds <= audibleEndSeconds) {
    preferredEndSeconds = beatEvidence.outroRegion.endSeconds;
    endConfidence = Math.max(endConfidence, beatEvidence.outroRegion.confidence);
  } else if (
    beatEvidence?.trusted && beatEvidence.lastBeatSeconds != null &&
    beatEvidence.lastBeatSeconds <= audibleEndSeconds &&
    durationSeconds - beatEvidence.lastBeatSeconds <= MAX_OUTRO_SNAP_SECONDS &&
    endClassification !== "fade" // a genuine musical fade should not be truncated at the last rhythmic beat
  ) {
    preferredEndSeconds = beatEvidence.lastBeatSeconds;
  }

  preferredEndSeconds = Math.max(preferredEndSeconds, 0);
  audibleEndSeconds = Math.max(audibleEndSeconds, preferredEndSeconds);

  return {
    audibleEndSeconds: +audibleEndSeconds.toFixed(3),
    preferredEndSeconds: +preferredEndSeconds.toFixed(3),
    endClassification,
    endConfidence: +endConfidence.toFixed(3),
    trailingSilenceSeconds: +trailingSeconds.toFixed(3),
  };
}
