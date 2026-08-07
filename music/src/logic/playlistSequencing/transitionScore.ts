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
  // 0804_MUSIC_Playlist_Eligibility_Repair — `null` means "not applicable
  // for this pair" (untrusted/missing BPM, key, or mood on either side).
  // A null input is OMITTED from the weighted total entirely rather than
  // defaulted to a neutral filler that still counted at full weight — its
  // weight share is redistributed across whichever inputs ARE present, per
  // direct instruction ("missing BPM: omit BPM scoring", etc.). Existing
  // callers that always have a value (e.g. the read-only Playlist Analyzer
  // Review, which already resolves its own neutral fallback before calling
  // this) are unaffected — passing a plain number behaves exactly as before.
  bpmFit: number | null;
  keyFit: number | null;
  moodContinuity: number | null;
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
 * fixed at its configured value regardless of section. A null bpmFit/keyFit/
 * moodContinuity additionally drops that dimension's weight to 0 before this
 * same rescale, so the remaining present dimensions still sum to `remainder`
 * — omission, not a neutral filler at full weight.
 */
export function computeTransitionScore(input: TransitionScoreInput): PlaylistTransitionScore {
  const w = input.weights ?? DEFAULT_TRANSITION_WEIGHTS;
  const bpmMultiplier = input.profile?.bpmWeightMultiplier ?? 1;
  const keyMultiplier = input.profile?.keyWeightMultiplier ?? 1;

  const energyW = w.energy;
  const remainder = Math.max(0, 1 - energyW);
  const rawBpm = input.bpmFit != null ? w.bpm * bpmMultiplier : 0;
  const rawKey = input.keyFit != null ? w.key * keyMultiplier : 0;
  const rawMood = input.moodContinuity != null ? w.mood : 0;
  const rawVariety = w.variety;
  const rawSum = rawBpm + rawKey + rawMood + rawVariety;
  const scale = rawSum > 0 ? remainder / rawSum : 0;

  const bpmW = rawBpm * scale;
  const keyW = rawKey * scale;
  const moodW = rawMood * scale;
  const varietyW = rawVariety * scale;

  const total =
    input.energyFit * energyW +
    (input.bpmFit ?? 0) * bpmW +
    (input.keyFit ?? 0) * keyW +
    (input.moodContinuity ?? 0) * moodW +
    input.variety * varietyW;

  return {
    energyFit: input.energyFit,
    bpmFit: input.bpmFit ?? 0.5,
    keyFit: input.keyFit ?? 0.5,
    moodContinuity: input.moodContinuity ?? 0.5,
    variety: input.variety,
    total,
  };
}
