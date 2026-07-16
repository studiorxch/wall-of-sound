// Downbeat and Bar Grid Calibration — multi-candidate phase evaluation
// (§5, §6, §14). ONE centralized weight configuration (§14) — do not
// scatter weights across modules.

import type { DownbeatPhaseCandidate } from "../../data/downbeatBarTypes";
import { computeLowBandEnvelope, computeOnsetEnvelope } from "./onsetEnvelope";
import {
  rawAccentForPhase, computeRecurrenceAndConsistency, computeStructuralChangePoints,
  computeStructuralChangeScore, computeHarmonicChangeScore, computePhraseBoundaryScore, type EnvelopeHandle,
} from "./downbeatEvidence";
import { computeBarRecurrenceEvidence } from "./barRecurrence";

// §14 — initial conceptual weighting, kept as one source of truth.
export const DOWNBEAT_CANDIDATE_WEIGHTS = {
  lowBandAccentScore: 0.25,
  broadbandAccentScore: 0.10,
  recurrenceScore: 0.25,
  structuralChangeScore: 0.15,
  harmonicChangeScore: 0.10,
  phraseBoundaryScore: 0.10,
  consistencyScore: 0.05,
};

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function normalize(values: number[]): number[] {
  const max = Math.max(...values, 1e-9);
  return values.map((v) => clamp01(v / max));
}

export function evaluatePhaseCandidates(
  mono: Float32Array,
  sampleRate: number,
  beatTimesSeconds: number[],
  beatsPerBar: number,
): DownbeatPhaseCandidate[] {
  if (beatTimesSeconds.length < beatsPerBar * 2) return [];

  const lowBand: EnvelopeHandle = computeLowBandEnvelope(mono, sampleRate);
  const broadband: EnvelopeHandle = computeOnsetEnvelope(mono, sampleRate);
  const structuralChangePoints = computeStructuralChangePoints(broadband);

  // Raw per-phase accent (summed across every bar, §6 "evaluate the full
  // stable region" — never just the first bar).
  const lowBandRawByPhase: number[][] = [];
  const broadbandRawByPhase: number[][] = [];
  for (let phase = 0; phase < beatsPerBar; phase++) {
    lowBandRawByPhase.push(rawAccentForPhase(lowBand, beatTimesSeconds, phase, beatsPerBar));
    broadbandRawByPhase.push(rawAccentForPhase(broadband, beatTimesSeconds, phase, beatsPerBar));
  }

  // §7 — "do not assume the loudest low-frequency hit is always beat one":
  // normalize each phase's MEAN low-band/broadband accent relative to the
  // strongest phase, rather than any single frame's raw magnitude.
  const lowBandMeans = lowBandRawByPhase.map((vals) => vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length));
  const broadbandMeans = broadbandRawByPhase.map((vals) => vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length));
  const lowBandNormalized = normalize(lowBandMeans);
  const broadbandNormalized = normalize(broadbandMeans);

  // False-reset evidence: for each bar, does some OTHER phase consistently
  // outscore this one? Needs all phases' raw values together.
  const barCount = Math.min(...lowBandRawByPhase.map((v) => v.length));
  const falseResetPenaltyByPhase = lowBandRawByPhase.map((thisPhaseVals, phase) => {
    if (barCount === 0) return 0;
    let outscored = 0;
    for (let bar = 0; bar < barCount; bar++) {
      const thisVal = thisPhaseVals[bar] ?? 0;
      const beatenByOther = lowBandRawByPhase.some((otherVals, otherPhase) => otherPhase !== phase && (otherVals[bar] ?? 0) > thisVal * 1.5);
      if (beatenByOther) outscored++;
    }
    return barCount > 0 ? outscored / barCount : 0;
  });

  const candidates: DownbeatPhaseCandidate[] = [];
  for (let phase = 0; phase < beatsPerBar; phase++) {
    const { recurrenceScore, consistencyScore } = computeRecurrenceAndConsistency(lowBandRawByPhase[phase]);
    const barRecurrence = computeBarRecurrenceEvidence(lowBand, beatTimesSeconds, phase, beatsPerBar);
    const structuralChangeScore = computeStructuralChangeScore(structuralChangePoints, beatTimesSeconds, phase, beatsPerBar);
    const phraseBoundaryScore = computePhraseBoundaryScore(barCount);
    const harmonicChangeScore = computeHarmonicChangeScore();

    // Recurrence combines the phase's own periodicity evidence with the
    // bar-recurrence penalties (missing bars / false resets).
    const combinedRecurrence = clamp01(
      recurrenceScore * (1 - barRecurrence.missingBarPenalty * 0.5) * (1 - falseResetPenaltyByPhase[phase] * 0.5),
    );

    const lowBandAccentScore = lowBandNormalized[phase];
    const broadbandAccentScore = broadbandNormalized[phase];

    const totalScore = clamp01(
      lowBandAccentScore * DOWNBEAT_CANDIDATE_WEIGHTS.lowBandAccentScore +
      broadbandAccentScore * DOWNBEAT_CANDIDATE_WEIGHTS.broadbandAccentScore +
      combinedRecurrence * DOWNBEAT_CANDIDATE_WEIGHTS.recurrenceScore +
      structuralChangeScore * DOWNBEAT_CANDIDATE_WEIGHTS.structuralChangeScore +
      harmonicChangeScore * DOWNBEAT_CANDIDATE_WEIGHTS.harmonicChangeScore +
      phraseBoundaryScore * DOWNBEAT_CANDIDATE_WEIGHTS.phraseBoundaryScore +
      consistencyScore * DOWNBEAT_CANDIDATE_WEIGHTS.consistencyScore,
    );

    candidates.push({
      phaseIndex: phase,
      beatsPerBar,
      lowBandAccentScore: +lowBandAccentScore.toFixed(3),
      broadbandAccentScore: +broadbandAccentScore.toFixed(3),
      recurrenceScore: +combinedRecurrence.toFixed(3),
      structuralChangeScore: +structuralChangeScore.toFixed(3),
      harmonicChangeScore: +harmonicChangeScore.toFixed(3),
      phraseBoundaryScore: +phraseBoundaryScore.toFixed(3),
      consistencyScore: +consistencyScore.toFixed(3),
      ambiguityPenalty: 0, // filled in by barGridConfidence.ts once all candidates are compared
      totalScore: +totalScore.toFixed(3),
    });
  }

  // ambiguityPenalty per-candidate: distance from the best candidate,
  // normalized — 0 for the winner, higher for weaker alternatives.
  const best = Math.max(...candidates.map((c) => c.totalScore), 1e-9);
  for (const c of candidates) c.ambiguityPenalty = +clamp01((best - c.totalScore) / best).toFixed(3);

  return candidates;
}
