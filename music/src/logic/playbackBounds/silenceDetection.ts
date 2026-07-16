// Track Playback Bounds — silence detection (§10). Adaptive per-track noise
// floor (not a single raw amplitude threshold across all files), with
// hysteresis so brief quiet passages don't flicker the boundary in and out.

export interface RmsWindows {
  values: Float32Array;
  windowSeconds: number;
}

const WINDOW_SECONDS = 0.1; // 100ms RMS windows — coarse enough to be stable, fine enough to locate boundaries to ~0.1s

export function computeRmsWindows(mono: Float32Array, sampleRate: number): RmsWindows {
  const windowSamples = Math.max(1, Math.round(WINDOW_SECONDS * sampleRate));
  const frameCount = Math.ceil(mono.length / windowSamples);
  const values = new Float32Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    const start = i * windowSamples;
    const end = Math.min(mono.length, start + windowSamples);
    let sum = 0;
    for (let j = start; j < end; j++) sum += mono[j] * mono[j];
    values[i] = Math.sqrt(sum / Math.max(1, end - start));
  }
  return { values, windowSeconds: WINDOW_SECONDS };
}

// §10 — adaptive noise floor per track. Uses the MEDIAN RMS level (the
// track's typical loudness) rather than a low percentile: a low-percentile
// floor is only meaningful when silence occupies a large-enough fraction of
// the track to dominate that percentile bucket — for a track with only a
// few seconds of leading/trailing silence, a 20th-percentile floor lands
// squarely on the sustained-audio level instead (a real miscalibration
// caught by this build's own fixture testing, see the calibration report).
// The median is robust to a leading/trailing silence fraction well under
// 50%, which covers every realistic case this build targets.
export function computeNoiseFloor(rms: RmsWindows): number {
  const sorted = Float32Array.from(rms.values).sort();
  const idx = Math.floor(sorted.length * 0.5);
  return sorted[idx] ?? 0;
}

const SILENCE_FACTOR = 0.15; // a window counts as "silent" below noiseFloor (median loudness) * this fraction
const MIN_SUSTAINED_SECONDS = 0.2; // hysteresis — must stay below threshold this long to count

export interface SilenceRegion {
  startSeconds: number;
  endSeconds: number;
}

// Returns the leading and trailing silence duration (seconds), using
// sustained-below-threshold runs only (hysteresis) — a single brief dip
// does not count as silence. Also returns the ACTUAL average level
// during each detected region (`leadingLevel`/`trailingLevel`) — distinct
// from `noiseFloor` (the track's overall typical loudness, used only to
// derive the detection threshold) — since classifying technical silence
// vs. musical quiet (§11) needs the real level of the region itself, not
// the track-wide reference.
export function detectLeadingTrailingSilence(rms: RmsWindows): {
  leadingSeconds: number; trailingSeconds: number; noiseFloor: number; leadingLevel: number; trailingLevel: number;
} {
  const noiseFloor = computeNoiseFloor(rms);
  const threshold = noiseFloor * SILENCE_FACTOR;
  const minFrames = Math.max(1, Math.round(MIN_SUSTAINED_SECONDS / rms.windowSeconds));

  let leadingFrames = 0;
  for (let i = 0; i < rms.values.length; i++) {
    if (rms.values[i] <= threshold) leadingFrames++;
    else break;
  }
  // Hysteresis: only count as silence if the leading run is itself long
  // enough to be "sustained," otherwise it's just the natural onset ramp.
  const leadingSeconds = leadingFrames >= minFrames ? leadingFrames * rms.windowSeconds : 0;
  const leadingLevel = leadingFrames > 0
    ? Array.from(rms.values.slice(0, leadingFrames)).reduce((a, b) => a + b, 0) / leadingFrames
    : 0;

  let trailingFrames = 0;
  for (let i = rms.values.length - 1; i >= 0; i--) {
    if (rms.values[i] <= threshold) trailingFrames++;
    else break;
  }
  const trailingSeconds = trailingFrames >= minFrames ? trailingFrames * rms.windowSeconds : 0;
  const trailingLevel = trailingFrames > 0
    ? Array.from(rms.values.slice(rms.values.length - trailingFrames)).reduce((a, b) => a + b, 0) / trailingFrames
    : 0;

  return { leadingSeconds, trailingSeconds, noiseFloor, leadingLevel, trailingLevel };
}
