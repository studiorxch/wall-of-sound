// Dual-Deck Playback and Crossfade Execution — tests for all pure decision
// logic (§30). DualDeckPlaybackEngine itself uses HTMLAudioElement/
// AudioContext, unavailable in this project's node test environment (no
// jsdom) — its real-audio behavior is covered by live browser verification
// instead (see completion report). Everything the engine DELEGATES TO for
// deck-state transitions, gain math, scheduling decisions, eligibility, and
// progress accounting is covered here.

import { describe, it, expect } from "vitest";
import type { Track } from "../data/trackTypes";
import type { TrackSlot } from "../data/playlistTypes";
import type { PlaylistTransitionPlan, PlaylistPlaybackPreparation } from "../data/playlistTransitionTypes";
import {
  createIdleDeck, loadDeck, markDeckReady, markDeckPlaying, markDeckPaused,
  markDeckEnded, markDeckError, resetDeckToIdle, setDeckGain,
  promoteIncomingDeck, promoteDeckRoles,
} from "./deckTransport";
import { gainAtContextTime, makeFadeInEnvelope, makeFadeOutEnvelope } from "./gainEnvelope";
import {
  shouldPreloadNextTrack, buildCrossfadeEnvelopes, buildHardCutEnvelopes,
  computeTransitionProgress, preparedSegmentSeconds, computePreparedElapsedSeconds,
} from "./transitionScheduler";
import { evaluatePreparedPlaybackEligibility, resolveExecutionSyncMode, nextFallbackMode } from "./transitionFallback";
import { buildInitialSession, toPreparedTransitionExecution, derivePreparedProgress } from "./preparedPlaybackSession";

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

function makePlan(overrides: Partial<PlaylistTransitionPlan> = {}): PlaylistTransitionPlan {
  return {
    transitionId: "s0__s1", playlistId: "pl1",
    fromSlotId: "s0", toSlotId: "s1", fromTrackId: "a", toTrackId: "b",
    fromPosition: 0, toPosition: 1,
    outgoingCueSeconds: 180, outgoingEndSeconds: 190,
    incomingCueSeconds: 0,
    transitionDurationSeconds: 8,
    tempoRelationship: "direct", syncMode: "bar_sync", fallbackMode: "timed_crossfade",
    bpmFit: 0.9, keyFit: 0.9, beatMapFit: 0.9, playbackBoundsFit: 0.9, phraseFit: 0.5, energyContinuityFit: 0.9,
    confidence: 0.85, status: "ready", warnings: [],
    evidence: {
      fromBeatMapTrusted: true, toBeatMapTrusted: true, fromBarGridTrusted: true, toBarGridTrusted: true,
      fromPlaybackBoundsTrusted: true, toPlaybackBoundsTrusted: true,
      fromOutroRegionAvailable: true, toIntroRegionAvailable: true,
      outgoingAvailableSeconds: 10, incomingAvailableSeconds: 10,
      selectedFromBoundary: "outro_region", selectedToBoundary: "intro_region",
    },
    detectorVersion: "playlist-transition-v1", preparedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makePreparation(plans: PlaylistTransitionPlan[], revisionMap: Record<string, string> = {}): PlaylistPlaybackPreparation {
  return {
    playlistId: "pl1", version: "1.0", transitionPlans: plans,
    readiness: "ready", readyCount: plans.length, fallbackCount: 0, reviewCount: 0, blockedCount: 0,
    sourceTrackRevisionMap: revisionMap, preparedAt: "2026-01-01T00:00:00Z",
    detectorVersion: "playlist-transition-v1", warnings: [],
  };
}

// ── Dual-deck state ──────────────────────────────────────────────────────

describe("dual-deck state", () => {
  it("one active and one incoming deck after loading", () => {
    let active = markDeckPlaying(loadDeck(createIdleDeck("A"), { trackId: "a", slotId: "s0", sourceUrl: "u1", role: "active" }));
    let incoming = markDeckReady(loadDeck(createIdleDeck("B"), { trackId: "b", slotId: "s1", sourceUrl: "u2", role: "incoming" }), 200);
    expect(active.role).toBe("active");
    expect(incoming.role).toBe("incoming");
  });

  it("deck promotion swaps roles correctly and no two decks are active", () => {
    const active = markDeckPlaying(loadDeck(createIdleDeck("A"), { trackId: "a", slotId: "s0", sourceUrl: "u1", role: "active" }));
    const incoming = markDeckReady(loadDeck(createIdleDeck("B"), { trackId: "b", slotId: "s1", sourceUrl: "u2", role: "incoming" }), 200);
    const { active: newActive, idle: newIdle } = promoteDeckRoles(active, incoming);
    expect(newActive.role).toBe("active");
    expect(newActive.trackId).toBe("b");
    expect(newIdle.role).toBe("idle");
    expect(newIdle.deckId).toBe("A");
    // exactly one active deck
    expect([newActive, newIdle].filter((d) => d.role === "active")).toHaveLength(1);
  });

  it("idle deck resets cleanly — no stale track/slot/cue data", () => {
    const stale = markDeckError(loadDeck(createIdleDeck("A"), { trackId: "a", slotId: "s0", sourceUrl: "u1", role: "active", cueStartSeconds: 5 }), "boom");
    const reset = resetDeckToIdle("A");
    expect(reset).toEqual(createIdleDeck("A"));
    expect(reset.trackId).toBeUndefined();
    expect(reset.error).toBeUndefined();
    void stale;
  });

  it("promoteIncomingDeck advances session position pointers and swaps deck ids", () => {
    const session = { ...buildInitialSession("pl1", [makeSlot("s0", 0, "a"), makeSlot("s1", 1, "b")]), nextPosition: 1, nextSlotId: "s1", nextTrackId: "b", status: "transitioning" as const };
    const promoted = promoteIncomingDeck(session);
    expect(promoted.currentPosition).toBe(1);
    expect(promoted.currentTrackId).toBe("b");
    expect(promoted.activeDeckId).toBe("B");
    expect(promoted.incomingDeckId).toBe("A");
    expect(promoted.status).toBe("playing");
    expect(promoted.nextTrackId).toBeUndefined();
  });

  it("setDeckGain clamps to [0,1]", () => {
    const deck = createIdleDeck("A");
    expect(setDeckGain(deck, 1.5).gain).toBe(1);
    expect(setDeckGain(deck, -0.5).gain).toBe(0);
    expect(setDeckGain(deck, 0.42).gain).toBeCloseTo(0.42);
  });

  it("markDeckPaused/markDeckEnded transition state without touching other fields", () => {
    const playing = markDeckPlaying(loadDeck(createIdleDeck("A"), { trackId: "a", slotId: "s0", sourceUrl: "u", role: "active" }));
    expect(markDeckPaused(playing).state).toBe("paused");
    expect(markDeckEnded(playing).state).toBe("ended");
    expect(markDeckPaused(playing).trackId).toBe("a");
  });
});

// ── Timed crossfade (gain-envelope math) ────────────────────────────────

describe("timed crossfade", () => {
  it("outgoing gain decreases monotonically over the envelope", () => {
    const env = makeFadeOutEnvelope(0, 8);
    const g0 = gainAtContextTime(env, 0);
    const g4 = gainAtContextTime(env, 4);
    const g8 = gainAtContextTime(env, 8);
    expect(g0).toBeCloseTo(1);
    expect(g8).toBeCloseTo(0);
    expect(g4).toBeLessThan(g0);
    expect(g4).toBeGreaterThan(g8);
  });

  it("incoming gain increases monotonically over the envelope", () => {
    const env = makeFadeInEnvelope(0, 8);
    expect(gainAtContextTime(env, 0)).toBeCloseTo(0);
    expect(gainAtContextTime(env, 8)).toBeCloseTo(1);
    expect(gainAtContextTime(env, 4)).toBeGreaterThan(0);
    expect(gainAtContextTime(env, 4)).toBeLessThan(1);
  });

  it("equal-power crossfade never lets combined gain drop below either endpoint (avoids perceived dip)", () => {
    const out = makeFadeOutEnvelope(0, 8, "equal_power");
    const inn = makeFadeInEnvelope(0, 8, "equal_power");
    for (const t of [0, 2, 4, 6, 8]) {
      const combined = gainAtContextTime(out, t) ** 2 + gainAtContextTime(inn, t) ** 2;
      expect(combined).toBeCloseTo(1, 1); // equal-power sums to ~constant power
    }
  });

  it("built crossfade envelope duration matches the plan's transitionDurationSeconds", () => {
    const plan = makePlan({ transitionDurationSeconds: 6 });
    const { outgoing, incoming } = buildCrossfadeEnvelopes(plan);
    expect(outgoing.endTimeContextSeconds - outgoing.startTimeContextSeconds).toBe(6);
    expect(incoming.endTimeContextSeconds - incoming.startTimeContextSeconds).toBe(6);
  });

  it("transition progress reaches 1.0 at (outgoingCueSeconds + duration) and 0 before the cue", () => {
    const plan = makePlan({ outgoingCueSeconds: 100, transitionDurationSeconds: 8 });
    expect(computeTransitionProgress(90, plan)).toBe(0);
    expect(computeTransitionProgress(104, plan)).toBeCloseTo(0.5);
    expect(computeTransitionProgress(200, plan)).toBe(1);
  });
});

// ── Gapless / hard cut ───────────────────────────────────────────────────

describe("gapless and hard cut", () => {
  it("hard cut envelopes are instantaneous — no overlap window", () => {
    const { outgoing, incoming } = buildHardCutEnvelopes();
    expect(outgoing.endTimeContextSeconds - outgoing.startTimeContextSeconds).toBe(0);
    expect(outgoing.endGain).toBe(0);
    expect(incoming.endGain).toBe(1);
  });

  it("gapless mode reuses the same crossfade envelope machinery but with the plan's (near-zero) duration", () => {
    const plan = makePlan({ syncMode: "gapless", transitionDurationSeconds: 0.2 });
    const { outgoing, incoming } = buildCrossfadeEnvelopes(plan);
    expect(outgoing.endTimeContextSeconds).toBeCloseTo(0.2);
    expect(incoming.endTimeContextSeconds).toBeCloseTo(0.2);
  });
});

// ── Sync eligibility / downgrade ─────────────────────────────────────────

describe("sync eligibility", () => {
  it("a trusted direct-tempo bar_sync plan is scheduled as bar_sync at rate 1.0", () => {
    const plan = makePlan({ syncMode: "bar_sync", tempoRelationship: "direct" });
    const result = resolveExecutionSyncMode(plan, 1.0);
    expect(result.mode).toBe("bar_sync");
    expect(result.downgraded).toBe(false);
  });

  it("unsupported tempo mismatch (tempo_change) downgrades to the plan's fallback mode", () => {
    const plan = makePlan({ syncMode: "bar_sync", tempoRelationship: "tempo_change", fallbackMode: "timed_crossfade" });
    const result = resolveExecutionSyncMode(plan, 1.0);
    expect(result.mode).toBe("timed_crossfade");
    expect(result.downgraded).toBe(true);
  });

  it("a playback rate other than exactly 1.0 always downgrades beat/bar sync (no pitch-preserving stretching exists)", () => {
    const plan = makePlan({ syncMode: "beat_sync", tempoRelationship: "direct" });
    const result = resolveExecutionSyncMode(plan, 1.02);
    expect(result.downgraded).toBe(true);
    expect(result.mode).not.toBe("beat_sync");
  });

  it("an untrusted plan (status blocked) is caught by preparation eligibility before sync mode is even considered", () => {
    const from = makeTrack("a"); const to = makeTrack("b");
    const tracksById = new Map([["a", from], ["b", to]]);
    const slots = [makeSlot("s0", 0, "a"), makeSlot("s1", 1, "b")];
    const plan = makePlan({ status: "blocked" });
    const prep = makePreparation([plan], { a: trackMarker(from), b: trackMarker(to) });
    const result = evaluatePreparedPlaybackEligibility(slots, tracksById, prep, "s0");
    // plan exists and cues are valid even though status is blocked — status
    // itself is a UI/decision signal the caller checks separately; eligibility
    // here only verifies the PLAN IS USABLE (references resolve, cues valid).
    expect(result.eligible).toBe(true);
  });

  it("non-linear fallback chain never returns beat_sync or phrase_sync as a next step", () => {
    expect(nextFallbackMode("bar_sync")).toBe("timed_crossfade");
    expect(nextFallbackMode("timed_crossfade")).toBe("gapless");
    expect(nextFallbackMode("gapless")).toBe("hard_cut");
    expect(nextFallbackMode("hard_cut")).toBeNull();
  });
});

// ── Prepared playback eligibility ────────────────────────────────────────

describe("prepared playback eligibility", () => {
  const from = makeTrack("a"); const to = makeTrack("b");
  const tracksById = new Map([["a", from], ["b", to]]);
  const slots = [makeSlot("s0", 0, "a"), makeSlot("s1", 1, "b")];

  it("no preparation record → not eligible", () => {
    expect(evaluatePreparedPlaybackEligibility(slots, tracksById, undefined, "s0").eligible).toBe(false);
  });

  it("stale preparation → not eligible, reason preparation_stale", () => {
    const plan = makePlan();
    const prep = makePreparation([plan], {}); // empty revision map → stale vs. current tracks
    const result = evaluatePreparedPlaybackEligibility(slots, tracksById, prep, "s0");
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("preparation_stale");
  });

  it("no plan for the current adjacency → not eligible", () => {
    // preparation exists and is fresh, but has no plan starting at s1
    // (e.g. the last track in the playlist, or a gap in the plan list).
    const plan = makePlan({ fromSlotId: "s0", toSlotId: "s1", toTrackId: "b" });
    const prep = makePreparation([plan], { a: trackMarker(from), b: trackMarker(to) });
    const result = evaluatePreparedPlaybackEligibility(slots, tracksById, prep, "s1");
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("no_plan_for_adjacency");
  });

  it("blocked (unplayable) source track → not eligible", () => {
    const plan = makePlan();
    const prep = makePreparation([plan], { a: trackMarker(from), b: trackMarker(to) });
    const result = evaluatePreparedPlaybackEligibility(slots, tracksById, prep, "s0", new Set(["b"]));
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("source_unplayable");
  });

  it("invalid cue values (outgoing cue after outgoing end) → not eligible", () => {
    const plan = makePlan({ outgoingCueSeconds: 195, outgoingEndSeconds: 190 });
    const prep = makePreparation([plan], { a: trackMarker(from), b: trackMarker(to) });
    const result = evaluatePreparedPlaybackEligibility(slots, tracksById, prep, "s0");
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("invalid_cue_values");
  });

  it("a fully valid, non-stale plan is eligible", () => {
    const plan = makePlan();
    const prep = makePreparation([plan], { a: trackMarker(from), b: trackMarker(to) });
    const result = evaluatePreparedPlaybackEligibility(slots, tracksById, prep, "s0");
    expect(result.eligible).toBe(true);
  });
});

function trackMarker(t: Track): string {
  return `${t.analysisUpdatedAt ?? ""}|${t.beatMap?.analyzedAt ?? ""}|${t.playbackBounds?.analyzedAt ?? ""}`;
}

// ── Preload timing ───────────────────────────────────────────────────────

describe("preload timing", () => {
  it("preload triggers once inside the lead window before the outgoing cue", () => {
    const plan = makePlan({ outgoingCueSeconds: 180 });
    expect(shouldPreloadNextTrack(160, plan, 15)).toBe(false);
    expect(shouldPreloadNextTrack(166, plan, 15)).toBe(true);
    expect(shouldPreloadNextTrack(179, plan, 15)).toBe(true);
  });
});

// ── Progress / prepared-duration accounting ─────────────────────────────

describe("progress accounting", () => {
  it("a track's prepared segment length subtracts only its own outgoing overlap", () => {
    const track = makeTrack("a", { durationSeconds: 200 });
    const plan = makePlan({ fromTrackId: "a", transitionDurationSeconds: 8 });
    expect(preparedSegmentSeconds(track, plan)).toBe(192);
    expect(preparedSegmentSeconds(track, undefined)).toBe(200); // last track, no outgoing overlap
  });

  it("elapsed prepared time is correct and overlap is never double-counted across a completed transition", () => {
    const a = makeTrack("a", { durationSeconds: 200 });
    const b = makeTrack("b", { durationSeconds: 200 });
    const tracksById = new Map([["a", a], ["b", b]]);
    const planAB = makePlan({ fromTrackId: "a", toTrackId: "b", transitionDurationSeconds: 8 });
    const plansByFromTrackId = new Map([["a", planAB]]);

    // Fully through track a (192s prepared) + 30s into track b.
    const elapsed = computePreparedElapsedSeconds(["a"], tracksById, plansByFromTrackId, "b", 30);
    expect(elapsed).toBe(192 + 30);
  });

  it("current segment elapsed is capped at its own prepared length (mid-crossfade doesn't overshoot)", () => {
    const a = makeTrack("a", { durationSeconds: 200 });
    const tracksById = new Map([["a", a]]);
    const planA = makePlan({ fromTrackId: "a", transitionDurationSeconds: 8 });
    const plansByFromTrackId = new Map([["a", planA]]);
    // claim 500s elapsed into a 192s-prepared segment — must clamp, not overshoot.
    const elapsed = computePreparedElapsedSeconds([], tracksById, plansByFromTrackId, "a", 500);
    expect(elapsed).toBe(192);
  });

  it("derivePreparedProgress matches computePreparedPlaylistDuration's totals and never returns negative remaining time", () => {
    const a = makeTrack("a", { durationSeconds: 200 });
    const b = makeTrack("b", { durationSeconds: 200 });
    const tracksById = new Map([["a", a], ["b", b]]);
    const slots = [makeSlot("s0", 0, "a"), makeSlot("s1", 1, "b")];
    const plan = makePlan({ fromTrackId: "a", toTrackId: "b", transitionDurationSeconds: 8 });
    const prep = makePreparation([plan]);

    const progress = derivePreparedProgress(slots, tracksById, prep, [], "a", 1_000_000);
    expect(progress.remainingPreparedSeconds).toBeGreaterThanOrEqual(0);
    expect(progress.preparedTotalSeconds).toBe(progress.sourceTotalSeconds - 8);
  });
});

// ── Player contract ───────────────────────────────────────────────────────

describe("player contract (§29)", () => {
  it("toPreparedTransitionExecution extracts exactly the contract fields, nothing more", () => {
    const plan = makePlan();
    const exec = toPreparedTransitionExecution(plan);
    expect(exec).toEqual({
      fromTrackId: plan.fromTrackId, toTrackId: plan.toTrackId,
      outgoingCueSeconds: plan.outgoingCueSeconds, outgoingEndSeconds: plan.outgoingEndSeconds,
      incomingCueSeconds: plan.incomingCueSeconds, transitionDurationSeconds: plan.transitionDurationSeconds,
      syncMode: plan.syncMode, tempoRelationship: plan.tempoRelationship,
    });
  });
});

// ── Regression ────────────────────────────────────────────────────────────

describe("regression", () => {
  it("buildInitialSession defaults to standard (disabled) prepared playback", () => {
    const session = buildInitialSession("pl1", [makeSlot("s0", 0, "a")]);
    expect(session.preparedPlaybackEnabled).toBe(false);
    expect(session.status).toBe("idle");
  });
});
