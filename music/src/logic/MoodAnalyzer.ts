// Deterministic mood vector scoring (0708_MUSIC_AnalyzableMoodVectorScoring_v1.1.0)
// 25-profile weighted Manhattan distance classifier + collision audit.

// ── Types ─────────────────────────────────────────────────────────────────────

export type MoodQuadrant =
  | "high_arousal_low_valence"
  | "low_arousal_low_valence"
  | "low_arousal_high_valence"
  | "high_arousal_high_valence"
  | "structural_texture";

export interface AudioFeatureVector {
  bpmDensity: number;  // 0–1  tempo + transient pacing
  rmsEnergy: number;   // 0–1  physical power / loudness
  brightness: number;  // 0–1  spectral centroid (high-freq center)
  bandwidth: number;   // 0–1  spectral bandwidth (freq spread)
  texture: number;     // 0–1  zero-crossing rate (noise vs smooth)
  valence: number;     // 0–1  structural/harmonic emotional positivity
}

export type MoodFeatureWeights = AudioFeatureVector;

export interface MoodProfile {
  name: string;
  quadrant: MoodQuadrant;
  group: string;
  target: AudioFeatureVector;
}

export interface MoodScore {
  mood: string;
  quadrant: MoodQuadrant;
  group: string;
  distance: number;
  normalizedDistance: number;
  confidence: number;
}

export interface MoodAssignment {
  approvedMoods: string[];
  suggestedMoods: string[];
  scores: MoodScore[];
}

export interface MoodProfileDistanceCell {
  moodA: string;
  moodB: string;
  distance: number;
  normalizedDistance: number;
}

export interface MoodProfileCollision {
  moodA: string;
  moodB: string;
  quadrantA: MoodQuadrant;
  quadrantB: MoodQuadrant;
  groupA: string;
  groupB: string;
  distance: number;
  normalizedDistance: number;
  severity: "expected_close" | "review" | "dangerous";
  reason: string;
}

// ── Default weights ───────────────────────────────────────────────────────────

export const DEFAULT_WEIGHTS: MoodFeatureWeights = {
  bpmDensity: 1.0,
  rmsEnergy: 1.0,
  brightness: 1.0,
  bandwidth: 1.0,
  texture: 1.0,
  valence: 1.0,  // reduced from 1.2 — minor-key Camelot inference over-pushed dark moods
};

// Applied to Balanced's confidence in assignMoodTags to prevent center-gravity dominance.
export const BALANCED_PRIMARY_PENALTY = 0.06;
// Applied to Tense only when it ranks #1 with a small margin — reduces possible_overtense
// without suppressing Tense in secondary/suggestion positions.
export const TENSE_PRIMARY_PENALTY = 0.025;
const TENSE_PRIMARY_MARGIN_THRESHOLD = 0.08;

// ── 25 baseline mood profiles ─────────────────────────────────────────────────

export const BASELINE_MOOD_PROFILES: MoodProfile[] = [
  // High Arousal / Low Valence
  { name: "Aggressive", quadrant: "high_arousal_low_valence",  group: "intense",    target: { bpmDensity: 0.70, rmsEnergy: 0.85, brightness: 0.60, bandwidth: 0.75, texture: 0.65, valence: 0.25 } },
  { name: "Frantic",    quadrant: "high_arousal_low_valence",  group: "intense",    target: { bpmDensity: 0.90, rmsEnergy: 0.70, brightness: 0.70, bandwidth: 0.60, texture: 0.75, valence: 0.35 } },
  { name: "Menacing",   quadrant: "high_arousal_low_valence",  group: "dark",       target: { bpmDensity: 0.50, rmsEnergy: 0.80, brightness: 0.30, bandwidth: 0.65, texture: 0.50, valence: 0.20 } },
  { name: "Tense",      quadrant: "high_arousal_low_valence",  group: "dark",       target: { bpmDensity: 0.62, rmsEnergy: 0.56, brightness: 0.58, bandwidth: 0.42, texture: 0.68, valence: 0.28 } },

  // Low Arousal / Low Valence
  { name: "Melancholy", quadrant: "low_arousal_low_valence",   group: "somber",     target: { bpmDensity: 0.35, rmsEnergy: 0.30, brightness: 0.40, bandwidth: 0.45, texture: 0.25, valence: 0.30 } },
  { name: "Somber",     quadrant: "low_arousal_low_valence",   group: "somber",     target: { bpmDensity: 0.25, rmsEnergy: 0.20, brightness: 0.25, bandwidth: 0.40, texture: 0.20, valence: 0.20 } },
  { name: "Haunting",   quadrant: "low_arousal_low_valence",   group: "dark",       target: { bpmDensity: 0.24, rmsEnergy: 0.22, brightness: 0.62, bandwidth: 0.58, texture: 0.32, valence: 0.28 } },
  { name: "Subdued",    quadrant: "low_arousal_low_valence",   group: "somber",     target: { bpmDensity: 0.45, rmsEnergy: 0.25, brightness: 0.30, bandwidth: 0.35, texture: 0.20, valence: 0.45 } },

  // Low Arousal / High Valence
  { name: "Chill",      quadrant: "low_arousal_high_valence",  group: "warm",       target: { bpmDensity: 0.45, rmsEnergy: 0.40, brightness: 0.45, bandwidth: 0.55, texture: 0.30, valence: 0.65 } },
  { name: "Calm",       quadrant: "low_arousal_high_valence",  group: "warm",       target: { bpmDensity: 0.35, rmsEnergy: 0.25, brightness: 0.40, bandwidth: 0.40, texture: 0.15, valence: 0.70 } },
  { name: "Dreamy",     quadrant: "low_arousal_high_valence",  group: "spatial",    target: { bpmDensity: 0.40, rmsEnergy: 0.35, brightness: 0.65, bandwidth: 0.70, texture: 0.25, valence: 0.65 } },
  { name: "Peaceful",   quadrant: "low_arousal_high_valence",  group: "warm",       target: { bpmDensity: 0.30, rmsEnergy: 0.30, brightness: 0.45, bandwidth: 0.50, texture: 0.20, valence: 0.80 } },
  { name: "Intimate",   quadrant: "low_arousal_high_valence",  group: "warm",       target: { bpmDensity: 0.35, rmsEnergy: 0.20, brightness: 0.40, bandwidth: 0.25, texture: 0.30, valence: 0.60 } },
  { name: "Nostalgic",  quadrant: "low_arousal_high_valence",  group: "warm",       target: { bpmDensity: 0.40, rmsEnergy: 0.35, brightness: 0.35, bandwidth: 0.50, texture: 0.40, valence: 0.55 } },
  { name: "Weightless", quadrant: "low_arousal_high_valence",  group: "spatial",    target: { bpmDensity: 0.10, rmsEnergy: 0.20, brightness: 0.35, bandwidth: 0.50, texture: 0.15, valence: 0.60 } },

  // High Arousal / High Valence
  { name: "Energetic",  quadrant: "high_arousal_high_valence", group: "uplift",     target: { bpmDensity: 0.75, rmsEnergy: 0.75, brightness: 0.65, bandwidth: 0.60, texture: 0.45, valence: 0.75 } },
  { name: "Joyful",     quadrant: "high_arousal_high_valence", group: "uplift",     target: { bpmDensity: 0.70, rmsEnergy: 0.70, brightness: 0.75, bandwidth: 0.65, texture: 0.40, valence: 0.90 } },
  { name: "Playful",    quadrant: "high_arousal_high_valence", group: "uplift",     target: { bpmDensity: 0.65, rmsEnergy: 0.55, brightness: 0.70, bandwidth: 0.50, texture: 0.60, valence: 0.80 } },
  { name: "Hopeful",    quadrant: "high_arousal_high_valence", group: "uplift",     target: { bpmDensity: 0.60, rmsEnergy: 0.60, brightness: 0.60, bandwidth: 0.70, texture: 0.30, valence: 0.80 } },

  // Structural / Texture Axis
  { name: "Experimental", quadrant: "structural_texture",      group: "textural",   target: { bpmDensity: 0.55, rmsEnergy: 0.50, brightness: 0.55, bandwidth: 0.80, texture: 0.70, valence: 0.50 } },
  { name: "Ambient",      quadrant: "structural_texture",      group: "spatial",    target: { bpmDensity: 0.20, rmsEnergy: 0.25, brightness: 0.40, bandwidth: 0.65, texture: 0.20, valence: 0.50 } },
  { name: "Futuristic",   quadrant: "structural_texture",      group: "textural",   target: { bpmDensity: 0.60, rmsEnergy: 0.55, brightness: 0.80, bandwidth: 0.30, texture: 0.40, valence: 0.50 } },
  { name: "Raw",          quadrant: "structural_texture",      group: "textural",   target: { bpmDensity: 0.65, rmsEnergy: 0.75, brightness: 0.50, bandwidth: 0.85, texture: 0.70, valence: 0.40 } },
  { name: "Balanced",     quadrant: "structural_texture",      group: "neutral",    target: { bpmDensity: 0.50, rmsEnergy: 0.50, brightness: 0.50, bandwidth: 0.50, texture: 0.50, valence: 0.50 } },
  { name: "Hypnotic",     quadrant: "structural_texture",      group: "neutral",    target: { bpmDensity: 0.62, rmsEnergy: 0.42, brightness: 0.42, bandwidth: 0.48, texture: 0.34, valence: 0.44 } },
];

// ── Known sibling pairs (expected close, not treated as failures) ─────────────

export const EXPECTED_CLOSE_MOOD_PAIRS: [string, string][] = [
  ["Calm", "Peaceful"],
  ["Melancholy", "Somber"],
  ["Dreamy", "Ambient"],
  ["Tense", "Menacing"],
  ["Energetic", "Joyful"],
  ["Raw", "Experimental"],
  ["Chill", "Nostalgic"],
  ["Calm", "Subdued"],
];

function isSiblingPair(a: string, b: string): boolean {
  return EXPECTED_CLOSE_MOOD_PAIRS.some(
    ([x, y]) => (x === a && y === b) || (x === b && y === a),
  );
}

// ── Distance helpers ──────────────────────────────────────────────────────────

export function calculateMoodProfileDistance(
  profileA: MoodProfile,
  profileB: MoodProfile,
  weights: MoodFeatureWeights = DEFAULT_WEIGHTS,
): { distance: number; normalizedDistance: number } {
  const a = profileA.target;
  const b = profileB.target;
  const distance =
    Math.abs(a.bpmDensity - b.bpmDensity) * weights.bpmDensity +
    Math.abs(a.rmsEnergy  - b.rmsEnergy)  * weights.rmsEnergy +
    Math.abs(a.brightness - b.brightness) * weights.brightness +
    Math.abs(a.bandwidth  - b.bandwidth)  * weights.bandwidth +
    Math.abs(a.texture    - b.texture)    * weights.texture +
    Math.abs(a.valence    - b.valence)    * weights.valence;

  const maxDist =
    weights.bpmDensity + weights.rmsEnergy + weights.brightness +
    weights.bandwidth + weights.texture + weights.valence;

  return { distance, normalizedDistance: distance / maxDist };
}

export function getMoodProfileDistanceMatrix(
  profiles = BASELINE_MOOD_PROFILES,
  weights?: MoodFeatureWeights,
): MoodProfileDistanceCell[] {
  const cells: MoodProfileDistanceCell[] = [];
  for (let i = 0; i < profiles.length; i++) {
    for (let j = i + 1; j < profiles.length; j++) {
      const { distance, normalizedDistance } = calculateMoodProfileDistance(
        profiles[i], profiles[j], weights,
      );
      cells.push({ moodA: profiles[i].name, moodB: profiles[j].name, distance, normalizedDistance });
    }
  }
  return cells;
}

// ── Collision audit ───────────────────────────────────────────────────────────

const DEFAULT_COLLISION_THRESHOLD = 0.65;

export function auditMoodProfileDistances(
  profiles = BASELINE_MOOD_PROFILES,
  options?: {
    threshold?: number;
    weighted?: boolean;
    weights?: MoodFeatureWeights;
  },
): MoodProfileCollision[] {
  const threshold = options?.threshold ?? DEFAULT_COLLISION_THRESHOLD;
  const weights = options?.weighted === false ? undefined : (options?.weights ?? DEFAULT_WEIGHTS);
  const results: MoodProfileCollision[] = [];

  for (let i = 0; i < profiles.length; i++) {
    for (let j = i + 1; j < profiles.length; j++) {
      const pA = profiles[i];
      const pB = profiles[j];
      const { distance, normalizedDistance } = calculateMoodProfileDistance(pA, pB, weights);
      if (distance >= threshold) continue;

      const samePair = isSiblingPair(pA.name, pB.name);
      const sameQuadrant = pA.quadrant === pB.quadrant;
      const crossQuadrant = !sameQuadrant;

      let severity: MoodProfileCollision["severity"];
      let reason: string;

      if (samePair) {
        severity = "expected_close";
        reason = "known sibling pair — intentionally similar";
      } else if (crossQuadrant) {
        severity = "dangerous";
        reason = `cross-quadrant collision: ${pA.quadrant} vs ${pB.quadrant}`;
      } else {
        severity = "review";
        reason = `same/adjacent quadrant, proximity worth inspecting`;
      }

      results.push({
        moodA: pA.name, moodB: pB.name,
        quadrantA: pA.quadrant, quadrantB: pB.quadrant,
        groupA: pA.group, groupB: pB.group,
        distance, normalizedDistance,
        severity, reason,
      });
    }
  }

  return results.sort((a, b) => a.distance - b.distance);
}

// ── Core scoring ──────────────────────────────────────────────────────────────

export function rankMoodProfiles(
  input: AudioFeatureVector,
  profiles = BASELINE_MOOD_PROFILES,
  weights: MoodFeatureWeights = DEFAULT_WEIGHTS,
): MoodScore[] {
  const maxDist =
    weights.bpmDensity + weights.rmsEnergy + weights.brightness +
    weights.bandwidth + weights.texture + weights.valence;

  return profiles
    .map((p) => {
      const distance =
        Math.abs(input.bpmDensity - p.target.bpmDensity) * weights.bpmDensity +
        Math.abs(input.rmsEnergy  - p.target.rmsEnergy)  * weights.rmsEnergy +
        Math.abs(input.brightness - p.target.brightness) * weights.brightness +
        Math.abs(input.bandwidth  - p.target.bandwidth)  * weights.bandwidth +
        Math.abs(input.texture    - p.target.texture)    * weights.texture +
        Math.abs(input.valence    - p.target.valence)    * weights.valence;
      const normalizedDistance = distance / maxDist;
      const confidence = Math.max(0, 1 - normalizedDistance);
      return { mood: p.name, quadrant: p.quadrant, group: p.group, distance, normalizedDistance, confidence };
    })
    .sort((a, b) => a.distance - b.distance);
}

// ── Tag assignment ────────────────────────────────────────────────────────────

export function assignMoodTags(
  input: AudioFeatureVector,
  options?: { approvedCount?: number; suggestedCount?: number; weights?: MoodFeatureWeights },
): MoodAssignment {
  const { approvedCount = 3, suggestedCount = 3, weights } = options ?? {};
  const rawScores = rankMoodProfiles(input, BASELINE_MOOD_PROFILES, weights ?? DEFAULT_WEIGHTS);

  // Apply primary penalties before final sort.
  // Balanced: unconditional center-gravity suppression.
  // Tense: soft penalty only when ranked #1 with a small margin — reduces possible_overtense
  //        without affecting Tense in secondary/suggestion slots.
  const sorted0 = [...rawScores].sort((a, b) => b.confidence - a.confidence);
  const tenseIsTop = sorted0[0]?.mood === "Tense";
  const tenseMargin = tenseIsTop ? (sorted0[0].confidence - (sorted0[1]?.confidence ?? 0)) : Infinity;
  const scores = sorted0
    .map((s) => {
      if (s.mood === "Balanced") return { ...s, confidence: Math.max(0, s.confidence - BALANCED_PRIMARY_PENALTY) };
      if (s.mood === "Tense" && tenseIsTop && tenseMargin < TENSE_PRIMARY_MARGIN_THRESHOLD)
        return { ...s, confidence: Math.max(0, s.confidence - TENSE_PRIMARY_PENALTY) };
      return s;
    })
    .sort((a, b) => b.confidence - a.confidence);

  const approvedMoods = scores.slice(0, approvedCount).map((s) => s.mood);
  const suggestedMoods = scores.slice(approvedCount, approvedCount + suggestedCount).map((s) => s.mood);
  return { approvedMoods, suggestedMoods, scores };
}

// ── Debug report printer ──────────────────────────────────────────────────────

function printCollisionReport(
  collisions: MoodProfileCollision[],
  threshold = DEFAULT_COLLISION_THRESHOLD,
) {
  console.group(`%cMood Profile Distance Audit — threshold: ${threshold} raw Manhattan`, "font-weight:bold");

  const dangerous = collisions.filter((c) => c.severity === "dangerous");
  const review    = collisions.filter((c) => c.severity === "review");
  const expected  = collisions.filter((c) => c.severity === "expected_close");

  if (dangerous.length) {
    console.group("%c⚠ Dangerous (cross-quadrant)", "color:red;font-weight:bold");
    dangerous.forEach((c) => console.log(`  ${c.moodA} ↔ ${c.moodB}: ${c.distance.toFixed(3)}  [${c.reason}]`));
    console.groupEnd();
  } else {
    console.log("%c✓ No dangerous cross-quadrant collisions.", "color:green");
  }

  if (review.length) {
    console.group("%c⚡ Review (same/adjacent quadrant)", "color:orange");
    review.forEach((c) => console.log(`  ${c.moodA} ↔ ${c.moodB}: ${c.distance.toFixed(3)}`));
    console.groupEnd();
  }

  if (expected.length) {
    console.group("Expected close (siblings)");
    expected.forEach((c) => console.log(`  ${c.moodA} ↔ ${c.moodB}: ${c.distance.toFixed(3)}`));
    console.groupEnd();
  }

  console.groupEnd();
}

// ── Install on window.MUSIC_DEBUG ────────────────────────────────────────────

export function installMoodAnalyzerDebug(
  dbg: Record<string, unknown>,
) {
  dbg.rankMoodProfiles = (input: AudioFeatureVector) => {
    const scores = rankMoodProfiles(input);
    console.table(scores.map((s) => ({
      mood: s.mood,
      group: s.group,
      distance: +s.distance.toFixed(4),
      confidence: `${(s.confidence * 100).toFixed(1)}%`,
    })));
    return scores;
  };

  dbg.testMoodVector = (input: AudioFeatureVector) => {
    const result = assignMoodTags(input);
    console.group("testMoodVector");
    console.log("Approved:", result.approvedMoods);
    console.log("Suggested:", result.suggestedMoods);
    console.groupEnd();
    return result;
  };

  dbg.auditMoodProfileDistances = (options?: Parameters<typeof auditMoodProfileDistances>[1]) => {
    const collisions = auditMoodProfileDistances(BASELINE_MOOD_PROFILES, options);
    printCollisionReport(collisions, options?.threshold);
    return collisions;
  };

  dbg.getMoodProfileDistanceMatrix = () => {
    const matrix = getMoodProfileDistanceMatrix();
    console.table(matrix.map((c) => ({
      moodA: c.moodA, moodB: c.moodB,
      distance: +c.distance.toFixed(4),
      normalized: +c.normalizedDistance.toFixed(4),
    })));
    return matrix;
  };

  dbg.printMoodProfileDistanceReport = () => {
    const collisions = auditMoodProfileDistances();
    printCollisionReport(collisions);
  };
}
