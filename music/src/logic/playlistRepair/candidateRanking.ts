// Playlist Local Repair — candidate ranking (§9, §19). Scores each searched
// candidate against BOTH neighbors using the exact same shared helpers
// 0713A's generator scoring already uses, then classifies perfect/strong/
// temporary/weak per §19's rules.

import type { Track } from "../../data/trackTypes";
import type { PlaylistRepairCandidate, PlaylistRepairZone } from "../../data/playlistRepairTypes";
import { isBpmTrustedForAnalysis, isKeyTrustedForAnalysis } from "../dspFeatureExtraction";
import { computeBpmTransitionDistance, scoreBpmTransition } from "../playlistSequencing/bpmTransition";
import { scoreKeyTransition } from "../playlistSequencing/keyTransition";
import { computeMoodContinuity } from "../playlistAnalyzer/transitions";
import { PREFERRED_TOLERANCE, ACCEPTABLE_TOLERANCE } from "../playlistEnergyEnvelope";

const RANK_WEIGHTS = { energy: 0.35, bpm: 0.25, key: 0.15, mood: 0.1, role: 0.1, duration: 0.05 };

function trustedBpm(t: Track | undefined): number | undefined {
  return t && isBpmTrustedForAnalysis(t) ? t.bpm : undefined;
}
function trustedKey(t: Track | undefined): string | undefined {
  return t && isKeyTrustedForAnalysis(t) ? (t.camelotKey as string | undefined) : undefined;
}

function bpmFitAgainst(a: number | undefined, b: number | undefined): number {
  if (a == null || b == null) return 0.5;
  return scoreBpmTransition(computeBpmTransitionDistance(a, b));
}
function keyFitAgainst(a: string | undefined, b: string | undefined): number {
  return scoreKeyTransition(a, b).score;
}

export function rankRepairCandidates(input: {
  zone: PlaylistRepairZone;
  candidates: Track[];
  previousTrack?: Track;
  currentTrack?: Track;
  nextTrack?: Track;
  targetEnergy?: number;
}): PlaylistRepairCandidate[] {
  const { candidates, previousTrack, nextTrack, currentTrack, targetEnergy } = input;
  const prevBpm = trustedBpm(previousTrack);
  const nextBpm = trustedBpm(nextTrack);
  const prevKey = trustedKey(previousTrack);
  const nextKey = trustedKey(nextTrack);
  const prevMoods = previousTrack?.moodTags ?? [];
  const nextMoods = nextTrack?.moodTags ?? [];
  const refDuration = currentTrack?.durationSeconds;

  const results: PlaylistRepairCandidate[] = candidates.map((cand) => {
    const warningCodes: string[] = [];

    // Energy fit against the zone's target (§8 step 2/§19 "section energy fit").
    let energyFit = 0.5;
    if (targetEnergy != null && typeof cand.energy === "number" && Number.isFinite(cand.energy)) {
      const dist = Math.abs(cand.energy - targetEnergy);
      energyFit = dist <= PREFERRED_TOLERANCE ? 1 : dist <= ACCEPTABLE_TOLERANCE ? 0.6 : Math.max(0, 1 - dist);
    } else if (targetEnergy != null) {
      energyFit = 0; // missing energy — weakest fit, never fabricated
    }

    const candBpm = trustedBpm(cand);
    const bpmToPrev = bpmFitAgainst(prevBpm, candBpm);
    const bpmToNext = bpmFitAgainst(candBpm, nextBpm);
    const bpmFit = (bpmToPrev + bpmToNext) / 2;
    if (candBpm == null) warningCodes.push("PLAYLIST_REPAIR_MISSING_BPM");

    const candKey = trustedKey(cand);
    const keyToPrev = keyFitAgainst(prevKey, candKey);
    const keyToNext = keyFitAgainst(candKey, nextKey);
    const keyFit = (keyToPrev + keyToNext) / 2;
    if (candKey == null) warningCodes.push("PLAYLIST_REPAIR_KEY_UNTRUSTED");
    else if (Math.min(keyToPrev, keyToNext) < 0.55) warningCodes.push("PLAYLIST_REPAIR_KEY_INCOMPATIBLE");

    const moodToPrev = computeMoodContinuity(prevMoods, cand.moodTags ?? []) ?? 0.5;
    const moodToNext = computeMoodContinuity(cand.moodTags ?? [], nextMoods) ?? 0.5;
    const moodFit = (moodToPrev + moodToNext) / 2;

    // Role fit: a lightweight proxy — does the candidate's own energy sit
    // between its neighbors in a way consistent with the zone's expected
    // direction, rather than a full role re-derivation per candidate.
    let roleFit = 0.5;
    if (typeof cand.energy === "number" && prevBpm != null) roleFit = energyFit; // fold into energy signal when no stronger evidence exists

    const durationFit = refDuration && cand.durationSeconds
      ? Math.max(0, 1 - Math.abs(cand.durationSeconds - refDuration) / Math.max(refDuration, 60))
      : 0.5;

    const totalScore =
      energyFit * RANK_WEIGHTS.energy +
      bpmFit * RANK_WEIGHTS.bpm +
      keyFit * RANK_WEIGHTS.key +
      moodFit * RANK_WEIGHTS.mood +
      roleFit * RANK_WEIGHTS.role +
      durationFit * RANK_WEIGHTS.duration;

    const hasRed = energyFit === 0 || bpmFit <= 0.1 || (candKey != null && Math.min(keyToPrev, keyToNext) < 0.15);
    const hasYellow = warningCodes.length > 0 || energyFit < 0.6 || bpmFit < 0.7 || keyFit < 0.6;

    const classification: PlaylistRepairCandidate["classification"] = hasRed
      ? "weak_match"
      : !hasYellow
      ? "perfect_match"
      : totalScore >= 0.55
      ? "strong_match"
      : "temporary_match";

    return {
      trackId: cand.trackId,
      rank: 0,
      classification,
      previousTransitionScore: previousTrack ? (bpmToPrev + keyToPrev) / 2 : undefined,
      nextTransitionScore: nextTrack ? (bpmToNext + keyToNext) / 2 : undefined,
      energyFit, bpmFit, keyFit, moodFit, roleFit, durationFit,
      totalScore: +totalScore.toFixed(3),
      warningCodes,
      explanation: `energy ${energyFit.toFixed(2)} · bpm ${bpmFit.toFixed(2)} · key ${keyFit.toFixed(2)} · mood ${moodFit.toFixed(2)}`,
    };
  });

  results.sort((a, b) => b.totalScore - a.totalScore);
  results.forEach((r, i) => { r.rank = i + 1; });
  return results;
}
