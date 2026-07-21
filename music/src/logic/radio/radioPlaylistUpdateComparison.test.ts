import { describe, it, expect } from "vitest";
import { compareMusicPlaylistToRadioPlaylist } from "./radioPlaylistUpdateComparison";
import { sendPlaylistToRadio } from "./musicToRadioPlaylistSync";
import type { PlaylistRecord } from "../../data/playProjectTypes";
import type { TrackSlot } from "../../data/playlistTypes";
import type { Track } from "../../data/trackTypes";

const NOW = "2026-07-17T00:00:00.000Z";

function slot(slotIndex: number, assignedTrackId?: string): TrackSlot {
  return { slotId: `slot_${slotIndex}`, slotIndex, startTimeSeconds: slotIndex * 180, targetEnergy: 0.5, targetBpm: 120, assignedTrackId, warningLevel: "none", warningMessages: [] };
}

function playlist(slots: TrackSlot[]): PlaylistRecord {
  return {
    playlistId: "pl_1", title: "Friday Set", slots, curve: {} as unknown as PlaylistRecord["curve"],
    locks: [], orphans: [], targetDurationMinutes: 60, createdAt: NOW, updatedAt: NOW,
  } as unknown as PlaylistRecord;
}

function track(trackId: string): Track {
  return { trackId, title: trackId, audioRelPath: `${trackId}.wav`, durationSeconds: 200 } as unknown as Track;
}

const TRACKS = [track("t1"), track("t2"), track("t3"), track("t4")];

function sync(slots: TrackSlot[]) {
  return sendPlaylistToRadio(playlist(slots), null, [], TRACKS, NOW);
}

describe("compareMusicPlaylistToRadioPlaylist", () => {
  it("reports no changes when the source playlist is unchanged", () => {
    const { radioPlaylist, inboxItems } = sync([slot(0, "t1"), slot(1, "t2"), slot(2, "t3")]);
    const diff = compareMusicPlaylistToRadioPlaylist(playlist([slot(0, "t1"), slot(1, "t2"), slot(2, "t3")]), radioPlaylist, inboxItems);
    expect(diff).toEqual({ orderChanged: false, membershipChanged: false, addedTrackIds: [], removedTrackIds: [], changedFields: [] });
  });

  it("detects an added track without falsely reporting a reorder", () => {
    const { radioPlaylist, inboxItems } = sync([slot(0, "t1"), slot(1, "t2")]);
    const diff = compareMusicPlaylistToRadioPlaylist(playlist([slot(0, "t1"), slot(1, "t2"), slot(2, "t3")]), radioPlaylist, inboxItems);
    expect(diff.membershipChanged).toBe(true);
    expect(diff.addedTrackIds).toEqual(["t3"]);
    expect(diff.removedTrackIds).toEqual([]);
    expect(diff.orderChanged).toBe(false);
    expect(diff.changedFields).toEqual(["membership"]);
  });

  it("detects a removed track", () => {
    const { radioPlaylist, inboxItems } = sync([slot(0, "t1"), slot(1, "t2"), slot(2, "t3")]);
    const diff = compareMusicPlaylistToRadioPlaylist(playlist([slot(0, "t1"), slot(1, "t3")]), radioPlaylist, inboxItems);
    expect(diff.membershipChanged).toBe(true);
    expect(diff.removedTrackIds).toEqual(["t2"]);
    expect(diff.addedTrackIds).toEqual([]);
  });

  it("detects a pure reorder (same membership, different order)", () => {
    const { radioPlaylist, inboxItems } = sync([slot(0, "t1"), slot(1, "t2"), slot(2, "t3")]);
    const diff = compareMusicPlaylistToRadioPlaylist(playlist([slot(0, "t3"), slot(1, "t1"), slot(2, "t2")]), radioPlaylist, inboxItems);
    expect(diff.orderChanged).toBe(true);
    expect(diff.membershipChanged).toBe(false);
    expect(diff.addedTrackIds).toEqual([]);
    expect(diff.removedTrackIds).toEqual([]);
    expect(diff.changedFields).toEqual(["order"]);
  });

  it("detects both membership and order changes together", () => {
    const { radioPlaylist, inboxItems } = sync([slot(0, "t1"), slot(1, "t2"), slot(2, "t3")]);
    const diff = compareMusicPlaylistToRadioPlaylist(playlist([slot(0, "t4"), slot(1, "t3"), slot(2, "t1")]), radioPlaylist, inboxItems);
    expect(diff.membershipChanged).toBe(true);
    expect(diff.addedTrackIds).toEqual(["t4"]);
    expect(diff.removedTrackIds).toEqual(["t2"]);
    expect(diff.orderChanged).toBe(true);
    expect(diff.changedFields).toEqual(["order", "membership"]);
  });
});
