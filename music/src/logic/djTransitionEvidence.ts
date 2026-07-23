// DJ Transition Engine (0722D) §6 — pure evidence assembly. Governed by
// 0722_MUSIC_DJ_Doctrine_v1.1.0 §14.2 (Observed/Inferred/Proposed/
// Manually-confirmed claims are a distinct axis from confidence — a value
// can be well-measured and still only "inferred," e.g. a phrase boundary
// synthesized from bar-count heuristics).
//
// This module is 100% synchronous and pure — no network, no filesystem, no
// audio decode. Everything it needs (beat map, playback bounds, song
// analysis, current-stem-role availability, source fingerprint) is resolved
// by the caller and passed in as plain data. Stem lookup in particular is
// the one genuinely async step anywhere in the DJ transition pipeline
// (GET /stem-sets via stemClient.ts) — it happens once, before this
// function runs, never inside it.
//
// Trust gates are REUSED, not reinvented: beat-alignment trust is exactly
// isBeatMapTrustedForAnalysis() (beatMapTrust.ts, TRUST_THRESHOLD=0.75 in
// calibrationThresholds.ts) — the same gate computeTrackPlaybackBounds.ts
// already uses. There is no independently-exposed downbeat/bar confidence
// function in the beat-map module, so this file reads
// beatMap.confidenceComponents.downbeatRecurrence / .barAlignment directly
// (already computed by the beat-map detector) rather than recomputing a
// second composite score.

import type { Track } from "../data/trackTypes";
import type { TrackBeatMap } from "../data/beatMapTypes";
import type { TrackPlaybackBounds } from "../data/playbackBoundsTypes";
import type { CompleteSongAnalysis, SongSection } from "../data/songAnalysisTypes";
import type { StemRole } from "../data/trackStemTypes";
import type { TransitionEvidenceValue } from "../data/djTransitionTypes";
import { isBeatMapTrustedForAnalysis } from "./beatMap/beatMapTrust";
import { computePhraseBoundaryScore } from "./beatMap/downbeatEvidence";

// §6.2 trust-gate policy — one named-constants object, not scattered
// literals, per the spec's own instruction. Beat-alignment reuses the
// existing 0.75 beat-map trust threshold directly; downbeat/bar and phrase
// gates are new, independently-gated checks this build introduces.
export const DJ_TRANSITION_TRUST_POLICY = {
  downbeatConfidenceForBarAlignment: 0.75,
  phraseConfidenceForPhraseAlignment: 0.70,
  maxAutomaticTempoAdjustmentPercent: 3,
  tempoAdjustmentWarningBandPercent: 2,
  defaultOverlapBarCandidates: [4, 8, 16, 32] as const,
} as const;

function missingValue<T>(source: TransitionEvidenceValue<T>["source"] = "missing"): TransitionEvidenceValue<T> {
  return { value: null, confidence: 0, source, claim: "proposed", analyzedAt: null };
}

function observed<T>(value: T, confidence: number, analyzedAt: string | null, source: TransitionEvidenceValue<T>["source"] = "decoded_analysis"): TransitionEvidenceValue<T> {
  return { value, confidence: clamp01(confidence), source, claim: "observed", analyzedAt };
}

function inferred<T>(value: T, confidence: number, analyzedAt: string | null): TransitionEvidenceValue<T> {
  return { value, confidence: clamp01(confidence), source: "derived", claim: "inferred", analyzedAt };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export interface TransitionSectionEvidence {
  id: string;
  structuralType: SongSection["structuralType"];
  startSeconds: number;
  endSeconds: number;
  confidence: number;
  verification: SongSection["verification"];
}

export interface DjTransitionEvidenceTrackInput {
  track: Track;
  beatMap?: TrackBeatMap;
  playbackBounds?: TrackPlaybackBounds;
  songAnalysis?: CompleteSongAnalysis;
  // Resolved by the caller (fetchStemSets, CURRENT lifecycle only) before
  // this function runs — see stemClient.ts / StemSublayer.tsx's
  // `lifecycle === "current"` derivation for the exact pattern to reuse.
  currentStemRoleAvailability: Partial<Record<StemRole, boolean>>;
  // Resolution order recommended for callers: songAnalysis?.sourceMediaFingerprint
  // (songAnalysisTypes.ts), else track.playbackBounds?.sourceFingerprint
  // (playbackBoundsTypes.ts), else "" — an empty fingerprint is treated as
  // "identity unknown" and fails staleness checks closed (never assumed
  // current) by djTransitionStaleness.ts.
  sourceFingerprint: string;
}

export interface DjTransitionTrackEvidence {
  trackId: string;
  sourceFingerprint: string;
  durationSeconds: TransitionEvidenceValue<number>;
  bpm: TransitionEvidenceValue<number>;
  tempoStability: TransitionEvidenceValue<number>;
  // null when the beat grid is not trust-gated (isBeatMapTrustedForAnalysis
  // false) — a populated BPM alone never permits beat/bar/phrase claims.
  beatTimesSeconds: TransitionEvidenceValue<number[]>;
  beatTrusted: boolean;
  downbeatConfidenceRaw: number;
  barGridConfidenceRaw: number;
  barStartTimesSeconds: TransitionEvidenceValue<number[]>;
  firstDownbeatSeconds: TransitionEvidenceValue<number>;
  barTrusted: boolean;
  // Genuinely new synthesis (no phrase detector exists anywhere in the
  // repo) — claim is always "inferred," never "observed," and confidence
  // is capped at the weakest input it depends on (bar-alignment confidence
  // and the bar-count-fits-a-phrase-length heuristic), never at the
  // heuristic score alone. Structurally unreachable unless barTrusted.
  phraseBoundarySeconds: TransitionEvidenceValue<number[]>;
  phraseTrusted: boolean;
  // Verified/reviewed structural sections only (provisional excluded),
  // with startFrame/endFrame already converted to seconds using this
  // track's own CompleteSongAnalysis.sampleRate — never left as raw frame
  // counts for a downstream consumer to misinterpret. Corroborating
  // evidence for djTransitionRegions.ts to match candidate windows
  // against; not folded into phraseBoundarySeconds' own confidence.
  verifiedSections: TransitionSectionEvidence[];
  key: TransitionEvidenceValue<string>;
  energyProfile: TransitionEvidenceValue<number[]>;
  bassWeightProfile: TransitionEvidenceValue<number[]>;
  densityProfile: TransitionEvidenceValue<number[]>;
  brightnessProfile: TransitionEvidenceValue<number[]>;
  // Doctrine §9: without a vocal stem or a proven classifier, spectral
  // midrange activity must never be labeled definitively "vocal." This
  // build has no vocal classifier, so foreground/vocal evidence is only
  // ever populated from an actually-available CURRENT vocals stem — never
  // inferred from brightnessProfile/densityProfile alone.
  currentStemRoles: TransitionEvidenceValue<StemRole[]>;
}

export function assembleDjTransitionTrackEvidence(input: DjTransitionEvidenceTrackInput): DjTransitionTrackEvidence {
  const { track, beatMap, playbackBounds, songAnalysis, currentStemRoleAvailability, sourceFingerprint } = input;

  const durationSeconds = playbackBounds
    ? observed(playbackBounds.sourceDurationSeconds, playbackBounds.overallConfidence, playbackBounds.analyzedAt)
    : typeof track.durationSeconds === "number"
      ? observed(track.durationSeconds, 0.5, track.analysisUpdatedAt ?? null, "imported_metadata")
      : missingValue<number>();

  const bpm = typeof track.bpm === "number" ? observed(track.bpm, track.audioAnalysis?.bpmConfidence ?? 0, track.analysisUpdatedAt ?? null) : missingValue<number>();

  const tempoStability = beatMap ? observed(beatMap.tempoStabilityScore, beatMap.tempoStabilityScore, beatMap.analyzedAt) : missingValue<number>();

  const beatTrusted = isBeatMapTrustedForAnalysis(beatMap);
  const beatTimesSeconds = beatTrusted && beatMap ? observed(beatMap.beatTimesSeconds, beatMap.confidence, beatMap.analyzedAt) : missingValue<number[]>();

  const downbeatConfidenceRaw = beatMap?.confidenceComponents?.downbeatRecurrence ?? 0;
  const barGridConfidenceRaw = beatMap?.confidenceComponents?.barAlignment ?? 0;
  // §6.2 cascade rule: a beat grid without trusted downbeats permits beat
  // alignment only — bar/downbeat claims require the beat gate to have
  // already passed, on top of their own independent 0.75 gate.
  const barTrusted =
    beatTrusted &&
    downbeatConfidenceRaw >= DJ_TRANSITION_TRUST_POLICY.downbeatConfidenceForBarAlignment &&
    barGridConfidenceRaw >= DJ_TRANSITION_TRUST_POLICY.downbeatConfidenceForBarAlignment;

  const barStartTimesSeconds =
    barTrusted && beatMap ? observed(beatMap.barStartTimesSeconds, Math.min(downbeatConfidenceRaw, barGridConfidenceRaw), beatMap.analyzedAt) : missingValue<number[]>();
  const firstDownbeatSeconds =
    barTrusted && beatMap && typeof beatMap.firstDownbeatSeconds === "number"
      ? observed(beatMap.firstDownbeatSeconds, Math.min(downbeatConfidenceRaw, barGridConfidenceRaw), beatMap.analyzedAt)
      : missingValue<number>();

  const sampleRate = songAnalysis?.sampleRate ?? 0;
  const verifiedSections: TransitionSectionEvidence[] =
    sampleRate > 0
      ? (songAnalysis?.sections ?? [])
          .filter((s) => s.verification !== "provisional" && s.sourceTrackId === track.trackId)
          .map((s) => ({
            id: s.id,
            structuralType: s.structuralType,
            startSeconds: s.startFrame / sampleRate,
            endSeconds: s.endFrame / sampleRate,
            confidence: s.confidence,
            verification: s.verification,
          }))
      : [];

  // §6.2 cascade rule: a downbeat grid without phrase evidence permits bar
  // alignment only — phrase claims require barTrusted first, then their
  // own >=0.70 gate. computePhraseBoundaryScore is a best-of-4-candidate-
  // lengths heuristic (downbeatEvidence.ts) that floors around 0.75 for
  // almost any bar count by construction — it is a real, existing signal,
  // but reused alone it would make the phrase gate pass essentially
  // whenever the bar gate does, which is exactly the false-precision the
  // spec's cascade rule exists to prevent ("no phrase boundary evidence
  // anywhere" until this build, since no detector ever measured one). So
  // the heuristic alone is treated as soft, capped support only — real
  // phrase trust additionally requires at least one VERIFIED/REVIEWED
  // structural section boundary (songAnalysisTypes.ts) to land close to a
  // synthesized phrase boundary, corroborating that the bar-count grouping
  // actually lines up with something real in the arrangement.
  let phraseBoundarySeconds: TransitionEvidenceValue<number[]> = missingValue<number[]>();
  let phraseTrusted = false;
  if (barTrusted && beatMap && beatMap.barStartTimesSeconds.length >= 4) {
    const heuristicScore = computePhraseBoundaryScore(beatMap.barStartTimesSeconds.length);
    const candidates = synthesizePhraseBoundaries(beatMap.barStartTimesSeconds);
    const corroborated = hasVerifiedSectionCorroboration(candidates, verifiedSections);
    const corroborationFactor = corroborated ? 1 : 0.6;
    const phraseConfidence = Math.min(barGridConfidenceRaw, heuristicScore) * corroborationFactor;
    if (phraseConfidence >= DJ_TRANSITION_TRUST_POLICY.phraseConfidenceForPhraseAlignment) {
      phraseTrusted = true;
      phraseBoundarySeconds = inferred(candidates, phraseConfidence, beatMap.analyzedAt);
    }
  }

  const key =
    track.musicalKey && typeof track.audioAnalysis?.keyConfidence === "number"
      ? observed(track.musicalKey, track.audioAnalysis.keyConfidence, track.analysisUpdatedAt ?? null)
      : missingValue<string>();

  const energyProfile = songAnalysis?.energyProfile ? observed(songAnalysis.energyProfile.values, 0.7, songAnalysis.updatedAt) : missingValue<number[]>();
  const bassWeightProfile = songAnalysis?.bassWeightProfile ? observed(songAnalysis.bassWeightProfile.values, 0.7, songAnalysis.updatedAt) : missingValue<number[]>();
  const densityProfile = songAnalysis?.densityProfile ? observed(songAnalysis.densityProfile.values, 0.7, songAnalysis.updatedAt) : missingValue<number[]>();
  const brightnessProfile = songAnalysis?.brightnessProfile ? observed(songAnalysis.brightnessProfile.values, 0.7, songAnalysis.updatedAt) : missingValue<number[]>();

  const availableRoles = (Object.keys(currentStemRoleAvailability) as StemRole[]).filter((role) => currentStemRoleAvailability[role]);
  const currentStemRoles = availableRoles.length > 0 ? observed(availableRoles, 1, null) : missingValue<StemRole[]>();

  return {
    trackId: track.trackId,
    sourceFingerprint,
    durationSeconds,
    bpm,
    tempoStability,
    beatTimesSeconds,
    beatTrusted,
    downbeatConfidenceRaw,
    barGridConfidenceRaw,
    barStartTimesSeconds,
    firstDownbeatSeconds,
    barTrusted,
    phraseBoundarySeconds,
    phraseTrusted,
    verifiedSections,
    key,
    energyProfile,
    bassWeightProfile,
    densityProfile,
    brightnessProfile,
    currentStemRoles,
  };
}

// Bars grouped into 4/8/16/32-bar candidate phrase lengths, picking the
// grouping computePhraseBoundaryScore found closest to a clean fit against
// the track's actual bar count. Never invents a boundary between two bars
// that don't both come from the trusted bar grid.
function synthesizePhraseBoundaries(barStartTimesSeconds: number[]): number[] {
  const barCount = barStartTimesSeconds.length;
  const PHRASE_LENGTHS = [32, 16, 8, 4];
  let bestLength = 4;
  let bestCloseness = -1;
  for (const length of PHRASE_LENGTHS) {
    const remainder = barCount % length;
    const closeness = 1 - Math.min(remainder, length - remainder) / length;
    if (closeness > bestCloseness) {
      bestCloseness = closeness;
      bestLength = length;
    }
  }
  const boundaries: number[] = [];
  for (let i = 0; i < barCount; i += bestLength) {
    boundaries.push(barStartTimesSeconds[i]);
  }
  return boundaries;
}

const PHRASE_CORROBORATION_TOLERANCE_SECONDS = 1.5;

// A candidate phrase boundary is corroborated when a real, human-verified
// (or analyzer-verified-then-reviewed) structural section starts within a
// small tolerance of it — i.e. something in the actual arrangement agrees
// with the bar-count grouping, not just arithmetic.
function hasVerifiedSectionCorroboration(candidateBoundarySeconds: number[], verifiedSections: TransitionSectionEvidence[]): boolean {
  if (verifiedSections.length === 0) return false;
  return candidateBoundarySeconds.some((boundary) => verifiedSections.some((s) => Math.abs(s.startSeconds - boundary) <= PHRASE_CORROBORATION_TOLERANCE_SECONDS));
}

export interface DjTransitionPairEvidence {
  outgoing: DjTransitionTrackEvidence;
  incoming: DjTransitionTrackEvidence;
}

export function assembleDjTransitionPairEvidence(
  outgoingInput: DjTransitionEvidenceTrackInput,
  incomingInput: DjTransitionEvidenceTrackInput,
): DjTransitionPairEvidence {
  return {
    outgoing: assembleDjTransitionTrackEvidence(outgoingInput),
    incoming: assembleDjTransitionTrackEvidence(incomingInput),
  };
}
