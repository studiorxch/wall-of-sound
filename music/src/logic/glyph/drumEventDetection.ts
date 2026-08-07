// Glyph Notes — drum onset detection
// (docs/glyph-audio/0804_GLYPH_NOTES_Full_Canvas_Pulse_Truth_Drum_Layer_Spec_v0.1.0.md §16).
// A real, deterministic, dependency-free onset detector following the
// spec's own suggested stages: mono mixdown (already mono) -> high-pass
// emphasis -> frame energy -> energy flux -> adaptive local threshold ->
// local peak picking -> minimum spacing -> normalized strength. No FFT
// library, no external package — every stage is plain arithmetic over the
// sample array.
//
// This function analyzes whatever MonoAudioInput it is given, regardless of
// `source` — source PRIORITY (tier 1 registered_existing drum stem, tier 2
// demucs-separated drum stem, tier 3 full-mix fallback) is decided by
// `selectDrumAudioSource` below and wired end-to-end in GlyphWorkspace.tsx's
// `selectDrumAudioSourceForTrack`, which reads the existing stem archive
// (read-only, via fetchStemSets) and decodes tier 1/2 audio through the
// existing stemLooperSource.ts adapter — no changes to the stem system
// itself. In practice this resolves to tier 1/2 only when the track already
// has a "current"-lifecycle stem set with a drums stem; otherwise it falls
// back to tier 3 full-mix, same as before.

import type { DetectDrumEventsInput, DrumEvent, DrumLayerResult, DrumLayerWarning } from "../../data/glyphDrumLayerTypes";

export const DRUM_LAYER_ANALYZER_VERSION = "glyph-drum-detector-v1";

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// One-pole high-pass filter — emphasizes transients (kicks/snares/hats)
// over sustained low-frequency content (bass, pad drones) without needing
// an FFT.
function highPassEmphasize(samples: Float32Array, sampleRate: number, cutoffHz = 150): Float32Array {
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const dt = 1 / sampleRate;
  const alpha = rc / (rc + dt);
  const out = new Float32Array(samples.length);
  for (let i = 1; i < samples.length; i++) {
    out[i] = alpha * (out[i - 1] + samples[i] - samples[i - 1]);
  }
  return out;
}

function computeFrameEnergies(samples: Float32Array, frameSize: number, hopSize: number): number[] {
  const energies: number[] = [];
  for (let start = 0; start + frameSize <= samples.length; start += hopSize) {
    let sum = 0;
    for (let i = 0; i < frameSize; i++) {
      const s = samples[start + i];
      sum += s * s;
    }
    energies.push(Math.sqrt(sum / frameSize));
  }
  return energies;
}

export function detectDrumEvents(input: DetectDrumEventsInput): DrumLayerResult {
  const sensitivity = clamp01(input.sensitivity ?? 0.5);
  const minIntervalSeconds = Math.max(0.02, input.minIntervalSeconds ?? 0.08);
  const strengthFloor = clamp01(input.strengthFloor ?? 0.15);
  const { mono, sampleRate } = input.audio;
  const warnings: DrumLayerWarning[] = [];

  const base = {
    source: input.source, sourceTrackId: input.sourceTrackId, sourceStemId: input.sourceStemId,
    analyzedAt: input.analyzedAt, analyzerVersion: DRUM_LAYER_ANALYZER_VERSION,
  };

  if (mono.length === 0 || !(sampleRate > 0)) {
    return { ...base, eventCount: 0, events: [], warnings: ["onsetDetectionZeroEvents"] };
  }

  const emphasized = highPassEmphasize(mono, sampleRate);
  const frameSize = Math.max(64, Math.round(sampleRate * 0.02)); // ~20ms
  const hopSize = Math.max(32, Math.round(frameSize / 2));
  const energies = computeFrameEnergies(emphasized, frameSize, hopSize);
  const frameSeconds = hopSize / sampleRate;

  const flux = energies.map((e, i) => (i === 0 ? 0 : Math.max(0, e - energies[i - 1])));

  const windowFrames = Math.max(4, Math.round(0.4 / frameSeconds));
  // Higher sensitivity -> lower multiplier -> more events accepted.
  const thresholdMultiplier = 1.4 - sensitivity * 0.8;
  const minIntervalFrames = Math.max(1, Math.round(minIntervalSeconds / frameSeconds));

  const candidates: Array<{ frame: number; strength: number }> = [];
  for (let i = 1; i < flux.length - 1; i++) {
    const windowStart = Math.max(0, i - windowFrames);
    const windowEnd = Math.min(flux.length, i + windowFrames);
    let localSum = 0;
    for (let j = windowStart; j < windowEnd; j++) localSum += flux[j];
    const localMean = localSum / Math.max(1, windowEnd - windowStart);
    const isLocalPeak = flux[i] >= flux[i - 1] && flux[i] >= flux[i + 1];
    if (isLocalPeak && flux[i] > 0 && flux[i] > localMean * thresholdMultiplier) {
      candidates.push({ frame: i, strength: flux[i] });
    }
  }

  // Minimum spacing (§16) — greedy, strongest-first: a weaker candidate
  // inside another accepted candidate's exclusion window is dropped.
  candidates.sort((a, b) => b.strength - a.strength);
  const acceptedFrames: number[] = [];
  for (const c of candidates) {
    if (acceptedFrames.every((f) => Math.abs(f - c.frame) >= minIntervalFrames)) {
      acceptedFrames.push(c.frame);
    }
  }
  acceptedFrames.sort((a, b) => a - b);

  const maxFlux = acceptedFrames.reduce((max, f) => Math.max(max, flux[f]), 0);
  const events: DrumEvent[] = [];
  acceptedFrames.forEach((f) => {
    if (maxFlux <= 0) return;
    const normalizedStrength = flux[f] / maxFlux;
    if (normalizedStrength < strengthFloor) return;
    events.push({
      id: `drum-${input.sourceTrackId}-${events.length}`,
      timeSeconds: f * frameSeconds,
      strength: normalizedStrength,
      confidence: Math.min(1, normalizedStrength + 0.2),
      source: input.source,
      sourceTrackId: input.sourceTrackId,
      sourceStemId: input.sourceStemId,
      classification: "unknown",
    });
  });

  if (events.length === 0) warnings.push("onsetDetectionZeroEvents");
  const durationSeconds = mono.length / sampleRate;
  if (durationSeconds > 0 && events.length / durationSeconds > 15) warnings.push("onsetDensityUnusuallyHigh");
  if (input.source === "fullMix") warnings.push("fullMixFallbackActive");

  return { ...base, eventCount: events.length, events, warnings };
}

// §14.2/§14.3 — source-priority selection. Genuinely prefers an existing
// drum stem (tier 1) or a separated one (tier 2) whenever the caller can
// actually supply that audio; falls back to full-mix (tier 3) otherwise.
// The decode path for tiers 1/2 is not wired in this build (Foundation
// scope, §14.4) — GlyphWorkspace.tsx never supplies decodeStemAudio today,
// so this always resolves to fullMix in practice, but the selection logic
// itself is real and will pick up a real decoder the moment one exists,
// with no change needed here.
export async function selectDrumAudioSource(options: {
  hasDrumStem: boolean;
  hasSeparatedDrumStem?: boolean;
  decodeDrumStemAudio?: () => Promise<{ mono: Float32Array; sampleRate: number }>;
  decodeSeparatedDrumStemAudio?: () => Promise<{ mono: Float32Array; sampleRate: number }>;
  decodeFullMixAudio: () => Promise<{ mono: Float32Array; sampleRate: number }>;
}): Promise<{ source: "drumStem" | "separatedDrumStem" | "fullMix"; audio: { mono: Float32Array; sampleRate: number } }> {
  if (options.hasDrumStem && options.decodeDrumStemAudio) {
    return { source: "drumStem", audio: await options.decodeDrumStemAudio() };
  }
  if (options.hasSeparatedDrumStem && options.decodeSeparatedDrumStemAudio) {
    return { source: "separatedDrumStem", audio: await options.decodeSeparatedDrumStemAudio() };
  }
  return { source: "fullMix", audio: await options.decodeFullMixAudio() };
}
