// 0728G_MUSIC_Fast_Breaks_Identification — a normalized fast_breaks genre-
// FAMILY review layer, parallel to (but independent of) 0728F's BPM tempo-
// family review. "Ambient mood ≠ Ambient genre family": a track can be
// atmospheric/ambient in mood while still being rhythmically a jungle/DnB
// track. This module only ever produces a REVIEW candidate — canonical
// Track.genreClassification only changes via an explicit accept in
// LibraryGenreFamilyReviewDialog.tsx, never automatically.
//
// Evidence-only, no new audio-ML classifier: only genre tokens (via the
// existing genreTaxonomy.ts normalizer, reused unmodified) and title/
// grouping/comment text can trigger a suggestion at all. BPM band membership
// and mood are corroborating/confidence-boosting only — never sufficient by
// themselves (mirrors 0728F's genre-as-soft-prior doctrine, applied here to
// mood/BPM as soft priors for genre-family instead).

import type { Track, GenreFamily, GenreFamilyReviewStatus } from "../../data/trackTypes";
import { normalizeTrackGenreTokens } from "../genreTaxonomy";
import { scoreFastBreakAudioEvidence, type FastBreakEvidence } from "./fastBreakAudioEvidence";

// Substring match against normalized genre tokens AND raw title/grouping/
// comment text. "jungle" alone covers jungle/atmospheric jungle/ambient
// jungle/liquid jungle (§11 — none of these compounds exist in genreTaxonomy's
// own CANONICAL_ALIASES table, so they pass through normalization unchanged
// and are only caught by this substring check). "drum & bass"/"drum and
// bass"/"dnb"/"d&b" cover both the already-normalized form genreTaxonomy.ts
// produces (dnb/d&b/"drum and bass" → "drum & bass") AND compound phrases
// that normalization does NOT touch (e.g. "liquid dnb" — no exact-token
// alias exists for the two-word phrase, so it survives as raw "liquid dnb"
// and still needs its own dnb/d&b substring check here).
const FAST_BREAKS_EVIDENCE_TOKENS = [
  "jungle", "drum & bass", "drum and bass", "dnb", "d&b", "breakcore", "breakbeat",
];

// Deliberately excluded — StudioRich does not produce these styles, and they
// must never be inferred as fast-break evidence even if a related word
// appears somewhere in metadata. No detection code checks for these; their
// absence from FAST_BREAKS_EVIDENCE_TOKENS above is the actual guarantee.
// Listed here only so the exclusion is explicit and easy to audit.
export const NEVER_INFERRED_STYLES = [
  "hardcore techno", "gabber", "happy hardcore", "speedcore", "thrash metal",
] as const;

export const FAST_BREAKS_DETAILED_GENRE_OPTIONS = [
  "Jungle",
  "Drum and Bass",
  "Atmospheric Jungle",
  "Liquid Drum and Bass",
  "Ambient Jungle",
  "Experimental Drum and Bass",
] as const;

const HALF_TIME_ZONE_MIN = 75;
const HALF_TIME_ZONE_MAX = 100;
const FULL_TIME_ZONE_MIN = 150;

function containsFastBreaksToken(text: string): boolean {
  const t = text.toLowerCase();
  return FAST_BREAKS_EVIDENCE_TOKENS.some((token) => t.includes(token));
}

function isValidBpm(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

/** The BPM currently under review — canonical if set, otherwise the retained low-confidence candidate (same precedence dspFeatureExtraction.ts's reviewBpmField already uses). */
function effectiveBpm(track: Track): number | null {
  if (isValidBpm(track.bpm)) return track.bpm!;
  const candidate = track.audioAnalysis?.bpmCandidate;
  return isValidBpm(candidate) ? candidate! : null;
}

export interface FastBreaksTempoOption {
  applicable: boolean;
  currentBpm: number | null;
  alternateBpm: number | null;
  direction: "double" | "half" | null;
}

/**
 * §9 BPM interaction — plain arithmetic only, review-only, never auto-
 * applied. Deliberately separate from bpmTempoFamilyReview.ts's
 * classifyTempoFamily (thresholds <50/>150): this build's bands (75–100
 * "possible hidden half-time", >150 "already plausible, optional half-time
 * fallback") come directly from this spec's own worked examples (90→180,
 * 172→86) and don't match 0728F's general suspicious-range bands.
 */
export function suggestFastBreaksTempoOption(bpm: number | null | undefined): FastBreaksTempoOption {
  if (!isValidBpm(bpm)) return { applicable: false, currentBpm: null, alternateBpm: null, direction: null };
  if (bpm >= HALF_TIME_ZONE_MIN && bpm <= HALF_TIME_ZONE_MAX) {
    return { applicable: true, currentBpm: bpm, alternateBpm: +(bpm * 2).toFixed(2), direction: "double" };
  }
  if (bpm > FULL_TIME_ZONE_MIN) {
    return { applicable: true, currentBpm: bpm, alternateBpm: +(bpm / 2).toFixed(2), direction: "half" };
  }
  return { applicable: false, currentBpm: bpm, alternateBpm: null, direction: null };
}

interface DeclaredFastBreaksEvidence {
  confidence: number;
  reason: string;
  matchedDetailedGenres: string[];
}

/**
 * DECLARED (metadata) evidence-only detection (§5). Genre tokens or explicit
 * title/grouping/comment text are the only signals that can trigger a
 * suggestion at all from this function; BPM band and mood never do so alone
 * (§5 "Weak evidence" list; verified by the required "172 BPM alone" /
 * "90 BPM + lo-fi only" / "ambient mood alone" tests all resolving to no
 * suggestion). See reviewGenreFamilyField below for how this combines with
 * the independent AUDIO evidence from fastBreakAudioEvidence.ts (0728H §2).
 */
function detectDeclaredFastBreaksEvidence(track: Track): DeclaredFastBreaksEvidence | null {
  const genreTokens = normalizeTrackGenreTokens(track);
  const matchedGenreTokens = genreTokens.filter(containsFastBreaksToken);
  const textFields = [track.title, track.grouping, track.notes].filter((v): v is string => Boolean(v));
  const matchedTextField = textFields.find(containsFastBreaksToken);

  if (matchedGenreTokens.length === 0 && !matchedTextField) return null;

  let confidence = matchedGenreTokens.length > 0 ? 0.8 : 0.6;
  const reasonParts: string[] = [];
  if (matchedGenreTokens.length > 0) reasonParts.push(`genre metadata contains ${matchedGenreTokens.join(", ")}`);
  if (matchedTextField) reasonParts.push(`title/grouping/comments reference fast-break material`);

  const bpm = effectiveBpm(track);
  if (bpm != null) {
    if (bpm > FULL_TIME_ZONE_MIN) {
      confidence = Math.min(0.95, confidence + 0.1);
      reasonParts.push(`BPM ${bpm} is in the plausible fast-breaks range`);
    } else if (bpm >= HALF_TIME_ZONE_MIN && bpm <= HALF_TIME_ZONE_MAX) {
      confidence = Math.min(0.95, confidence + 0.1);
      reasonParts.push(`BPM ${bpm} is consistent with a half-time reading of a fast-breaks track`);
    }
  }

  return {
    confidence,
    reason: reasonParts.join("; ") + ".",
    matchedDetailedGenres: matchedGenreTokens,
  };
}

export interface GenreFamilyFieldReview {
  reviewStatus: GenreFamilyReviewStatus;
  currentFamily: GenreFamily | null;
  currentDetailedGenres: readonly string[];
  suggestedFamily: GenreFamily | null;
  confidence: number | null;
  reason: string | null;
  bpm: number | null;
  tempoOption: FastBreaksTempoOption;
  // 0728H_MUSIC_Review_Dialog_Playback_And_Audio_Evidence §2 — the two
  // evidence sources kept visible SEPARATELY (never merged into one opaque
  // number) so a person can see exactly what declared metadata said versus
  // what the audio itself suggests, and `conflict` names the case where
  // they disagree rather than silently averaging it away.
  declaredEvidence: { confidence: number; reason: string } | null;
  audioEvidence: FastBreakEvidence;
  conflict: boolean;
}

interface CombinedEvidence {
  suggested: boolean;
  confidence: number;
  reason: string;
  conflict: boolean;
}

/**
 * §2 combine rules, applied in order:
 *   - declared + audio agree (audio "high"/"medium")    → strongest suggestion
 *   - audio "high" alone, declared absent                → review candidate
 *   - declared present, audio "low" (measured, weak)      → review candidate, conflict=true
 *   - declared present, audio "insufficient" (no DSP yet) → declared-only suggestion, no conflict —
 *     absence of audio analysis is not disagreement, so it must not be reported as one
 *   - audio "medium" alone (declared absent) or nothing at all → no suggestion
 * BPM and mood are never inputs to this function at all (mood is never read
 * anywhere in this module; BPM only ever reaches the separate tempoOption
 * side-channel) — "BPM alone is never sufficient" / "mood alone is never
 * sufficient" hold structurally, not just by threshold tuning.
 */
function combineFastBreaksEvidence(declared: DeclaredFastBreaksEvidence | null, audio: FastBreakEvidence): CombinedEvidence | null {
  const audioSupportive = audio.likelihood === "high" || audio.likelihood === "medium";

  if (declared && audioSupportive) {
    return {
      suggested: true,
      confidence: Math.max(declared.confidence, audio.confidence),
      reason: [declared.reason, ...audio.reasons].join(" "),
      conflict: false,
    };
  }
  if (!declared && audio.likelihood === "high") {
    return {
      suggested: true,
      confidence: audio.confidence,
      reason: audio.reasons.join(" "),
      conflict: false,
    };
  }
  if (declared && audio.likelihood === "low") {
    return {
      suggested: true,
      confidence: +(declared.confidence * 0.7).toFixed(2),
      reason: `${declared.reason} Conflict: audio evidence is low (${audio.reasons.join(" ")})`,
      conflict: true,
    };
  }
  if (declared && audio.likelihood === "insufficient") {
    return {
      suggested: true,
      confidence: declared.confidence,
      reason: declared.reason,
      conflict: false,
    };
  }
  return null;
}

/**
 * §3 precedence (manual > imported > derived > unresolved): a "confirmed"
 * classification (manual or trusted imported) is permanently exempt from
 * re-derivation, regardless of what fresh evidence would otherwise suggest —
 * derived classification must never overwrite it.
 */
export function reviewGenreFamilyField(track: Track): GenreFamilyFieldReview {
  const gc = track.genreClassification ?? null;
  const bpm = effectiveBpm(track);
  const tempoOption = suggestFastBreaksTempoOption(bpm);
  const declaredEvidence = detectDeclaredFastBreaksEvidence(track);
  const audioEvidence = scoreFastBreakAudioEvidence(track);

  if (gc?.reviewStatus === "confirmed") {
    return {
      reviewStatus: "confirmed",
      currentFamily: gc.primaryGenreFamily,
      currentDetailedGenres: gc.detailedGenres,
      suggestedFamily: null, confidence: null, reason: null,
      bpm, tempoOption, declaredEvidence, audioEvidence, conflict: false,
    };
  }

  const combined = combineFastBreaksEvidence(declaredEvidence, audioEvidence);
  if (!combined) {
    return {
      reviewStatus: gc?.reviewStatus ?? "unreviewed",
      currentFamily: gc?.primaryGenreFamily ?? null,
      currentDetailedGenres: gc?.detailedGenres ?? [],
      suggestedFamily: null, confidence: null, reason: null,
      bpm, tempoOption, declaredEvidence, audioEvidence, conflict: false,
    };
  }

  // §6 — a rejected suggestion stays suppressed only while the evidence that
  // produced it is unchanged; a differing reason means the evidence itself
  // changed (e.g. genre metadata was edited, or the track was reanalyzed
  // with new DSP output), so it's a NEW suggestion, not the same one
  // reappearing.
  if (gc?.reviewStatus === "rejected" && gc.reason === combined.reason) {
    return {
      reviewStatus: "rejected",
      currentFamily: gc.primaryGenreFamily,
      currentDetailedGenres: gc.detailedGenres,
      suggestedFamily: null, confidence: null, reason: null,
      bpm, tempoOption, declaredEvidence, audioEvidence, conflict: false,
    };
  }

  return {
    reviewStatus: "suggested",
    currentFamily: gc?.primaryGenreFamily ?? null,
    currentDetailedGenres: gc?.detailedGenres ?? [],
    suggestedFamily: "fast_breaks",
    confidence: combined.confidence,
    reason: combined.reason,
    bpm, tempoOption, declaredEvidence, audioEvidence, conflict: combined.conflict,
  };
}

export function needsGenreFamilyReview(track: Track): boolean {
  return reviewGenreFamilyField(track).reviewStatus === "suggested";
}
