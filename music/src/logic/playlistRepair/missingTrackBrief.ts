// Playlist Local Repair — missing-track brief (§12). Generated when no
// perfect/strong candidate exists — describes what the library is missing,
// derived from the zone's real neighbor context, never invented from
// nothing.

import type { Track } from "../../data/trackTypes";
import type { MissingTrackBrief, PlaylistRepairZone } from "../../data/playlistRepairTypes";
import { isBpmTrustedForAnalysis, isKeyTrustedForAnalysis } from "../dspFeatureExtraction";
import { computeBpmTransitionDistance } from "../playlistSequencing/bpmTransition";

function midpointRange(a: number, b: number, spread: number): [number, number] {
  const mid = (a + b) / 2;
  return [+(mid - spread).toFixed(2), +(mid + spread).toFixed(2)];
}

export function buildMissingTrackBrief(input: {
  playlistId: string;
  zone: PlaylistRepairZone;
  previousTrack?: Track;
  nextTrack?: Track;
  role: string;
  targetEnergy?: number;
  searchedCandidateCount: number;
}): MissingTrackBrief {
  const { playlistId, zone, previousTrack, nextTrack, role, targetEnergy, searchedCandidateCount } = input;

  const prevBpm = previousTrack && isBpmTrustedForAnalysis(previousTrack) ? previousTrack.bpm : undefined;
  const nextBpm = nextTrack && isBpmTrustedForAnalysis(nextTrack) ? nextTrack.bpm : undefined;
  const prevKey = previousTrack && isKeyTrustedForAnalysis(previousTrack) ? (previousTrack.camelotKey as string | undefined) : undefined;
  const nextKey = nextTrack && isKeyTrustedForAnalysis(nextTrack) ? (nextTrack.camelotKey as string | undefined) : undefined;

  let preferredBpmRange: [number, number] | undefined;
  let acceptableBpmRange: [number, number] | undefined;
  let halfDoubleAllowed = false;
  if (prevBpm != null && nextBpm != null) {
    preferredBpmRange = midpointRange(prevBpm, nextBpm, 4);
    acceptableBpmRange = midpointRange(prevBpm, nextBpm, 10);
    const dist = computeBpmTransitionDistance(prevBpm, nextBpm);
    halfDoubleAllowed = dist.relationship === "half_time" || dist.relationship === "double_time";
  } else if (prevBpm != null) {
    preferredBpmRange = [prevBpm - 4, prevBpm + 4];
    acceptableBpmRange = [prevBpm - 10, prevBpm + 10];
  } else if (nextBpm != null) {
    preferredBpmRange = [nextBpm - 4, nextBpm + 4];
    acceptableBpmRange = [nextBpm - 10, nextBpm + 10];
  }

  const preferredCamelotKeys = [prevKey, nextKey].filter((k): k is string => k != null);
  const acceptableCamelotKeys = [...preferredCamelotKeys]; // conservative — no adjacency expansion without a stronger signal

  const requiredMoods = [...new Set([...(previousTrack?.moodTags ?? []), ...(nextTrack?.moodTags ?? [])])].slice(0, 3);

  const energyDirection = previousTrack?.energy != null && nextTrack?.energy != null
    ? (nextTrack.energy > previousTrack.energy ? "rising" : nextTrack.energy < previousTrack.energy ? "falling" : "stable")
    : undefined;

  return {
    id: `brief_${zone.issueId}`,
    playlistId,
    sectionId: zone.sectionId,
    positionBetween: [zone.previousPosition ?? null, zone.nextPosition ?? null],
    role,
    energy: {
      preferredRange: targetEnergy != null ? [+(targetEnergy - 0.06).toFixed(2), +(targetEnergy + 0.06).toFixed(2)] : undefined,
      direction: energyDirection,
    },
    tempo: { preferredBpmRange, acceptableBpmRange, halfDoubleAllowed },
    harmony: { preferredCamelotKeys, acceptableCamelotKeys },
    moods: { required: requiredMoods, optional: [], avoid: [] },
    purpose: `No perfect or strong candidate found among ${searchedCandidateCount} searched — this brief describes what the library needs at position ${zone.targetPosition + 1} to close the gap.`,
    confidence: prevBpm != null && nextBpm != null ? 0.7 : 0.4,
  };
}
