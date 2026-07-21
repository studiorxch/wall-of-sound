import { describe, it, expect } from "vitest";
import { compareMusicBankToRadioBank } from "./radioBankUpdateComparison";
import { sendBankToRadio } from "./musicToRadioBankSync";
import type { PlaylistRecord } from "../../data/playProjectTypes";
import type { TrackSlot } from "../../data/playlistTypes";
import type { Track } from "../../data/trackTypes";

const NOW = "2026-07-17T00:00:00.000Z";

function slot(slotIndex: number, assignedTrackId?: string): TrackSlot {
  return { slotId: `slot_${slotIndex}`, slotIndex, startTimeSeconds: slotIndex * 180, targetEnergy: 0.5, targetBpm: 120, assignedTrackId, warningLevel: "none", warningMessages: [] };
}

function bank(slots: TrackSlot[]): PlaylistRecord {
  return {
    playlistId: "bank_1", title: "Kick Kit", slots, curve: {} as unknown as PlaylistRecord["curve"],
    locks: [], orphans: [], targetDurationMinutes: 0, playlistKind: "reference_overlay",
    createdAt: NOW, updatedAt: NOW,
  } as unknown as PlaylistRecord;
}

function track(trackId: string): Track {
  return { trackId, title: trackId, audioRelPath: `${trackId}.wav`, durationSeconds: 2, sourceOwner: "reference" } as unknown as Track;
}

const TRACKS = [track("s1"), track("s2"), track("s3"), track("s4")];

function sync(slots: TrackSlot[]) {
  return sendBankToRadio(bank(slots), null, [], TRACKS, NOW);
}

describe("compareMusicBankToRadioBank", () => {
  it("reports no changes when the source bank is unchanged", () => {
    const { radioBank, inboxItems } = sync([slot(0, "s1"), slot(1, "s2"), slot(2, "s3")]);
    const diff = compareMusicBankToRadioBank(bank([slot(0, "s1"), slot(1, "s2"), slot(2, "s3")]), radioBank, inboxItems);
    expect(diff).toEqual({ orderChanged: false, membershipChanged: false, addedTrackIds: [], removedTrackIds: [], changedFields: [] });
  });

  it("detects an added member without falsely reporting a reorder", () => {
    const { radioBank, inboxItems } = sync([slot(0, "s1"), slot(1, "s2")]);
    const diff = compareMusicBankToRadioBank(bank([slot(0, "s1"), slot(1, "s2"), slot(2, "s3")]), radioBank, inboxItems);
    expect(diff.membershipChanged).toBe(true);
    expect(diff.addedTrackIds).toEqual(["s3"]);
    expect(diff.removedTrackIds).toEqual([]);
    expect(diff.orderChanged).toBe(false);
    expect(diff.changedFields).toEqual(["membership"]);
  });

  it("detects a removed member", () => {
    const { radioBank, inboxItems } = sync([slot(0, "s1"), slot(1, "s2"), slot(2, "s3")]);
    const diff = compareMusicBankToRadioBank(bank([slot(0, "s1"), slot(1, "s3")]), radioBank, inboxItems);
    expect(diff.membershipChanged).toBe(true);
    expect(diff.removedTrackIds).toEqual(["s2"]);
    expect(diff.addedTrackIds).toEqual([]);
  });

  it("detects a pure reorder (same membership, different order)", () => {
    const { radioBank, inboxItems } = sync([slot(0, "s1"), slot(1, "s2"), slot(2, "s3")]);
    const diff = compareMusicBankToRadioBank(bank([slot(0, "s3"), slot(1, "s1"), slot(2, "s2")]), radioBank, inboxItems);
    expect(diff.orderChanged).toBe(true);
    expect(diff.membershipChanged).toBe(false);
    expect(diff.changedFields).toEqual(["order"]);
  });

  it("detects both membership and order changes together", () => {
    const { radioBank, inboxItems } = sync([slot(0, "s1"), slot(1, "s2"), slot(2, "s3")]);
    const diff = compareMusicBankToRadioBank(bank([slot(0, "s4"), slot(1, "s3"), slot(2, "s1")]), radioBank, inboxItems);
    expect(diff.membershipChanged).toBe(true);
    expect(diff.addedTrackIds).toEqual(["s4"]);
    expect(diff.removedTrackIds).toEqual(["s2"]);
    expect(diff.orderChanged).toBe(true);
    expect(diff.changedFields).toEqual(["order", "membership"]);
  });
});
