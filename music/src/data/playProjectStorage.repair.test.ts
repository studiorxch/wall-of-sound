// 0718B_RADIO_Web_Publication_Asset_Export_Bridge — spec test 21: adding
// `radioWebExports` to the repair guard must be purely additive. A project
// saved before this build (real RadioLoop package bindings via
// legacyRadioLoopId, real 0718A RadioBanks/RadioDashboardReceipts, no
// radioWebExports field at all) must load with those records completely
// untouched and radioWebExports simply backfilled to an empty array —
// never dropped, never reset, never thrown on.

import { describe, it, expect } from "vitest";
import { repairStoredProject } from "./playProjectStorage";
import type { PlayProject } from "./playProjectTypes";
import type { RadioPlaylist } from "./radioPlaylistTypes";
import type { RadioInboxItem } from "./radioInboxTypes";
import type { RadioBank } from "./radioBankTypes";
import type { RadioDashboardReceipt } from "./radioDashboardReceiptTypes";
import type { RadioWebExportRecord } from "./radioWebBundleTypes";

const NOW = "2026-07-17T00:00:00.000Z";

function minimalProject(overrides: Partial<PlayProject> = {}): PlayProject {
  return {
    schemaVersion: "play-project-v2",
    libraryTracks: [],
    activePlaylistId: "",
    playlists: [],
    excludedTrackIds: [],
    ...overrides,
  } as PlayProject;
}

const PRE_0718B_RADIO_PLAYLIST: RadioPlaylist = {
  id: "radplaylist_1", title: "My Mix", version: "1", state: "PUBLISHED", entries: [],
  estimatedPublishBytes: 0, createdAt: NOW, updatedAt: NOW, publishedAt: NOW,
};

// A pre-0718B item carrying a real, already-published RadioLoop package
// binding — the exact "RadioLoop packages survive" fact this test proves.
const PRE_0718B_RADIO_INBOX_ITEM: RadioInboxItem = {
  id: "radinbox_1", kind: "loop", sourceFingerprint: "fp::1.00", state: "PUBLISHED",
  readiness: "READY", legacyRadioLoopId: "rloop_000001",
  assignedPlaylistIds: ["radplaylist_1"], createdAt: NOW, updatedAt: NOW,
};

const PRE_0718B_RADIO_BANK: RadioBank = {
  id: "radbank_1", title: "Field Recordings", state: "DRAFT", entries: [],
  createdAt: NOW, updatedAt: NOW,
} as RadioBank;

const PRE_0718B_RECEIPT: RadioDashboardReceipt = {
  id: "radreceipt_1", kind: "asset", targetId: "radinbox_1", receivedAt: NOW,
};

describe("repairStoredProject — 0718B radioWebExports addition", () => {
  it("backfills a missing radioWebExports to an empty array on a pre-0718B project", () => {
    const legacy = minimalProject({
      radioPlaylists: [PRE_0718B_RADIO_PLAYLIST],
      radioInboxItems: [PRE_0718B_RADIO_INBOX_ITEM],
      radioBanks: [PRE_0718B_RADIO_BANK],
      radioDashboardReceipts: [PRE_0718B_RECEIPT],
    });
    // Simulate a real pre-0718B saved project, which never had this field.
    delete (legacy as Partial<PlayProject>).radioWebExports;

    const repaired = repairStoredProject(legacy);

    expect(repaired.radioWebExports).toEqual([]);
  });

  it("never touches pre-existing RadioLoop package bindings, RadioPlaylists, RadioBanks, or RadioDashboardReceipts", () => {
    const legacy = minimalProject({
      radioPlaylists: [PRE_0718B_RADIO_PLAYLIST],
      radioInboxItems: [PRE_0718B_RADIO_INBOX_ITEM],
      radioBanks: [PRE_0718B_RADIO_BANK],
      radioDashboardReceipts: [PRE_0718B_RECEIPT],
    });
    delete (legacy as Partial<PlayProject>).radioWebExports;

    const repaired = repairStoredProject(legacy);

    expect(repaired.radioPlaylists).toEqual([PRE_0718B_RADIO_PLAYLIST]);
    expect(repaired.radioInboxItems).toEqual([PRE_0718B_RADIO_INBOX_ITEM]);
    expect(repaired.radioInboxItems?.[0].legacyRadioLoopId).toBe("rloop_000001");
    expect(repaired.radioBanks).toEqual([PRE_0718B_RADIO_BANK]);
    expect(repaired.radioDashboardReceipts).toEqual([PRE_0718B_RECEIPT]);
  });

  it("preserves an existing, real radioWebExports array unchanged (idempotent, not reset)", () => {
    const record: RadioWebExportRecord = {
      id: "radweb_1", radioPlaylistId: "radplaylist_1", slug: "my-mix", bundleVersion: 1,
      exportedAt: NOW, contentSignature: "sig1", totalByteSize: 4_200_000, totalDurationSeconds: 210,
      entryCount: 1, validation: { ok: true, checkedAt: NOW }, exportPath: "/library/music/RadioWebExports/my-mix/v1",
    };
    const project = minimalProject({ radioWebExports: [record] });

    const repaired = repairStoredProject(project);

    expect(repaired.radioWebExports).toEqual([record]);
  });

  it("repairs a malformed (non-array) radioWebExports to an empty array rather than throwing", () => {
    const corrupted = minimalProject();
    (corrupted as unknown as Record<string, unknown>).radioWebExports = "not-an-array";

    const repaired = repairStoredProject(corrupted);

    expect(repaired.radioWebExports).toEqual([]);
  });
});
