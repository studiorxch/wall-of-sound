// Dual-Deck Playback — session derivation (§6, §24, §27, §28, §29). Builds
// the PlaylistPlaybackSession and the PreparedTransitionExecution contract
// consumed by the engine; never re-derives transition-plan scoring.

import type { Track } from "../data/trackTypes";
import type { TrackSlot } from "../data/playlistTypes";
import type { PlaylistPlaybackPreparation, PlaylistTransitionPlan, PreparedTransitionExecution } from "../data/playlistTransitionTypes";
import type { PlaylistPlaybackSession, PreparedPlaybackProgress } from "./dualDeckTypes";
import { computePreparedPlaylistDuration } from "../logic/playlistTransition/preparedDuration";
import { computePreparedElapsedSeconds } from "./transitionScheduler";

// §29 — the ONLY place a PlaylistTransitionPlan is narrowed down to the
// player contract. Never construct a PreparedTransitionExecution any other
// way — this keeps the plan schema and the execution contract from
// silently diverging.
export function toPreparedTransitionExecution(plan: PlaylistTransitionPlan): PreparedTransitionExecution {
  return {
    fromTrackId: plan.fromTrackId,
    toTrackId: plan.toTrackId,
    outgoingCueSeconds: plan.outgoingCueSeconds,
    outgoingEndSeconds: plan.outgoingEndSeconds,
    incomingCueSeconds: plan.incomingCueSeconds,
    transitionDurationSeconds: plan.transitionDurationSeconds,
    syncMode: plan.syncMode,
    tempoRelationship: plan.tempoRelationship,
  };
}

// §27 — rebuilt from the playlist + preparation record on load; never
// persisted itself (runtime deck state, AudioNodes, and scheduled gain
// events are explicitly excluded from persistence).
export function buildInitialSession(playlistId: string, slots: TrackSlot[]): PlaylistPlaybackSession {
  const firstAssigned = slots.find((s) => s.assignedTrackId);
  return {
    playlistId,
    currentPosition: 0,
    currentSlotId: firstAssigned?.slotId,
    currentTrackId: firstAssigned?.assignedTrackId,
    activeDeckId: "A",
    incomingDeckId: "B",
    status: "idle",
    preparedPlaybackEnabled: false,
  };
}

export function findOutgoingPlan(preparation: PlaylistPlaybackPreparation | undefined, currentSlotId: string | undefined): PlaylistTransitionPlan | undefined {
  if (!preparation || !currentSlotId) return undefined;
  return preparation.transitionPlans.find((p) => p.fromSlotId === currentSlotId);
}

// §24 — full progress snapshot combining the saved total-duration model
// with live elapsed accounting.
export function derivePreparedProgress(
  slots: TrackSlot[],
  tracksById: Map<string, Track>,
  preparation: PlaylistPlaybackPreparation | undefined,
  completedTrackIds: string[],
  currentTrackId: string | undefined,
  currentDeckElapsedSeconds: number,
): PreparedPlaybackProgress {
  const totals = computePreparedPlaylistDuration(slots, tracksById, preparation);
  const plansByFromTrackId = new Map((preparation?.transitionPlans ?? []).map((p) => [p.fromTrackId, p]));
  const elapsed = computePreparedElapsedSeconds(completedTrackIds, tracksById, plansByFromTrackId, currentTrackId, currentDeckElapsedSeconds);
  return {
    sourceTotalSeconds: totals.sourceTotalSeconds,
    effectiveTotalSeconds: totals.effectiveTotalSeconds,
    preparedTotalSeconds: totals.preparedTotalSeconds,
    elapsedPreparedSeconds: elapsed,
    remainingPreparedSeconds: Math.max(0, totals.preparedTotalSeconds - elapsed),
  };
}
