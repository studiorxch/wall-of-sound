// Dual-Deck Playback — deck lifecycle and session promotion (§3, §5, §6,
// §21). Pure state-transition functions; the engine (DualDeckPlaybackEngine)
// is the only place that touches real AudioNodes/HTMLAudioElements — this
// module is testable without any audio runtime.

import type { PlaybackDeckState, PlaylistPlaybackSession, DeckRole } from "./dualDeckTypes";

export function createIdleDeck(deckId: "A" | "B"): PlaybackDeckState {
  return {
    deckId,
    role: "idle",
    state: "empty",
    currentTimeSeconds: 0,
    gain: 1,
    muted: false,
  };
}

export function loadDeck(
  deck: PlaybackDeckState,
  params: { trackId: string; slotId: string; sourceUrl: string; role: DeckRole; cueStartSeconds?: number; cueEndSeconds?: number },
): PlaybackDeckState {
  return {
    ...deck,
    role: params.role,
    state: "loading",
    trackId: params.trackId,
    slotId: params.slotId,
    sourceUrl: params.sourceUrl,
    cueStartSeconds: params.cueStartSeconds,
    cueEndSeconds: params.cueEndSeconds,
    currentTimeSeconds: params.cueStartSeconds ?? 0,
    error: undefined,
  };
}

export function markDeckReady(deck: PlaybackDeckState, durationSeconds: number): PlaybackDeckState {
  return { ...deck, state: "ready", durationSeconds };
}

export function markDeckPlaying(deck: PlaybackDeckState): PlaybackDeckState {
  return { ...deck, state: "playing" };
}

export function markDeckPaused(deck: PlaybackDeckState): PlaybackDeckState {
  return { ...deck, state: "paused" };
}

export function markDeckEnded(deck: PlaybackDeckState): PlaybackDeckState {
  return { ...deck, state: "ended" };
}

export function markDeckError(deck: PlaybackDeckState, error: string): PlaybackDeckState {
  return { ...deck, state: "error", error };
}

export function resetDeckToIdle(deckId: "A" | "B"): PlaybackDeckState {
  return createIdleDeck(deckId);
}

export function setDeckGain(deck: PlaybackDeckState, gain: number): PlaybackDeckState {
  return { ...deck, gain: Math.max(0, Math.min(1, gain)) };
}

// §3/§6 — at transition completion, Deck B (incoming) becomes active, Deck A
// (previously active) resets, and the session's position pointers advance.
// Only one deck is ever "active" after promotion — verified by the caller
// checking `decks[session.activeDeckId].role === "active"` and the other
// deck's role !== "active".
export function promoteIncomingDeck(session: PlaylistPlaybackSession): PlaylistPlaybackSession {
  return {
    ...session,
    currentPosition: session.nextPosition ?? session.currentPosition + 1,
    currentSlotId: session.nextSlotId,
    currentTrackId: session.nextTrackId,
    nextPosition: undefined,
    nextSlotId: undefined,
    nextTrackId: undefined,
    activeDeckId: session.incomingDeckId,
    incomingDeckId: session.activeDeckId,
    status: "playing",
    activeTransitionId: undefined,
    transitionProgress: undefined,
  };
}

export function promoteDeckRoles(
  activeDeck: PlaybackDeckState,
  incomingDeck: PlaybackDeckState,
): { active: PlaybackDeckState; idle: PlaybackDeckState } {
  return {
    active: { ...incomingDeck, role: "active" },
    idle: resetDeckToIdle(activeDeck.deckId),
  };
}
