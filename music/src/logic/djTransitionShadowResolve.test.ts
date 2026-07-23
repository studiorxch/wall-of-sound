import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PlaylistRecord } from "../data/playProjectTypes";
import type { Track } from "../data/trackTypes";
import type { TrackSlot } from "../data/playlistTypes";
import type { PlaylistTransitionPlan } from "../data/playlistTransitionTypes";
import { computeAdjacentAssignedPairs, findLegacyPlanForPair, resolveDjTransitionPairShadow } from "./djTransitionShadowResolve";

function makeSlot(id: string, index: number, trackId?: string): TrackSlot {
  return { slotId: id, slotIndex: index, startTimeSeconds: index * 200, targetEnergy: 0.5, targetBpm: 120, assignedTrackId: trackId, warningLevel: "none", warningMessages: [] };
}

function makeTrack(id: string, overrides: Partial<Track> = {}): Track {
  return {
    trackId: id, title: id, artist: "Artist", durationSeconds: 200, energy: 0.5,
    sourceOwner: "studiorich", genres: [], moodTags: [], moodSuggestions: [], sourcePoolIds: [],
    grouping: "", albumArtist: "", archiveStatus: "library",
    ...overrides,
  } as unknown as Track;
}

function makePlaylist(slots: TrackSlot[], overrides: Partial<PlaylistRecord> = {}): PlaylistRecord {
  return {
    playlistId: "pl-1", title: "Test Playlist", slots,
    curve: { anchors: [] } as unknown as PlaylistRecord["curve"],
    locks: [], orphans: [], targetDurationMinutes: 60,
    createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("computeAdjacentAssignedPairs", () => {
  it("pairs only consecutive, fully-assigned slots in slotIndex order", () => {
    const tracksById = new Map([
      ["t1", makeTrack("t1")],
      ["t2", makeTrack("t2")],
      ["t3", makeTrack("t3")],
    ]);
    const playlist = makePlaylist([
      makeSlot("s3", 2, "t3"),
      makeSlot("s1", 0, "t1"),
      makeSlot("s2", 1, "t2"),
    ]);
    const pairs = computeAdjacentAssignedPairs(playlist, tracksById);
    expect(pairs).toHaveLength(2);
    expect(pairs[0].pairKey).toBe("s1__s2");
    expect(pairs[1].pairKey).toBe("s2__s3");
  });

  it("skips an empty slot and treats the next assigned slot as adjacent — matches the legacy preparePlaylist.ts precedent exactly", () => {
    const tracksById = new Map([["t1", makeTrack("t1")], ["t3", makeTrack("t3")]]);
    const playlist = makePlaylist([makeSlot("s1", 0, "t1"), makeSlot("s2", 1, undefined), makeSlot("s3", 2, "t3")]);
    const pairs = computeAdjacentAssignedPairs(playlist, tracksById);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].pairKey).toBe("s1__s3");
  });

  it("skips a slot whose assigned track no longer exists in the library", () => {
    const tracksById = new Map([["t1", makeTrack("t1")]]);
    const playlist = makePlaylist([makeSlot("s1", 0, "t1"), makeSlot("s2", 1, "missing-track")]);
    const pairs = computeAdjacentAssignedPairs(playlist, tracksById);
    expect(pairs).toHaveLength(0);
  });
});

describe("findLegacyPlanForPair", () => {
  it("finds the legacy plan matching the pair's exact slot adjacency", () => {
    const tracksById = new Map([["t1", makeTrack("t1")], ["t2", makeTrack("t2")]]);
    const playlist = makePlaylist(
      [makeSlot("s1", 0, "t1"), makeSlot("s2", 1, "t2")],
      {
        playbackPreparation: {
          playlistId: "pl-1", version: "1", readiness: "ready", readyCount: 1, fallbackCount: 0, reviewCount: 0, blockedCount: 0,
          sourceTrackRevisionMap: {}, preparedAt: "2026-01-01T00:00:00Z", detectorVersion: "playlist-transition-v1",
          warnings: [],
          transitionPlans: [{ fromSlotId: "s1", toSlotId: "s2" } as PlaylistTransitionPlan],
        },
      },
    );
    const pairs = computeAdjacentAssignedPairs(playlist, tracksById);
    const legacy = findLegacyPlanForPair(playlist, pairs[0]);
    expect(legacy).not.toBeNull();
    expect(legacy!.fromSlotId).toBe("s1");
  });

  it("returns null when no legacy preparation has ever run", () => {
    const tracksById = new Map([["t1", makeTrack("t1")], ["t2", makeTrack("t2")]]);
    const playlist = makePlaylist([makeSlot("s1", 0, "t1"), makeSlot("s2", 1, "t2")]);
    const pairs = computeAdjacentAssignedPairs(playlist, tracksById);
    expect(findLegacyPlanForPair(playlist, pairs[0])).toBeNull();
  });
});

describe("resolveDjTransitionPairShadow", () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true, sets: [], lifecycles: {} }) })) as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("resolves without throwing when there is no stem data at all, and never claims stem transport is implemented", async () => {
    const tracksById = new Map([["t1", makeTrack("t1")], ["t2", makeTrack("t2")]]);
    const playlist = makePlaylist([makeSlot("s1", 0, "t1"), makeSlot("s2", 1, "t2")]);
    const pairs = computeAdjacentAssignedPairs(playlist, tracksById);
    const resolution = await resolveDjTransitionPairShadow(pairs[0], "pl-1", new Map());
    expect(resolution.pairKey).toBe("s1__s2");
    expect(resolution.result.recommended.family).not.toBe("stem_assisted_transition");
  });

  it("fails closed (no stem evidence) when the stem-set fetch itself throws", async () => {
    global.fetch = vi.fn(async () => {
      throw new Error("network error");
    }) as unknown as typeof fetch;
    const tracksById = new Map([["t1", makeTrack("t1", { audioRelPath: "a.wav" })], ["t2", makeTrack("t2", { audioRelPath: "b.wav" })]]);
    const playlist = makePlaylist([makeSlot("s1", 0, "t1"), makeSlot("s2", 1, "t2")]);
    const pairs = computeAdjacentAssignedPairs(playlist, tracksById);
    const resolution = await resolveDjTransitionPairShadow(pairs[0], "pl-1", new Map());
    expect(resolution.result.recommended).toBeDefined();
  });
});
