// Audio feature adapter (0708_MUSIC_AudioFeatureExtractionToMoodAnalyzer_v1.0.0)
// Normalizes existing TrackRecord metadata into AudioFeatureVector for MoodAnalyzer.
// Uses real fields where they exist; documented fallbacks with warnings where they don't.

import type { Track } from "../data/trackTypes";
import type { AudioFeatureVector } from "./MoodAnalyzer";

export type FeatureSources = Partial<Record<keyof AudioFeatureVector, string>>;

export interface AdapterResult {
  features: AudioFeatureVector | null;
  warnings: string[];
  confidence: number;           // 0–1: how many features came from real data vs fallback
  missingCount: number;
  featureSources: FeatureSources;
}

// ── BPM / onset density → bpmDensity ─────────────────────────────────────────
// Priority: track.density → audioAnalysis.onsetDensity → track.bpm (normalized)
// BPM formula: clamp((bpm - 60) / 120, 0, 1)
// 60→0.00  90→0.25  120→0.50  150→0.75  180→1.00

function normalizeBpmDensity(track: Track): { value: number | null; source: string | null } {
  if (track.density != null && track.density > 0)
    return { value: Math.max(0, Math.min(1, track.density)), source: "track.density" };
  const aa = track.audioAnalysis;
  if (aa?.onsetDensity != null && aa.onsetDensity > 0)
    return { value: Math.max(0, Math.min(1, aa.onsetDensity)), source: "audioAnalysis.onsetDensity" };
  const bpm = track.bpm ?? aa?.actualBpm;
  if (!bpm || bpm <= 0) return { value: null, source: null };
  return { value: Math.max(0, Math.min(1, (bpm - 60) / 120)), source: "track.bpm" };
}

// ── energy → rmsEnergy ───────────────────────────────────────────────────────
// Priority: audioAnalysis.rmsEnergy → audioAnalysis.rmsMean → track.energy → loudness

function normalizeRmsEnergy(track: Track): { value: number | null; source: string | null } {
  const aa = track.audioAnalysis;
  if (aa?.rmsEnergy != null && aa.rmsEnergy >= 0) return { value: Math.max(0, Math.min(1, aa.rmsEnergy)), source: "audioAnalysis.rmsEnergy" };
  if (aa?.rmsMean  != null && aa.rmsMean  >= 0) return { value: Math.max(0, Math.min(1, aa.rmsMean)), source: "audioAnalysis.rmsMean" };
  if (track.energy != null && track.energy > 0)  return { value: Math.max(0, Math.min(1, track.energy)), source: "track.energy" };
  if (aa?.loudness != null) return { value: Math.max(0, Math.min(1, (aa.loudness + 60) / 60)), source: "audioAnalysis.loudness" };
  return { value: null, source: null };
}

// ── spectral centroid → brightness ───────────────────────────────────────────
// Priority: audioAnalysis.brightness (DSP) → audioAnalysis.spectralCentroidNorm → track.brightness
//           → audioAnalysis.spectralCentroid (Hz) → metadata hint → neutral

function normalizeBrightness(track: Track, warnings: string[]): { value: number; isFallback: boolean; source: string } {
  const aa = track.audioAnalysis;
  if (aa?.brightness         != null) return { value: Math.max(0, Math.min(1, aa.brightness)), isFallback: false, source: "audioAnalysis.brightness" };
  if (aa?.spectralCentroidNorm != null) return { value: Math.max(0, Math.min(1, aa.spectralCentroidNorm)), isFallback: false, source: "audioAnalysis.spectralCentroidNorm" };
  if (track.brightness       != null) return { value: Math.max(0, Math.min(1, track.brightness)), isFallback: false, source: "track.brightness" };
  if (aa?.spectralCentroid   != null && aa.spectralCentroid > 0) {
    const v = Math.max(0, Math.min(1, (aa.spectralCentroid - 500) / 5500));
    return { value: v, isFallback: false, source: "audioAnalysis.spectralCentroid" };
  }

  // Genre/title fallback
  const hints = [
    track.genre ?? "",
    ...(track.genres ?? []),
    track.grouping ?? "",
    track.title ?? "",
  ].join(" ").toLowerCase();

  if (/bright|pop|house|disco|joyful|uplifting|euphoric/.test(hints)) {
    warnings.push("brightness inferred from metadata (bright hint)");
    return { value: 0.65, isFallback: true, source: "metadata_hint" };
  }
  if (/dark|noir|doom|somber|minor|grim|shadow/.test(hints)) {
    warnings.push("brightness inferred from metadata (dark hint)");
    return { value: 0.30, isFallback: true, source: "metadata_hint" };
  }
  if (/ambient|dub|minimal|drone|pad/.test(hints)) {
    warnings.push("brightness inferred from metadata (ambient/minimal hint)");
    return { value: 0.38, isFallback: true, source: "metadata_hint" };
  }

  warnings.push("brightness missing; neutral fallback used");
  return { value: 0.50, isFallback: true, source: "neutral" };
}

// ── spectral bandwidth → bandwidth ───────────────────────────────────────────
// Priority: audioAnalysis.spectralBandwidthNorm → spectralBandwidth (Hz)
//           → spectralRolloffNorm → spectralRolloff (Hz) → metadata hint → neutral

function normalizeBandwidth(track: Track, warnings: string[]): { value: number; isFallback: boolean; source: string } {
  const aa = track.audioAnalysis;
  if (aa?.spectralBandwidthNorm != null) return { value: Math.max(0, Math.min(1, aa.spectralBandwidthNorm)), isFallback: false, source: "audioAnalysis.spectralBandwidthNorm" };
  if (aa?.spectralBandwidth     != null && aa.spectralBandwidth > 0) {
    return { value: Math.max(0, Math.min(1, (aa.spectralBandwidth - 500) / 6000)), isFallback: false, source: "audioAnalysis.spectralBandwidth" };
  }
  if (aa?.spectralRolloffNorm   != null) return { value: Math.max(0, Math.min(1, aa.spectralRolloffNorm)), isFallback: false, source: "audioAnalysis.spectralRolloffNorm" };
  if (aa?.spectralRolloff       != null && aa.spectralRolloff > 0) {
    const v = Math.max(0, Math.min(1, (aa.spectralRolloff - 500) / 6000));
    return { value: v, isFallback: false, source: "audioAnalysis.spectralRolloff" };
  }

  const hints = [
    track.genre ?? "",
    ...(track.genres ?? []),
    track.grouping ?? "",
    ...(track.mechanismTags ?? []),
  ].join(" ").toLowerCase();

  if (/ambient|wide|pad|spatial|reverb/.test(hints)) {
    warnings.push("bandwidth inferred from metadata (wide/ambient hint)");
    return { value: 0.65, isFallback: true, source: "metadata_hint" };
  }
  if (/raw|noisy|distorted|glitch|noise|experimental/.test(hints)) {
    warnings.push("bandwidth inferred from metadata (raw/noisy hint)");
    return { value: 0.80, isFallback: true, source: "metadata_hint" };
  }
  if (/minimal|intimate|pure|synthetic/.test(hints)) {
    warnings.push("bandwidth inferred from metadata (minimal hint)");
    return { value: 0.30, isFallback: true, source: "metadata_hint" };
  }

  warnings.push("bandwidth missing; neutral fallback used");
  return { value: 0.50, isFallback: true, source: "neutral" };
}

// ── ZCR → texture ─────────────────────────────────────────────────────────────
// Priority: audioAnalysis.zeroCrossingRate → mechanism/genre hints

function normalizeTexture(track: Track, warnings: string[]): { value: number; isFallback: boolean; source: string } {
  const aa = track.audioAnalysis;
  if (aa?.zeroCrossingRate != null && aa.zeroCrossingRate >= 0) {
    return { value: Math.max(0, Math.min(1, aa.zeroCrossingRate)), isFallback: false, source: "audioAnalysis.zeroCrossingRate" };
  }

  const hints = [
    track.genre ?? "",
    ...(track.genres ?? []),
    ...(track.mechanismTags ?? []),
    track.title ?? "",
  ].join(" ").toLowerCase();

  if (/raw|glitch|noise|experimental|distort|static|granular/.test(hints)) {
    warnings.push("texture inferred from metadata (rough hint)");
    return { value: 0.70, isFallback: true, source: "metadata_hint" };
  }
  if (/calm|ambient|weightless|smooth|peaceful|drone|pad/.test(hints)) {
    warnings.push("texture inferred from metadata (smooth hint)");
    return { value: 0.18, isFallback: true, source: "metadata_hint" };
  }

  warnings.push("texture missing; neutral fallback used");
  return { value: 0.50, isFallback: true, source: "neutral" };
}

// ── key/mode → valence ────────────────────────────────────────────────────────
// Priority: direct valence field → key/mode → existing moodTags hint → neutral

function normalizeValence(track: Track, warnings: string[]): { value: number; isFallback: boolean; source: string } {
  const aa = track.audioAnalysis;

  const key = (track.musicalKey ?? track.key ?? aa?.actualKey ?? "").toLowerCase();
  if (key) {
    if (/major|\bmaj\b/.test(key)) return { value: 0.70, isFallback: false, source: "track.musicalKey" };
    if (/minor|\bmin\b/.test(key)) return { value: 0.35, isFallback: false, source: "track.musicalKey" };
  }

  const camelot = (track.camelotKey ?? "").toUpperCase();
  if (camelot.endsWith("B")) return { value: 0.70, isFallback: false, source: "track.camelotKey" };
  if (camelot.endsWith("A")) return { value: 0.35, isFallback: false, source: "track.camelotKey" };

  // Fallback from existing mood tags — only as a rough signal, with warning
  const moods = (track.moodTags ?? []).join(" ").toLowerCase();
  if (/joyful|uplifting|hopeful|playful|peaceful|calm|warm|bright/.test(moods)) {
    warnings.push("valence inferred from existing mood metadata");
    return { value: 0.70, isFallback: true, source: "moodTags_hint" };
  }
  if (/dark|somber|melanchol|menacing|aggressive|tense|haunting/.test(moods)) {
    warnings.push("valence inferred from existing mood metadata");
    return { value: 0.30, isFallback: true, source: "moodTags_hint" };
  }

  warnings.push("valence missing; neutral fallback used");
  return { value: 0.50, isFallback: true, source: "neutral" };
}

// ── Main adapter ──────────────────────────────────────────────────────────────

export function trackToAudioFeatures(track: Track): AdapterResult {
  const warnings: string[] = [];

  const { value: bpmDensity, source: bpmSrc }              = normalizeBpmDensity(track);
  const { value: rmsEnergy,  source: rmsSrc }              = normalizeRmsEnergy(track);
  const { value: brightness, isFallback: bFallback,  source: brtSrc }  = normalizeBrightness(track, warnings);
  const { value: bandwidth,  isFallback: bwFallback, source: bwSrc }   = normalizeBandwidth(track, warnings);
  const { value: texture,    isFallback: tFallback,  source: texSrc }  = normalizeTexture(track, warnings);
  const { value: valence,    isFallback: vFallback,  source: valSrc }  = normalizeValence(track, warnings);

  if (bpmDensity == null) warnings.push("bpmDensity missing; track has no usable BPM");
  if (rmsEnergy == null)  warnings.push("rmsEnergy missing; track has no usable energy/rms/loudness");

  const missingCount = [
    bpmDensity == null,
    rmsEnergy == null,
    bFallback,
    bwFallback,
    tFallback,
    vFallback,
  ].filter(Boolean).length;

  const confidence = Math.max(0, 1 - missingCount / 6);

  const featureSources: FeatureSources = {
    ...(bpmSrc != null && { bpmDensity: bpmSrc }),
    ...(rmsSrc  != null && { rmsEnergy:  rmsSrc }),
    brightness: brtSrc,
    bandwidth:  bwSrc,
    texture:    texSrc,
    valence:    valSrc,
  };

  if (bpmDensity == null && rmsEnergy == null) {
    return { features: null, warnings, confidence: 0, missingCount, featureSources };
  }

  const features: AudioFeatureVector = {
    bpmDensity: bpmDensity ?? 0.50,
    rmsEnergy:  rmsEnergy  ?? 0.50,
    brightness,
    bandwidth,
    texture,
    valence,
  };

  if (bpmDensity == null) warnings.push("bpmDensity defaulted to 0.50 neutral");
  if (rmsEnergy  == null) warnings.push("rmsEnergy defaulted to 0.50 neutral");

  return { features, warnings, confidence, missingCount, featureSources };
}

// ── Field audit helper ────────────────────────────────────────────────────────

export function auditTrackAnalysisFields(tracks: Track[]) {
  const fields = [
    "bpm", "energy", "brightness", "density",
    "musicalKey", "key", "camelotKey",
    "audioAnalysis.rmsMean", "audioAnalysis.rmsEnergy", "audioAnalysis.loudness",
    "audioAnalysis.brightness", "audioAnalysis.spectralCentroid",
    "audioAnalysis.spectralRolloff", "audioAnalysis.zeroCrossingRate",
    "mechanismTags", "moodTags", "moodSuggestions", "analysisStatus",
  ] as const;

  const counts: Record<string, number> = {};
  for (const f of fields) counts[f] = 0;

  for (const t of tracks) {
    if (t.bpm) counts["bpm"]++;
    if (t.energy) counts["energy"]++;
    if (t.brightness != null) counts["brightness"]++;
    if (t.density != null) counts["density"]++;
    if (t.musicalKey) counts["musicalKey"]++;
    if (t.key) counts["key"]++;
    if (t.camelotKey) counts["camelotKey"]++;
    if (t.audioAnalysis?.rmsMean  != null) counts["audioAnalysis.rmsMean"]++;
    if (t.audioAnalysis?.rmsEnergy != null) counts["audioAnalysis.rmsEnergy"]++;
    if (t.audioAnalysis?.loudness  != null) counts["audioAnalysis.loudness"]++;
    if (t.audioAnalysis?.brightness != null) counts["audioAnalysis.brightness"]++;
    if (t.audioAnalysis?.spectralCentroid != null) counts["audioAnalysis.spectralCentroid"]++;
    if (t.audioAnalysis?.spectralRolloff != null) counts["audioAnalysis.spectralRolloff"]++;
    if (t.audioAnalysis?.zeroCrossingRate != null) counts["audioAnalysis.zeroCrossingRate"]++;
    if (t.mechanismTags?.length) counts["mechanismTags"]++;
    if (t.moodTags?.length) counts["moodTags"]++;
    if (t.moodSuggestions?.length) counts["moodSuggestions"]++;
    if (t.analysisStatus) counts["analysisStatus"]++;
  }

  const pct = (n: number) => `${n} / ${tracks.length} (${tracks.length > 0 ? Math.round(n / tracks.length * 100) : 0}%)`;
  const report: Record<string, string> = {};
  for (const [k, v] of Object.entries(counts)) report[k] = pct(v);
  console.table(report);
  return counts;
}
