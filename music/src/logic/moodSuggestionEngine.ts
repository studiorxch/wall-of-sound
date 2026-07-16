// Mood suggestion engine (0705Q)
// Controlled-vocabulary moods and cluster tags inferred from BPM/energy/crate/filename.
// Works without full audio analysis — complements moodSuggestions.ts.

import type { Track } from "../data/trackTypes";

// ── Controlled vocabularies ───────────────────────────────────────────────────

export const MOOD_VOCAB = [
  "late-night", "warm", "dark", "minimal", "deep", "driving", "ambient",
  "cinematic", "soft", "tense", "playful", "melancholic", "uplifting",
  "hypnotic", "mechanical", "organic",
] as const;

export type MoodVocabWord = typeof MOOD_VOCAB[number];

export const CLUSTER_TAG_VOCAB = [
  "opener-candidate", "closer-candidate", "transition-bed",
  "low-energy-transition", "peak-section", "steady-groove",
  "deep-pulse", "warm-microhouse", "late-night-minimal",
  "broadcast-bed", "field-recording-adjacent", "documentary-motion",
] as const;

export type ClusterTagVocabWord = typeof CLUSTER_TAG_VOCAB[number];

export type MoodSuggestionResult = {
  moods: string[];
  clusterTags: string[];
  reasons: string[];
};

// ── Heuristics ────────────────────────────────────────────────────────────────

function bpmFamily(bpm: number): "slow" | "medium" | "fast" | "unknown" {
  if (!bpm || bpm <= 0) return "unknown";
  if (bpm < 90) return "slow";
  if (bpm <= 125) return "medium";
  return "fast";
}

function energyBand(e: number | null): "low" | "mid" | "high" | "unknown" {
  if (e == null || e === 0) return "unknown";
  if (e < 0.35) return "low";
  if (e <= 0.65) return "mid";
  return "high";
}

function durationBand(s: number): "short" | "medium" | "long" | "unknown" {
  if (!s || s <= 0) return "unknown";
  if (s < 180) return "short";
  if (s <= 420) return "medium";
  return "long";
}

function crateSignals(crateNames: string[]): string[] {
  const combined = crateNames.join(" ").toLowerCase();
  const signals: string[] = [];
  if (combined.includes("microhouse")) signals.push("microhouse");
  if (combined.includes("ambient") || combined.includes("drone")) signals.push("ambient");
  if (combined.includes("dark") || combined.includes("night")) signals.push("dark");
  if (combined.includes("broadcast") || combined.includes("bed")) signals.push("broadcast");
  if (combined.includes("field") || combined.includes("sfx")) signals.push("field");
  if (combined.includes("documentary") || combined.includes("film")) signals.push("documentary");
  return signals;
}

function filenameSignals(filename: string): string[] {
  const f = filename.toLowerCase();
  const signals: string[] = [];
  if (f.includes("night") || f.includes("dark")) signals.push("dark");
  if (f.includes("ambient") || f.includes("drone")) signals.push("ambient");
  if (f.includes("field") || f.includes("rain") || f.includes("wind")) signals.push("field");
  if (f.includes("warm") || f.includes("house") || f.includes("groove")) signals.push("warm");
  return signals;
}

// ── Main engine ───────────────────────────────────────────────────────────────

export function suggestMoodsAndClusters(
  track: Track,
  crateNames: string[] = [],
): MoodSuggestionResult {
  const moods = new Set<string>();
  const clusters = new Set<string>();
  const reasons: string[] = [];

  const bpm = track.bpm ?? 0;
  const energy = track.energy ?? null;
  const dur = track.durationSeconds ?? 0;
  const bf = bpmFamily(bpm);
  const ef = energyBand(energy);
  const df = durationBand(dur);

  // BPM + energy combos
  if (bf === "slow" && ef === "low") {
    moods.add("ambient"); moods.add("soft");
    clusters.add("transition-bed");
    reasons.push("slow BPM + low energy");
  }
  if (bf === "slow" && ef === "mid") {
    moods.add("deep"); moods.add("minimal");
    clusters.add("deep-pulse");
    reasons.push("slow BPM + medium energy");
  }
  if (bf === "medium" && ef === "low") {
    moods.add("minimal"); moods.add("hypnotic");
    clusters.add("late-night-minimal");
    reasons.push("medium BPM + restrained energy");
  }
  if (bf === "medium" && ef === "mid") {
    moods.add("warm"); moods.add("organic");
    clusters.add("steady-groove");
    reasons.push("medium BPM + medium energy");
  }
  if (bf === "medium" && ef === "high") {
    moods.add("driving"); moods.add("uplifting");
    clusters.add("peak-section");
    reasons.push("medium BPM + high energy");
  }
  if (bf === "fast" && ef === "high") {
    moods.add("driving"); moods.add("tense");
    clusters.add("peak-section");
    reasons.push("fast BPM + high energy");
  }

  // Duration signals
  if (df === "long" && ef === "low") {
    clusters.add("broadcast-bed"); clusters.add("transition-bed");
    moods.add("ambient");
    reasons.push("long duration + low energy");
  }

  // Opener / closer heuristics
  if (ef === "low" && df !== "short") {
    clusters.add("opener-candidate");
  }
  if (ef === "low" && df === "long") {
    clusters.add("closer-candidate");
  }

  // Low-energy transition
  if (ef === "low" || (ef === "mid" && bf === "slow")) {
    clusters.add("low-energy-transition");
  }

  // Crate name signals
  const cs = crateSignals(crateNames);
  if (cs.includes("microhouse")) {
    moods.add("minimal"); moods.add("warm");
    clusters.add("warm-microhouse");
    reasons.push("source crate: Microhouse");
  }
  if (cs.includes("ambient")) { moods.add("ambient"); reasons.push("source crate: Ambient"); }
  if (cs.includes("dark")) { moods.add("dark"); moods.add("late-night"); reasons.push("source crate: Dark/Night"); }
  if (cs.includes("broadcast")) { clusters.add("broadcast-bed"); reasons.push("source crate: Broadcast"); }
  if (cs.includes("field")) { clusters.add("field-recording-adjacent"); moods.add("organic"); reasons.push("source crate: Field"); }
  if (cs.includes("documentary")) { clusters.add("documentary-motion"); moods.add("cinematic"); reasons.push("source crate: Documentary"); }

  // Filename signals
  const fn = track.audioFilename ?? track.fileName ?? "";
  const fs = filenameSignals(fn);
  for (const s of fs) {
    if (s === "dark") { moods.add("dark"); moods.add("late-night"); }
    if (s === "ambient") { moods.add("ambient"); }
    if (s === "field") { clusters.add("field-recording-adjacent"); }
    if (s === "warm") { moods.add("warm"); }
  }
  if (fs.length) reasons.push(`filename signals: ${fs.join(", ")}`);

  // Existing audio analysis moods
  if (track.audioAnalysis) {
    const a = track.audioAnalysis;
    if ((a.brightness ?? 0) < 0.3) moods.add("dark");
    if ((a.dynamicRange ?? 99) < 20 && (a.density ?? 0) > 0.6) moods.add("hypnotic");
  }

  // Filter to valid vocab only
  const validMoods = [...moods].filter(m => (MOOD_VOCAB as readonly string[]).includes(m)).slice(0, 4);
  const validClusters = [...clusters].filter(c => (CLUSTER_TAG_VOCAB as readonly string[]).includes(c)).slice(0, 4);

  return {
    moods: validMoods,
    clusterTags: validClusters,
    reasons: [...new Set(reasons)],
  };
}
