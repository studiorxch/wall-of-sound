// Multi-Length Loop Candidate Generation and Preview Reliability
// (0714P_MUSIC_..._v1.0.0 §11). Pure. Ranks candidates using only
// STRUCTURAL signals available at generation time (grid trust, tempo
// stability, bar-length appropriateness, position, uniqueness against
// higher-ranked candidates) — the real, audio-evidence-based seamlessness
// score from loopSeamlessness.ts still only runs once at approval time
// (0714N/0714O), never duplicated or faked here. §11: "do not rank
// uniqueness from spectral centroid alone" — uniqueness here is boundary
// (start-time) separation, one deliberately simple, honest signal, not a
// spectral analysis this build was never asked to add.

import type { LoopCandidateScore } from "../../data/loopTypes";

export interface RankableCandidateInput {
  startSeconds: number;
  barCount?: number;
  gridTrusted: boolean;
  provisional: boolean;
  tempoStabilityScore?: number;
}

// §12 — length-specific expectations: 8/16 bars are the primary sweet spot;
// 4 is a short fragment, 32/64 need more sustained stability to be useful.
const BAR_USABILITY: Record<number, number> = { 4: 0.6, 8: 1.0, 16: 0.95, 32: 0.75, 64: 0.55 };

export function scoreLoopCandidate(
  input: RankableCandidateInput,
  higherRankedStartTimes: readonly number[],
): LoopCandidateScore {
  const boundaryConfidence = input.gridTrusted ? 1 : input.provisional ? 0.55 : 0.25;
  const tempoStability = input.tempoStabilityScore ?? (input.gridTrusted ? 0.8 : 0.4);
  // Structural-only proxy — never a substitute for the real, audio-evidence
  // seamlessness score computed at approval time.
  const seamlessness = boundaryConfidence;
  const sectionStability = tempoStability;
  const repetitionStrength = input.gridTrusted ? 0.7 : 0.4;
  const usability = input.barCount != null ? (BAR_USABILITY[input.barCount] ?? 0.5) : 0.5;

  // Uniqueness: penalize candidates whose start time sits close to an
  // already-higher-ranked candidate's start (redundant near-duplicates),
  // reward clear separation.
  const minSeparation = higherRankedStartTimes.length
    ? Math.min(...higherRankedStartTimes.map((t) => Math.abs(t - input.startSeconds)))
    : Infinity;
  const uniqueness = minSeparation === Infinity ? 1 : Math.min(1, minSeparation / 16);

  const total = (
    seamlessness * 0.2 +
    sectionStability * 0.15 +
    boundaryConfidence * 0.2 +
    tempoStability * 0.1 +
    repetitionStrength * 0.1 +
    uniqueness * 0.1 +
    usability * 0.15
  );

  return { seamlessness, sectionStability, boundaryConfidence, tempoStability, repetitionStrength, uniqueness, usability, total };
}

// §10 — rank a pool for one (section, length) group and keep only the top N,
// selecting greedily so uniqueness is computed against ALREADY-CHOSEN
// higher-ranked candidates, not the whole pool at once.
export function rankAndLimitCandidates<T extends RankableCandidateInput>(
  pool: T[],
  maxVisible: number,
): { candidate: T; score: LoopCandidateScore; rank: number }[] {
  const remaining = [...pool];
  const chosen: { candidate: T; score: LoopCandidateScore; rank: number }[] = [];
  while (remaining.length && chosen.length < maxVisible) {
    const chosenStarts = chosen.map((c) => c.candidate.startSeconds);
    let bestIdx = 0;
    let bestScore: LoopCandidateScore | null = null;
    for (let i = 0; i < remaining.length; i++) {
      const score = scoreLoopCandidate(remaining[i], chosenStarts);
      if (!bestScore || score.total > bestScore.total) {
        bestScore = score;
        bestIdx = i;
      }
    }
    if (!bestScore) break;
    chosen.push({ candidate: remaining[bestIdx], score: bestScore, rank: chosen.length + 1 });
    remaining.splice(bestIdx, 1);
  }
  return chosen;
}
