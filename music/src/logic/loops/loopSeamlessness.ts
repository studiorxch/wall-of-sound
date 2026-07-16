// Sectional Looper and Loop Library — seamlessness scoring (§11, §12).
// Pure decision logic only: given already-computed 0..1 evidence values,
// combine them into a composite score/confidence and named warnings. Never
// claims seamlessness from grid alignment alone (§11) — gridAlignment is
// one of seven weighted inputs, not a standalone pass/fail gate.

import type { LoopSeamlessnessEvidence, LoopSeamlessnessResult, LoopWarningCode } from "../../data/loopTypes";

const MIN_LOOP_SECONDS = 1;
const MAX_LOOP_SECONDS = 64;

// Weights sum to 1; boundaryTransientPenalty is subtracted, not averaged in,
// since it represents an audible defect rather than a quality dimension.
const WEIGHTS = {
  waveformMatch: 0.22,
  rmsMatch: 0.14,
  spectralMatch: 0.18,
  zeroCrossingFit: 0.12,
  gridAlignment: 0.14,
  tempoStability: 0.20,
};

export function scoreLoopSeamlessness(
  evidence: LoopSeamlessnessEvidence,
  durationSeconds: number,
  tempoStableOverBounds: boolean,
): LoopSeamlessnessResult {
  const weightedScore =
    evidence.waveformMatch * WEIGHTS.waveformMatch +
    evidence.rmsMatch * WEIGHTS.rmsMatch +
    evidence.spectralMatch * WEIGHTS.spectralMatch +
    evidence.zeroCrossingFit * WEIGHTS.zeroCrossingFit +
    evidence.gridAlignment * WEIGHTS.gridAlignment +
    evidence.tempoStability * WEIGHTS.tempoStability;

  const score = clamp01(weightedScore - evidence.boundaryTransientPenalty * 0.5);
  // Confidence reflects how much evidence agrees with itself — a single
  // strong dimension propping up an otherwise weak set is less trustworthy
  // than uniformly moderate evidence.
  const values = [
    evidence.waveformMatch, evidence.rmsMatch, evidence.spectralMatch,
    evidence.zeroCrossingFit, evidence.gridAlignment, evidence.tempoStability,
  ];
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
  const confidence = clamp01(mean - Math.sqrt(variance));

  const warnings: LoopWarningCode[] = [];
  if (evidence.boundaryTransientPenalty > 0.35) warnings.push("LOOP_ENDPOINT_DISCONTINUITY");
  if (!tempoStableOverBounds || evidence.tempoStability < 0.5) warnings.push("LOOP_TEMPO_UNSTABLE");
  if (durationSeconds < MIN_LOOP_SECONDS) warnings.push("LOOP_TOO_SHORT");
  if (durationSeconds > MAX_LOOP_SECONDS) warnings.push("LOOP_TOO_LONG");
  if (evidence.gridAlignment < 0.4) warnings.push("LOOP_GRID_UNTRUSTED");

  return { score, confidence, evidence, warnings };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
