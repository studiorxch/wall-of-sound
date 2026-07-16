// Playlist Analyzer Review — playlist-level identity aggregation.
// Weighted, not a simple unweighted mood count (spec §12.4): duration,
// opener/closer influence, and peak-energy influence all shift the weight a
// track's mood/feature values contribute to the aggregate.

import type { PlaylistIdentitySummary } from "../../data/playlistAnalyzerTypes";
import type { OrderedPlaylistEntry } from "./resolveOrder";
import { isBpmTrustedForAnalysis } from "../dspFeatureExtraction";

function bucket(value: number, low: string, mid: string, high: string, loT = 0.4, hiT = 0.6): string {
  if (value < loT) return low;
  if (value > hiT) return high;
  return mid;
}

export function computeIdentity(entries: OrderedPlaylistEntry[]): PlaylistIdentitySummary {
  if (entries.length === 0) {
    return { primaryMoods: [], secondaryMoods: [], confidence: 0 };
  }

  const totalDuration = entries.reduce((s, e) => s + (e.track.durationSeconds || 0), 0) || 1;
  const peakIndex = entries.reduce(
    (best, e, i) => ((e.row.energy ?? 0) > (entries[best].row.energy ?? -1) ? i : best),
    0,
  );

  const moodWeight = new Map<string, number>();
  let weightedValence = 0, weightedBrightness = 0, weightedTexture = 0, weightedBandwidth = 0, weightedBpmDensity = 0;
  let featureWeightSum = 0;
  let featuredEntryCount = 0;

  const energyValues: number[] = [];
  const bpmValues: number[] = [];

  entries.forEach((e, i) => {
    const durationWeight = (e.track.durationSeconds || 0) / totalDuration;
    const positionBoost = (i === 0 || i === entries.length - 1) ? 1.5 : i === peakIndex ? 1.3 : 1.0;
    const w = durationWeight * positionBoost;

    for (const mood of e.row.moodTags.slice(0, 3)) {
      moodWeight.set(mood, (moodWeight.get(mood) ?? 0) + w);
    }

    if (e.row.features) {
      featuredEntryCount++;
      weightedValence += e.row.features.valence * w;
      weightedBrightness += e.row.features.brightness * w;
      weightedTexture += e.row.features.texture * w;
      weightedBandwidth += e.row.features.bandwidth * w;
      weightedBpmDensity += e.row.features.bpmDensity * w;
      featureWeightSum += w;
    }

    if (e.row.energy != null && e.row.energy > 0) energyValues.push(e.row.energy);
    if (isBpmTrustedForAnalysis(e.track)) bpmValues.push(e.track.bpm as number);
  });

  const rankedMoods = [...moodWeight.entries()].sort((a, b) => b[1] - a[1]).map(([m]) => m);
  const primaryMoods = rankedMoods.slice(0, 3);
  const secondaryMoods = rankedMoods.slice(3, 6);

  const hasFeatures = featureWeightSum > 0;
  const avgValence = hasFeatures ? weightedValence / featureWeightSum : undefined;
  const avgBrightness = hasFeatures ? weightedBrightness / featureWeightSum : undefined;
  const avgTexture = hasFeatures ? weightedTexture / featureWeightSum : undefined;
  const avgBandwidth = hasFeatures ? weightedBandwidth / featureWeightSum : undefined;
  const avgBpmDensity = hasFeatures ? weightedBpmDensity / featureWeightSum : undefined;

  const energyRange: [number, number] | undefined = energyValues.length
    ? [Math.min(...energyValues), Math.max(...energyValues)]
    : undefined;
  const bpmRange: [number, number] | undefined = bpmValues.length
    ? [Math.min(...bpmValues), Math.max(...bpmValues)]
    : undefined;

  // Movement / contrast from the energy trajectory in actual playlist order.
  let movement: string | undefined;
  let contrast: string | undefined;
  if (energyValues.length >= 2) {
    let totalDelta = 0;
    for (let i = 1; i < energyValues.length; i++) totalDelta += Math.abs(energyValues[i] - energyValues[i - 1]);
    const avgDelta = totalDelta / (energyValues.length - 1);
    movement = bucket(avgDelta, "static, held steady", "gradual drift", "dynamic, actively moving", 0.06, 0.15);
    const mean = energyValues.reduce((a, b) => a + b, 0) / energyValues.length;
    const variance = energyValues.reduce((s, v) => s + (v - mean) ** 2, 0) / energyValues.length;
    contrast = bucket(Math.sqrt(variance), "low contrast, tonally consistent", "moderate contrast", "high contrast, wide swings", 0.08, 0.18);
  }

  // Resolution: does the closer land lower than the peak, or hold near it?
  let resolution: string | undefined;
  if (energyValues.length >= 2) {
    const peakEnergy = Math.max(...energyValues);
    const closerEnergy = energyValues[energyValues.length - 1];
    resolution = peakEnergy > 0 && closerEnergy / peakEnergy < 0.7 ? "resolved" : "unresolved";
  }

  const emotionalTemperature: "warm" | "cool" | "neutral" | undefined = avgValence != null
    ? (avgValence > 0.6 ? "warm" : avgValence < 0.4 ? "cool" : "neutral")
    : undefined;

  const brightness = avgBrightness != null ? bucket(avgBrightness, "dark", "balanced", "bright") : undefined;
  const texture = avgTexture != null ? bucket(avgTexture, "smooth, soft transients", "balanced texture", "rough, dense transients") : undefined;
  const density = avgBandwidth != null ? bucket(avgBandwidth, "sparse", "moderate density", "dense, wide-spectrum") : undefined;
  const rhythmicCharacter = avgBpmDensity != null ? bucket(avgBpmDensity, "slow, drifting pace", "steady mid-tempo pulse", "driving, uptempo pulse") : undefined;
  const tonalCharacter = emotionalTemperature && primaryMoods[0]
    ? `${primaryMoods[0]}, ${emotionalTemperature === "warm" ? "grounded" : emotionalTemperature === "cool" ? "distant" : "balanced"}`
    : primaryMoods[0];

  // Confidence: coverage-weighted — how much of the playlist actually had
  // real features to aggregate, not just whether *a* result exists.
  const confidence = +(featuredEntryCount / entries.length).toFixed(3);

  return {
    primaryMoods,
    secondaryMoods,
    emotionalTemperature,
    energyRange,
    bpmRange,
    tonalCharacter,
    rhythmicCharacter,
    texture,
    brightness,
    density,
    movement,
    contrast,
    resolution,
    confidence,
  };
}
