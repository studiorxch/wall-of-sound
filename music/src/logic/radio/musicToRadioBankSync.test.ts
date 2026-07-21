import { describe, it, expect } from "vitest";
import { sendBankToRadio } from "./musicToRadioBankSync";
import type { PlaylistRecord } from "../../data/playProjectTypes";
import type { TrackSlot } from "../../data/playlistTypes";
import type { Track } from "../../data/trackTypes";
import type { RadioInboxItem } from "../../data/radioInboxTypes";
import type { RadioBank } from "../../data/radioBankTypes";

const NOW = "2026-07-17T00:00:00.000Z";
const LATER = "2026-07-17T01:00:00.000Z";

function slot(slotIndex: number, assignedTrackId?: string): TrackSlot {
  return { slotId: `slot_${slotIndex}`, slotIndex, startTimeSeconds: slotIndex * 180, targetEnergy: 0.5, targetBpm: 120, assignedTrackId, warningLevel: "none", warningMessages: [] };
}

function bank(slots: TrackSlot[], overrides: Partial<PlaylistRecord> = {}): PlaylistRecord {
  return {
    playlistId: "bank_1", title: "Kick Kit", slots, curve: {} as unknown as PlaylistRecord["curve"],
    locks: [], orphans: [], targetDurationMinutes: 0, playlistKind: "reference_overlay",
    createdAt: NOW, updatedAt: NOW, ...overrides,
  } as unknown as PlaylistRecord;
}

function track(trackId: string): Track {
  return { trackId, title: trackId, audioRelPath: `${trackId}.wav`, durationSeconds: 2, sourceOwner: "reference" } as unknown as Track;
}

describe("sendBankToRadio — order preservation and creation", () => {
  it("creates a fresh RadioBank whose entries follow slot order, one Inbox item (kind: sound) per member", () => {
    const src = bank([slot(0, "s1"), slot(1, "s2"), slot(2, "s3")]);
    const tracks = [track("s1"), track("s2"), track("s3")];
    const result = sendBankToRadio(src, null, [], tracks, NOW);

    expect(result.changed).toBe(true);
    expect(result.radioBank.sourceMusicBankId).toBe("bank_1");
    expect(result.radioBank.entries.length).toBe(3);
    expect(result.inboxItems.length).toBe(3);
    expect(result.inboxItems.every((i) => i.kind === "sound")).toBe(true);

    const orderedSoundIds = result.radioBank.entries.map((e) => {
      const item = result.inboxItems.find((i) => i.id === e.inboxItemId)!;
      return item.sourceSoundId;
    });
    expect(orderedSoundIds).toEqual(["s1", "s2", "s3"]);
  });
});

describe("sendBankToRadio — idempotent re-send", () => {
  it("re-sending an unchanged bank returns the same record, unchanged, with zero new Inbox items", () => {
    const src = bank([slot(0, "s1"), slot(1, "s2")]);
    const tracks = [track("s1"), track("s2")];
    const first = sendBankToRadio(src, null, [], tracks, NOW);

    const second = sendBankToRadio(src, first.radioBank, first.inboxItems, tracks, LATER);

    expect(second.changed).toBe(false);
    expect(second.radioBank.updatedAt).toBe(NOW);
    expect(second.inboxItems).toBe(first.inboxItems);
    expect(second.radioBank).toBe(first.radioBank);
  });

  it("refreshes the title snapshot on a title-only rename even with unchanged members", () => {
    const src1 = bank([slot(0, "s1")], { title: "Old Kit" });
    const first = sendBankToRadio(src1, null, [], [track("s1")], NOW);

    const src2 = bank([slot(0, "s1")], { title: "New Kit" });
    const second = sendBankToRadio(src2, first.radioBank, first.inboxItems, [track("s1")], LATER);

    expect(second.changed).toBe(true);
    expect(second.radioBank.title).toBe("New Kit");
  });
});

describe("sendBankToRadio — locked entries survive source removal", () => {
  it("a locked entry whose source track left the bank is preserved, not dropped", () => {
    const src1 = bank([slot(0, "s1"), slot(1, "s2"), slot(2, "s3")]);
    const tracks = [track("s1"), track("s2"), track("s3")];
    const first = sendBankToRadio(src1, null, [], tracks, NOW);

    const s2Item = first.inboxItems.find((i) => i.sourceSoundId === "s2")!;
    const lockedBank: RadioBank = {
      ...first.radioBank,
      entries: first.radioBank.entries.map((e) => (e.inboxItemId === s2Item.id ? { ...e, locked: true } : e)),
    };

    const src2 = bank([slot(0, "s1"), slot(1, "s3")]);
    const second = sendBankToRadio(src2, lockedBank, first.inboxItems, tracks, LATER);

    expect(second.changed).toBe(true);
    const survivingLocked = second.radioBank.entries.find((e) => e.inboxItemId === s2Item.id);
    expect(survivingLocked).toBeDefined();
    expect(survivingLocked!.locked).toBe(true);
    expect(second.radioBank.entries.length).toBe(3);
  });

  it("an unlocked entry whose source track left the bank is dropped", () => {
    const src1 = bank([slot(0, "s1"), slot(1, "s2")]);
    const tracks = [track("s1"), track("s2")];
    const first = sendBankToRadio(src1, null, [], tracks, NOW);

    const src2 = bank([slot(0, "s1")]);
    const second = sendBankToRadio(src2, first.radioBank, first.inboxItems, tracks, LATER);
    expect(second.radioBank.entries.length).toBe(1);
  });
});

describe("sendBankToRadio — reuses existing Inbox items across sends", () => {
  it("does not create a duplicate Inbox item for a sound already staged from a different source", () => {
    const existingItem: RadioInboxItem = {
      id: "radinbox_existing", kind: "sound", sourceSoundId: "s1", sourceFingerprint: "s1.wav::2.00",
      state: "INBOX", readiness: "UNPREPARED", assignedPlaylistIds: [], createdAt: NOW, updatedAt: NOW,
    };
    const src = bank([slot(0, "s1")]);
    const result = sendBankToRadio(src, null, [existingItem], [track("s1")], LATER);

    expect(result.inboxItems.length).toBe(1);
    expect(result.inboxItems[0].id).toBe("radinbox_existing");
    expect(result.inboxItems[0].assignedBankIds).toContain(result.radioBank.id);
  });
});
