// Complete Song Intelligence and Section Map (0717C) — reduces the raw
// per-frame arrays computeDspFeaturesChunked returns into fixed-resolution
// NumericProfile curves spanning the whole decoded track. Pure, no I/O.
//
// energyProfile/brightnessProfile/bassWeightProfile are real, signal-
// derived windowed means of already-computed per-frame data (RMS/spectral
// centroid/low-band FFT energy) — nothing fabricated. densityProfile
// generalizes the existing scalar onset-density calculation
// (dspFeatureExtraction.ts's rmsValues[i]-rmsValues[i-1] delta-threshold
// logic) into per-window counts using the SAME adaptive-threshold formula
// and the SAME /10 normalization scale. percussiveProfile is a disclosed
// heuristic — a geometric mean of the windowed density and windowed
// zero-crossing-rate profiles, generalizing the existing binary
// "percussive-fragments" mechanism tag (onsetDensityNorm > 0.6 &&
// zeroCrossingRate > 0.5) into a continuous score using the same two
// signals and the same normalization constants, never a new detector.

import type { NumericProfile } from "../../data/songAnalysisTypes";

export const DEFAULT_PROFILE_SAMPLE_COUNT = 128;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// Exported for reuse by songWaveformSummary.ts (0717D) — the exact same
// index-proportional windowing, so the waveform overview's bins align with
// every other profile's windowing convention.
export function windowBounds(index: number, sampleCount: number, length: number): { startIdx: number; endIdx: number } {
  const startIdx = Math.floor((index / sampleCount) * length);
  const endIdx = Math.max(startIdx + 1, Math.floor(((index + 1) / sampleCount) * length));
  return { startIdx, endIdx };
}

// Index-proportional windowing (not exact-timestamp alignment) — frames are
// evenly hop-spaced across the array, so a proportional chunk split is
// time-proportional too. Appropriate for a coarse activity-curve
// visualization, not audio-detail peaks.
export function buildNumericProfile(
  rawValues: number[],
  totalDurationSeconds: number,
  sampleCount: number = DEFAULT_PROFILE_SAMPLE_COUNT,
): NumericProfile {
  const windowSeconds = totalDurationSeconds / sampleCount;
  const values: number[] = [];
  for (let i = 0; i < sampleCount; i++) {
    if (rawValues.length === 0) { values.push(0); continue; }
    const { startIdx, endIdx } = windowBounds(i, sampleCount, rawValues.length);
    let sum = 0;
    let count = 0;
    for (let j = startIdx; j < endIdx && j < rawValues.length; j++) { sum += rawValues[j]; count++; }
    values.push(count > 0 ? sum / count : 0);
  }
  return { sampleCount, windowSeconds, values };
}

// Generalizes dspFeatureExtraction.ts's scalar onset-density calculation
// (adaptive threshold = overall RMS mean * 0.3, normalized /10) to one
// windowed count per profile sample instead of a single whole-track mean.
export function buildDensityProfile(
  rmsValues: number[],
  totalDurationSeconds: number,
  sampleCount: number = DEFAULT_PROFILE_SAMPLE_COUNT,
): NumericProfile {
  const windowSeconds = totalDurationSeconds / sampleCount;
  const values: number[] = [];
  if (rmsValues.length < 2) return { sampleCount, windowSeconds, values: new Array(sampleCount).fill(0) };

  const overallMean = rmsValues.reduce((a, b) => a + b, 0) / rmsValues.length;
  const adaptiveThreshold = overallMean * 0.3;

  for (let i = 0; i < sampleCount; i++) {
    const { startIdx, endIdx } = windowBounds(i, sampleCount, rmsValues.length);
    let onsetCount = 0;
    for (let j = Math.max(1, startIdx); j < endIdx && j < rmsValues.length; j++) {
      const delta = Math.max(0, rmsValues[j] - rmsValues[j - 1]);
      if (delta > adaptiveThreshold) onsetCount++;
    }
    const rawDensity = onsetCount / Math.max(0.001, windowSeconds);
    values.push(clamp01(rawDensity / 10));
  }
  return { sampleCount, windowSeconds, values };
}

export function buildPercussiveProfile(
  rmsValues: number[],
  zcrValues: number[],
  totalDurationSeconds: number,
  sampleCount: number = DEFAULT_PROFILE_SAMPLE_COUNT,
): NumericProfile {
  const density = buildDensityProfile(rmsValues, totalDurationSeconds, sampleCount);
  const zcrNormalized = zcrValues.map((z) => clamp01(z * 8)); // matches existing zeroCrossingRate normalization
  const zcrProfile = buildNumericProfile(zcrNormalized, totalDurationSeconds, sampleCount);
  const windowSeconds = totalDurationSeconds / sampleCount;
  const values = density.values.map((d, i) => Math.sqrt(Math.max(0, d) * Math.max(0, zcrProfile.values[i] ?? 0)));
  return { sampleCount, windowSeconds, values };
}
