import { describe, it, expect } from "vitest";
import { sendPlaylistToRadio } from "./musicToRadioPlaylistSync";
import type { PlaylistRecord } from "../../data/playProjectTypes";
import type { TrackSlot } from "../../data/playlistTypes";
import type { Track } from "../../data/trackTypes";
import type { RadioInboxItem } from "../../data/radioInboxTypes";
import type { RadioPlaylist } from "../../data/radioPlaylistTypes";

const NOW = "2026-07-17T00:00:00.000Z";
const LATER = "2026-07-17T01:00:00.000Z";

function slot(slotIndex: number, assignedTrackId?: string): TrackSlot {
  return { slotId: `slot_${slotIndex}`, slotIndex, startTimeSeconds: slotIndex * 180, targetEnergy: 0.5, targetBpm: 120, assignedTrackId, warningLevel: "none", warningMessages: [] };
}

function playlist(slots: TrackSlot[], overrides: Partial<PlaylistRecord> = {}): PlaylistRecord {
  return {
    playlistId: "pl_1", title: "Friday Set", slots, curve: {} as unknown as PlaylistRecord["curve"],
    locks: [], orphans: [], targetDurationMinutes: 60, createdAt: NOW, updatedAt: NOW,
    ...overrides,
  } as unknown as PlaylistRecord;
}

function track(trackId: string): Track {
  return { trackId, title: trackId, audioRelPath: `${trackId}.wav`, durationSeconds: 200 } as unknown as Track;
}

describe("sendPlaylistToRadio — order preservation and creation", () => {
  it("creates a fresh DRAFT playlist whose entries follow slot order, one Inbox item per track", () => {
    const src = playlist([slot(0, "t1"), slot(1, "t2"), slot(2, "t3")]);
    const tracks = [track("t1"), track("t2"), track("t3")];
    const result = sendPlaylistToRadio(src, null, [], tracks, NOW);

    expect(result.changed).toBe(true);
    expect(result.radioPlaylist.state).toBe("DRAFT");
    expect(result.radioPlaylist.sourceMusicPlaylistId).toBe("pl_1");
    expect(result.radioPlaylist.entries.length).toBe(3);
    expect(result.inboxItems.length).toBe(3);

    const orderedTrackIds = result.radioPlaylist.entries.map((e) => {
      const item = result.inboxItems.find((i) => i.id === e.inboxItemId)!;
      return item.sourceTrackId;
    });
    expect(orderedTrackIds).toEqual(["t1", "t2", "t3"]);
  });

  it("skips empty slots", () => {
    const src = playlist([slot(0, "t1"), slot(1, undefined), slot(2, "t2")]);
    const result = sendPlaylistToRadio(src, null, [], [track("t1"), track("t2")], NOW);
    expect(result.radioPlaylist.entries.length).toBe(2);
  });
});

describe("sendPlaylistToRadio — idempotent re-send", () => {
  it("re-sending an unchanged playlist returns the same draft, unchanged, with zero new Inbox items", () => {
    const src = playlist([slot(0, "t1"), slot(1, "t2")]);
    const tracks = [track("t1"), track("t2")];
    const first = sendPlaylistToRadio(src, null, [], tracks, NOW);

    const second = sendPlaylistToRadio(src, first.radioPlaylist, first.inboxItems, tracks, LATER);

    expect(second.changed).toBe(false);
    expect(second.radioPlaylist.updatedAt).toBe(NOW); // untouched — same object, no LATER stamp
    expect(second.inboxItems.length).toBe(first.inboxItems.length);
    expect(second.inboxItems).toBe(first.inboxItems);
  });
});

describe("sendPlaylistToRadio — locked entries survive source removal", () => {
  it("a locked entry whose track left the source playlist is preserved, not dropped or silently reordered away", () => {
    const src1 = playlist([slot(0, "t1"), slot(1, "t2"), slot(2, "t3")]);
    const tracks = [track("t1"), track("t2"), track("t3")];
    const first = sendPlaylistToRadio(src1, null, [], tracks, NOW);

    // Lock the entry for t2.
    const t2InboxItem = first.inboxItems.find((i) => i.sourceTrackId === "t2")!;
    const lockedPlaylist: RadioPlaylist = {
      ...first.radioPlaylist,
      entries: first.radioPlaylist.entries.map((e) => (e.inboxItemId === t2InboxItem.id ? { ...e, locked: true } : e)),
    };

    // t2 is removed from the source MUSIC playlist entirely.
    const src2 = playlist([slot(0, "t1"), slot(1, "t3")]);
    const second = sendPlaylistToRadio(src2, lockedPlaylist, first.inboxItems, tracks, LATER);

    expect(second.changed).toBe(true);
    const survivingLocked = second.radioPlaylist.entries.find((e) => e.inboxItemId === t2InboxItem.id);
    expect(survivingLocked).toBeDefined();
    expect(survivingLocked!.locked).toBe(true);
    // t1 and t3 still present too — nothing else lost.
    expect(second.radioPlaylist.entries.length).toBe(3);
  });

  it("an unlocked entry whose track left the source playlist is dropped", () => {
    const src1 = playlist([slot(0, "t1"), slot(1, "t2")]);
    const tracks = [track("t1"), track("t2")];
    const first = sendPlaylistToRadio(src1, null, [], tracks, NOW);

    const src2 = playlist([slot(0, "t1")]);
    const second = sendPlaylistToRadio(src2, first.radioPlaylist, first.inboxItems, tracks, LATER);

    expect(second.radioPlaylist.entries.length).toBe(1);
  });
});

describe("sendPlaylistToRadio — create-vs-update branching", () => {
  it("null existingRadioPlaylist creates a brand new draft with version 1", () => {
    const src = playlist([slot(0, "t1")]);
    const result = sendPlaylistToRadio(src, null, [], [track("t1")], NOW);
    expect(result.radioPlaylist.version).toBe("1");
    expect(result.radioPlaylist.createdAt).toBe(NOW);
  });

  it("an existing non-published draft is updated in place, preserving id and version", () => {
    const src1 = playlist([slot(0, "t1")]);
    const first = sendPlaylistToRadio(src1, null, [], [track("t1")], NOW);

    const src2 = playlist([slot(0, "t1"), slot(1, "t2")]);
    const second = sendPlaylistToRadio(src2, first.radioPlaylist, first.inboxItems, [track("t1"), track("t2")], LATER);

    expect(second.radioPlaylist.id).toBe(first.radioPlaylist.id);
    expect(second.radioPlaylist.version).toBe(first.radioPlaylist.version);
    expect(second.radioPlaylist.createdAt).toBe(NOW);
    expect(second.radioPlaylist.updatedAt).toBe(LATER);
  });

  // Identity corrective pass (batch 0929-4) — replaces the old assertion
  // that a PUBLISHED RadioPlaylist forks a fresh draft identity on
  // re-send. Human acceptance of commit 9d50ffe exposed that behavior as
  // a real defect: editing the source MUSIC playlist's title and
  // re-sending created a SECOND RadioPlaylist instead of updating the
  // existing one, leaving two RadioPlaylists (β0.1.1, β0.1.2) for one
  // MUSIC playlist. RadioPlaylist identity must be stable regardless of
  // `state` — Package immutability (see radioWebBundleWriter.test.ts's
  // own "re-export never touches v1" coverage) already guarantees
  // publication safety at the correct layer.
  it("a PUBLISHED radioPlaylist IS updated in place on re-send — identity never forks", () => {
    const src1 = playlist([slot(0, "t1")]);
    const first = sendPlaylistToRadio(src1, null, [], [track("t1")], NOW);
    const published: RadioPlaylist = { ...first.radioPlaylist, state: "PUBLISHED", publishedAt: NOW };

    const src2 = playlist([slot(0, "t1"), slot(1, "t2")]);
    const second = sendPlaylistToRadio(src2, published, first.inboxItems, [track("t1"), track("t2")], LATER);

    expect(second.changed).toBe(true);
    expect(second.radioPlaylist.id).toBe(published.id);
    expect(second.radioPlaylist.version).toBe(published.version);
    // The editorial PUBLISHED mark is preserved, not reset by an edit —
    // this batch changes identity handling only, not state semantics.
    expect(second.radioPlaylist.state).toBe("PUBLISHED");
    expect(second.radioPlaylist.entries.length).toBe(2);
  });
});

describe("sendPlaylistToRadio — identity stability (batch 0929-4 regression)", () => {
  it("1. a first Send creates exactly one RadioPlaylist identity", () => {
    const src = playlist([slot(0, "t1")], { title: "β0.1.1" });
    const result = sendPlaylistToRadio(src, null, [], [track("t1")], NOW);
    expect(result.radioPlaylist.id).toMatch(/^radplaylist_/);
    expect(result.radioPlaylist.sourceMusicPlaylistId).toBe("pl_1");
  });

  it("2. editing the title and sending again (playlist already PUBLISHED) leaves exactly one identity", () => {
    const src1 = playlist([slot(0, "t1")], { title: "β0.1.1" });
    const first = sendPlaylistToRadio(src1, null, [], [track("t1")], NOW);
    const published: RadioPlaylist = { ...first.radioPlaylist, state: "PUBLISHED", publishedAt: NOW };

    const src2 = playlist([slot(0, "t1")], { title: "β0.1.2" });
    const second = sendPlaylistToRadio(src2, published, first.inboxItems, [track("t1")], LATER);

    expect(second.radioPlaylist.id).toBe(first.radioPlaylist.id);
    expect(second.radioPlaylist.title).toBe("β0.1.2");
  });

  it("3. editing tracks and sending again (playlist already PUBLISHED) leaves exactly one identity", () => {
    const src1 = playlist([slot(0, "t1")]);
    const first = sendPlaylistToRadio(src1, null, [], [track("t1")], NOW);
    const published: RadioPlaylist = { ...first.radioPlaylist, state: "PUBLISHED", publishedAt: NOW };

    const src2 = playlist([slot(0, "t1"), slot(1, "t2"), slot(2, "t3")]);
    const second = sendPlaylistToRadio(src2, published, first.inboxItems, [track("t1"), track("t2"), track("t3")], LATER);

    expect(second.radioPlaylist.id).toBe(first.radioPlaylist.id);
    expect(second.radioPlaylist.entries.length).toBe(3);
  });

  it("4. identity is stable across a full realistic sequence: send, publish, edit title, edit tracks, re-send again", () => {
    const src1 = playlist([slot(0, "t1"), slot(1, "t2")], { title: "β0.1.1" });
    const sent = sendPlaylistToRadio(src1, null, [], [track("t1"), track("t2")], NOW);
    const originalId = sent.radioPlaylist.id;

    // Simulate a successful Publish's own side effect (computePublishPatch
    // sets state: "PUBLISHED" — see radioOnePublishOrchestrator.ts).
    const afterPublish: RadioPlaylist = { ...sent.radioPlaylist, state: "PUBLISHED", publishedAt: NOW };

    const src2 = playlist([slot(0, "t1"), slot(1, "t2")], { title: "β0.1.2" });
    const afterTitleEdit = sendPlaylistToRadio(src2, afterPublish, sent.inboxItems, [track("t1"), track("t2")], LATER);
    expect(afterTitleEdit.radioPlaylist.id).toBe(originalId);

    const src3 = playlist([slot(0, "t1"), slot(1, "t2"), slot(2, "t3")], { title: "β0.1.2" });
    const afterTrackEdit = sendPlaylistToRadio(
      src3,
      afterTitleEdit.radioPlaylist,
      afterTitleEdit.inboxItems,
      [track("t1"), track("t2"), track("t3")],
      LATER,
    );
    expect(afterTrackEdit.radioPlaylist.id).toBe(originalId);
    expect(afterTrackEdit.radioPlaylist.entries.length).toBe(3);
  });
});

describe("sendPlaylistToRadio — snapshot-at-send-time (0718A §2)", () => {
  it("snapshots title/coverImage/accentColor/durationSeconds from sourcePlaylist on the first send", () => {
    const src = playlist([slot(0, "t1"), slot(1, "t2")], {
      title: "Friday Set",
      coverImage: { src: "data:image/png;base64,AAA", source: "uploaded", createdAt: NOW },
      accentColor: "#ff0000",
    });
    const result = sendPlaylistToRadio(src, null, [], [track("t1"), track("t2")], NOW);
    expect(result.radioPlaylist.title).toBe("Friday Set");
    expect(result.radioPlaylist.coverImage?.src).toBe("data:image/png;base64,AAA");
    expect(result.radioPlaylist.accentColor).toBe("#ff0000");
    expect(result.radioPlaylist.durationSeconds).toBe(400); // 2 tracks x 200s
  });

  it("refreshes the snapshot on every re-send, even a title-only rename with unchanged tracks", () => {
    const src1 = playlist([slot(0, "t1")], { title: "Old Title" });
    const first = sendPlaylistToRadio(src1, null, [], [track("t1")], NOW);
    expect(first.radioPlaylist.title).toBe("Old Title");

    const src2 = playlist([slot(0, "t1")], { title: "New Title" });
    const second = sendPlaylistToRadio(src2, first.radioPlaylist, first.inboxItems, [track("t1")], LATER);

    expect(second.changed).toBe(true);
    expect(second.radioPlaylist.title).toBe("New Title");
    expect(second.radioPlaylist.updatedAt).toBe(LATER);
  });

  it("a truly unchanged re-send (same tracks AND same title/cover/accent) stays a true no-op", () => {
    const src = playlist([slot(0, "t1")], { title: "Steady", accentColor: "#00ff00" });
    const first = sendPlaylistToRadio(src, null, [], [track("t1")], NOW);
    const second = sendPlaylistToRadio(src, first.radioPlaylist, first.inboxItems, [track("t1")], LATER);
    expect(second.changed).toBe(false);
    expect(second.radioPlaylist).toBe(first.radioPlaylist);
  });

  it("the RADIO snapshot survives later, un-sent MUSIC source mutation unchanged", () => {
    const src1 = playlist([slot(0, "t1")], { title: "Original" });
    const first = sendPlaylistToRadio(src1, null, [], [track("t1")], NOW);

    // Source is mutated in MUSIC but never re-sent.
    const mutatedSrc = playlist([slot(0, "t1")], { title: "Mutated Elsewhere" });
    void mutatedSrc; // simulated MUSIC-side mutation, never passed back into sendPlaylistToRadio

    expect(first.radioPlaylist.title).toBe("Original");
  });
});

describe("sendPlaylistToRadio — reuses existing Inbox items across sends", () => {
  it("does not create a duplicate Inbox item for a track already staged from a different source", () => {
    const existingItem: RadioInboxItem = {
      id: "radinbox_existing", kind: "track", sourceTrackId: "t1", sourceFingerprint: "t1.wav::200.00",
      state: "INBOX", readiness: "UNPREPARED", assignedPlaylistIds: [], createdAt: NOW, updatedAt: NOW,
    };
    const src = playlist([slot(0, "t1")]);
    const result = sendPlaylistToRadio(src, null, [existingItem], [track("t1")], LATER);

    expect(result.inboxItems.length).toBe(1);
    expect(result.inboxItems[0].id).toBe("radinbox_existing");
    expect(result.inboxItems[0].assignedPlaylistIds).toContain(result.radioPlaylist.id);
  });
});
