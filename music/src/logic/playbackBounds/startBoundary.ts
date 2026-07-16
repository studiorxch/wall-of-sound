// Track Playback Bounds — start-boundary detection (§6, §7, §14, §15, §16).
// Distinguishes technical silence (safe to skip) from musical quiet
// (preserve unless overridden) — low amplitude alone is never sufficient
// evidence (§11).

import type { PlaybackBoundaryClassification } from "../../data/playbackBoundsTypes";
import type { RmsWindows } from "./silenceDetection";
import { detectLeadingTrailingSilence } from "./silenceDetection";
import { detectFadeIn } from "./fadeDetection";

// Absolute floor below which a signal reads as true digital silence /
// encoder padding regardless of the track's own adaptive noise floor —
// distinguishes "near-zero samples" from "quiet-but-real audio."
const TECHNICAL_SILENCE_ABSOLUTE_FLOOR = 0.01;
const ENCODER_DELAY_MAX_SECONDS = 1;
// A trusted downbeat is only used to move preferredStart forward when it
// falls within a reasonable early window — a downbeat at 90s into an
// 8-minute ambient track is not "the intro," it's the first beat AFTER a
// long intentional intro, which should be preserved, not skipped past.
const MAX_DOWNBEAT_SNAP_SECONDS = 30;

export interface StartBoundaryResult {
  audibleStartSeconds: number;
  preferredStartSeconds: number;
  startClassification: PlaybackBoundaryClassification;
  startConfidence: number;
  leadingSilenceSeconds: number;
}

export interface StartBoundaryBeatEvidence {
  trusted: boolean;
  firstBeatSeconds?: number;
  firstDownbeatSeconds?: number;
  introRegion?: { startSeconds: number; endSeconds: number; confidence: number };
}

export function computeStartBoundary(rms: RmsWindows, durationSeconds: number, beatEvidence?: StartBoundaryBeatEvidence): StartBoundaryResult {
  const { leadingSeconds, noiseFloor, leadingLevel } = detectLeadingTrailingSilence(rms);
  const fadeIn = detectFadeIn(rms);

  let audibleStartSeconds = 0;
  let startClassification: PlaybackBoundaryClassification = "musical_intro";
  let startConfidence = 0.5;

  if (leadingSeconds > 0) {
    // §11 — technical silence vs. musical quiet: the ABSOLUTE level of the
    // leading region ITSELF decides which (never the track-wide reference
    // level, which reflects the sustained audio, not the quiet region).
    const isTrueDigitalSilence = leadingLevel < TECHNICAL_SILENCE_ABSOLUTE_FLOOR;
    if (isTrueDigitalSilence) {
      audibleStartSeconds = leadingSeconds;
      startClassification = leadingSeconds <= ENCODER_DELAY_MAX_SECONDS ? "encoder_delay" : "technical_silence";
      startConfidence = 0.85;
    } else {
      // Non-negligible but quiet — room tone or intentional ambience.
      // Preserve it: audibleStart stays 0.
      audibleStartSeconds = 0;
      startClassification = "room_tone";
      startConfidence = 0.6;
    }
  } else if (fadeIn) {
    audibleStartSeconds = 0;
    startClassification = "fade";
    startConfidence = fadeIn.confidence;
  } else {
    // No sustained leading silence, no fade — either a hard start or a
    // gentle musical intro. A hard/abrupt start shows high energy in the
    // very first window already.
    const firstWindowLevel = rms.values[0] ?? 0;
    startClassification = firstWindowLevel >= noiseFloor * 0.7 ? "abrupt_start" : "musical_intro";
    startConfidence = 0.6;
  }

  // §14 — pickup/count-in: a trusted beat map showing the first downbeat
  // materially later than the first beat, within the audible region,
  // suggests a pickup note or count-in preceding the first full bar.
  if (beatEvidence?.trusted && beatEvidence.firstBeatSeconds != null && beatEvidence.firstDownbeatSeconds != null) {
    const gap = beatEvidence.firstDownbeatSeconds - beatEvidence.firstBeatSeconds;
    if (gap > 0.05 && gap < 4 && beatEvidence.firstBeatSeconds <= audibleStartSeconds + 2) {
      startClassification = gap < 1.5 ? "pickup" : "count_in";
    }
  }

  // §15/§16 — preferred start snaps to trusted evidence, never forced.
  let preferredStartSeconds = audibleStartSeconds;
  if (beatEvidence?.introRegion && beatEvidence.introRegion.startSeconds >= audibleStartSeconds) {
    preferredStartSeconds = beatEvidence.introRegion.startSeconds;
    startConfidence = Math.max(startConfidence, beatEvidence.introRegion.confidence);
  } else if (
    beatEvidence?.trusted && beatEvidence.firstDownbeatSeconds != null &&
    beatEvidence.firstDownbeatSeconds >= audibleStartSeconds &&
    beatEvidence.firstDownbeatSeconds <= MAX_DOWNBEAT_SNAP_SECONDS
  ) {
    preferredStartSeconds = beatEvidence.firstDownbeatSeconds;
  }

  preferredStartSeconds = Math.min(preferredStartSeconds, durationSeconds);
  audibleStartSeconds = Math.min(audibleStartSeconds, preferredStartSeconds);

  return {
    audibleStartSeconds: +audibleStartSeconds.toFixed(3),
    preferredStartSeconds: +preferredStartSeconds.toFixed(3),
    startClassification,
    startConfidence: +startConfidence.toFixed(3),
    leadingSilenceSeconds: +leadingSeconds.toFixed(3),
  };
}
