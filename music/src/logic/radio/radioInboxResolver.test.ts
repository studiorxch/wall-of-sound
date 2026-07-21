import { describe, it, expect } from "vitest";
import { resolveOrCreateInboxItem, assignInboxItemToPlaylist, assignInboxItemToBank } from "./radioInboxResolver";
import type { RadioInboxItem } from "../../data/radioInboxTypes";

const NOW = "2026-07-17T00:00:00.000Z";

describe("resolveOrCreateInboxItem — exact-source idempotency", () => {
  it("the same kind+sourceRef resolves to the same item across repeated calls, never a duplicate", () => {
    const items: RadioInboxItem[] = [];
    const first = resolveOrCreateInboxItem(items, "loop", { sourceTrackId: "track_1", sourceLoopId: "loop_1", sourceFingerprint: "fp::1.00", startFrame: 0, endFrame: 100 }, NOW);
    expect(first.created).toBe(true);
    items.push(first.item);

    const second = resolveOrCreateInboxItem(items, "loop", { sourceTrackId: "track_1", sourceLoopId: "loop_1", sourceFingerprint: "fp::1.00", startFrame: 0, endFrame: 100 }, NOW);
    expect(second.created).toBe(false);
    expect(second.item.id).toBe(first.item.id);
  });

  it("distinct frame bounds on the same track remain distinct items", () => {
    const items: RadioInboxItem[] = [];
    const a = resolveOrCreateInboxItem(items, "loop", { sourceTrackId: "track_1", sourceLoopId: "loop_1", sourceFingerprint: "fp::1.00", startFrame: 0, endFrame: 100 }, NOW);
    items.push(a.item);
    const b = resolveOrCreateInboxItem(items, "loop", { sourceTrackId: "track_1", sourceLoopId: "loop_2", sourceFingerprint: "fp::1.00", startFrame: 200, endFrame: 300 }, NOW);
    expect(b.created).toBe(true);
    expect(b.item.id).not.toBe(a.item.id);
  });
});

describe("resolveOrCreateInboxItem — unsupported kinds", () => {
  it("a kind with no packaging path lands at NOT_YET_PACKAGEABLE on creation", () => {
    const items: RadioInboxItem[] = [];
    const result = resolveOrCreateInboxItem(items, "announcement", { sourceFingerprint: "fp::ann1" }, NOW);
    expect(result.item.readiness).toBe("NOT_YET_PACKAGEABLE");
  });

  // 0718B_RADIO_Web_Publication_Asset_Export_Bridge — "track" now has a
  // verified packaging path (RadioTrackPackage). A freshly created item
  // carries no songAnalysisStatus yet, so it lands at UNPREPARED (analysis
  // not yet run) rather than the old, permanent NOT_YET_PACKAGEABLE.
  it("kind: track lands at UNPREPARED on creation (has a packaging path, but no analysis yet)", () => {
    const items: RadioInboxItem[] = [];
    const result = resolveOrCreateInboxItem(items, "track", { sourceTrackId: "track_9", sourceFingerprint: "fp::9.00" }, NOW);
    expect(result.item.readiness).toBe("UNPREPARED");
  });
});

describe("assignInboxItemToPlaylist — same track twice in one playlist", () => {
  it("resolving the same source ref twice while assigning to two different playlists produces ONE item assigned to both, never a duplicate item", () => {
    const items: RadioInboxItem[] = [];
    const firstResolve = resolveOrCreateInboxItem(items, "loop", { sourceTrackId: "track_1", sourceLoopId: "loop_1", sourceFingerprint: "fp::1.00" }, NOW);
    let item = assignInboxItemToPlaylist(firstResolve.item, "radplaylist_a", NOW);
    items.push(item);

    // Same track appears again — this time in a second playlist.
    const secondResolve = resolveOrCreateInboxItem(items, "loop", { sourceTrackId: "track_1", sourceLoopId: "loop_1", sourceFingerprint: "fp::1.00" }, NOW);
    expect(secondResolve.created).toBe(false);
    item = assignInboxItemToPlaylist(secondResolve.item, "radplaylist_b", NOW);

    expect(item.assignedPlaylistIds).toEqual(["radplaylist_a", "radplaylist_b"]);
    expect(items.length).toBe(1);
  });

  it("assigning the same playlistId twice does not duplicate it", () => {
    const base: RadioInboxItem = {
      id: "radinbox_1", kind: "loop", sourceFingerprint: "fp::1.00",
      state: "INBOX", readiness: "UNPREPARED", assignedPlaylistIds: ["radplaylist_a"],
      createdAt: NOW, updatedAt: NOW,
    };
    const result = assignInboxItemToPlaylist(base, "radplaylist_a", NOW);
    expect(result.assignedPlaylistIds).toEqual(["radplaylist_a"]);
    expect(result).toBe(base); // no-op returns the same reference
  });
});

describe("assignInboxItemToBank — mirrors assignInboxItemToPlaylist on a separate list", () => {
  it("resolving the same source ref twice while assigning to two different banks produces ONE item assigned to both, never a duplicate item", () => {
    const items: RadioInboxItem[] = [];
    const firstResolve = resolveOrCreateInboxItem(items, "sound", { sourceSoundId: "sound_1", sourceFingerprint: "fp::s1" }, NOW);
    let item = assignInboxItemToBank(firstResolve.item, "radbank_a", NOW);
    items.push(item);

    const secondResolve = resolveOrCreateInboxItem(items, "sound", { sourceSoundId: "sound_1", sourceFingerprint: "fp::s1" }, NOW);
    expect(secondResolve.created).toBe(false);
    item = assignInboxItemToBank(secondResolve.item, "radbank_b", NOW);

    expect(item.assignedBankIds).toEqual(["radbank_a", "radbank_b"]);
    expect(items.length).toBe(1);
  });

  it("assigning the same bankId twice does not duplicate it", () => {
    const base: RadioInboxItem = {
      id: "radinbox_1", kind: "sound", sourceFingerprint: "fp::s1",
      state: "INBOX", readiness: "UNPREPARED", assignedPlaylistIds: [], assignedBankIds: ["radbank_a"],
      createdAt: NOW, updatedAt: NOW,
    };
    const result = assignInboxItemToBank(base, "radbank_a", NOW);
    expect(result.assignedBankIds).toEqual(["radbank_a"]);
    expect(result).toBe(base); // no-op returns the same reference
  });

  it("an item with no assignedBankIds yet (legacy/pre-0718A) assigns cleanly", () => {
    const base: RadioInboxItem = {
      id: "radinbox_2", kind: "sound", sourceFingerprint: "fp::s2",
      state: "INBOX", readiness: "UNPREPARED", assignedPlaylistIds: [],
      createdAt: NOW, updatedAt: NOW,
    };
    const result = assignInboxItemToBank(base, "radbank_a", NOW);
    expect(result.assignedBankIds).toEqual(["radbank_a"]);
  });

  it("playlist and bank association lists stay independent on the same item", () => {
    const base: RadioInboxItem = {
      id: "radinbox_3", kind: "sound", sourceFingerprint: "fp::s3",
      state: "INBOX", readiness: "UNPREPARED", assignedPlaylistIds: [],
      createdAt: NOW, updatedAt: NOW,
    };
    const withPlaylist = assignInboxItemToPlaylist(base, "radplaylist_a", NOW);
    const withBankToo = assignInboxItemToBank(withPlaylist, "radbank_a", NOW);
    expect(withBankToo.assignedPlaylistIds).toEqual(["radplaylist_a"]);
    expect(withBankToo.assignedBankIds).toEqual(["radbank_a"]);
  });
});
