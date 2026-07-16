// Dual-Deck Transport Authority Completion (0714_MUSIC_Dual_Deck_Transport_
// Authority_Completion v1.0.0) — pure authority-state derivation and skip
// decision logic (§5, §8, §17, §18, §19). No AudioNode access — the engine
// itself supplies raw deck/session data; everything here is deterministic
// and testable without a browser.

import type { Track } from "../data/trackTypes";
import type { TrackSlot } from "../data/playlistTypes";
import type { PlaylistTransitionPlan } from "../data/playlistTransitionTypes";
import type {
  PlaybackAuthority, PlaybackAuthorityState, PlaybackDeckState,
  PlaylistPlaybackSession, EngineTransportSnapshot, PreparedPlaybackProgress,
  PlaybackSurfaceSnapshot, PlaylistPlaybackRowState,
} from "./dualDeckTypes";

// §5 — canonical authority state. Only this should drive the shared
// transport UI once `authority === "dual_deck_engine"`.
export function buildAuthorityState(
  authority: PlaybackAuthority,
  standardSnapshot: { positionSeconds: number; durationSeconds?: number; isPlaying: boolean; isPaused: boolean; playlistId?: string; slotId?: string; trackId?: string },
  session: PlaylistPlaybackSession | null,
  decks: Record<"A" | "B", PlaybackDeckState> | null,
  nowMonotonicMs: number,
): PlaybackAuthorityState {
  if (authority === "standard_player" || !session || !decks) {
    return {
      authority: "standard_player",
      playlistId: standardSnapshot.playlistId,
      slotId: standardSnapshot.slotId,
      trackId: standardSnapshot.trackId,
      positionSeconds: standardSnapshot.positionSeconds,
      durationSeconds: standardSnapshot.durationSeconds,
      isPlaying: standardSnapshot.isPlaying,
      isPaused: standardSnapshot.isPaused,
      isTransitioning: false,
      updatedAtMonotonicMs: nowMonotonicMs,
    };
  }

  // §8 — position/duration come from the ACTIVE deck, never the paused
  // standard <audio> element.
  const activeDeck = decks[session.activeDeckId];
  return {
    authority: "dual_deck_engine",
    playlistId: session.playlistId,
    slotId: session.currentSlotId,
    trackId: session.currentTrackId,
    positionSeconds: activeDeck.currentTimeSeconds,
    durationSeconds: activeDeck.durationSeconds,
    isPlaying: activeDeck.state === "playing",
    isPaused: activeDeck.state === "paused",
    isTransitioning: session.status === "transitioning",
    activeDeckId: session.activeDeckId,
    incomingDeckId: session.incomingDeckId,
    transitionId: session.activeTransitionId,
    transitionProgress: session.transitionProgress,
    updatedAtMonotonicMs: nowMonotonicMs,
  };
}

// §8 — the fuller engine-transport snapshot (adds playlist-relative
// progress alongside track-relative position), for UI that wants both.
export function buildEngineTransportSnapshot(
  session: PlaylistPlaybackSession,
  decks: Record<"A" | "B", PlaybackDeckState>,
  progress: PreparedPlaybackProgress | null,
): EngineTransportSnapshot {
  const activeDeck = decks[session.activeDeckId];
  const incomingDeck = decks[session.incomingDeckId];
  return {
    activeDeckId: session.activeDeckId,
    incomingDeckId: session.incomingDeckId,
    activeTrackId: activeDeck.trackId,
    incomingTrackId: incomingDeck.trackId,
    activePositionSeconds: activeDeck.currentTimeSeconds,
    activeDurationSeconds: activeDeck.durationSeconds,
    playlistElapsedSeconds: progress?.elapsedPreparedSeconds ?? 0,
    playlistRemainingSeconds: progress?.remainingPreparedSeconds,
    transitionProgress: session.transitionProgress,
    isTransitioning: session.status === "transitioning",
    isPlaying: activeDeck.state === "playing",
    isPaused: activeDeck.state === "paused",
  };
}

export interface SkipNextDecision {
  // "promote": the already-preloaded incoming deck is valid — just promote
  // it (no new load). "load": load the target track fresh (incoming deck
  // wasn't preloaded/valid, or there is no prepared plan for this move).
  action: "promote" | "load";
  targetSlot: TrackSlot;
  targetTrack: Track;
}

// §17 — skip next: promote the already-loaded incoming deck when it's
// genuinely the next slot and already ready/playing; otherwise the caller
// must load the target track fresh. Never reuses a stale incoming deck for
// the WRONG track (e.g. after a plan changed underneath it).
export function decideSkipNext(
  slots: TrackSlot[],
  tracksById: Map<string, Track>,
  session: PlaylistPlaybackSession,
  decks: Record<"A" | "B", PlaybackDeckState>,
): SkipNextDecision | null {
  const ordered = [...slots].sort((a, b) => a.slotIndex - b.slotIndex);
  const currentIdx = ordered.findIndex((s) => s.slotId === session.currentSlotId);
  if (currentIdx === -1) return null;
  let nextSlot: TrackSlot | undefined;
  for (let i = currentIdx + 1; i < ordered.length; i++) {
    if (ordered[i].assignedTrackId) { nextSlot = ordered[i]; break; }
  }
  if (!nextSlot || !nextSlot.assignedTrackId) return null;
  const targetTrack = tracksById.get(nextSlot.assignedTrackId);
  if (!targetTrack) return null;

  const incoming = decks[session.incomingDeckId];
  const incomingIsValidPromotion =
    incoming.slotId === nextSlot.slotId &&
    (incoming.state === "ready" || incoming.state === "playing");

  return {
    action: incomingIsValidPromotion ? "promote" : "load",
    targetSlot: nextSlot,
    targetTrack,
  };
}

// Dual-Deck Control Edge-Case Verification — end-of-playlist detection.
// The LAST assigned slot has no outgoing plan by design (there is no next
// adjacency); this must never be reported as a fallback/error condition
// (§ misleading "no_plan_for_adjacency" warning at playlist end).
export function isLastAssignedSlot(slots: TrackSlot[], slotId: string | undefined): boolean {
  if (!slotId) return false;
  const ordered = [...slots].sort((a, b) => a.slotIndex - b.slotIndex);
  const assigned = ordered.filter((s) => s.assignedTrackId);
  const last = assigned[assigned.length - 1];
  return last?.slotId === slotId;
}

// §18 — skip previous always resets deck roles and loads fresh; a stale
// incoming-deck state (from whatever adjacency was in flight before the
// skip) must never be reused for a previous-track jump.
export function resolvePreviousSlot(slots: TrackSlot[], currentSlotId: string | undefined): TrackSlot | null {
  const ordered = [...slots].sort((a, b) => a.slotIndex - b.slotIndex);
  const currentIdx = ordered.findIndex((s) => s.slotId === currentSlotId);
  if (currentIdx <= 0) return null;
  for (let i = currentIdx - 1; i >= 0; i--) {
    if (ordered[i].assignedTrackId) return ordered[i];
  }
  return null;
}

export function findPlanForSlotPair(
  plans: PlaylistTransitionPlan[],
  fromSlotId: string | undefined,
): PlaylistTransitionPlan | undefined {
  if (!fromSlotId) return undefined;
  return plans.find((p) => p.fromSlotId === fromSlotId);
}

// §8 — the ONE shared selector every visible playback surface should
// derive from. Built directly from PlaybackAuthorityState (§5); the
// incoming track/slot (when engine authority is active) come from
// whichever deck is currently `session.incomingDeckId` — the session
// itself only tracks NEXT pointers transiently during the initial
// handoff, not throughout steady-state playback.
export function buildSurfaceSnapshot(
  authorityState: PlaybackAuthorityState,
  session: PlaylistPlaybackSession | null,
  decks: Record<"A" | "B", PlaybackDeckState> | null,
): PlaybackSurfaceSnapshot {
  const statusLabel = authorityState.isTransitioning
    ? "Transitioning"
    : authorityState.isPlaying
      ? "Playing"
      : authorityState.isPaused
        ? "Paused"
        : "Idle";
  const incomingDeck = authorityState.authority === "dual_deck_engine" && session && decks ? decks[session.incomingDeckId] : null;
  return {
    authority: authorityState.authority,
    activeTrackId: authorityState.trackId,
    activeSlotId: authorityState.slotId,
    incomingTrackId: incomingDeck?.trackId,
    incomingSlotId: incomingDeck?.slotId,
    positionSeconds: authorityState.positionSeconds,
    durationSeconds: authorityState.durationSeconds,
    isPlaying: authorityState.isPlaying,
    isPaused: authorityState.isPaused,
    isTransitioning: authorityState.isTransitioning,
    transitionId: authorityState.transitionId,
    transitionProgress: authorityState.transitionProgress,
    statusLabel,
  };
}

// §17 — row state for a given slot, derived purely from the shared
// snapshot. Exactly one row can be "playing"; only the incoming slot (when
// one exists) can be "incoming"; both become "transitioning" during
// overlap. Everything before the active slot (by index) is "completed".
export function computeRowState(
  slotId: string,
  slotIndex: number,
  activeSlotIndex: number | null,
  snapshot: PlaybackSurfaceSnapshot,
): PlaylistPlaybackRowState {
  if (activeSlotIndex == null) return "idle";
  if (slotId === snapshot.activeSlotId) {
    if (snapshot.isTransitioning) return "transitioning";
    if (snapshot.isPaused) return "paused";
    if (snapshot.isPlaying) return "playing";
    return "idle";
  }
  if (slotId === snapshot.incomingSlotId) {
    return snapshot.isTransitioning ? "transitioning" : "incoming";
  }
  if (slotIndex < activeSlotIndex) return "completed";
  return "idle";
}
