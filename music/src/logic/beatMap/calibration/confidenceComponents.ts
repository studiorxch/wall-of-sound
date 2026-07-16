// Beat Map Confidence Calibration — confidence decomposition (§4, §6, §17).
// Replaces the opaque single confidence number with named, reproducible
// components. This module only COMPOSES evidence already computed
// elsewhere (beatTracking/downbeatDetection/barDetection/tempoStability/
// mixRegionDetection) — it does not re-derive beat/bar/tempo evidence.

import type {
  BeatMapConfidenceComponents, BeatMapConfidenceWeights, BeatMapConfidenceAxes, BeatMapPriorAgreement, BeatMapPriorRelationship,
} from "../../../data/beatMapCalibrationTypes";
import type { TempoSegment, MixRegion, BeatMapWarningCode } from "../../../data/beatMapTypes";
import { BEAT_MAP_CONFIDENCE_WEIGHTS } from "./calibrationThresholds";

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// §17 — measures agreement between the BPM prior (the existing BPM
// detector's own result) and the grid actually built, INCLUDING half/
// double relationships. Never rewards agreement with an incorrect prior —
// it just reports what relationship (if any) holds; the caller decides
// what that means for confidence via priorAgreement's score.
export function computePriorAgreement(bpmPrior: number | undefined, gridBpm: number | undefined): BeatMapPriorAgreement {
  if (bpmPrior == null || gridBpm == null || bpmPrior <= 0 || gridBpm <= 0) {
    return { bpmPrior, gridBpm, relationship: "unknown" };
  }
  const directErrorPercent = Math.abs(gridBpm - bpmPrior) / bpmPrior * 100;
  const halfTimeErrorPercent = Math.abs(gridBpm - bpmPrior / 2) / (bpmPrior / 2) * 100;
  const doubleTimeErrorPercent = Math.abs(gridBpm - bpmPrior * 2) / (bpmPrior * 2) * 100;

  const TOLERANCE_PERCENT = 3;
  let relationship: BeatMapPriorRelationship = "disagreement";
  if (directErrorPercent <= TOLERANCE_PERCENT) relationship = "direct";
  else if (halfTimeErrorPercent <= TOLERANCE_PERCENT) relationship = "half_time";
  else if (doubleTimeErrorPercent <= TOLERANCE_PERCENT) relationship = "double_time";

  return { bpmPrior, gridBpm, directErrorPercent, halfTimeErrorPercent, doubleTimeErrorPercent, relationship };
}

function priorAgreementScore(agreement: BeatMapPriorAgreement): number {
  switch (agreement.relationship) {
    case "direct": return 1;
    case "half_time":
    case "double_time": return 0.7; // a coherent metrical relationship, just not the prior's own octave
    case "disagreement": return 0.2;
    case "unknown": return 0.5; // no prior to compare against — neutral, not penalized
  }
}

// §11 — how consistently a single tempo characterizes the track: 1.0 for
// one segment; each additional segment (beyond the first) both signals a
// real tempo change AND reduces how well "one grid" describes the whole
// track, weighted by how much of the track each additional segment covers.
export function computeSegmentConsistency(tempoSegments: TempoSegment[], durationSeconds: number): number {
  if (tempoSegments.length <= 1 || durationSeconds <= 0) return 1;
  const avgConfidence = tempoSegments.reduce((a, s) => a + s.confidence, 0) / tempoSegments.length;
  const segmentPenalty = Math.min(1, (tempoSegments.length - 1) * 0.25);
  return clamp01(avgConfidence * (1 - segmentPenalty));
}

const WARNING_PENALTY_WEIGHT: Partial<Record<BeatMapWarningCode, number>> = {
  BEAT_MAP_LOW_CONFIDENCE: 0.05, // largely redundant with total falling anyway; small additional penalty
  BEAT_MAP_BAR_ALIGNMENT_UNCERTAIN: 0.10,
  BEAT_MAP_TEMPO_DRIFT: 0.05,
  BEAT_MAP_IRREGULAR_METER: 0.15,
  BEAT_MAP_DOWNBEAT_UNCERTAIN: 0.05,
  BEAT_MAP_FIRST_BEAT_UNCERTAIN: 0.03,
};

// §4 — deterministic, reproducible from the warning list alone.
export function computeWarningPenalty(warnings: BeatMapWarningCode[]): number {
  const totalPenalty = warnings.reduce((sum, w) => sum + (WARNING_PENALTY_WEIGHT[w] ?? 0), 0);
  return clamp01(1 - Math.min(0.6, totalPenalty));
}

export interface ConfidenceComponentInputs {
  onsetStrength: number;
  onsetRegularity: number;
  beatPhaseFit: number;
  beatCoverage: number;
  beatContinuity: number;
  downbeatRecurrence: number;
  barAlignment: number;
  tempoStability: number;
  tempoSegments: TempoSegment[];
  durationSeconds: number;
  introRegion?: MixRegion;
  outroRegion?: MixRegion;
  bpmPrior?: number;
  gridBpm?: number;
  warnings: BeatMapWarningCode[];
  weights?: BeatMapConfidenceWeights;
}

// §5/§4 — the ONE place that composes the weighted total. Every component
// (and the weights themselves) stays within 0-1; weights are normalized so
// the composed total is always reproducible from `components` alone,
// independent of any drift in the weight table's own sum.
export function composeConfidenceComponents(inputs: ConfidenceComponentInputs): BeatMapConfidenceComponents {
  const weights = inputs.weights ?? BEAT_MAP_CONFIDENCE_WEIGHTS;
  const weightSum = Object.values(weights).reduce((a, b) => a + b, 0) || 1;

  const segmentConsistency = computeSegmentConsistency(inputs.tempoSegments, inputs.durationSeconds);
  const priorAgreement = priorAgreementScore(computePriorAgreement(inputs.bpmPrior, inputs.gridBpm));
  const introRegionConfidence = inputs.introRegion?.confidence ?? 0;
  const outroRegionConfidence = inputs.outroRegion?.confidence ?? 0;
  const warningPenalty = computeWarningPenalty(inputs.warnings);

  const components: Record<keyof BeatMapConfidenceWeights, number> = {
    onsetStrength: clamp01(inputs.onsetStrength),
    onsetRegularity: clamp01(inputs.onsetRegularity),
    beatPhaseFit: clamp01(inputs.beatPhaseFit),
    beatCoverage: clamp01(inputs.beatCoverage),
    beatContinuity: clamp01(inputs.beatContinuity),
    downbeatRecurrence: clamp01(inputs.downbeatRecurrence),
    barAlignment: clamp01(inputs.barAlignment),
    tempoStability: clamp01(inputs.tempoStability),
    segmentConsistency,
    introRegionConfidence,
    outroRegionConfidence,
    priorAgreement,
  };

  const weightedSum = (Object.keys(components) as Array<keyof BeatMapConfidenceWeights>)
    .reduce((sum, key) => sum + components[key] * weights[key], 0);
  const baseScore = weightedSum / weightSum;
  const total = +clamp01(baseScore * warningPenalty).toFixed(3);

  return {
    ...components,
    segmentConsistency: +segmentConsistency.toFixed(3),
    priorAgreement: +priorAgreement.toFixed(3),
    warningPenalty: +warningPenalty.toFixed(3),
    total,
  };
}

// §6 — separate axes so a weak downbeat doesn't erase a useful beat grid.
export function computeConfidenceAxes(components: BeatMapConfidenceComponents): BeatMapConfidenceAxes {
  const beatGridConfidence = +clamp01(
    (components.onsetStrength + components.onsetRegularity + components.beatPhaseFit + components.beatCoverage + components.beatContinuity) / 5,
  ).toFixed(3);
  const mixRegionConfidence = +clamp01((components.introRegionConfidence + components.outroRegionConfidence) / 2).toFixed(3);

  return {
    beatGridConfidence,
    downbeatConfidence: +components.downbeatRecurrence.toFixed(3),
    barGridConfidence: +components.barAlignment.toFixed(3),
    mixRegionConfidence,
    totalConfidence: components.total,
  };
}

// §13 — dominant failure causes: the weighted-contribution-weakest
// components, named explicitly rather than a generic "low confidence."
export function computeDominantFailureCauses(components: BeatMapConfidenceComponents, weights: BeatMapConfidenceWeights = BEAT_MAP_CONFIDENCE_WEIGHTS): string[] {
  const contributions = (Object.keys(weights) as Array<keyof BeatMapConfidenceWeights>)
    .filter((k) => k !== "warningPenalty" as never)
    .map((key) => ({ key, score: components[key], weightedGap: (1 - components[key]) * weights[key] }))
    .sort((a, b) => b.weightedGap - a.weightedGap);

  return contributions
    .filter((c) => c.score < 0.5)
    .slice(0, 3)
    .map((c) => `${c.key}: ${c.score.toFixed(2)}`);
}
