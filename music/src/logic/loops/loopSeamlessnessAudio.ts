// Sectional Looper and Loop Library — real-audio evidence extraction (§11).
// Uses a decoded AudioBuffer (Web Audio), unavailable in this project's
// node test environment (no jsdom) — covered by live browser verification
// instead, matching the existing convention for anything that needs real
// audio decode (see DualDeckPlaybackEngine's own test-file header). The
// pure SCORING function this feeds (scoreLoopSeamlessness) is unit-tested.

import type { LoopSeamlessnessEvidence } from "../../data/loopTypes";

const ENDPOINT_WINDOW_SECONDS = 0.05;

function getWindowSamples(buffer: AudioBuffer, centerSeconds: number, windowSeconds: number): Float32Array {
  const sr = buffer.sampleRate;
  const half = Math.floor((windowSeconds * sr) / 2);
  const center = Math.round(centerSeconds * sr);
  const start = Math.max(0, center - half);
  const end = Math.min(buffer.length, center + half);
  const channelData = buffer.getChannelData(0);
  return channelData.slice(start, end);
}

function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

function zeroCrossingRate(samples: Float32Array): number {
  if (samples.length < 2) return 0;
  let crossings = 0;
  for (let i = 1; i < samples.length; i++) {
    if ((samples[i - 1] >= 0) !== (samples[i] >= 0)) crossings++;
  }
  return crossings / samples.length;
}

// Crude spectral proxy: high-frequency energy ratio via first-difference
// magnitude (a real FFT-based spectral-flatness comparison is a documented
// deferral — see completion report).
function highFreqEnergyRatio(samples: Float32Array): number {
  if (samples.length < 2) return 0;
  let diffEnergy = 0;
  let totalEnergy = 0;
  for (let i = 1; i < samples.length; i++) {
    const d = samples[i] - samples[i - 1];
    diffEnergy += d * d;
    totalEnergy += samples[i] * samples[i];
  }
  if (totalEnergy === 0) return 0;
  return Math.min(1, diffEnergy / totalEnergy);
}

function similarity(a: number, b: number): number {
  const diff = Math.abs(a - b);
  return Math.max(0, 1 - diff);
}

export function computeLoopSeamlessnessEvidenceFromBuffer(
  buffer: AudioBuffer,
  startSeconds: number,
  endSeconds: number,
  gridAlignmentScore: number,
  tempoStabilityScore: number,
): LoopSeamlessnessEvidence {
  const headWindow = getWindowSamples(buffer, startSeconds, ENDPOINT_WINDOW_SECONDS);
  const tailWindow = getWindowSamples(buffer, endSeconds, ENDPOINT_WINDOW_SECONDS);

  const headRms = rms(headWindow);
  const tailRms = rms(tailWindow);
  const headZcr = zeroCrossingRate(headWindow);
  const tailZcr = zeroCrossingRate(tailWindow);
  const headSpectral = highFreqEnergyRatio(headWindow);
  const tailSpectral = highFreqEnergyRatio(tailWindow);

  // Raw amplitude discontinuity at the exact splice point — the single
  // biggest predictor of an audible click.
  const sr = buffer.sampleRate;
  const channelData = buffer.getChannelData(0);
  const headSampleIdx = Math.min(channelData.length - 1, Math.round(startSeconds * sr));
  const tailSampleIdx = Math.min(channelData.length - 1, Math.round(endSeconds * sr));
  const spliceDelta = Math.abs(channelData[tailSampleIdx] - channelData[headSampleIdx]);

  return {
    waveformMatch: similarity(headRms === 0 && tailRms === 0 ? 0 : headRms, tailRms),
    rmsMatch: similarity(headRms, tailRms),
    spectralMatch: similarity(headSpectral, tailSpectral),
    zeroCrossingFit: similarity(headZcr, tailZcr),
    gridAlignment: gridAlignmentScore,
    tempoStability: tempoStabilityScore,
    boundaryTransientPenalty: Math.min(1, spliceDelta * 4),
  };
}
