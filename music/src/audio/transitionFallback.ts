// Dual-Deck Playback — prepared-playback eligibility and execution-mode
// fallback (§8, §15, §16, §22, §28). Pure decision logic only; reuses
// isPreparationStale rather than re-deriving staleness.

import type { Track } from "../data/trackTypes";
import type { TrackSlot } from "../data/playlistTypes";
import type { PlaylistPlaybackPreparation, PlaylistTransitionPlan, PlaylistTransitionSyncMode } from "../data/playlistTransitionTypes";
import { isPreparationStale } from "../logic/playlistTransition/transitionStaleness";

export interface PreparedEligibilityResult {
  eligible: boolean;
  reason?: string;
}

// §8 — prepared playback requires: active playlist, valid assigned-track
// order, a non-stale preparation record, a plan for the current adjacency,
// both source tracks playable, and valid (finite, non-negative) cue values.
export function evaluatePreparedPlaybackEligibility(
  slots: TrackSlot[],
  tracksById: Map<string, Track>,
  preparation: PlaylistPlaybackPreparation | undefined,
  currentSlotId: string | undefined,
  blockedTrackIds?: ReadonlySet<string>,
): PreparedEligibilityResult {
  if (!slots.some((s) => s.assignedTrackId)) return { eligible: false, reason: "no_assigned_tracks" };
  if (!preparation) return { eligible: false, reason: "no_preparation_record" };
  if (isPreparationStale(preparation, slots, tracksById)) return { eligible: false, reason: "preparation_stale" };
  if (!currentSlotId) return { eligible: false, reason: "no_current_slot" };

  const plan = preparation.transitionPlans.find((p) => p.fromSlotId === currentSlotId);
  if (!plan) return { eligible: false, reason: "no_plan_for_adjacency" };

  const fromTrack = tracksById.get(plan.fromTrackId);
  const toTrack = tracksById.get(plan.toTrackId);
  if (!fromTrack || !toTrack) return { eligible: false, reason: "plan_references_missing_track" };
  if (blockedTrackIds?.has(plan.fromTrackId) || blockedTrackIds?.has(plan.toTrackId)) {
    return { eligible: false, reason: "source_unplayable" };
  }

  if (!isFiniteNonNegative(plan.outgoingCueSeconds) || !isFiniteNonNegative(plan.outgoingEndSeconds)) {
    return { eligible: false, reason: "invalid_cue_values" };
  }
  if (!isFiniteNonNegative(plan.incomingCueSeconds)) {
    return { eligible: false, reason: "invalid_cue_values" };
  }
  if (plan.outgoingCueSeconds > plan.outgoingEndSeconds) {
    return { eligible: false, reason: "invalid_cue_values" };
  }

  return { eligible: true };
}

function isFiniteNonNegative(n: number): boolean {
  return Number.isFinite(n) && n >= 0;
}

// §15/§16 — resolves the sync mode actually SAFE to execute this run,
// downgrading beat_sync/bar_sync when playback rate isn't exactly 1.0 (no
// pitch-preserving time stretching exists) or tempo relationship doesn't
// support alignment. Never falsely claims sync.
export function resolveExecutionSyncMode(
  plan: PlaylistTransitionPlan,
  playbackRate: number,
): { mode: PlaylistTransitionSyncMode; downgraded: boolean } {
  const wantsBeatBarSync = plan.syncMode === "beat_sync" || plan.syncMode === "bar_sync";
  if (!wantsBeatBarSync) return { mode: plan.syncMode, downgraded: false };

  if (playbackRate !== 1.0) {
    return { mode: plan.fallbackMode ?? "timed_crossfade", downgraded: true };
  }
  if (plan.tempoRelationship === "tempo_change" || plan.tempoRelationship === "unknown") {
    return { mode: plan.fallbackMode ?? "timed_crossfade", downgraded: true };
  }
  // direct / half_time / double_time are all phase-alignable without
  // stretching when the plan already accounts for them (fold factor baked
  // into the prepared cues/tempo relationship upstream).
  return { mode: plan.syncMode, downgraded: false };
}

// §22 — execution fallback order: prepared execution → timed crossfade →
// gapless → hard cut → stop with explicit error. Given a mode that failed,
// returns the next mode to attempt, or null if exhausted.
const FALLBACK_ORDER: PlaylistTransitionSyncMode[] = [
  "bar_sync", "beat_sync", "phrase_sync", "timed_crossfade", "gapless", "hard_cut",
];

export function nextFallbackMode(failedMode: PlaylistTransitionSyncMode): PlaylistTransitionSyncMode | null {
  const idx = FALLBACK_ORDER.indexOf(failedMode);
  if (idx === -1 || idx === FALLBACK_ORDER.length - 1) return null;
  // Skip straight to timed_crossfade from any beat/bar/phrase mode — those
  // three are evidence tiers, not independently retriable steps.
  const next = FALLBACK_ORDER[idx + 1];
  if (next === "beat_sync" || next === "phrase_sync") return "timed_crossfade";
  return next;
}

// Prepared Playback Handoff and Hard-Cut Repair (0714_MUSIC_Prepared_
// Playback_Handoff_And_Hard_Cut_Repair v1.0.0) — §17, §18. `needs_review`
// and `blocked` plan status were previously purely advisory: the tick loop
// and engine never read `plan.status` at all, so an untrusted plan executed
// exactly like a fully-trusted one. This is the one shared runtime-policy
// decision point every execution path (scheduled tick, media-ended) must
// go through — never branch on `plan.status` independently elsewhere.
// The engine-executable mode set — already excludes phrase_sync, which the
// caller must remap to timed_crossfade before this policy ever runs.
export type EngineExecutionMode = "timed_crossfade" | "gapless" | "hard_cut" | "beat_sync" | "bar_sync";

export interface RuntimeTransitionPolicyResult {
  // The mode actually safe to execute this run, after runtime-policy
  // downgrade (distinct from resolveExecutionSyncMode's sync-capability
  // downgrade, which runs first).
  mode: EngineExecutionMode;
  runtimeFallback: "none" | "review_hard_cut" | "blocked_standard_fallback";
  // §18 — true only when the adjacency is blocked AND the incoming track
  // has no resolvable source at all; the caller must stop with an explicit
  // error rather than attempt any transition.
  stopWithError: boolean;
}

export function decideRuntimeTransitionPolicy(
  plan: Pick<PlaylistTransitionPlan, "status">,
  resolvedMode: EngineExecutionMode,
  incomingTrackPlayable: boolean,
): RuntimeTransitionPolicyResult {
  if (plan.status === "blocked") {
    // §18 — a single blocked adjacency must never silently disable the
    // entire prepared session; fall back to a conservative hard cut when the
    // incoming track is genuinely playable, otherwise stop explicitly.
    if (!incomingTrackPlayable) {
      return { mode: resolvedMode, runtimeFallback: "blocked_standard_fallback", stopWithError: true };
    }
    return { mode: "hard_cut", runtimeFallback: "blocked_standard_fallback", stopWithError: false };
  }
  if (plan.status === "needs_review") {
    // §17 — conservative hard cut only: no fabricated beat/bar sync, no
    // untrusted cue snapping, safe source start/end (the prepared cues
    // themselves — this never re-derives cue values).
    return { mode: "hard_cut", runtimeFallback: "review_hard_cut", stopWithError: false };
  }
  return { mode: resolvedMode, runtimeFallback: "none", stopWithError: false };
}
