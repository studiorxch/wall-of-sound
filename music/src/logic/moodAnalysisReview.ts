// Mood Analysis Review + Calibration (0708_MUSIC_MoodAnalysisResultsReviewAndCalibration_v1.0.0)
// Builds per-track review rows and aggregate calibration summaries.
// Does not duplicate analyzer math — delegates to existing functions.

import type { Track } from "../data/trackTypes";
import type { AudioFeatureVector } from "./MoodAnalyzer";
import { rankMoodProfiles } from "./MoodAnalyzer";
import { trackToAudioFeatures, type FeatureSources } from "./audioFeatureAdapter";
import { requiresCanonicalAnalysis, isBpmTrustedForAnalysis, isKeyTrustedForAnalysis } from "./dspFeatureExtraction";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CalibrationFlag =
  | "zcr_high"
  | "onset_high"
  | "rms_saturated"
  | "low_confidence"
  | "metadata_fallback"
  | "missing_dsp"
  | "possible_overfrantic"
  | "possible_overtense"
  | "no_audio_source"
  | "invalid_bpm"
  | "invalid_key"
  | "stale_mood_assignment"
  // Committed tag differs from live scoring, but live score is not trustworthy (no DSP +
  // metadata fallback). Do not treat as a repair candidate.
  | "weak_live_mood_mismatch";

export interface MoodAnalysisReviewRow {
  id: string;
  title: string;
  artist?: string;
  sourceKind?: string;
  hasAudioSource: boolean;
  hasDspAnalysis: boolean;
  bpm?: number;
  energy?: number;
  camelotKey?: string;
  // BPM/key detection engine (0712_MUSIC_BPM_Key_Detection_Engine §13,
  // calibrated confidence breakdown per 0712_MUSIC_BPM_Key_Detector_
  // Calibration §20) — provenance + confidence for bpm/camelotKey above.
  bpmConfidence?: number;
  bpmConfidenceDetail?: import("../data/audioDetectionTypes").BpmDetectionConfidence;
  bpmSource?: string;
  tonic?: string;
  mode?: "major" | "minor";
  keyConfidence?: number;
  keyConfidenceDetail?: import("../data/audioDetectionTypes").KeyDetectionConfidence;
  keySource?: string;
  bpmWarningCodes?: string[];
  keyWarningCodes?: string[];
  audioAnalysis?: {
    rmsMean?: number;
    rmsEnergy?: number;
    brightness?: number;
    spectralCentroid?: number;
    spectralRolloff?: number;
    spectralBandwidth?: number;
    zeroCrossingRate?: number;
    onsetDensity?: number;
  };
  features: AudioFeatureVector | null;
  featureSources: FeatureSources;
  moodTags: string[];
  moodSuggestions: string[];
  topScores: Array<{ mood: string; confidence: number; distance: number }>;
  analysisConfidence?: number;
  analysisStatus?: string;
  isStale: boolean;
  // 0712_MUSIC_BPM_Key_Persistence_Repair §7 — DSP/mood completeness alone
  // does not make a track "Complete"; BPM and key must also be real values,
  // not missing or a fabricated placeholder (no beat-tracking/key-detection
  // algorithm exists here, so these are only ever populated by CSV/metadata
  // import — see isValidBpm/isValidCamelotKey).
  hasValidBpm: boolean;
  hasValidKey: boolean;
  analysisWarnings: string[];
  suggestedMechanismTags?: string[];
  calibrationFlags: CalibrationFlag[];
}

export interface MoodCalibrationSummary {
  total: number;
  hasDsp: number;
  needsDsp: number;
  noAudioSource: number;
  withWarnings: number;
  lowConfidence: number;
  /** moodTags[0] per track — committed primary assignment */
  primaryMoodCounts: Record<string, number>;
  /** topScores[0].mood per track — live scoring primary (may differ from committed) */
  livePrimaryMoodCounts: Record<string, number>;
  /** top-3 live scores per track accumulated — shows overall scoring distribution */
  top3TagCounts: Record<string, number>;
  calibrationFlagCounts: Record<CalibrationFlag, number>;
}

export type ReviewFilter =
  | "all"
  | "needs_dsp"
  | "has_dsp"
  | "no_audio_source"
  | "warnings"
  | "low_confidence"
  | "reference"
  | "external"
  | "catalog";

// ── Helpers ───────────────────────────────────────────────────────────────────

function hasAudioSource(track: Track): boolean {
  const r = track as Record<string, unknown>;
  return !!(track.objectUrl ?? r.audioUrl ?? track.audioRelPath ?? track.filePath ?? r.path);
}

// Unified with the canonical "missing DSP" predicate (0712_MUSIC_Catalog_
// Analysis_Orchestration §7) — this file and dspFeatureExtraction.ts
// previously disagreed on what counted as "has DSP" (this check ignored
// bandwidth/rolloff and stale-version reprocessing entirely).
function hasDsp(track: Track): boolean {
  return !requiresCanonicalAnalysis(track);
}

export function sourceKindLabel(track: Track): string {
  const r = track as Record<string, unknown>;
  const sk = String(r.sourceKind ?? r.sourceType ?? r.kind ?? track.sourceOwner ?? "").toLowerCase();
  if (sk === "reference" || sk === "ref") return "REF";
  if (sk === "external") return "EXT";
  if (sk === "studiorich") return "CAT";
  if (sk === "unknown" || !sk) return "?";
  return sk.slice(0, 3).toUpperCase();
}

function computeFlags(row: Omit<MoodAnalysisReviewRow, "calibrationFlags">): CalibrationFlag[] {
  const flags: CalibrationFlag[] = [];
  const aa = row.audioAnalysis;
  if (!row.hasAudioSource) flags.push("no_audio_source");
  if (!row.hasDspAnalysis) flags.push("missing_dsp");
  if (!row.hasValidBpm) flags.push("invalid_bpm");
  if (!row.hasValidKey) flags.push("invalid_key");
  if (aa?.zeroCrossingRate != null && aa.zeroCrossingRate >= 0.85) flags.push("zcr_high");
  if (aa?.onsetDensity != null && aa.onsetDensity >= 0.90) flags.push("onset_high");
  if (aa?.rmsEnergy != null && aa.rmsEnergy >= 0.98) flags.push("rms_saturated");
  if ((row.analysisConfidence ?? 1) < 0.65) flags.push("low_confidence");
  if (row.analysisWarnings.some((w) => w.includes("inferred") || w.includes("fallback"))) {
    flags.push("metadata_fallback");
  }
  const top3 = row.topScores.slice(0, 3).map((s) => s.mood);
  if (top3.includes("Frantic") && (aa?.onsetDensity ?? 0) >= 0.90 && (row.features?.rmsEnergy ?? 1) < 0.45) {
    flags.push("possible_overfrantic");
  }
  if (top3.includes("Tense") && (row.analysisConfidence ?? 1) < 0.55) {
    flags.push("possible_overtense");
  }
  const committedPrimary = row.moodTags[0];
  const livePrimary = row.topScores[0]?.mood;
  if (committedPrimary && livePrimary && committedPrimary !== livePrimary) {
    // Only flag as stale when the live score is trustworthy: DSP present, or high feature
    // confidence, or no metadata fallback was needed. Without one of these, the live score
    // is likely just Balanced from a neutral fallback vector — not a real disagreement.
    const canTrustLiveMood =
      row.hasDspAnalysis ||
      (row.analysisConfidence ?? 0) >= 0.75 ||
      !flags.includes("metadata_fallback");
    if (canTrustLiveMood) {
      flags.push("stale_mood_assignment");
    } else {
      flags.push("weak_live_mood_mismatch");
    }
  }
  return flags;
}

// ── Row builder ───────────────────────────────────────────────────────────────

export function buildMoodAnalysisReviewRow(track: Track): MoodAnalysisReviewRow {
  const { features, warnings, featureSources } = trackToAudioFeatures(track);
  const topScores = features
    ? rankMoodProfiles(features).slice(0, 5).map((s) => ({
        mood: s.mood,
        confidence: +s.confidence.toFixed(4),
        distance: (s as { distance?: number }).distance != null
          ? +(s as { distance?: number }).distance!.toFixed(4)
          : 0,
      }))
    : [];

  const aa = track.audioAnalysis;
  const base: Omit<MoodAnalysisReviewRow, "calibrationFlags"> = {
    id: track.trackId,
    title: track.title,
    artist: track.artist,
    sourceKind: sourceKindLabel(track),
    hasAudioSource: hasAudioSource(track),
    hasDspAnalysis: hasDsp(track),
    bpm: track.bpm,
    energy: track.energy,
    camelotKey: track.camelotKey,
    bpmConfidence: aa?.bpmConfidence,
    bpmConfidenceDetail: aa?.bpmConfidenceDetail,
    bpmSource: track.bpmSource,
    tonic: aa?.tonic,
    mode: aa?.mode,
    keyConfidence: aa?.keyConfidence,
    keyConfidenceDetail: aa?.keyConfidenceDetail,
    keySource: track.keySource,
    bpmWarningCodes: aa?.bpmWarningCodes,
    keyWarningCodes: aa?.keyWarningCodes,
    audioAnalysis: aa ? {
      rmsMean: aa.rmsMean,
      rmsEnergy: aa.rmsEnergy,
      brightness: aa.brightness,
      spectralCentroid: aa.spectralCentroid,
      spectralRolloff: aa.spectralRolloff,
      spectralBandwidth: aa.spectralBandwidth,
      zeroCrossingRate: aa.zeroCrossingRate,
      onsetDensity: aa.onsetDensity,
    } : undefined,
    features,
    featureSources,
    moodTags: track.moodTags ?? [],
    moodSuggestions: track.moodSuggestions ?? [],
    topScores,
    analysisConfidence: track.analysisConfidence,
    analysisStatus: track.analysisStatus,
    // Stale = has a DSP payload, but it's the older/wrong analyzer version —
    // distinct from "missing" (no payload at all). Reuses the same canonical
    // predicate as the batch runner rather than re-deriving version logic here.
    isStale: hasDsp(track) && requiresCanonicalAnalysis(track),
    // 0712_MUSIC_BPM_Key_Detector_Calibration §19/§20 — "valid" for display
    // purposes now means trusted/confident, not just format-valid: a
    // legacy_unknown or ambiguity-flagged value is still shown as Partial.
    hasValidBpm: isBpmTrustedForAnalysis(track),
    hasValidKey: isKeyTrustedForAnalysis(track),
    analysisWarnings: [...(track.analysisWarnings ?? []), ...warnings],
    suggestedMechanismTags: track.suggestedMechanismTags ?? [],
  };

  return { ...base, calibrationFlags: computeFlags(base) };
}

// ── Filter ────────────────────────────────────────────────────────────────────

function passesFilter(row: MoodAnalysisReviewRow, filter: ReviewFilter): boolean {
  switch (filter) {
    case "needs_dsp":       return !row.hasDspAnalysis;
    case "has_dsp":         return row.hasDspAnalysis;
    case "no_audio_source": return !row.hasAudioSource;
    case "warnings":        return row.analysisWarnings.length > 0;
    case "low_confidence":  return (row.analysisConfidence ?? 1) < 0.65;
    case "reference":       return row.sourceKind === "REF";
    case "external":        return row.sourceKind === "EXT";
    case "catalog":         return row.sourceKind === "CAT";
    default:                return true;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface GetReviewRowsOptions {
  limit?: number;
  offset?: number;
  skipReference?: boolean;
  filter?: ReviewFilter;
}

export function getMoodAnalysisReviewRows(
  tracks: Track[],
  opts: GetReviewRowsOptions = {},
): MoodAnalysisReviewRow[] {
  const { limit = 50, offset = 0, skipReference = false, filter = "all" } = opts;
  let pool = tracks;
  if (skipReference) pool = pool.filter((t) => sourceKindLabel(t) !== "REF");
  const rows = pool.map(buildMoodAnalysisReviewRow).filter((r) => passesFilter(r, filter));
  return rows.slice(offset, offset + limit);
}

export function getMoodCalibrationSummary(tracks: Track[]): MoodCalibrationSummary {
  const ALL_FLAGS: CalibrationFlag[] = [
    "zcr_high", "onset_high", "rms_saturated", "low_confidence",
    "metadata_fallback", "missing_dsp", "possible_overfrantic",
    "possible_overtense", "no_audio_source", "invalid_bpm", "invalid_key",
    "stale_mood_assignment", "weak_live_mood_mismatch",
  ];

  const flagCounts = Object.fromEntries(ALL_FLAGS.map((f) => [f, 0])) as Record<CalibrationFlag, number>;
  const primaryMoodCounts: Record<string, number> = {};
  const livePrimaryMoodCounts: Record<string, number> = {};
  const top3TagCounts: Record<string, number> = {};
  let hasDspCount = 0;
  let needsDspCount = 0;
  let noSourceCount = 0;
  let withWarnings = 0;
  let lowConf = 0;

  for (const t of tracks) {
    const row = buildMoodAnalysisReviewRow(t);
    if (row.hasDspAnalysis) hasDspCount++; else needsDspCount++;
    if (!row.hasAudioSource) noSourceCount++;
    if (row.analysisWarnings.length > 0) withWarnings++;
    if ((row.analysisConfidence ?? 1) < 0.65) lowConf++;
    for (const f of row.calibrationFlags) flagCounts[f]++;

    const committed = row.moodTags[0];
    if (committed) primaryMoodCounts[committed] = (primaryMoodCounts[committed] ?? 0) + 1;

    const live = row.topScores[0]?.mood;
    if (live) livePrimaryMoodCounts[live] = (livePrimaryMoodCounts[live] ?? 0) + 1;

    for (const s of row.topScores.slice(0, 3)) {
      top3TagCounts[s.mood] = (top3TagCounts[s.mood] ?? 0) + 1;
    }
  }

  const sort = (r: Record<string, number>) =>
    Object.fromEntries(Object.entries(r).sort(([, a], [, b]) => b - a));

  return {
    total: tracks.length,
    hasDsp: hasDspCount,
    needsDsp: needsDspCount,
    noAudioSource: noSourceCount,
    withWarnings,
    lowConfidence: lowConf,
    primaryMoodCounts: sort(primaryMoodCounts),
    livePrimaryMoodCounts: sort(livePrimaryMoodCounts),
    top3TagCounts: sort(top3TagCounts),
    calibrationFlagCounts: flagCounts,
  };
}

// ── Calibration snapshot ──────────────────────────────────────────────────────

export interface MoodCalibrationSnapshot {
  label?: string;
  createdAt: string;
  total: number;
  /** committed moodTags[0] per track at snapshot time */
  topMoodCounts: Record<string, number>;
  tagCounts: Record<string, number>;
  calibrationFlagCounts: Record<CalibrationFlag, number>;
  averageConfidence: number;
  lowConfidenceCount: number;
  staleMoodCount: number;
  rowsSample: MoodAnalysisReviewRow[];
}

export function snapshotMoodCalibration(tracks: Track[], label?: string): MoodCalibrationSnapshot {
  const summary = getMoodCalibrationSummary(tracks);
  const rows = getMoodAnalysisReviewRows(tracks, { limit: 99999 });

  // topMoodCounts: primary mood per track — moodTags[0] then topScores[0], else skip.
  // Must be computed from the snapshot rows (not summary.topMoodCounts which counts top-3
  // from live scoring and produces identical values in both snapshots → zero delta).
  const topMoodCounts: Record<string, number> = {};
  const tagCounts: Record<string, number> = {};
  let totalConf = 0;
  let confCount = 0;
  for (const r of rows) {
    const primary = r.moodTags[0] ?? r.topScores[0]?.mood;
    if (primary) topMoodCounts[primary] = (topMoodCounts[primary] ?? 0) + 1;
    for (const m of r.moodTags) tagCounts[m] = (tagCounts[m] ?? 0) + 1;
    if (r.analysisConfidence != null) { totalConf += r.analysisConfidence; confCount++; }
  }

  return {
    label,
    createdAt: new Date().toISOString(),
    total: summary.total,
    topMoodCounts: Object.fromEntries(Object.entries(topMoodCounts).sort(([, a], [, b]) => b - a)),
    tagCounts: Object.fromEntries(Object.entries(tagCounts).sort(([, a], [, b]) => b - a)),
    calibrationFlagCounts: summary.calibrationFlagCounts,
    averageConfidence: confCount > 0 ? +(totalConf / confCount).toFixed(4) : 0,
    lowConfidenceCount: summary.lowConfidence,
    staleMoodCount: summary.calibrationFlagCounts.stale_mood_assignment,
    rowsSample: rows.slice(0, 25),
  };
}

export function compareMoodCalibrationSnapshots(
  before: MoodCalibrationSnapshot,
  after: MoodCalibrationSnapshot,
): {
  beforeLabel?: string;
  afterLabel?: string;
  topMoodDelta: Record<string, number>;
  tagDelta: Record<string, number>;
  confidenceDelta: number;
  flagDelta: Record<string, number>;
} {
  const allMoods = new Set([...Object.keys(before.topMoodCounts), ...Object.keys(after.topMoodCounts)]);
  const topMoodDelta: Record<string, number> = {};
  for (const m of allMoods) topMoodDelta[m] = (after.topMoodCounts[m] ?? 0) - (before.topMoodCounts[m] ?? 0);

  const allTags = new Set([...Object.keys(before.tagCounts), ...Object.keys(after.tagCounts)]);
  const tagDelta: Record<string, number> = {};
  for (const t of allTags) tagDelta[t] = (after.tagCounts[t] ?? 0) - (before.tagCounts[t] ?? 0);

  const allFlags = new Set([
    ...Object.keys(before.calibrationFlagCounts),
    ...Object.keys(after.calibrationFlagCounts),
  ]);
  const flagDelta: Record<string, number> = {};
  for (const f of allFlags) {
    flagDelta[f] =
      ((after.calibrationFlagCounts as Record<string, number>)[f] ?? 0) -
      ((before.calibrationFlagCounts as Record<string, number>)[f] ?? 0);
  }

  return {
    beforeLabel: before.label,
    afterLabel: after.label,
    topMoodDelta: Object.fromEntries(Object.entries(topMoodDelta).sort(([, a], [, b]) => b - a)),
    tagDelta: Object.fromEntries(Object.entries(tagDelta).sort(([, a], [, b]) => b - a)),
    confidenceDelta: +(after.averageConfidence - before.averageConfidence).toFixed(4),
    flagDelta,
  };
}
