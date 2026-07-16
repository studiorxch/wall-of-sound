// 0715G_MUSIC_Sectional_Looper_Simplification_And_Stem_Ready_Export —
// "Auto" single-winner recommendation for a user-selected region. Never
// modifies `generateLoopCandidates` itself (protected by convention — see
// its own callers' comments); scopes it to a region purely by constructing
// a `TrackPlaybackBounds`-shaped window, reusing the function's own
// existing `preferredStartSeconds`/`preferredEndSeconds` mechanism.
// Ranking reuses the existing, previously-unwired `rankAndLimitCandidates`
// (structural-metadata-only scoring — no audio decode required, so a
// recommendation is available instantly on region-select, matching this
// codebase's existing convention that real seamlessness evidence is only
// computed once, at approval time).

import type { TrackBeatMap } from "../../data/beatMapTypes";
import type { TrackPlaybackBounds } from "../../data/playbackBoundsTypes";
import { generateLoopCandidates, type LoopCandidate } from "./loopCandidates";
import { rankAndLimitCandidates } from "./loopCandidateRanking";

export type LengthPreference = "auto" | 4 | 8 | 16 | 32 | 64;
const SUPPORTED_LENGTHS = [4, 8, 16, 32, 64] as const;

export interface AutoRecommendationInput {
  regionStartSeconds: number;
  regionEndSeconds: number;
  sourceDurationSeconds: number;
  beatMap: TrackBeatMap | undefined;
  playbackBounds: TrackPlaybackBounds | undefined;
  trackBpm?: number;
  tempoStabilityScore?: number;
  lengthPreference: LengthPreference;
  // Ceiling in seconds; undefined/omitted means no duration budget.
  durationTargetSeconds?: number;
}

export interface AutoRecommendationResult {
  winner: LoopCandidate | null;
  // Which of the 4/8/16/32/64 bar lengths have at least one candidate
  // available within the region (and duration budget, if any) — drives
  // LengthControl's disabled state.
  availableLengths: Record<(typeof SUPPORTED_LENGTHS)[number], boolean>;
}

// Builds a TrackPlaybackBounds-shaped window scoped to the region, reusing
// the track's real bounds when they exist (preserving its other fields —
// only the preferred start/end move) and synthesizing a minimal valid one
// when the track has no detected bounds at all.
export function buildScopedPlaybackBounds(
  base: TrackPlaybackBounds | undefined,
  regionStartSeconds: number,
  regionEndSeconds: number,
  sourceDurationSeconds: number,
): TrackPlaybackBounds {
  if (base) {
    return {
      ...base,
      preferredStartSeconds: regionStartSeconds,
      preferredEndSeconds: regionEndSeconds,
      override: undefined,
    };
  }
  return {
    version: "0715g-region-scope",
    sourceDurationSeconds,
    audibleStartSeconds: regionStartSeconds,
    preferredStartSeconds: regionStartSeconds,
    preferredEndSeconds: regionEndSeconds,
    audibleEndSeconds: regionEndSeconds,
    leadingSilenceSeconds: 0,
    trailingSilenceSeconds: 0,
    effectiveDurationSeconds: Math.max(0, regionEndSeconds - regionStartSeconds),
    startClassification: "unknown",
    endClassification: "unknown",
    startConfidence: 0,
    endConfidence: 0,
    overallConfidence: 0,
    source: "detected",
    detectorVersion: "none",
    analyzedAt: new Date(0).toISOString(),
    warnings: [],
  };
}

function withinDurationBudget(c: LoopCandidate, ceilingSeconds: number | undefined): boolean {
  return ceilingSeconds == null || c.durationSeconds <= ceilingSeconds;
}

export function recommendForRegion(input: AutoRecommendationInput): AutoRecommendationResult {
  const scopedBounds = buildScopedPlaybackBounds(
    input.playbackBounds, input.regionStartSeconds, input.regionEndSeconds, input.sourceDurationSeconds,
  );
  const pool = generateLoopCandidates(input.beatMap, scopedBounds, input.sourceDurationSeconds, input.trackBpm)
    .filter((c) => withinDurationBudget(c, input.durationTargetSeconds));

  const availableLengths = Object.fromEntries(
    SUPPORTED_LENGTHS.map((len) => [len, pool.some((c) => c.barCount === len)]),
  ) as AutoRecommendationResult["availableLengths"];

  const scoped = input.lengthPreference === "auto"
    ? pool
    : pool.filter((c) => c.barCount === input.lengthPreference);

  const rankable = scoped.map((c) => ({ ...c, tempoStabilityScore: input.tempoStabilityScore }));
  const [best] = rankAndLimitCandidates(rankable, 1);

  return { winner: best?.candidate ?? null, availableLengths };
}
