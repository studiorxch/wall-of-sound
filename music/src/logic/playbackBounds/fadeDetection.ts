// Track Playback Bounds — fade detection (§13). Detected fades are
// classified and preserved by default — never automatically trimmed.

import type { FadeEvidence } from "../../data/playbackBoundsTypes";
import type { RmsWindows } from "./silenceDetection";

const FADE_SCAN_SECONDS = 8; // how far into the track to look for a fade shape
const MIN_FADE_SECONDS = 1; // shorter ramps read as onset/decay, not a "fade"

function monotonicity(values: number[]): number {
  if (values.length < 2) return 0;
  let increasing = 0;
  let decreasing = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[i - 1]) increasing++;
    else if (values[i] < values[i - 1]) decreasing++;
  }
  const total = values.length - 1;
  return Math.max(increasing, decreasing) / total;
}

export function detectFadeIn(rms: RmsWindows): FadeEvidence | undefined {
  const scanFrames = Math.min(rms.values.length, Math.round(FADE_SCAN_SECONDS / rms.windowSeconds));
  if (scanFrames < 3) return undefined;
  const slice = Array.from(rms.values.slice(0, scanFrames));
  const mono = monotonicity(slice);
  const overallRise = slice[slice.length - 1] - slice[0];
  if (mono < 0.7 || overallRise <= 0) return undefined;

  const durationSeconds = scanFrames * rms.windowSeconds;
  if (durationSeconds < MIN_FADE_SECONDS) return undefined;

  return {
    startSeconds: 0,
    endSeconds: +durationSeconds.toFixed(3),
    direction: "in",
    monotonicity: +mono.toFixed(3),
    confidence: +Math.min(1, mono).toFixed(3),
  };
}

export function detectFadeOut(rms: RmsWindows, durationSeconds: number): FadeEvidence | undefined {
  const scanFrames = Math.min(rms.values.length, Math.round(FADE_SCAN_SECONDS / rms.windowSeconds));
  if (scanFrames < 3) return undefined;
  const slice = Array.from(rms.values.slice(rms.values.length - scanFrames));
  const mono = monotonicity(slice);
  const overallFall = slice[0] - slice[slice.length - 1];
  if (mono < 0.7 || overallFall <= 0) return undefined;

  const fadeStartSeconds = durationSeconds - scanFrames * rms.windowSeconds;
  if (durationSeconds - fadeStartSeconds < MIN_FADE_SECONDS) return undefined;

  return {
    startSeconds: +fadeStartSeconds.toFixed(3),
    endSeconds: +durationSeconds.toFixed(3),
    direction: "out",
    monotonicity: +mono.toFixed(3),
    confidence: +Math.min(1, mono).toFixed(3),
  };
}
