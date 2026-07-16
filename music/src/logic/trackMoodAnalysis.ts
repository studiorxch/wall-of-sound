// Track mood analysis pipeline (0708_MUSIC_AudioFeatureExtractionToMoodAnalyzer_v1.0.0 + v1.0.1)
// Connects TrackRecord → audioFeatureAdapter → MoodAnalyzer → moodTags / moodScores

import type { Track } from "../data/trackTypes";
import { assignMoodTags, DEFAULT_WEIGHTS, type MoodScore, type MoodFeatureWeights } from "./MoodAnalyzer";
import { trackToAudioFeatures } from "./audioFeatureAdapter";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TrackMoodAnalysisResult {
  track: Track;
  features: ReturnType<typeof trackToAudioFeatures>["features"];
  rankedScores: MoodScore[];
  warnings: string[];
  confidence: number;
}

export interface BatchMoodAnalysisResult {
  tracks: Track[];
  analyzed: number;
  skipped: number;
  failed: number;
  warnings: string[];
  warningSummary: Record<string, number>;
  warningSamples: string[];
}

// ── Warning categorization ────────────────────────────────────────────────────

const WARNING_PATTERNS: Array<{ key: string; includes: string }> = [
  { key: "energy_missing",     includes: "no usable energy" },
  { key: "brightness_missing", includes: "brightness missing" },
  { key: "bandwidth_missing",  includes: "bandwidth missing" },
  { key: "texture_missing",    includes: "texture missing" },
  { key: "neutral_fallback",   includes: "neutral fallback used" },
  { key: "metadata_inferred",  includes: "inferred from metadata" },
  { key: "valence_inferred",   includes: "valence inferred" },
  { key: "bpm_missing",        includes: "no usable BPM" },
  { key: "analysis_failed",    includes: "failed" },
];

export function summarizeAnalysisWarnings(warnings: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const w of warnings) {
    for (const { key, includes } of WARNING_PATTERNS) {
      if (w.includes(includes)) counts[key] = (counts[key] ?? 0) + 1;
    }
  }
  return counts;
}

// ── Single track ──────────────────────────────────────────────────────────────

function needsAnalysis(track: Track, force = false): boolean {
  if (force) return true;
  const moods = track.moodTags ?? [];
  const scores = track.moodScores;
  if (moods.length >= 3 && scores && Object.keys(scores).length > 0) return false;
  if (track.analysisStatus === "analyzed") return false;
  return true;
}

export function analyzeTrackMood(
  track: Track,
  options?: { force?: boolean; approvedCount?: number; suggestedCount?: number },
): TrackMoodAnalysisResult {
  const { force = false, approvedCount = 3, suggestedCount = 3 } = options ?? {};
  const now = new Date().toISOString();

  if (!needsAnalysis(track, force)) {
    return {
      track,
      features: null,
      rankedScores: [],
      warnings: ["skipped: track already has complete moodTags and moodScores"],
      confidence: 1,
    };
  }

  const { features, warnings, confidence, featureSources } = trackToAudioFeatures(track);

  if (!features) {
    const updated: Track = {
      ...track,
      analysisStatus: "failed",
      analysisErrors: [...(track.analysisErrors ?? []), "insufficient audio features for mood analysis"],
      analysisUpdatedAt: now,
    };
    return { track: updated, features: null, rankedScores: [], warnings, confidence: 0 };
  }

  // Source-aware valence weight: Camelot/key inference is less reliable for electronic music.
  const valenceSrc = featureSources.valence ?? "";
  const valencWeight = valenceSrc === "track.camelotKey" ? 0.85 : DEFAULT_WEIGHTS.valence;
  const weights: MoodFeatureWeights = valencWeight !== DEFAULT_WEIGHTS.valence
    ? { ...DEFAULT_WEIGHTS, valence: valencWeight }
    : DEFAULT_WEIGHTS;

  const { approvedMoods, suggestedMoods, scores } = assignMoodTags(features, { approvedCount, suggestedCount, weights });
  const moodScores: Record<string, number> = {};
  for (const s of scores) moodScores[s.mood] = +s.confidence.toFixed(4);

  const existingMoods = track.moodTags ?? [];
  const finalMoodTags = existingMoods.length >= approvedCount && !force
    ? existingMoods
    : approvedMoods;

  const analysisStatus = confidence >= 0.7
    ? ("analyzed" as const)
    : confidence >= 0.4
    ? ("partial" as const)
    : ("review_needed" as const);

  const updated: Track = {
    ...track,
    moodTags: finalMoodTags,
    moodSuggestions: suggestedMoods,
    moodScores,
    analysisStatus,
    analysisConfidence: +confidence.toFixed(3),
    analysisWarnings: warnings.length > 0 ? warnings : undefined,
    analysisUpdatedAt: now,
    analysisSources: [...new Set([...(track.analysisSources ?? []), "play_analyzer" as const])],
  };

  return { track: updated, features, rankedScores: scores, warnings, confidence };
}

// ── Batch analysis ────────────────────────────────────────────────────────────

export function analyzeAllMissingMoods(
  tracks: Track[],
  options?: { force?: boolean },
): BatchMoodAnalysisResult {
  const { force = false } = options ?? {};
  const allWarnings: string[] = [];
  let analyzed = 0;
  let skipped = 0;
  let failed = 0;

  const updated = tracks.map((t) => {
    if (!needsAnalysis(t, force)) { skipped++; return t; }
    const result = analyzeTrackMood(t, { force });
    if (result.track.analysisStatus === "failed") { failed++; }
    else { analyzed++; }
    for (const w of result.warnings) {
      allWarnings.push(`[${t.title ?? t.trackId}] ${w}`);
    }
    return result.track;
  });

  const warningSummary = summarizeAnalysisWarnings(allWarnings);
  const warningSamples = allWarnings.slice(0, 20);

  console.info(`[analyzeAllMissingMoods] analyzed=${analyzed} skipped=${skipped} failed=${failed}`);
  if (Object.keys(warningSummary).length) {
    console.group("Warning summary");
    for (const [k, v] of Object.entries(warningSummary)) console.log(`  ${k}: ${v}`);
    console.groupEnd();
  }
  if (warningSamples.length) {
    console.group(`Showing first ${warningSamples.length} of ${allWarnings.length} warnings`);
    warningSamples.forEach((w, i) => console.log(`${i + 1}. ${w}`));
    console.groupEnd();
  }

  return { tracks: updated, analyzed, skipped, failed, warnings: allWarnings, warningSummary, warningSamples };
}
