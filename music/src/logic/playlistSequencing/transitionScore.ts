// Combined candidate transition score (0713_MUSIC_Playlist_BPM_Key_Sequencing
// §12) — the ONE configuration source for weights, per spec's explicit "do
// not hardcode weights across multiple files."

import type { SectionSequencingProfile } from "./sectionSequencingProfile";

export interface TransitionScoreWeights {
  energy: number;
  bpm: number;
  key: number;
  mood: number;
  variety: number;
}

// Recommended initial weighting (§12). Must sum to 1.
export const DEFAULT_TRANSITION_WEIGHTS: TransitionScoreWeights = {
  energy: 0.45,
  bpm: 0.25,
  key: 0.15,
  mood: 0.10,
  variety: 0.05,
};

export interface PlaylistTransitionScore {
  energyFit: number;
  bpmFit: number;
  keyFit: number;
  moodContinuity: number;
  variety: number;
  total: number;
}

export interface TransitionScoreInput {
  energyFit: number;
  bpmFit: number;
  keyFit: number;
  moodContinuity: number;
  variety: number;
  weights?: TransitionScoreWeights;
  profile?: SectionSequencingProfile;
}

/**
 * Energy's weight share is NEVER reduced by a section profile (§19 "energy
 * remains the main structural constraint" / "do not let harmonic
 * compatibility flatten the playlist's intended energy arc") — only the
 * BPM/key/mood/variety share is redistributed by the section's multipliers,
 * then rescaled so the whole set still sums to 1. Energy's own weight is
 * fixed at its configured value regardless of section.
 */
export function computeTransitionScore(input: TransitionScoreInput): PlaylistTransitionScore {
  const w = input.weights ?? DEFAULT_TRANSITION_WEIGHTS;
  const bpmMultiplier = input.profile?.bpmWeightMultiplier ?? 1;
  const keyMultiplier = input.profile?.keyWeightMultiplier ?? 1;

  const energyW = w.energy;
  const remainder = Math.max(0, 1 - energyW);
  const rawBpm = w.bpm * bpmMultiplier;
  const rawKey = w.key * keyMultiplier;
  const rawMood = w.mood;
  const rawVariety = w.variety;
  const rawSum = rawBpm + rawKey + rawMood + rawVariety;
  const scale = rawSum > 0 ? remainder / rawSum : 0;

  const bpmW = rawBpm * scale;
  const keyW = rawKey * scale;
  const moodW = rawMood * scale;
  const varietyW = rawVariety * scale;

  const total =
    input.energyFit * energyW +
    input.bpmFit * bpmW +
    input.keyFit * keyW +
    input.moodContinuity * moodW +
    input.variety * varietyW;

  return {
    energyFit: input.energyFit,
    bpmFit: input.bpmFit,
    keyFit: input.keyFit,
    moodContinuity: input.moodContinuity,
    variety: input.variety,
    total,
  };
}
