import type { Track, TrackAudioAnalysis } from "../data/trackTypes";

// Thresholds are heuristic — chosen to give 1-4 labels across typical analyzer output ranges.
function norm(val: number | undefined, lo: number, hi: number): number | undefined {
  if (val == null) return undefined;
  return Math.max(0, Math.min(1, (val - lo) / (hi - lo)));
}

export function suggestMoodsFromAnalysis(track: Track): string[] {
  const a: TrackAudioAnalysis = track.audioAnalysis ?? {};
  const suggestions = new Set<string>();

  const energy = norm(a.energyScore, 0, 1);
  const brightness = norm(a.brightness, 0, 1);
  const density = norm(a.density, 0, 1);
  const dynamic = norm(a.dynamicRange, 0, 60);
  const onset = norm(a.onsetDensity, 0, 20);
  const transient = norm(a.transientDensity, 0, 20);
  const tempo = a.tempoFamily?.toLowerCase();

  // Tempo family overrides
  if (tempo === "fast" || tempo === "very fast") suggestions.add("Energetic");
  if (tempo === "slow" || tempo === "very slow") suggestions.add("Calm");

  // High-energy combos
  if (energy != null && energy > 0.7 && density != null && density > 0.6) {
    suggestions.add("Intense");
    if (brightness != null && brightness > 0.6) suggestions.add("Restless");
  }

  // Low-energy combos
  if (energy != null && energy < 0.3 && density != null && density < 0.4) {
    suggestions.add("Quiet");
    if (brightness != null && brightness < 0.4) suggestions.add("Still");
  }

  // Dreamy: medium energy + high brightness + low density
  if (
    energy != null && energy >= 0.3 && energy <= 0.65 &&
    brightness != null && brightness > 0.6 &&
    density != null && density < 0.4
  ) {
    suggestions.add("Dreamy");
    suggestions.add("Ethereal");
  }

  // Percussive / mechanical
  if ((onset != null && onset > 0.6) || (transient != null && transient > 0.6)) {
    suggestions.add("Restless");
    if (density != null && density > 0.5) suggestions.add("Mechanical");
  }

  // Hypnotic: low dynamic range + high density
  if (dynamic != null && dynamic < 0.35 && density != null && density > 0.6) {
    suggestions.add("Hypnotic");
    suggestions.add("Mechanical");
  }

  // Spectral brightness
  const spectral = norm(a.spectralCentroid, 500, 8000);
  if (spectral != null && spectral > 0.7) {
    suggestions.add("Radiant");
  }

  // Brightness chip
  if (brightness != null && brightness > 0.7 && !suggestions.has("Dreamy")) {
    suggestions.add("Bright");
  }

  // Dark
  if (brightness != null && brightness < 0.3) {
    suggestions.add("Dark");
    if (density != null && density > 0.45) suggestions.add("Haunting");
  }

  // Subdued
  if (energy != null && energy < 0.25 && brightness != null && brightness < 0.4) {
    suggestions.add("Subdued");
  }

  // Cap at 4 labels; deterministic order = insertion order (Set preserves it in V8)
  return [...suggestions].slice(0, 4);
}
