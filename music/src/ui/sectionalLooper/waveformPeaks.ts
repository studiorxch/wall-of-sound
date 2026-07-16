// 0714R — Sectional Looper waveform, playhead, and active-candidate UI (§6,
// §7). Pure peak-generation logic: downmixes a decoded AudioBuffer into
// fixed-size min/max bins. Never decodes audio itself (the caller supplies
// an already-decoded buffer — reused across the full-track overview AND
// every candidate mini waveform, satisfying §6 "no repeated full decode per
// card") and never touches the beat-map/BPM/playback-bounds detectors.

import type { WaveformEnvelope, WaveformPeak } from "../../data/loopTypes";

// Bumped only when the peak-generation algorithm itself changes — used as
// part of the cache key (§23) so a changed generator invalidates old peaks.
export const WAVEFORM_GENERATOR_VERSION = "1.0.0";

export const FULL_TRACK_BIN_COUNT = 768; // §6 — 512–1024 recommended range
export const CANDIDATE_BIN_COUNT = 192; // §6 — 128–256 recommended range

function downmixFrame(buffer: AudioBuffer, frame: number): number {
  let sum = 0;
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    sum += buffer.getChannelData(ch)[frame];
  }
  return sum / buffer.numberOfChannels;
}

// §6/§7 — core peak reducer, shared by the full-track and per-candidate
// paths below so both honor the same min/max semantics.
export function computePeaksForFrameRange(
  buffer: AudioBuffer,
  startFrame: number,
  endFrame: number,
  binCount: number,
): WaveformPeak[] {
  const total = Math.max(0, endFrame - startFrame);
  const peaks: WaveformPeak[] = new Array(binCount);
  if (total <= 0 || binCount <= 0) {
    for (let i = 0; i < binCount; i++) peaks[i] = { min: 0, max: 0 };
    return peaks;
  }
  const framesPerBin = total / binCount;
  for (let bin = 0; bin < binCount; bin++) {
    const binStart = startFrame + Math.floor(bin * framesPerBin);
    const binEnd = Math.min(endFrame, startFrame + Math.floor((bin + 1) * framesPerBin));
    let min = 0;
    let max = 0;
    if (binEnd > binStart) {
      min = Infinity;
      max = -Infinity;
      for (let f = binStart; f < binEnd; f++) {
        const v = downmixFrame(buffer, f);
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    peaks[bin] = { min, max };
  }
  return peaks;
}

export function computePeaksForRange(
  buffer: AudioBuffer,
  startSeconds: number,
  endSeconds: number,
  binCount: number,
): WaveformPeak[] {
  const startFrame = Math.max(0, Math.floor(startSeconds * buffer.sampleRate));
  const endFrame = Math.min(buffer.length, Math.ceil(endSeconds * buffer.sampleRate));
  return computePeaksForFrameRange(buffer, startFrame, endFrame, binCount);
}

// §7/§8 — full-track envelope, generated once per source and reused for
// every candidate region overlay in the top waveform overview.
export function generateWaveformEnvelope(
  buffer: AudioBuffer,
  sourceId: string,
  sourceFingerprint: string,
  binCount: number = FULL_TRACK_BIN_COUNT,
): WaveformEnvelope {
  return {
    sourceId,
    sourceFingerprint,
    sampleRate: buffer.sampleRate,
    durationSeconds: buffer.duration,
    binCount,
    peaks: computePeaksForFrameRange(buffer, 0, buffer.length, binCount),
    createdAt: new Date().toISOString(),
    generatorVersion: WAVEFORM_GENERATOR_VERSION,
  };
}
