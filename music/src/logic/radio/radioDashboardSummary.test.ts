import { describe, it, expect } from "vitest";
import { buildRadioDashboardSummary } from "./radioDashboardSummary";
import type { RadioDashboardReceipt } from "../../data/radioDashboardReceiptTypes";
import type { RadioInboxItem } from "../../data/radioInboxTypes";
import type { RadioPlaylist } from "../../data/radioPlaylistTypes";
import type { RadioBank } from "../../data/radioBankTypes";

const T1 = "2026-07-18T00:00:00.000Z";
const T2 = "2026-07-18T01:00:00.000Z";
const T3 = "2026-07-18T02:00:00.000Z";

function item(overrides: Partial<RadioInboxItem> = {}): RadioInboxItem {
  return {
    id: "radinbox_1", kind: "track", sourceFingerprint: "fp::1",
    state: "INBOX", readiness: "READY", assignedPlaylistIds: [],
    createdAt: T1, updatedAt: T1, ...overrides,
  };
}

function playlist(overrides: Partial<RadioPlaylist> = {}): RadioPlaylist {
  return {
    id: "radplaylist_1", title: "Set", version: "1", state: "DRAFT", entries: [],
    estimatedPublishBytes: 0, createdAt: T1, updatedAt: T1, ...overrides,
  };
}

function bank(overrides: Partial<RadioBank> = {}): RadioBank {
  return { id: "radbank_1", title: "Kit", entries: [], createdAt: T1, updatedAt: T1, ...overrides };
}

describe("buildRadioDashboardSummary", () => {
  it("resolves only non-dismissed receipts to their live target records", () => {
    const receipts: RadioDashboardReceipt[] = [
      { id: "r1", kind: "asset", targetId: "radinbox_1", receivedAt: T1 },
      { id: "r2", kind: "asset", targetId: "radinbox_2", receivedAt: T1, dismissedAt: T2 },
    ];
    const items = [item({ id: "radinbox_1" }), item({ id: "radinbox_2" })];
    const summary = buildRadioDashboardSummary(receipts, items, [], []);
    expect(summary.looseAssets.length).toBe(1);
    expect(summary.looseAssets[0].item.id).toBe("radinbox_1");
  });

  it("a dismissed receipt's underlying record is untouched and still resolvable directly (not deleted)", () => {
    const receipts: RadioDashboardReceipt[] = [{ id: "r1", kind: "asset", targetId: "radinbox_1", receivedAt: T1, dismissedAt: T2 }];
    const items = [item({ id: "radinbox_1" })];
    const summary = buildRadioDashboardSummary(receipts, items, [], []);
    expect(summary.looseAssets.length).toBe(0);
    // The underlying item itself is still fully present in the source array.
    expect(items.find((i) => i.id === "radinbox_1")).toBeDefined();
  });

  it("FAILED items are counted as alerts, NOT_YET_PACKAGEABLE are not", () => {
    const receipts: RadioDashboardReceipt[] = [
      { id: "r1", kind: "asset", targetId: "failed_item", receivedAt: T1 },
      { id: "r2", kind: "asset", targetId: "not_yet_packageable_item", receivedAt: T1 },
      { id: "r3", kind: "asset", targetId: "ready_item", receivedAt: T1 },
    ];
    const items = [
      item({ id: "failed_item", readiness: "FAILED" }),
      item({ id: "not_yet_packageable_item", readiness: "NOT_YET_PACKAGEABLE" }),
      item({ id: "ready_item", readiness: "READY" }),
    ];
    const summary = buildRadioDashboardSummary(receipts, items, [], []);
    expect(summary.alertCount).toBe(1);
  });

  it("recency ordering is correct across all three receipt kinds", () => {
    const receipts: RadioDashboardReceipt[] = [
      { id: "r1", kind: "asset", targetId: "radinbox_1", receivedAt: T1 },
      { id: "r2", kind: "playlist", targetId: "radplaylist_1", receivedAt: T3 },
      { id: "r3", kind: "bank", targetId: "radbank_1", receivedAt: T2 },
    ];
    const summary = buildRadioDashboardSummary(receipts, [item({ id: "radinbox_1" })], [playlist({ id: "radplaylist_1" })], [bank({ id: "radbank_1" })]);
    expect(summary.activityFeed.map((e) => e.kind)).toEqual(["playlist", "bank", "asset"]);
  });

  it("groups playlist and bank receipts separately from loose assets", () => {
    const receipts: RadioDashboardReceipt[] = [
      { id: "r1", kind: "asset", targetId: "radinbox_1", receivedAt: T1 },
      { id: "r2", kind: "playlist", targetId: "radplaylist_1", receivedAt: T2 },
      { id: "r3", kind: "bank", targetId: "radbank_1", receivedAt: T3 },
    ];
    const summary = buildRadioDashboardSummary(receipts, [item({ id: "radinbox_1" })], [playlist({ id: "radplaylist_1" })], [bank({ id: "radbank_1" })]);
    expect(summary.looseAssets.length).toBe(1);
    expect(summary.playlistReceipts.length).toBe(1);
    expect(summary.bankReceipts.length).toBe(1);
  });
});
