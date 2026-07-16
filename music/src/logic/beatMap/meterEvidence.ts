// Downbeat and Bar Grid Calibration — meter evidence (§10). Supports 4/4
// first, but evaluates candidate meters explicitly rather than assuming
// every track is 4/4 without evidence. Does not force 4/4 when recurrence
// strongly disagrees.

import type { MeterEvidence, MeterCandidate } from "../../data/downbeatBarTypes";
import { evaluatePhaseCandidates } from "./downbeatPhaseCandidates";

const METER_CANDIDATES: { beatsPerBar: number; meter: MeterCandidate }[] = [
  { beatsPerBar: 4, meter: "4/4" },
  { beatsPerBar: 3, meter: "3/4" },
  { beatsPerBar: 6, meter: "6/8" },
];

const FOUR_FOUR_PRIOR_BONUS = 0.05; // "support 4/4 first" — a small tie-breaking preference, not a forced default
const MIN_METER_CONFIDENCE = 0.4;

export function evaluateMeter(mono: Float32Array, sampleRate: number, beatTimesSeconds: number[]): MeterEvidence {
  const candidateScoresByMeter: Record<number, number> = {};
  let bestMeter: MeterCandidate = "unknown";
  let bestScore = -Infinity;

  for (const { beatsPerBar, meter } of METER_CANDIDATES) {
    const candidates = evaluatePhaseCandidates(mono, sampleRate, beatTimesSeconds, beatsPerBar);
    const topScore = candidates.length > 0 ? Math.max(...candidates.map((c) => c.totalScore)) : 0;
    candidateScoresByMeter[beatsPerBar] = +topScore.toFixed(3);
    const prioritized = topScore + (beatsPerBar === 4 ? FOUR_FOUR_PRIOR_BONUS : 0);
    if (prioritized > bestScore) { bestScore = prioritized; bestMeter = meter; }
  }

  const rawBest = candidateScoresByMeter[
    METER_CANDIDATES.find((m) => m.meter === bestMeter)?.beatsPerBar ?? 4
  ] ?? 0;

  const meter = rawBest >= MIN_METER_CONFIDENCE ? bestMeter : "unknown";
  const meterConfidence = +Math.max(0, Math.min(1, rawBest)).toFixed(3);

  return { meter, meterConfidence, candidateScoresByMeter };
}
