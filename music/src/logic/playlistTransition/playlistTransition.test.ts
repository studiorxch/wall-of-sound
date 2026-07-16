import { describe, it, expect } from "vitest";
import type { Track } from "../../data/trackTypes";
import type { TrackSlot } from "../../data/playlistTypes";
import type { TrackBeatMap } from "../../data/beatMapTypes";
import type { TrackPlaybackBounds } from "../../data/playbackBoundsTypes";
import {
  buildTransitionPlan, preparePlaylistForPlayback, computeReadiness,
  reprepareLocalTransitions, countStaleLocalTransitions,
} from "./preparePlaylist";
import { isPreparationStale, affectedTransitionIds, mergeLocalTransitionPlans } from "./transitionStaleness";
import { computePreparedPlaylistDuration } from "./preparedDuration";

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

function makeBeatMap(overrides: Partial<TrackBeatMap> = {}): TrackBeatMap {
  return {
    version: "1.0", beatTimesSeconds: Array.from({ length: 100 }, (_, i) => i * 0.5),
    barStartTimesSeconds: Array.from({ length: 25 }, (_, i) => i * 2),
    firstDownbeatSeconds: 0.5, tempoStable: true, tempoStabilityScore: 0.95, tempoSegments: [],
    confidence: 0.9, source: "detected", detectorVersion: "beat-map-v3", analyzedAt: "2026-01-01T00:00:00Z", warnings: [],
    confidenceComponents: {
      onsetStrength: 0.9, onsetRegularity: 0.9, beatPhaseFit: 0.9, beatCoverage: 0.9, beatContinuity: 0.9,
      downbeatRecurrence: 0.9, barAlignment: 0.9, tempoStability: 0.9, segmentConsistency: 1,
      introRegionConfidence: 0.9, outroRegionConfidence: 0.9, priorAgreement: 1, warningPenalty: 1, total: 0.9,
    },
    introRegion: { startSeconds: 2, endSeconds: 10, cleanBars: 4, confidence: 0.9, reasons: [] },
    outroRegion: { startSeconds: 180, endSeconds: 190, cleanBars: 4, confidence: 0.9, reasons: [] },
    ...overrides,
  };
}

function makeBounds(overrides: Partial<TrackPlaybackBounds> = {}): TrackPlaybackBounds {
  return {
    version: "1.0", sourceDurationSeconds: 200,
    audibleStartSeconds: 0, preferredStartSeconds: 1,
    preferredEndSeconds: 195, audibleEndSeconds: 200,
    leadingSilenceSeconds: 0, trailingSilenceSeconds: 0,
    effectiveDurationSeconds: 194,
    startClassification: "musical_intro", endClassification: "musical_outro",
    startConfidence: 0.8, endConfidence: 0.8, overallConfidence: 0.8,
    source: "detected", detectorVersion: "playback-bounds-v1", analyzedAt: "2026-01-01T00:00:00Z", warnings: [],
    ...overrides,
  };
}

const NOW = "2026-01-01T00:00:00Z";

// ── Pair planning ────────────────────────────────────────────────────────────

describe("pair planning", () => {
  it("trusted beat AND bar grids on both sides produce bar_sync", () => {
    const from = makeTrack("a", { bpm: 128, bpmSource: "detected", camelotKey: "8B", keySource: "detected", beatMap: makeBeatMap(), playbackBounds: makeBounds() });
    const to = makeTrack("b", { bpm: 128, bpmSource: "detected", camelotKey: "8B", keySource: "detected", beatMap: makeBeatMap(), playbackBounds: makeBounds() });
    const plan = buildTransitionPlan("pl1", {
      fromSlot: makeSlot("s1", 0, "a"), toSlot: makeSlot("s2", 1, "b"), fromTrack: from, toTrack: to, fromPosition: 0, toPosition: 1,
    }, NOW);
    expect(plan.syncMode).toBe("bar_sync");
  });

  it("trusted beats without trusted bars produce beat_sync", () => {
    const noBar = makeBeatMap({ barStartTimesSeconds: [] });
    const from = makeTrack("a", { bpm: 128, bpmSource: "detected", camelotKey: "8B", keySource: "detected", beatMap: noBar, playbackBounds: makeBounds() });
    const to = makeTrack("b", { bpm: 128, bpmSource: "detected", camelotKey: "8B", keySource: "detected", beatMap: noBar, playbackBounds: makeBounds() });
    const plan = buildTransitionPlan("pl1", {
      fromSlot: makeSlot("s1", 0, "a"), toSlot: makeSlot("s2", 1, "b"), fromTrack: from, toTrack: to, fromPosition: 0, toPosition: 1,
    }, NOW);
    expect(plan.syncMode).toBe("beat_sync");
  });

  it("a missing beat map on either side produces a timed/gapless fallback, not a fabricated sync", () => {
    const from = makeTrack("a", { bpm: 128, bpmSource: "detected", playbackBounds: makeBounds() });
    const to = makeTrack("b", { bpm: 128, bpmSource: "detected", playbackBounds: makeBounds() });
    const plan = buildTransitionPlan("pl1", {
      fromSlot: makeSlot("s1", 0, "a"), toSlot: makeSlot("s2", 1, "b"), fromTrack: from, toTrack: to, fromPosition: 0, toPosition: 1,
    }, NOW);
    expect(["timed_crossfade", "gapless"]).toContain(plan.syncMode);
    expect(plan.warnings).toContain("TRANSITION_PLAN_MISSING_BEAT_MAP");
  });

  it("insufficient regions on both sides with no trusted evidence at all produce hard_cut or blocked", () => {
    const from = makeTrack("a", { durationSeconds: 200 });
    const to = makeTrack("b", { durationSeconds: 200 });
    const plan = buildTransitionPlan("pl1", {
      fromSlot: makeSlot("s1", 0, "a"), toSlot: makeSlot("s2", 1, "b"), fromTrack: from, toTrack: to, fromPosition: 0, toPosition: 1,
    }, NOW);
    expect(["hard_cut", "unsynced"]).toContain(plan.syncMode);
  });
});

// ── Cue validity ─────────────────────────────────────────────────────────────

describe("cue validity", () => {
  it("cues stay inside playback bounds", () => {
    const from = makeTrack("a", { bpm: 128, bpmSource: "detected", beatMap: makeBeatMap(), playbackBounds: makeBounds() });
    const to = makeTrack("b", { bpm: 128, bpmSource: "detected", beatMap: makeBeatMap(), playbackBounds: makeBounds() });
    const plan = buildTransitionPlan("pl1", {
      fromSlot: makeSlot("s1", 0, "a"), toSlot: makeSlot("s2", 1, "b"), fromTrack: from, toTrack: to, fromPosition: 0, toPosition: 1,
    }, NOW);
    expect(plan.outgoingCueSeconds).toBeLessThanOrEqual(plan.outgoingEndSeconds);
    expect(plan.outgoingCueSeconds).toBeGreaterThanOrEqual(0);
  });

  it("transition duration fits both available regions", () => {
    const from = makeTrack("a", { bpm: 128, bpmSource: "detected", beatMap: makeBeatMap(), playbackBounds: makeBounds() });
    const to = makeTrack("b", { bpm: 128, bpmSource: "detected", beatMap: makeBeatMap(), playbackBounds: makeBounds() });
    const plan = buildTransitionPlan("pl1", {
      fromSlot: makeSlot("s1", 0, "a"), toSlot: makeSlot("s2", 1, "b"), fromTrack: from, toTrack: to, fromPosition: 0, toPosition: 1,
    }, NOW);
    expect(plan.transitionDurationSeconds).toBeLessThanOrEqual(plan.evidence.outgoingAvailableSeconds + 0.01);
    expect(plan.transitionDurationSeconds).toBeLessThanOrEqual(plan.evidence.incomingAvailableSeconds + 0.01);
  });
});

// ── Staleness ────────────────────────────────────────────────────────────────

describe("staleness", () => {
  it("replacing a track invalidates exactly its two adjacent transitions", () => {
    const tracks = ["a", "b", "c", "d"].map((id) => makeTrack(id));
    const tracksById = new Map(tracks.map((t) => [t.trackId, t]));
    const slots = tracks.map((t, i) => makeSlot(`s${i}`, i, t.trackId));
    const prep = preparePlaylistForPlayback("pl1", slots, tracksById, NOW);
    expect(prep.transitionPlans.length).toBe(3);

    const affected = affectedTransitionIds(prep.transitionPlans, 1); // "b" is at position 1
    expect(affected.length).toBe(2);
    expect(affected).toContain(prep.transitionPlans[0].transitionId); // a→b
    expect(affected).toContain(prep.transitionPlans[1].transitionId); // b→c
  });

  it("removal creates one new adjacency and unrelated plans remain valid", () => {
    const tracks = ["a", "b", "c", "d"].map((id) => makeTrack(id));
    const tracksById = new Map(tracks.map((t) => [t.trackId, t]));
    const slots = tracks.map((t, i) => makeSlot(`s${i}`, i, t.trackId));
    const before = preparePlaylistForPlayback("pl1", slots, tracksById, NOW);

    // Remove "b" — compact remaining slots.
    const slotsAfterRemoval = [makeSlot("s0", 0, "a"), makeSlot("s2", 1, "c"), makeSlot("s3", 2, "d")];
    const after = preparePlaylistForPlayback("pl1", slotsAfterRemoval, tracksById, NOW);
    expect(after.transitionPlans.length).toBe(2); // a→c, c→d

    // The c→d transition (unaffected by b's removal) should be identical in shape.
    const beforeCD = before.transitionPlans.find((p) => p.fromTrackId === "c" && p.toTrackId === "d");
    const afterCD = after.transitionPlans.find((p) => p.fromTrackId === "c" && p.toTrackId === "d");
    expect(afterCD?.syncMode).toBe(beforeCD?.syncMode);
  });

  it("unrelated plans remain stable after a merge", () => {
    const tracks = ["a", "b", "c"].map((id) => makeTrack(id));
    const tracksById = new Map(tracks.map((t) => [t.trackId, t]));
    const slots = tracks.map((t, i) => makeSlot(`s${i}`, i, t.trackId));
    const prep = preparePlaylistForPlayback("pl1", slots, tracksById, NOW);
    const bcPlan = prep.transitionPlans[1];
    const merged = mergeLocalTransitionPlans(prep.transitionPlans, [], [prep.transitionPlans[0].transitionId]);
    expect(merged.find((p) => p.transitionId === bcPlan.transitionId)).toEqual(bcPlan);
  });

  it("a changed source (beat map re-analyzed) marks the preparation stale", () => {
    const trackA = makeTrack("a", { beatMap: makeBeatMap({ analyzedAt: "2026-01-01T00:00:00Z" }) });
    const trackB = makeTrack("b");
    const tracksById = new Map([["a", trackA], ["b", trackB]] as [string, Track][]);
    const slots = [makeSlot("s0", 0, "a"), makeSlot("s1", 1, "b")];
    const prep = preparePlaylistForPlayback("pl1", slots, tracksById, NOW);

    const updatedTrackA = { ...trackA, beatMap: makeBeatMap({ analyzedAt: "2026-02-01T00:00:00Z" }) };
    const updatedTracksById = new Map([["a", updatedTrackA], ["b", trackB]] as [string, Track][]);
    expect(isPreparationStale(prep, slots, updatedTracksById)).toBe(true);
    expect(isPreparationStale(prep, slots, tracksById)).toBe(false);
  });
});

// ── Readiness ────────────────────────────────────────────────────────────────

describe("readiness", () => {
  it("all ready plans → ready", () => {
    const readyPlan = { status: "ready" } as never;
    expect(computeReadiness([readyPlan, readyPlan])).toBe("ready");
  });

  it("any fallback (no review/blocked) → ready_with_fallbacks", () => {
    const readyPlan = { status: "ready" } as never;
    const fallbackPlan = { status: "ready_with_fallback" } as never;
    expect(computeReadiness([readyPlan, fallbackPlan])).toBe("ready_with_fallbacks");
  });

  it("any review item → needs_review", () => {
    const fallbackPlan = { status: "ready_with_fallback" } as never;
    const reviewPlan = { status: "needs_review" } as never;
    expect(computeReadiness([fallbackPlan, reviewPlan])).toBe("needs_review");
  });

  it("any blocked item → blocked", () => {
    const readyPlan = { status: "ready" } as never;
    const blockedPlan = { status: "blocked" } as never;
    expect(computeReadiness([readyPlan, blockedPlan])).toBe("blocked");
  });
});

// ── Duration ─────────────────────────────────────────────────────────────────

describe("duration", () => {
  it("prepared duration subtracts transition overlap from the effective total", () => {
    const tracks = ["a", "b"].map((id) => makeTrack(id, { durationSeconds: 200, playbackBounds: makeBounds() }));
    const tracksById = new Map(tracks.map((t) => [t.trackId, t]));
    const slots = tracks.map((t, i) => makeSlot(`s${i}`, i, t.trackId));
    const prep = preparePlaylistForPlayback("pl1", slots, tracksById, NOW);
    const duration = computePreparedPlaylistDuration(slots, tracksById, prep);
    expect(duration.preparedTotalSeconds).toBeLessThanOrEqual(duration.effectiveTotalSeconds);
  });

  it("source and effective durations remain unchanged by preparation", () => {
    const tracks = ["a", "b"].map((id) => makeTrack(id, { durationSeconds: 200, playbackBounds: makeBounds() }));
    const tracksById = new Map(tracks.map((t) => [t.trackId, t]));
    const slots = tracks.map((t, i) => makeSlot(`s${i}`, i, t.trackId));
    const durationBefore = computePreparedPlaylistDuration(slots, tracksById);
    const prep = preparePlaylistForPlayback("pl1", slots, tracksById, NOW);
    const durationAfter = computePreparedPlaylistDuration(slots, tracksById, prep);
    expect(durationAfter.sourceTotalSeconds).toBe(durationBefore.sourceTotalSeconds);
    expect(durationAfter.effectiveTotalSeconds).toBe(durationBefore.effectiveTotalSeconds);
  });
});

// ── Regression ───────────────────────────────────────────────────────────────

describe("regression", () => {
  it("preparing a playlist does not mutate the input tracks or slots", () => {
    const tracks = ["a", "b"].map((id) => makeTrack(id, { beatMap: makeBeatMap(), playbackBounds: makeBounds() }));
    const tracksById = new Map(tracks.map((t) => [t.trackId, t]));
    const slots = tracks.map((t, i) => makeSlot(`s${i}`, i, t.trackId));
    const slotsCopy = JSON.parse(JSON.stringify(slots));
    preparePlaylistForPlayback("pl1", slots, tracksById, NOW);
    expect(slots).toEqual(slotsCopy);
  });

  it("beat-map and playback-bounds objects on tracks are not modified by preparation", () => {
    const beatMap = makeBeatMap();
    const bounds = makeBounds();
    const track = makeTrack("a", { beatMap, playbackBounds: bounds });
    const trackB = makeTrack("b", { beatMap: makeBeatMap(), playbackBounds: makeBounds() });
    const tracksById = new Map([["a", track], ["b", trackB]] as [string, Track][]);
    const slots = [makeSlot("s0", 0, "a"), makeSlot("s1", 1, "b")];
    preparePlaylistForPlayback("pl1", slots, tracksById, NOW);
    expect(track.beatMap).toBe(beatMap);
    expect(track.playbackBounds).toBe(bounds);
  });
});

// ── Local re-preparation (0714 Completion Pass §10) ─────────────────────────

describe("local re-preparation", () => {
  function fourTrackPlaylist() {
    const tracks = ["a", "b", "c", "d"].map((id) => makeTrack(id, { beatMap: makeBeatMap(), playbackBounds: makeBounds() }));
    const tracksById = new Map(tracks.map((t) => [t.trackId, t]));
    const slots = tracks.map((t, i) => makeSlot(`s${i}`, i, t.trackId));
    const prep = preparePlaylistForPlayback("pl1", slots, tracksById, NOW);
    return { tracks, tracksById, slots, prep };
  }

  it("replacing one track recomputes exactly the two adjacent plans and preserves the rest", () => {
    const { tracksById, slots, prep } = fourTrackPlaylist();
    const oldPlans = prep.transitionPlans;

    const replacement = makeTrack("e", { beatMap: makeBeatMap(), playbackBounds: makeBounds() });
    const nextTracksById = new Map(tracksById);
    nextTracksById.set("e", replacement);
    const nextSlots = slots.map((s) => (s.slotId === "s1" ? { ...s, assignedTrackId: "e" } : s));

    const stale = countStaleLocalTransitions(nextSlots, nextTracksById, prep);
    expect(stale).toBe(2); // a→e (was a→b) and e→c (was b→c)

    const reprepared = reprepareLocalTransitions("pl1", nextSlots, nextTracksById, prep, "2026-01-02T00:00:00Z");
    expect(reprepared.transitionPlans).toHaveLength(3);

    const cToD = reprepared.transitionPlans.find((p) => p.transitionId === "s2__s3");
    const oldCToD = oldPlans.find((p) => p.transitionId === "s2__s3");
    expect(cToD).toBe(oldCToD); // byte-identical, untouched

    const aToE = reprepared.transitionPlans.find((p) => p.transitionId === "s0__s1");
    expect(aToE?.toTrackId).toBe("e");
    expect(aToE?.preparedAt).toBe("2026-01-02T00:00:00Z");
  });

  it("removing one track invalidates its old plans and creates exactly one new adjacency", () => {
    const { tracksById, slots, prep } = fourTrackPlaylist();
    const slotsAfterRemoval = slots.filter((s) => s.slotId !== "s1");

    const reprepared = reprepareLocalTransitions("pl1", slotsAfterRemoval, tracksById, prep, "2026-01-02T00:00:00Z");
    expect(reprepared.transitionPlans).toHaveLength(2);
    const aToC = reprepared.transitionPlans.find((p) => p.transitionId === "s0__s2");
    expect(aToC).toBeDefined();
    expect(aToC?.fromTrackId).toBe("a");
    expect(aToC?.toTrackId).toBe("c");
    // the previously-adjacent b-touching plans are gone
    expect(reprepared.transitionPlans.find((p) => p.transitionId === "s0__s1")).toBeUndefined();
    expect(reprepared.transitionPlans.find((p) => p.transitionId === "s1__s2")).toBeUndefined();
  });

  it("reordering invalidates only the changed adjacencies; untouched pairs stay identical", () => {
    const { tracksById, slots, prep } = fourTrackPlaylist();
    // swap b and c: a,c,b,d
    const reordered = [
      { ...slots[0], slotIndex: 0 },
      { ...slots[2], slotIndex: 1 },
      { ...slots[1], slotIndex: 2 },
      { ...slots[3], slotIndex: 3 },
    ];
    const reprepared = reprepareLocalTransitions("pl1", reordered, tracksById, prep, "2026-01-02T00:00:00Z");
    expect(reprepared.transitionPlans).toHaveLength(3);
    // resolved order is a, c, b, d → adjacencies a-c, c-b, b-d
    expect(reprepared.transitionPlans.map((p) => p.transitionId).sort()).toEqual(["s0__s2", "s2__s1", "s1__s3"].sort());
  });

  it("an analysis revision change marks only that adjacency's plans stale", () => {
    const { tracksById, slots, prep } = fourTrackPlaylist();
    const revised = makeTrack("b", { beatMap: makeBeatMap({ analyzedAt: "2026-02-01T00:00:00Z" }), playbackBounds: makeBounds() });
    const nextTracksById = new Map(tracksById);
    nextTracksById.set("b", revised);

    const stale = countStaleLocalTransitions(slots, nextTracksById, prep);
    expect(stale).toBe(2); // a→b and b→c

    const reprepared = reprepareLocalTransitions("pl1", slots, nextTracksById, prep, "2026-01-02T00:00:00Z");
    const cToD = reprepared.transitionPlans.find((p) => p.transitionId === "s2__s3");
    expect(cToD).toBe(prep.transitionPlans.find((p) => p.transitionId === "s2__s3")); // untouched
  });

  it("countStaleLocalTransitions is 0 for an unmodified playlist", () => {
    const { tracksById, slots, prep } = fourTrackPlaylist();
    expect(countStaleLocalTransitions(slots, tracksById, prep)).toBe(0);
  });

  it("countStaleLocalTransitions is 0 when there is no preparation yet", () => {
    const { tracksById, slots } = fourTrackPlaylist();
    expect(countStaleLocalTransitions(slots, tracksById, undefined)).toBe(0);
  });
});
