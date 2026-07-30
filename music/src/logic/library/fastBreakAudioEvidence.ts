// 0728H_MUSIC_Review_Dialog_Playback_And_Audio_Evidence §2 — a narrow,
// single-question rhythm-evidence scorer: "does this track exhibit jungle/
// drum-and-bass/fast-break rhythmic behavior?" Reuses ONLY already-computed
// DSP outputs (audioAnalysis.onsetDensity/zeroCrossingRate/bpmConfidenceDetail,
// beatMap.confidenceComponents) — no new signal processing, no external
// service, no general ML genre classifier. Pure function of already-
// persisted data; never itself persisted (kept structurally separate from
// Track.genreClassification, per instruction, by never writing to it).
//
// Deliberately NOT used as evidence, with reasons:
//   - beatMap.beatTimesSeconds / tempoStabilityScore / tempoSegments — the
//     beat grid is a fixed-period arithmetic extrapolation from ONE detected
//     BPM (see beatMap/tempoStability.ts's own doc comment), not a re-
//     tracked grid; inter-beat-interval variance computed from it is ~0 by
//     construction. Using it for "syncopation" would fabricate a signal that
//     provably doesn't vary. Not used.
//   - kick/snare/four-on-the-floor periodicity — no such signal exists
//     anywhere in this codebase (confirmed by search); not fabricated here.

import type { Track } from "../../data/trackTypes";

export type FastBreakLikelihood = "high" | "medium" | "low" | "insufficient";

export interface FastBreakEvidence {
  likelihood: FastBreakLikelihood;
  confidence: number;
  tempoFamily: {
    halfTime: number | null;
    fullTime: number | null;
  };
  reasons: readonly string[];
  analysisRevision: string;
}

// Bump whenever the scoring logic below changes materially, mirroring the
// BPM_DETECTOR_VERSION/KEY_DETECTOR_VERSION convention — lets a future
// build tell "recomputed under the old formula" apart from the current one.
export const FAST_BREAK_AUDIO_EVIDENCE_VERSION = "fast-break-audio-v1";

// Reuses the EXACT threshold pair dspFeatureExtraction.ts already uses for
// its own "percussive-fragments" mechanical-tag heuristic (line ~190) —
// not a new number invented for this build.
const PERCUSSIVE_ONSET_THRESHOLD = 0.6;
const PERCUSSIVE_ZCR_THRESHOLD = 0.5;

const HIGH_DENSITY_THRESHOLD = 0.75;
const MEDIUM_DENSITY_THRESHOLD = 0.45;

// Overall combined-score thresholds (distinct from the onset-density
// thresholds above, even though one happens to share the same number).
const HIGH_SCORE_THRESHOLD = 0.65;
const MEDIUM_SCORE_THRESHOLD = 0.35;

const HALF_TIME_ZONE_MAX = 150; // mirrors genreFamilyClassification.ts's own band framing

function isValidBpm(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

function effectiveBpm(track: Track): number | null {
  if (isValidBpm(track.bpm)) return track.bpm!;
  const candidate = track.audioAnalysis?.bpmCandidate;
  return isValidBpm(candidate) ? candidate! : null;
}

/**
 * Always returns BOTH a half-time and a full-time reading when a BPM
 * exists — the slower of {bpm, bpm×2, bpm÷2} as halfTime, the faster as
 * fullTime — matching both of the spec's own worked examples exactly
 * (90 ≤150 → half 90/full 180; 172 >150 → half 86/full 172).
 */
function computeTempoFamily(bpm: number | null): FastBreakEvidence["tempoFamily"] {
  if (bpm == null) return { halfTime: null, fullTime: null };
  const half = bpm <= HALF_TIME_ZONE_MAX ? bpm : bpm / 2;
  const full = bpm <= HALF_TIME_ZONE_MAX ? bpm * 2 : bpm;
  return { halfTime: +half.toFixed(2), fullTime: +full.toFixed(2) };
}

/**
 * Pure, evidence-only rhythm scorer. Never reads genre/mood/title text —
 * genreFamilyClassification.ts is responsible for combining this with
 * metadata evidence; this function answers ONLY the audio question.
 */
export function scoreFastBreakAudioEvidence(track: Track): FastBreakEvidence {
  const bpm = effectiveBpm(track);
  const tempoFamily = computeTempoFamily(bpm);
  const aa = track.audioAnalysis;

  if (!aa || aa.onsetDensity == null) {
    return {
      likelihood: "insufficient",
      confidence: 0,
      tempoFamily,
      reasons: ["No DSP analysis available yet — onset density has not been computed for this track."],
      analysisRevision: FAST_BREAK_AUDIO_EVIDENCE_VERSION,
    };
  }

  const onsetDensity = aa.onsetDensity;
  const zcr = aa.zeroCrossingRate ?? 0;
  const metricalConfidence = aa.bpmConfidenceDetail?.metricalConfidence ?? null;

  const reasons: string[] = [];
  let score = 0;

  if (onsetDensity >= HIGH_DENSITY_THRESHOLD) {
    score += 0.5;
    reasons.push(`Onset density ${onsetDensity.toFixed(2)} indicates dense, rapid rhythmic activity, consistent with breakbeat material.`);
  } else if (onsetDensity >= MEDIUM_DENSITY_THRESHOLD) {
    score += 0.25;
    reasons.push(`Onset density ${onsetDensity.toFixed(2)} indicates moderate rhythmic activity.`);
  } else {
    reasons.push(`Onset density ${onsetDensity.toFixed(2)} is low — consistent with sparse or ambient/no-beat material, not breakbeat.`);
  }

  // Reuses dspFeatureExtraction.ts's own "percussive-fragments" heuristic
  // threshold pair directly, rather than inventing a new one.
  const percussiveFragments = onsetDensity > PERCUSSIVE_ONSET_THRESHOLD && zcr > PERCUSSIVE_ZCR_THRESHOLD;
  if (percussiveFragments) {
    score += 0.25;
    reasons.push("Percussive-fragment texture detected (high onset density + high zero-crossing rate) — the same signature the mechanical-mood analyzer already flags as \"percussive-fragments\".");
  }

  // A low metrical-confidence reading alongside REAL rhythmic density (not
  // alongside silence) is weak corroborating evidence of the half/double/
  // triple ambiguity that syncopated breakbeat material often produces —
  // never used alone, and never when onset density is itself low (which
  // would just mean "quiet track, ambiguous for unrelated reasons").
  if (metricalConfidence != null && metricalConfidence < 0.5 && onsetDensity >= MEDIUM_DENSITY_THRESHOLD) {
    score += 0.1;
    reasons.push(`Metrical confidence ${metricalConfidence.toFixed(2)} is low alongside real rhythmic density — consistent with the half/double-time ambiguity breakbeat material often produces, though this alone is weak evidence.`);
  }

  score = Math.min(1, score);
  const likelihood: FastBreakLikelihood = score >= HIGH_SCORE_THRESHOLD ? "high" : score >= MEDIUM_SCORE_THRESHOLD ? "medium" : "low";

  return {
    likelihood,
    confidence: +score.toFixed(2),
    tempoFamily,
    reasons,
    analysisRevision: FAST_BREAK_AUDIO_EVIDENCE_VERSION,
  };
}
