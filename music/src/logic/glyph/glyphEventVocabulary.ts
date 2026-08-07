// Glyph Notes — Event Vocabulary classification
// (docs/glyph-audio/0804_GLYPH_NOTES_Event_Vocabulary_Laser_Layer_Spec_v0.1.0.md §6-8).
//
// Nothing in the existing drum layer (drumEventDetection.ts) computes
// spectral data — it is strictly single-band, time-domain (one high-pass
// filter -> frame RMS -> flux -> peak picking). This module is a NEW,
// separate post-hoc feature-extraction pass over each already-detected
// DrumEvent's own timestamp, reusing the shared FFT (../fft.ts,
// magnitudeSpectrum) that dspFeatureExtraction.ts's computeFrameFeatures
// already established the exact pattern for (spectral centroid/rolloff/
// bandwidth/a bass-band energy ratio, all via the same magnitude spectrum)
// — extended here to three bands, spectral flatness, and two time-domain
// onset measurements. detectDrumEvents itself is never modified or
// re-run; this module only reads the audio and the events it already
// produced.
//
// Per the pre-implementation review's provenance correction: this module
// NEVER writes a definitive label back into DrumEvent.classification.
// glyphDrumLayerTypes.ts and drumEventDetection.ts are untouched. Every
// GlyphAudibleEvent instead carries its own sourceDrumEventId, tracing
// back to exactly which raw onset produced it.
//
// Classification stays an explicit heuristic (§8) — thresholds below are
// not calibrated against any labeled clap dataset (none exists in this
// repo); a track's own low-confidence candidates correctly fall back to
// plain "drum" rather than a forced ring symbol.

import { magnitudeSpectrum } from "../fft";
import type { DrumEvent, MonoAudioInput } from "../../data/glyphDrumLayerTypes";
import type {
  GlyphAudibleEvent, GlyphAudibleEventFeatures, GlyphEventClassificationResult,
  GlyphEventVocabularyResult, GlyphEventVocabularyWarning,
} from "../../data/glyphEventVocabularyTypes";

export const EVENT_VOCABULARY_ANALYZER_VERSION = "glyph-event-vocabulary-v1";
// Bumped whenever the classification thresholds below change — participates
// in the cache key (glyphCacheKey.ts §16 eventClassificationThresholds) so
// a future threshold tune correctly invalidates old cached/exported output.
export const EVENT_CLASSIFICATION_THRESHOLD_VERSION = "clap-thresholds-v1";

// Band cutoffs (Hz) for the low/mid/high energy split — claps/snares read
// mid/high-dominant with a broadband (spectrally flat), sharp, fast-decay
// attack; kicks read low-dominant with a narrower, more tonal spectrum.
const LOW_MID_CUTOFF_HZ = 250;
const MID_HIGH_CUTOFF_HZ = 2000;

// 2048 samples ~= 46ms at 44.1kHz, close to the spec's own "short window"
// framing, and a power of 2 (required by the shared radix-2 FFT).
const FFT_SIZE = 2048;
const DECAY_MAX_SECONDS = 0.3;
const DECAY_THRESHOLD_RATIO = 0.2; // envelope must fall to 20% of its onset-frame peak

const CLAP_CONFIDENCE_THRESHOLD = 0.55;
const ACCENT_STRENGTH_THRESHOLD = 0.8;
const LIGHT_TRANSIENT_STRENGTH_THRESHOLD = 0.3;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function rms(mono: Float32Array, start: number, end: number): number {
  if (end <= start) return 0;
  let sum = 0;
  for (let i = start; i < end; i++) sum += mono[i] * mono[i];
  return Math.sqrt(sum / (end - start));
}

function computeBandEnergies(mags: Float32Array, binHz: number): { low: number; mid: number; high: number } {
  let low = 0, mid = 0, high = 0, total = 0;
  for (let k = 0; k < mags.length; k++) {
    const freq = k * binHz;
    total += mags[k];
    if (freq < LOW_MID_CUTOFF_HZ) low += mags[k];
    else if (freq < MID_HIGH_CUTOFF_HZ) mid += mags[k];
    else high += mags[k];
  }
  if (total <= 0) return { low: 0, mid: 0, high: 0 };
  return { low: low / total, mid: mid / total, high: high / total };
}

// Wiener entropy (geometric mean / arithmetic mean of the magnitude
// spectrum) — near 0 for tonal content, near 1 for noise-like/broadband
// content. A standard, cheap spectral-flatness proxy.
function computeSpectralFlatness(mags: Float32Array): number {
  let logSum = 0, sum = 0, count = 0;
  for (let k = 0; k < mags.length; k++) {
    const m = mags[k];
    if (m > 1e-9) { logSum += Math.log(m); count++; }
    sum += m;
  }
  if (count === 0 || sum <= 0) return 0;
  const geometricMean = Math.exp(logSum / count);
  const arithmeticMean = sum / mags.length;
  if (arithmeticMean <= 0) return 0;
  return clamp01(geometricMean / arithmeticMean);
}

// Attack-slope proxy: RMS growth from just-before to just-after the onset
// sample, normalized so a typical sharp percussive rise saturates near 1.
function computeTransientSharpness(mono: Float32Array, sampleRate: number, onsetSample: number): number {
  const halfWindow = Math.round(sampleRate * 0.01); // ~10ms each side
  const preStart = Math.max(0, onsetSample - halfWindow);
  const postEnd = Math.min(mono.length, onsetSample + halfWindow);
  const preRms = rms(mono, preStart, onsetSample);
  const postRms = rms(mono, onsetSample, postEnd);
  return clamp01((postRms - preRms) * 6);
}

// Post-onset decay time: walks ~5ms envelope frames forward from the
// onset until RMS falls to DECAY_THRESHOLD_RATIO of the onset frame's own
// peak, capped at DECAY_MAX_SECONDS.
function computeDecaySeconds(mono: Float32Array, sampleRate: number, onsetSample: number): number {
  const frameSize = Math.max(32, Math.round(sampleRate * 0.005));
  const maxSamples = Math.min(mono.length - onsetSample, Math.round(sampleRate * DECAY_MAX_SECONDS));
  if (maxSamples <= frameSize) return 0;
  const peak = rms(mono, onsetSample, Math.min(mono.length, onsetSample + frameSize));
  if (peak <= 0) return 0;
  const threshold = peak * DECAY_THRESHOLD_RATIO;
  for (let offset = frameSize; offset < maxSamples; offset += frameSize) {
    const frameEnd = Math.min(mono.length, onsetSample + offset + frameSize);
    const level = rms(mono, onsetSample + offset, frameEnd);
    if (level <= threshold) return offset / sampleRate;
  }
  return maxSamples / sampleRate;
}

export function computeEventFeatures(mono: Float32Array, sampleRate: number, timeSeconds: number): GlyphAudibleEventFeatures {
  const onsetSample = Math.round(timeSeconds * sampleRate);
  if (onsetSample < 0 || onsetSample >= mono.length || !(sampleRate > 0)) {
    return {};
  }
  const frameStart = Math.max(0, onsetSample - Math.round(FFT_SIZE / 4));
  const frame = mono.subarray(frameStart, Math.min(mono.length, frameStart + FFT_SIZE));
  const mags = magnitudeSpectrum(frame, FFT_SIZE);
  const binHz = sampleRate / FFT_SIZE;
  const bands = computeBandEnergies(mags, binHz);
  const flatness = computeSpectralFlatness(mags);
  const sharpness = computeTransientSharpness(mono, sampleRate, onsetSample);
  const decay = computeDecaySeconds(mono, sampleRate, onsetSample);
  return {
    lowBandEnergy: +bands.low.toFixed(4),
    midBandEnergy: +bands.mid.toFixed(4),
    highBandEnergy: +bands.high.toFixed(4),
    transientSharpness: +sharpness.toFixed(4),
    spectralFlatness: +flatness.toFixed(4),
    decaySeconds: +decay.toFixed(4),
  };
}

export function classifyEvent(features: GlyphAudibleEventFeatures, strength: number): GlyphEventClassificationResult {
  if (!Number.isFinite(strength)) {
    return { family: "unknown", confidence: 0, reasons: ["invalid strength value"] };
  }

  const { lowBandEnergy, midBandEnergy, highBandEnergy, spectralFlatness, transientSharpness, decaySeconds } = features;
  if (lowBandEnergy == null || midBandEnergy == null || highBandEnergy == null || spectralFlatness == null || transientSharpness == null) {
    const reasons = ["insufficient feature data"];
    return strength >= LIGHT_TRANSIENT_STRENGTH_THRESHOLD
      ? { family: "drum", confidence: 0.3, reasons }
      : { family: "lightTransient", confidence: 0.3, reasons };
  }

  const reasons: string[] = [];
  let clapScore = 0;
  if (midBandEnergy + highBandEnergy > lowBandEnergy) { clapScore += 0.3; reasons.push("mid/high-dominant spectrum"); }
  if (spectralFlatness > 0.35) { clapScore += 0.3; reasons.push("broadband/noise-like spectrum"); }
  if (transientSharpness > 0.5) { clapScore += 0.2; reasons.push("sharp attack"); }
  if ((decaySeconds ?? 1) < 0.15) { clapScore += 0.2; reasons.push("fast decay"); }

  if (clapScore >= CLAP_CONFIDENCE_THRESHOLD) {
    const family = strength >= ACCENT_STRENGTH_THRESHOLD ? "accent" : "clap";
    return { family, confidence: Math.min(1, clapScore), reasons };
  }

  // Not confidently clap-like — fall back to drum/light-transient rather
  // than forcing a ring symbol (§8).
  reasons.push("clap confidence below threshold — falling back to drum");
  if (strength >= ACCENT_STRENGTH_THRESHOLD) {
    return { family: "accent", confidence: 0.6, reasons: [...reasons, "high strength"] };
  }
  if (strength < LIGHT_TRANSIENT_STRENGTH_THRESHOLD) {
    return { family: "lightTransient", confidence: 0.5, reasons: [...reasons, "low strength"] };
  }
  return { family: "drum", confidence: 0.5, reasons };
}

export function buildAudibleEvents(
  drumEvents: DrumEvent[],
  audio: MonoAudioInput,
  sourceTrackId: string,
  analyzedAt: string,
): GlyphEventVocabularyResult {
  const warnings: GlyphEventVocabularyWarning[] = [];

  if (audio.mono.length === 0 || !(audio.sampleRate > 0)) {
    warnings.push("sourceUnavailable");
    return { sourceTrackId, analyzerVersion: EVENT_VOCABULARY_ANALYZER_VERSION, analyzedAt, events: [], warnings };
  }
  if (drumEvents.length === 0) {
    warnings.push("acceptedCountZero");
    return { sourceTrackId, analyzerVersion: EVENT_VOCABULARY_ANALYZER_VERSION, analyzedAt, events: [], warnings };
  }

  const events: GlyphAudibleEvent[] = drumEvents.map((de) => {
    const features = computeEventFeatures(audio.mono, audio.sampleRate, de.timeSeconds);
    const classification = classifyEvent(features, de.strength);
    return {
      id: `event-${de.id}`,
      timeSeconds: de.timeSeconds,
      durationSeconds: de.durationSeconds,
      family: classification.family,
      strength: de.strength,
      confidence: classification.confidence,
      source: de.source,
      sourceTrackId: de.sourceTrackId,
      sourceStemId: de.sourceStemId,
      nearestPulseId: de.nearestPulseId,
      offsetFromPulseSeconds: de.offsetFromPulseSeconds,
      features,
      sourceDrumEventId: de.id,
      classificationReasons: classification.reasons,
    };
  });

  if (events.every((e) => e.family === "unknown")) warnings.push("allEventsUnclassified");
  if (events.some((e) => e.family === "clap" && e.confidence < CLAP_CONFIDENCE_THRESHOLD + 0.15)) warnings.push("weakClapConfidence");
  const durationSeconds = audio.mono.length / audio.sampleRate;
  if (durationSeconds > 0 && drumEvents.length / durationSeconds > 15) warnings.push("eventCountUnusuallyHigh");

  return { sourceTrackId, analyzerVersion: EVENT_VOCABULARY_ANALYZER_VERSION, analyzedAt, events, warnings };
}
