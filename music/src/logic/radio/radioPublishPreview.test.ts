import { describe, it, expect } from "vitest";
import { buildPublishPreview } from "./radioPublishPreview";
import type { RadioPlaylist, RadioPlaylistEntry } from "../../data/radioPlaylistTypes";
import type { RadioInboxItem } from "../../data/radioInboxTypes";

const NOW = "2026-07-17T00:00:00.000Z";

function entry(id: string, inboxItemId: string, overrides: Partial<RadioPlaylistEntry> = {}): RadioPlaylistEntry {
  return { id, inboxItemId, order: 0, locked: false, includedInPublish: true, stemPolicy: "none", ...overrides };
}

function item(overrides: Partial<RadioInboxItem> & { id: string }): RadioInboxItem {
  return {
    kind: "track", sourceFingerprint: "fp::1.00", state: "INBOX", readiness: "UNPREPARED",
    assignedPlaylistIds: [], createdAt: NOW, updatedAt: NOW,
    ...overrides,
  };
}

function playlistWith(entries: RadioPlaylistEntry[]): RadioPlaylist {
  return {
    id: "radplaylist_1", title: "Set", version: "1", state: "DRAFT", entries,
    estimatedPublishBytes: 0, createdAt: NOW, updatedAt: NOW,
  };
}

const APPROVED = { approved: true as const, approvedAt: NOW, sourceAssetHash: "hash1" };
const BINDING = { radioTrackId: "rtrack_000001", packageVersion: 1, sourceTrackId: "t1", sourceAssetHash: "hash1", packageManifestHash: "mh1", boundAt: NOW };

describe("buildPublishPreview — five-category classification for track-kind entries", () => {
  it("an unapproved track-kind entry lands in needsApproval", () => {
    const items = [item({ id: "i1" })];
    const preview = buildPublishPreview(playlistWith([entry("e1", "i1")]), items);
    expect(preview.needsApproval).toEqual([{ entryId: "e1", inboxItemId: "i1" }]);
    expect(preview.ready).toEqual([]);
  });

  it("an approved, unbound entry lands in needsPreparation", () => {
    const items = [item({ id: "i1" })];
    const preview = buildPublishPreview(playlistWith([entry("e1", "i1", { approval: APPROVED })]), items);
    expect(preview.needsPreparation).toEqual([{ entryId: "e1", inboxItemId: "i1" }]);
  });

  it("a bound entry with no live verification supplied is trusted as ready", () => {
    const items = [item({ id: "i1" })];
    const preview = buildPublishPreview(playlistWith([entry("e1", "i1", { approval: APPROVED, trackBinding: BINDING })]), items);
    expect(preview.ready).toEqual([{ entryId: "e1", inboxItemId: "i1" }]);
  });

  it("a live-verified STALE state (passed via entryStates) lands in staleOrFailed with a reason", () => {
    const items = [item({ id: "i1" })];
    const entryStates = new Map([["e1", "STALE" as const]]);
    const preview = buildPublishPreview(playlistWith([entry("e1", "i1", { approval: APPROVED, trackBinding: BINDING })]), items, entryStates);
    expect(preview.staleOrFailed).toEqual([{ entryId: "e1", inboxItemId: "i1", reason: "Stale — needs re-preparation" }]);
    expect(preview.ready).toEqual([]);
  });

  it("a failed entry lands in staleOrFailed, surfacing the recorded error message", () => {
    const items = [item({ id: "i1" })];
    const failEntry = entry("e1", "i1", { approval: APPROVED, lastPreparationError: { code: "RADIO_TRACK_PREPARE_ENCODE_FAILED", message: "ffmpeg exited 1", at: NOW } });
    const preview = buildPublishPreview(playlistWith([failEntry]), items);
    expect(preview.staleOrFailed).toEqual([{ entryId: "e1", inboxItemId: "i1", reason: "ffmpeg exited 1" }]);
  });

  it("an entry excluded from publish is excluded before any classification, with a named reason", () => {
    const items = [item({ id: "i1" })];
    const preview = buildPublishPreview(playlistWith([entry("e1", "i1", { includedInPublish: false, approval: APPROVED, trackBinding: BINDING })]), items);
    expect(preview.excluded).toEqual([{ entryId: "e1", inboxItemId: "i1", reason: "Entry excluded from publish" }]);
    expect(preview.ready).toEqual([]);
  });

  it("a missing source Inbox item is excluded with a named reason, never crashes", () => {
    const preview = buildPublishPreview(playlistWith([entry("e1", "i_missing")]), []);
    expect(preview.excluded).toEqual([{ entryId: "e1", inboxItemId: "i_missing", reason: "Source Inbox item missing" }]);
  });

  it("a kind with no packaging path (e.g. sound) is excluded with a named reason", () => {
    const items = [item({ id: "i1", kind: "sound" })];
    const preview = buildPublishPreview(playlistWith([entry("e1", "i1")]), items);
    expect(preview.excluded).toEqual([{ entryId: "e1", inboxItemId: "i1", reason: 'Kind "sound" has no verified packaging path yet' }]);
  });

  it("a mixed playlist splits every entry into exactly one of the five categories", () => {
    const items = [
      item({ id: "i1" }), // not approved
      item({ id: "i2" }), // approved, unbound
      item({ id: "i3" }), // ready
      item({ id: "i4" }), // failed
      item({ id: "i5", kind: "sound" }), // excluded
    ];
    const entries = [
      entry("e1", "i1"),
      entry("e2", "i2", { approval: APPROVED }),
      entry("e3", "i3", { approval: APPROVED, trackBinding: BINDING }),
      entry("e4", "i4", { approval: APPROVED, lastPreparationError: { code: "X", message: "boom", at: NOW } }),
      entry("e5", "i5"),
    ];
    const preview = buildPublishPreview(playlistWith(entries), items);
    expect(preview.needsApproval.map((e) => e.entryId)).toEqual(["e1"]);
    expect(preview.needsPreparation.map((e) => e.entryId)).toEqual(["e2"]);
    expect(preview.ready.map((e) => e.entryId)).toEqual(["e3"]);
    expect(preview.staleOrFailed.map((e) => e.entryId)).toEqual(["e4"]);
    expect(preview.excluded.map((e) => e.entryId)).toEqual(["e5"]);
  });
});

describe("buildPublishPreview — loop-kind entries never gate the five categories", () => {
  it("a legacyRadioLoopId entry is surfaced as a performance asset only, never in any of the five categories", () => {
    const items = [item({ id: "i1", kind: "loop", legacyRadioLoopId: "rloop_1" })];
    const preview = buildPublishPreview(playlistWith([entry("e1", "i1")]), items);
    expect(preview.performanceAssets).toEqual([{ entryId: "e1", inboxItemId: "i1", radioLoopId: "rloop_1" }]);
    expect(preview.ready).toEqual([]);
    expect(preview.needsApproval).toEqual([]);
    expect(preview.needsPreparation).toEqual([]);
    expect(preview.staleOrFailed).toEqual([]);
    expect(preview.excluded).toEqual([]);
  });

  it("a loop-kind entry with no legacyRadioLoopId is excluded with an honest reason and is not a performance asset", () => {
    const items = [item({ id: "i1", kind: "loop" })];
    const preview = buildPublishPreview(playlistWith([entry("e1", "i1")]), items);
    expect(preview.performanceAssets).toEqual([]);
    expect(preview.excluded).toEqual([{ entryId: "e1", inboxItemId: "i1", reason: "Loop-kind entries publish via the separate RadioLoop performance-asset flow" }]);
  });

  it("a playlist with only track entries never populates performanceAssets", () => {
    const items = [item({ id: "i1" })];
    const preview = buildPublishPreview(playlistWith([entry("e1", "i1", { approval: APPROVED, trackBinding: BINDING })]), items);
    expect(preview.performanceAssets).toEqual([]);
  });
});
