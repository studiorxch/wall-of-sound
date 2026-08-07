// Glyph Notes — Laser / synth-motion continuous analysis
// (docs/glyph-audio/0804_GLYPH_NOTES_Event_Vocabulary_Laser_Layer_Spec_v0.1.0.md §9-10).
//
// A real, deterministic, dependency-free frame-series analyzer, reusing
// the shared FFT (../fft.ts) the same way dspFeatureExtraction.ts and
// glyphEventVocabulary.ts already do. Per the spec's own stage list:
// mono -> high-band filtering (via magnitude-spectrum band ratio) -> frame
// energy -> spectral flux -> envelope smoothing -> short-window
// oscillation proxy -> modulation amount -> modulation rate -> sweep
// direction.
//
// Per the pre-implementation review's "laser coverage must not mean
// continuous visibility" correction: this module ALWAYS analyzes frames
// across the full track duration, regardless of activity level — coverage
// is a property of the ANALYZER, not of how much ends up visible.
// Filtering by an activity threshold is explicitly a LAYOUT-time concern
// (laserLayerLayout.ts), never done here.
//
// modulationRate and sweepDirection are cheap, disclosed proxies (a
// derivative zero-crossing rate; a short-window spectral-centroid trend
// sign) — visual descriptors, never pitch or synthesis measurements.

import { magnitudeSpectrum } from "../fft";
import type { MonoAudioInput } from "../../data/glyphDrumLayerTypes";
import type { LaserActivityFrame, LaserLayerResult, LaserLayerSource, LaserLayerWarning } from "../../data/glyphLaserLayerTypes";

export const LASER_ANALYZER_VERSION = "glyph-laser-analyzer-v1";

const FRAME_HOP_SECONDS = 0.1;
const FFT_SIZE = 4096;
const HIGH_BAND_CUTOFF_HZ = 4000;
const SMOOTHING_WINDOW_FRAMES = 5; // +/- ~0.5s of context for modulation/sweep proxies
const NO_ACTIVITY_HINT_THRESHOLD = 0.1; // diagnostic-only hint, not a layout filter

export type DetectLaserActivityInput = {
  audio: MonoAudioInput;
  source: LaserLayerSource;
  sourceTrackId: string;
  sourceStemId?: string;
  analyzedAt: string; // caller-supplied for determinism (never Date.now() internally)
};

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function rms(mono: Float32Array, start: number, end: number): number {
  if (end <= start) return 0;
  let sum = 0;
  for (let i = start; i < end; i++) sum += mono[i] * mono[i];
  return Math.sqrt(sum / (end - start));
}

function computeVariance(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) * (b - mean), 0) / values.length;
  return clamp01(Math.sqrt(variance) * 3);
}

function computeDerivativeZeroCrossingRate(values: number[]): number {
  if (values.length < 3) return 0;
  const derivative: number[] = [];
  for (let i = 1; i < values.length; i++) derivative.push(values[i] - values[i - 1]);
  let crossings = 0;
  for (let i = 1; i < derivative.length; i++) {
    if ((derivative[i] >= 0) !== (derivative[i - 1] >= 0)) crossings++;
  }
  return clamp01(crossings / derivative.length);
}

function computeTrendSign(values: number[]): -1 | 0 | 1 {
  if (values.length < 2) return 0;
  const first = values[0];
  const last = values[values.length - 1];
  const delta = last - first;
  const deadband = Math.abs(first) * 0.02 + 1;
  if (delta > deadband) return 1;
  if (delta < -deadband) return -1;
  return 0;
}

export function detectLaserActivity(input: DetectLaserActivityInput): LaserLayerResult {
  const { mono, sampleRate } = input.audio;
  const base = {
    sourceTrackId: input.sourceTrackId, sourceStemId: input.sourceStemId, source: input.source,
    analyzerVersion: LASER_ANALYZER_VERSION, analyzedAt: input.analyzedAt,
  };

  if (mono.length === 0 || !(sampleRate > 0)) {
    return { ...base, frameDurationSeconds: FRAME_HOP_SECONDS, frames: [], coverageStartSeconds: 0, coverageEndSeconds: 0, coveragePercent: 0, warnings: ["noVisibleActivity"] };
  }

  const hopSamples = Math.max(1, Math.round(FRAME_HOP_SECONDS * sampleRate));
  const durationSeconds = mono.length / sampleRate;
  const binHz = sampleRate / FFT_SIZE;

  type RawFrame = { timeSeconds: number; rmsValue: number; highBandRatio: number; centroid: number; fluxRaw: number };
  const raw: RawFrame[] = [];
  let prevMags: Float32Array | null = null;

  for (let start = 0; start < mono.length; start += hopSamples) {
    const frame = mono.subarray(start, Math.min(mono.length, start + FFT_SIZE));
    const mags = magnitudeSpectrum(frame, FFT_SIZE);

    let total = 0, high = 0, weightedFreq = 0;
    for (let k = 0; k < mags.length; k++) {
      const freq = k * binHz;
      total += mags[k];
      weightedFreq += freq * mags[k];
      if (freq >= HIGH_BAND_CUTOFF_HZ) high += mags[k];
    }
    const highBandRatio = total > 0 ? high / total : 0;
    const centroid = total > 0 ? weightedFreq / total : 0;

    let fluxRaw = 0;
    if (prevMags) {
      for (let k = 0; k < mags.length; k++) fluxRaw += Math.max(0, mags[k] - prevMags[k]);
    }
    prevMags = mags;

    const frameEnd = Math.min(mono.length, start + hopSamples);
    raw.push({ timeSeconds: start / sampleRate, rmsValue: rms(mono, start, frameEnd), highBandRatio, centroid, fluxRaw });
  }

  const maxFlux = raw.reduce((m, r) => Math.max(m, r.fluxRaw), 0);
  const maxRms = raw.reduce((m, r) => Math.max(m, r.rmsValue), 0);

  const activityAt = (r: RawFrame): number => {
    const normFlux = maxFlux > 0 ? r.fluxRaw / maxFlux : 0;
    const normRms = maxRms > 0 ? r.rmsValue / maxRms : 0;
    return clamp01(r.highBandRatio * 0.5 + normFlux * 0.3 + normRms * 0.2);
  };

  const frames: LaserActivityFrame[] = raw.map((r, i) => {
    const windowStart = Math.max(0, i - SMOOTHING_WINDOW_FRAMES);
    const windowEnd = Math.min(raw.length, i + SMOOTHING_WINDOW_FRAMES + 1);
    const windowActivities: number[] = [];
    const windowCentroids: number[] = [];
    for (let j = windowStart; j < windowEnd; j++) {
      windowActivities.push(activityAt(raw[j]));
      windowCentroids.push(raw[j].centroid);
    }

    const activity = activityAt(r);
    const normFlux = maxFlux > 0 ? r.fluxRaw / maxFlux : 0;
    return {
      timeSeconds: r.timeSeconds,
      activity,
      highBandEnergy: +r.highBandRatio.toFixed(4),
      spectralFlux: +normFlux.toFixed(4),
      modulationAmount: +computeVariance(windowActivities).toFixed(4),
      modulationRate: +computeDerivativeZeroCrossingRate(windowActivities).toFixed(4),
      sweepDirection: computeTrendSign(windowCentroids),
      confidence: +clamp01(activity * 1.2).toFixed(4),
    };
  });

  const warnings: LaserLayerWarning[] = [];
  const coverageStartSeconds = frames.length ? frames[0].timeSeconds : 0;
  const lastFrame = frames[frames.length - 1];
  const coverageEndSeconds = lastFrame ? lastFrame.timeSeconds + FRAME_HOP_SECONDS : 0;
  const coveragePercent = durationSeconds > 0 ? Math.min(100, (coverageEndSeconds / durationSeconds) * 100) : 0;

  if (durationSeconds - coverageEndSeconds > FRAME_HOP_SECONDS) warnings.push("coverageBelow100");
  if (frames.length > 0 && frames.every((f) => f.activity < NO_ACTIVITY_HINT_THRESHOLD)) warnings.push("noVisibleActivity");
  if (input.source === "fullMix") warnings.push("fullMixFallbackActive");

  return {
    ...base, frameDurationSeconds: FRAME_HOP_SECONDS, frames,
    coverageStartSeconds, coverageEndSeconds, coveragePercent, warnings,
  };
}
