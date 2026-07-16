// Downbeat and Bar Grid Calibration — combines multi-phase candidates into
// bar-grid confidence and downbeat confidence (§8, §9). A near-tie must
// remain uncertain — margin and stability matter as much as the raw score.

import type {
  DownbeatPhaseCandidate, BarGridConfidence, DownbeatConfidence,
} from "../../data/downbeatBarTypes";

const MARGIN_THRESHOLD = 0.15; // below this, treat the top-2 candidates as ambiguous
const MIN_SELECTION_SCORE = 0.45; // never select a phase whose absolute evidence is this weak, even if it "wins"

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export interface BarGridResult {
  barGridConfidence: BarGridConfidence;
  downbeatConfidence: DownbeatConfidence;
  selectedPhaseIndex?: number;
  ambiguous: boolean;
}

export function combinePhaseCandidates(candidates: DownbeatPhaseCandidate[], fullTrackCoverage: number): BarGridResult {
  if (candidates.length === 0) {
    return {
      barGridConfidence: { bestPhaseScore: 0, secondBestPhaseScore: 0, margin: 0, phaseStability: 0, fullTrackCoverage: 0, ambiguity: 1, total: 0 },
      downbeatConfidence: { accentEvidence: 0, recurrenceEvidence: 0, structuralEvidence: 0, harmonicEvidence: 0, phraseEvidence: 0, ambiguityPenalty: 1, total: 0 },
      ambiguous: true,
    };
  }

  const sorted = [...candidates].sort((a, b) => b.totalScore - a.totalScore);
  const best = sorted[0];
  const secondBest = sorted[1];
  const margin = secondBest ? best.totalScore - secondBest.totalScore : best.totalScore;
  const ambiguity = clamp01(1 - margin / MARGIN_THRESHOLD);
  const ambiguous = margin < MARGIN_THRESHOLD || best.totalScore < MIN_SELECTION_SCORE;

  const phaseStability = best.consistencyScore;
  const total = clamp01(best.totalScore * (1 - ambiguity * 0.5) * clamp01(0.5 + 0.5 * fullTrackCoverage));

  const barGridConfidence: BarGridConfidence = {
    bestPhaseScore: best.totalScore,
    secondBestPhaseScore: secondBest?.totalScore ?? 0,
    margin: +margin.toFixed(3),
    phaseStability,
    fullTrackCoverage: +fullTrackCoverage.toFixed(3),
    ambiguity: +ambiguity.toFixed(3),
    total: +total.toFixed(3),
  };

  const accentEvidence = +((best.lowBandAccentScore + best.broadbandAccentScore) / 2).toFixed(3);
  const downbeatTotal = clamp01(best.totalScore * (1 - ambiguity * 0.5));

  const downbeatConfidence: DownbeatConfidence = {
    selectedPhase: ambiguous ? undefined : best.phaseIndex,
    accentEvidence,
    recurrenceEvidence: best.recurrenceScore,
    structuralEvidence: best.structuralChangeScore,
    harmonicEvidence: best.harmonicChangeScore,
    phraseEvidence: best.phraseBoundaryScore,
    ambiguityPenalty: +ambiguity.toFixed(3),
    total: +downbeatTotal.toFixed(3),
  };

  return {
    barGridConfidence, downbeatConfidence,
    selectedPhaseIndex: ambiguous ? undefined : best.phaseIndex,
    ambiguous,
  };
}
