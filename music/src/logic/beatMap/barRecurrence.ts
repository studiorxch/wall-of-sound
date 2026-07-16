// Downbeat and Bar Grid Calibration — bar recurrence evidence (§7 "Bar
// recurrence evidence" / BarRecurrenceEvidence). A candidate phase must
// remain credible across MANY bars, not merely one short region.

import type { BarRecurrenceEvidence } from "../../data/downbeatBarTypes";
import { rawAccentForPhase, type EnvelopeHandle } from "./downbeatEvidence";

export function computeBarRecurrenceEvidence(
  env: EnvelopeHandle,
  beatTimesSeconds: number[],
  phaseIndex: number,
  beatsPerBar: number,
): BarRecurrenceEvidence {
  const perBarValues = rawAccentForPhase(env, beatTimesSeconds, phaseIndex, beatsPerBar);
  if (perBarValues.length === 0) {
    return { periodicityScore: 0, candidatePhaseConsistency: 0, missingBarPenalty: 1, falseResetPenalty: 0 };
  }

  const mean = perBarValues.reduce((a, b) => a + b, 0) / perBarValues.length;
  const std = Math.sqrt(perBarValues.reduce((a, b) => a + (b - mean) ** 2, 0) / perBarValues.length);
  const periodicityScore = mean > 0 ? Math.max(0, Math.min(1, 1 - std / mean)) : 0;

  // A bar is "missing" when its accent falls far below the track's own
  // average for this phase — i.e. this bar doesn't support the phase at all.
  const missingBars = perBarValues.filter((v) => mean > 0 && v < mean * 0.25).length;
  const missingBarPenalty = perBarValues.length > 0 ? missingBars / perBarValues.length : 1;

  return {
    periodicityScore: +periodicityScore.toFixed(3),
    candidatePhaseConsistency: +periodicityScore.toFixed(3),
    missingBarPenalty: +missingBarPenalty.toFixed(3),
    // False-reset evidence needs every phase's per-bar values at once (is
    // some OTHER phase consistently louder in the same bar?) — computed at
    // the candidate-comparison level in downbeatPhaseCandidates.ts, where
    // all phases are already available together, rather than duplicating
    // that scan here per-phase.
    falseResetPenalty: 0,
  };
}
