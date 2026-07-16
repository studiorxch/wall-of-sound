// Dual-Deck Transport Authority Completion — tests for pure authority-state
// derivation and skip decision logic (§30 "Authority handoff", "Position
// binding", "Skip" groups). The engine class itself (real AudioContext) is
// covered by live browser verification — see completion report.

import { describe, it, expect } from "vitest";
import type { Track } from "../data/trackTypes";
import type { TrackSlot } from "../data/playlistTypes";
import type { PlaylistPlaybackSession, PlaybackDeckState } from "./dualDeckTypes";
import { createIdleDeck, loadDeck, markDeckPlaying, markDeckReady } from "./deckTransport";
import { buildAuthorityState, buildEngineTransportSnapshot, decideSkipNext, resolvePreviousSlot, findPlanForSlotPair, buildSurfaceSnapshot, computeRowState, isLastAssignedSlot } from "./playbackAuthority";
import type { PlaylistTransitionPlan } from "../data/playlistTransitionTypes";

function makeTrack(id: string, opts: Partial<Track> = {}): Track {
  return {
    trackId: id, title: id, artist: "Artist",
    durationSeconds: 200, energy: 0.5,
    sourceOwner: "studiorich", genres: [], moodTags: [], moodSuggestions: [],
    sourcePoolIds: [], grouping: "", albumArtist: "", archiveStatus: "library",
    ...opts,
  } as unknown as Track;
}

function makeSlot(id: string, index: number, trackId: string | undefined): TrackSlot {
  return {
    slotId: id, slotIndex: index, startTimeSeconds: index * 200, targetEnergy: 0.5, targetBpm: 120,
    assignedTrackId: trackId, warningLevel: "none", warningMessages: [],
  };
}

function makeSession(overrides: Partial<PlaylistPlaybackSession> = {}): PlaylistPlaybackSession {
  return {
    playlistId: "pl1", currentPosition: 0, currentSlotId: "s0", currentTrackId: "a",
    activeDeckId: "A", incomingDeckId: "B", status: "playing", preparedPlaybackEnabled: true,
    ...overrides,
  };
}

// ── Authority handoff / position binding ────────────────────────────────

describe("buildAuthorityState", () => {
  it("standard authority reports the standard snapshot verbatim", () => {
    const state = buildAuthorityState(
      "standard_player",
      { positionSeconds: 42, durationSeconds: 200, isPlaying: true, isPaused: false, playlistId: "pl1", slotId: "s0", trackId: "a" },
      null, null, 1000,
    );
    expect(state.authority).toBe("standard_player");
    expect(state.positionSeconds).toBe(42);
    expect(state.isPlaying).toBe(true);
  });

  it("engine authority reads position/duration from the ACTIVE deck, never the standard snapshot", () => {
    const decks: Record<"A" | "B", PlaybackDeckState> = {
      A: { ...markDeckPlaying(loadDeck(createIdleDeck("A"), { trackId: "a", slotId: "s0", sourceUrl: "u", role: "active" })), currentTimeSeconds: 99, durationSeconds: 200 },
      B: createIdleDeck("B"),
    };
    const session = makeSession();
    const state = buildAuthorityState(
      "dual_deck_engine",
      { positionSeconds: 1, durationSeconds: 5, isPlaying: false, isPaused: false }, // stale standard snapshot — must be ignored
      session, decks, 2000,
    );
    expect(state.authority).toBe("dual_deck_engine");
    expect(state.positionSeconds).toBe(99);
    expect(state.durationSeconds).toBe(200);
    expect(state.isPlaying).toBe(true);
  });

  it("falls back to standard authority when session/decks are missing even if authority flag says engine", () => {
    const state = buildAuthorityState(
      "dual_deck_engine",
      { positionSeconds: 10, isPlaying: true, isPaused: false },
      null, null, 3000,
    );
    expect(state.authority).toBe("standard_player");
    expect(state.positionSeconds).toBe(10);
  });

  it("reports isTransitioning only when session.status is transitioning", () => {
    const decks: Record<"A" | "B", PlaybackDeckState> = { A: markDeckPlaying(createIdleDeck("A")), B: createIdleDeck("B") };
    const transitioning = buildAuthorityState("dual_deck_engine", { positionSeconds: 0, isPlaying: true, isPaused: false }, makeSession({ status: "transitioning", transitionProgress: 0.5 }), decks, 0);
    const playing = buildAuthorityState("dual_deck_engine", { positionSeconds: 0, isPlaying: true, isPaused: false }, makeSession({ status: "playing" }), decks, 0);
    expect(transitioning.isTransitioning).toBe(true);
    expect(transitioning.transitionProgress).toBe(0.5);
    expect(playing.isTransitioning).toBe(false);
  });
});

describe("buildEngineTransportSnapshot", () => {
  it("combines track-relative active-deck position with playlist-relative progress", () => {
    const decks: Record<"A" | "B", PlaybackDeckState> = {
      A: { ...markDeckPlaying(loadDeck(createIdleDeck("A"), { trackId: "a", slotId: "s0", sourceUrl: "u", role: "active" })), currentTimeSeconds: 50, durationSeconds: 200 },
      B: markDeckReady(loadDeck(createIdleDeck("B"), { trackId: "b", slotId: "s1", sourceUrl: "u2", role: "incoming" }), 180),
    };
    const session = makeSession();
    const snapshot = buildEngineTransportSnapshot(session, decks, {
      sourceTotalSeconds: 400, effectiveTotalSeconds: 390, preparedTotalSeconds: 380, elapsedPreparedSeconds: 50, remainingPreparedSeconds: 330,
    });
    expect(snapshot.activeTrackId).toBe("a");
    expect(snapshot.incomingTrackId).toBe("b");
    expect(snapshot.activePositionSeconds).toBe(50);
    expect(snapshot.playlistElapsedSeconds).toBe(50);
    expect(snapshot.playlistRemainingSeconds).toBe(330);
  });
});

// ── Skip ─────────────────────────────────────────────────────────────────

describe("decideSkipNext", () => {
  const tracks = ["a", "b", "c"].map((id) => makeTrack(id));
  const tracksById = new Map(tracks.map((t) => [t.trackId, t]));
  const slots = tracks.map((t, i) => makeSlot(`s${i}`, i, t.trackId));

  it("promotes the incoming deck when it's already ready for the next slot", () => {
    const decks: Record<"A" | "B", PlaybackDeckState> = {
      A: markDeckPlaying(loadDeck(createIdleDeck("A"), { trackId: "a", slotId: "s0", sourceUrl: "u", role: "active" })),
      B: markDeckReady(loadDeck(createIdleDeck("B"), { trackId: "b", slotId: "s1", sourceUrl: "u2", role: "incoming" }), 200),
    };
    const decision = decideSkipNext(slots, tracksById, makeSession(), decks);
    expect(decision?.action).toBe("promote");
    expect(decision?.targetTrack.trackId).toBe("b");
  });

  it("loads fresh when the incoming deck is empty (not preloaded yet)", () => {
    const decks: Record<"A" | "B", PlaybackDeckState> = { A: markDeckPlaying(loadDeck(createIdleDeck("A"), { trackId: "a", slotId: "s0", sourceUrl: "u", role: "active" })), B: createIdleDeck("B") };
    const decision = decideSkipNext(slots, tracksById, makeSession(), decks);
    expect(decision?.action).toBe("load");
    expect(decision?.targetTrack.trackId).toBe("b");
  });

  it("loads fresh (never reuses) when the incoming deck is preloaded for the WRONG track", () => {
    const decks: Record<"A" | "B", PlaybackDeckState> = {
      A: markDeckPlaying(loadDeck(createIdleDeck("A"), { trackId: "a", slotId: "s0", sourceUrl: "u", role: "active" })),
      B: markDeckReady(loadDeck(createIdleDeck("B"), { trackId: "c", slotId: "s2", sourceUrl: "u3", role: "incoming" }), 200), // stale — was preloaded for a DIFFERENT plan
    };
    const decision = decideSkipNext(slots, tracksById, makeSession(), decks);
    expect(decision?.action).toBe("load");
    expect(decision?.targetSlot.slotId).toBe("s1"); // still the REAL next slot, not the stale deck's track
  });

  it("returns null when already at the last track", () => {
    const decks: Record<"A" | "B", PlaybackDeckState> = { A: markDeckPlaying(createIdleDeck("A")), B: createIdleDeck("B") };
    const decision = decideSkipNext(slots, tracksById, makeSession({ currentSlotId: "s2", currentTrackId: "c" }), decks);
    expect(decision).toBeNull();
  });
});

describe("resolvePreviousSlot", () => {
  const slots = ["a", "b", "c"].map((id, i) => makeSlot(`s${i}`, i, id));

  it("resolves the immediately preceding assigned slot", () => {
    expect(resolvePreviousSlot(slots, "s1")?.slotId).toBe("s0");
  });

  it("skips unassigned slots when walking backward", () => {
    const withGap = [makeSlot("s0", 0, "a"), makeSlot("s1", 1, undefined), makeSlot("s2", 2, "c")];
    expect(resolvePreviousSlot(withGap, "s2")?.slotId).toBe("s0");
  });

  it("returns null at the first slot", () => {
    expect(resolvePreviousSlot(slots, "s0")).toBeNull();
  });

  it("returns null when currentSlotId isn't found", () => {
    expect(resolvePreviousSlot(slots, "ghost")).toBeNull();
  });
});

describe("findPlanForSlotPair", () => {
  it("finds the plan whose fromSlotId matches", () => {
    const plans = [{ fromSlotId: "s0", transitionId: "t1" } as PlaylistTransitionPlan, { fromSlotId: "s1", transitionId: "t2" } as PlaylistTransitionPlan];
    expect(findPlanForSlotPair(plans, "s1")?.transitionId).toBe("t2");
  });

  it("returns undefined when fromSlotId is undefined", () => {
    expect(findPlanForSlotPair([], undefined)).toBeUndefined();
  });
});

// ── Playback Authority Surface and Control Completion — shared surface ─────

describe("buildSurfaceSnapshot", () => {
  it("derives incoming track/slot from the incoming DECK, not stale session.next* pointers", () => {
    const decks: Record<"A" | "B", PlaybackDeckState> = {
      A: { ...markDeckPlaying(loadDeck(createIdleDeck("A"), { trackId: "a", slotId: "s0", sourceUrl: "u", role: "active" })), currentTimeSeconds: 10, durationSeconds: 200 },
      B: markDeckReady(loadDeck(createIdleDeck("B"), { trackId: "b", slotId: "s1", sourceUrl: "u2", role: "incoming" }), 180),
    };
    const session = makeSession(); // no nextSlotId/nextTrackId set — steady-state playback
    const authorityState = buildAuthorityState("dual_deck_engine", { positionSeconds: 0, isPlaying: true, isPaused: false }, session, decks, 0);
    const snapshot = buildSurfaceSnapshot(authorityState, session, decks);
    expect(snapshot.incomingTrackId).toBe("b");
    expect(snapshot.incomingSlotId).toBe("s1");
    expect(snapshot.activeTrackId).toBe("a");
  });

  it("statusLabel reflects transitioning > playing > paused > idle priority", () => {
    const decks: Record<"A" | "B", PlaybackDeckState> = { A: markDeckPlaying(createIdleDeck("A")), B: createIdleDeck("B") };
    const transitioning = buildAuthorityState("dual_deck_engine", { positionSeconds: 0, isPlaying: true, isPaused: false }, makeSession({ status: "transitioning" }), decks, 0);
    expect(buildSurfaceSnapshot(transitioning, makeSession({ status: "transitioning" }), decks).statusLabel).toBe("Transitioning");
  });

  it("standard authority never reports an incoming track/slot", () => {
    const authorityState = buildAuthorityState("standard_player", { positionSeconds: 5, isPlaying: true, isPaused: false }, null, null, 0);
    const snapshot = buildSurfaceSnapshot(authorityState, null, null);
    expect(snapshot.incomingTrackId).toBeUndefined();
    expect(snapshot.incomingSlotId).toBeUndefined();
    expect(snapshot.authority).toBe("standard_player");
  });
});

describe("computeRowState", () => {
  const decks: Record<"A" | "B", PlaybackDeckState> = {
    A: markDeckPlaying(loadDeck(createIdleDeck("A"), { trackId: "a", slotId: "s1", sourceUrl: "u", role: "active" })),
    B: markDeckReady(loadDeck(createIdleDeck("B"), { trackId: "b", slotId: "s2", sourceUrl: "u2", role: "incoming" }), 180),
  };
  const session = makeSession({ currentSlotId: "s1", activeDeckId: "A", incomingDeckId: "B" });
  const authorityState = buildAuthorityState("dual_deck_engine", { positionSeconds: 0, isPlaying: true, isPaused: false }, session, decks, 0);
  const snapshot = buildSurfaceSnapshot(authorityState, session, decks);

  it("exactly one row is playing — the active slot", () => {
    expect(computeRowState("s1", 1, 1, snapshot)).toBe("playing");
    expect(computeRowState("s2", 2, 1, snapshot)).not.toBe("playing");
    expect(computeRowState("s0", 0, 1, snapshot)).not.toBe("playing");
  });

  it("the adjacent preloaded slot is incoming", () => {
    expect(computeRowState("s2", 2, 1, snapshot)).toBe("incoming");
  });

  it("earlier slots (by index) are completed", () => {
    expect(computeRowState("s0", 0, 1, snapshot)).toBe("completed");
  });

  it("later, non-incoming slots are idle", () => {
    expect(computeRowState("s3", 3, 1, snapshot)).toBe("idle");
  });

  it("during overlap, both active and incoming rows report transitioning", () => {
    const transitioningSession = makeSession({ currentSlotId: "s1", activeDeckId: "A", incomingDeckId: "B", status: "transitioning" });
    const transitioningState = buildAuthorityState("dual_deck_engine", { positionSeconds: 0, isPlaying: true, isPaused: false }, transitioningSession, decks, 0);
    const transitioningSnapshot = buildSurfaceSnapshot(transitioningState, transitioningSession, decks);
    expect(computeRowState("s1", 1, 1, transitioningSnapshot)).toBe("transitioning");
    expect(computeRowState("s2", 2, 1, transitioningSnapshot)).toBe("transitioning");
  });

  it("all rows are idle when no slot is active (activeSlotIndex null)", () => {
    expect(computeRowState("s1", 1, null, snapshot)).toBe("idle");
  });
});

// ── Dual-Deck Control Edge-Case Verification — end-of-playlist detection ───

describe("isLastAssignedSlot", () => {
  const slots = ["a", "b", "c"].map((id, i) => makeSlot(`s${i}`, i, id));

  it("is true for the last assigned slot", () => {
    expect(isLastAssignedSlot(slots, "s2")).toBe(true);
  });

  it("is false for any earlier slot", () => {
    expect(isLastAssignedSlot(slots, "s0")).toBe(false);
    expect(isLastAssignedSlot(slots, "s1")).toBe(false);
  });

  it("is false for an unknown slot id", () => {
    expect(isLastAssignedSlot(slots, "ghost")).toBe(false);
  });

  it("is false when slotId is undefined", () => {
    expect(isLastAssignedSlot(slots, undefined)).toBe(false);
  });

  it("skips trailing unassigned slots — the last ASSIGNED slot is what matters", () => {
    const withTrailingGap = [...slots, makeSlot("s3", 3, undefined)];
    expect(isLastAssignedSlot(withTrailingGap, "s2")).toBe(true);
    expect(isLastAssignedSlot(withTrailingGap, "s3")).toBe(false);
  });
});
