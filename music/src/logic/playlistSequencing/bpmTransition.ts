// Canonical BPM transition distance/scoring (0713_MUSIC_Playlist_BPM_Key_
// Sequencing §7-§9). Pure, deterministic — no track/crate knowledge. Shared
// by playlist generation (playlistShapeBuilder.ts) and Playlist Analyzer
// Review (playlistAnalyzer/transitions.ts) so the two surfaces never disagree
// about what a given BPM pair means.

export type BpmTransitionRelationship = "direct" | "half_time" | "double_time" | "unknown";

export interface BpmTransitionDistance {
  directDelta?: number;
  halfTimeDelta?: number;
  doubleTimeDelta?: number;
  effectiveDelta?: number;
  relationship: BpmTransitionRelationship;
}

// Half/double-time relationships are only evaluated when BOTH values are
// trusted (§7) — an untrusted BPM shouldn't get to claim a favorable
// half/double match any more than it should claim a favorable direct one.
export function computeBpmTransitionDistance(
  fromBpm: number | undefined,
  toBpm: number | undefined,
): BpmTransitionDistance {
  if (fromBpm == null || toBpm == null) {
    return { relationship: "unknown" };
  }

  const directDelta = Math.abs(fromBpm - toBpm);
  const halfTimeDelta = Math.abs(fromBpm * 2 - toBpm);
  const doubleTimeDelta = Math.abs(fromBpm - toBpm * 2);

  // Direct continuity is preferred when comparably strong (§9 "prefer direct
  // continuity when both options are comparably strong") — only report a
  // half/double relationship when it's a MEANINGFULLY better fit than direct,
  // not just marginally so.
  const HALF_DOUBLE_PREFERENCE_MARGIN = 3; // BPM
  let relationship: BpmTransitionRelationship = "direct";
  let effectiveDelta = directDelta;

  if (halfTimeDelta + HALF_DOUBLE_PREFERENCE_MARGIN < effectiveDelta) {
    relationship = "half_time";
    effectiveDelta = halfTimeDelta;
  }
  if (doubleTimeDelta + HALF_DOUBLE_PREFERENCE_MARGIN < effectiveDelta) {
    relationship = "double_time";
    effectiveDelta = doubleTimeDelta;
  }

  return { directDelta, halfTimeDelta, doubleTimeDelta, effectiveDelta, relationship };
}

// Soft BPM-fit score (§8) — thresholds isolated here, in one place, per
// spec's explicit instruction not to scatter them across files.
const BPM_SCORE_BANDS: Array<[maxDelta: number, score: number]> = [
  [3, 1.0],
  [6, 0.9],
  [12, 0.7],
  [20, 0.35],
];
const BPM_SCORE_FLOOR = 0.05;
const NEUTRAL_SCORE = 0.5;
// Half/double matches score slightly below a comparable direct match (§9) —
// real, but not identical, continuity.
const HALF_DOUBLE_SCORE_CAP = 0.85;

export function scoreBpmTransition(distance: BpmTransitionDistance): number {
  if (distance.relationship === "unknown" || distance.effectiveDelta == null) return NEUTRAL_SCORE;

  const delta = distance.effectiveDelta;
  let score = BPM_SCORE_FLOOR;
  for (const [maxDelta, bandScore] of BPM_SCORE_BANDS) {
    if (delta <= maxDelta) { score = bandScore; break; }
  }

  if (distance.relationship === "half_time" || distance.relationship === "double_time") {
    score = Math.min(score, HALF_DOUBLE_SCORE_CAP);
  }
  return score;
}
