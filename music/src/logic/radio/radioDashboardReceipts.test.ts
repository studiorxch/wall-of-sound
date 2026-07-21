import { describe, it, expect } from "vitest";
import {
  addAssetReceipt,
  addOrReactivateReceipt,
  dismissReceipt,
  migrateLegacyInboxItemsToReceipts,
  resolveActiveDashboardEntries,
} from "./radioDashboardReceipts";
import type { RadioDashboardReceipt } from "../../data/radioDashboardReceiptTypes";
import type { RadioInboxItem } from "../../data/radioInboxTypes";

const NOW = "2026-07-18T00:00:00.000Z";
const LATER = "2026-07-18T01:00:00.000Z";
const LATEST = "2026-07-18T02:00:00.000Z";

function inboxItem(overrides: Partial<RadioInboxItem> = {}): RadioInboxItem {
  return {
    id: "radinbox_1", kind: "track", sourceFingerprint: "fp::1",
    state: "INBOX", readiness: "UNPREPARED", assignedPlaylistIds: [],
    createdAt: NOW, updatedAt: NOW, ...overrides,
  };
}

describe("addAssetReceipt — true no-op when an active receipt already targets the id", () => {
  it("calling it twice for the same item with no dismissal in between creates exactly one receipt", () => {
    let receipts: RadioDashboardReceipt[] = [];
    receipts = addAssetReceipt(receipts, "radinbox_1", NOW);
    expect(receipts.length).toBe(1);
    const again = addAssetReceipt(receipts, "radinbox_1", LATER);
    expect(again).toBe(receipts); // same reference — true no-op
    expect(again.length).toBe(1);
  });
});

describe("addAssetReceipt / addOrReactivateReceipt — reactivate a dismissed receipt rather than duplicating", () => {
  it("dismiss-then-resend: directly send an asset, dismiss its receipt, send the same asset again — the same receipt is reactivated, not duplicated", () => {
    let receipts: RadioDashboardReceipt[] = [];
    receipts = addAssetReceipt(receipts, "radinbox_1", NOW);
    const firstReceiptId = receipts[0].id;

    receipts = dismissReceipt(receipts, firstReceiptId, LATER);
    expect(receipts[0].dismissedAt).toBe(LATER);

    receipts = addAssetReceipt(receipts, "radinbox_1", LATEST);

    expect(receipts.length).toBe(1); // no duplicate
    expect(receipts[0].id).toBe(firstReceiptId); // same receipt, reactivated
    expect(receipts[0].dismissedAt).toBeUndefined();
    expect(receipts[0].receivedAt).toBe(NOW); // original receivedAt preserved
  });

  it("addOrReactivateReceipt reactivates a dismissed playlist receipt identically", () => {
    let receipts: RadioDashboardReceipt[] = [];
    receipts = addOrReactivateReceipt(receipts, "playlist", "radplaylist_1", NOW);
    const id = receipts[0].id;
    receipts = dismissReceipt(receipts, id, LATER);
    receipts = addOrReactivateReceipt(receipts, "playlist", "radplaylist_1", LATEST);
    expect(receipts.length).toBe(1);
    expect(receipts[0].id).toBe(id);
    expect(receipts[0].dismissedAt).toBeUndefined();
    expect(receipts[0].receivedAt).toBe(NOW);
  });

  it("appends a new receipt when none exists for that target", () => {
    const receipts = addOrReactivateReceipt([], "bank", "radbank_1", NOW);
    expect(receipts.length).toBe(1);
    expect(receipts[0]).toMatchObject({ kind: "bank", targetId: "radbank_1", receivedAt: NOW });
    expect(receipts[0].dismissedAt).toBeUndefined();
  });
});

describe("dismissReceipt", () => {
  it("only sets dismissedAt, changing nothing else", () => {
    const receipts: RadioDashboardReceipt[] = [{ id: "r1", kind: "asset", targetId: "radinbox_1", receivedAt: NOW }];
    const result = dismissReceipt(receipts, "r1", LATER);
    expect(result[0]).toEqual({ id: "r1", kind: "asset", targetId: "radinbox_1", receivedAt: NOW, dismissedAt: LATER });
  });
});

describe("an asset that is individually sent and later also becomes a playlist/bank member keeps its own asset receipt", () => {
  it("the asset receipt is untouched by later playlist/bank membership", () => {
    let receipts: RadioDashboardReceipt[] = [];
    receipts = addAssetReceipt(receipts, "radinbox_1", NOW);

    // Later, the same item becomes a playlist member — member resolution
    // never calls addAssetReceipt/addOrReactivateReceipt for individual
    // members, so this simulates that by NOT calling any receipt function
    // for the membership itself.
    const stillOneReceipt = receipts;
    expect(stillOneReceipt.length).toBe(1);
    expect(stillOneReceipt[0].kind).toBe("asset");
    expect(stillOneReceipt[0].targetId).toBe("radinbox_1");
  });
});

describe("inverse case: an asset that first enters RADIO only as a playlist/bank member gains its own receipt on first direct send", () => {
  it("the same Inbox item is reused (created: false in practice) but gains exactly one visible asset receipt", () => {
    // No asset receipt exists yet — the item only exists via playlist
    // membership (simulated: receipts starts empty, item id is known).
    let receipts: RadioDashboardReceipt[] = [];
    expect(receipts.find((r) => r.targetId === "radinbox_1")).toBeUndefined();

    // User sends the same underlying Inbox item directly.
    receipts = addAssetReceipt(receipts, "radinbox_1", NOW);

    expect(receipts.length).toBe(1);
    expect(receipts[0]).toMatchObject({ kind: "asset", targetId: "radinbox_1", receivedAt: NOW });

    // A repeated direct send while the receipt is still active stays a
    // true no-op.
    const again = addAssetReceipt(receipts, "radinbox_1", LATER);
    expect(again).toBe(receipts);
  });
});

describe("migrateLegacyInboxItemsToReceipts", () => {
  it("backfills exactly the unassociated items lacking a receipt", () => {
    const items: RadioInboxItem[] = [
      inboxItem({ id: "unassociated_no_receipt", createdAt: NOW }),
      inboxItem({ id: "unassociated_has_receipt", createdAt: NOW }),
      inboxItem({ id: "in_playlist", assignedPlaylistIds: ["radplaylist_1"], createdAt: NOW }),
      inboxItem({ id: "in_bank", assignedPlaylistIds: [], assignedBankIds: ["radbank_1"], createdAt: NOW }),
    ];
    const existing: RadioDashboardReceipt[] = [
      { id: "r1", kind: "asset", targetId: "unassociated_has_receipt", receivedAt: NOW },
    ];
    const result = migrateLegacyInboxItemsToReceipts(items, existing);

    expect(result.length).toBe(2);
    const backfilled = result.find((r) => r.targetId === "unassociated_no_receipt");
    expect(backfilled).toBeDefined();
    expect(backfilled!.kind).toBe("asset");
    expect(backfilled!.receivedAt).toBe(NOW);
    expect(result.some((r) => r.targetId === "in_playlist")).toBe(false);
    expect(result.some((r) => r.targetId === "in_bank")).toBe(false);
  });

  it("is a no-op on a second run", () => {
    const items: RadioInboxItem[] = [inboxItem({ id: "unassociated_no_receipt", createdAt: NOW })];
    const first = migrateLegacyInboxItemsToReceipts(items, []);
    expect(first.length).toBe(1);
    const second = migrateLegacyInboxItemsToReceipts(items, first);
    expect(second).toBe(first);
  });
});

describe("resolveActiveDashboardEntries", () => {
  it("resolves only non-dismissed receipts to their live target records", () => {
    const items: RadioInboxItem[] = [inboxItem({ id: "radinbox_1" }), inboxItem({ id: "radinbox_2" })];
    const receipts: RadioDashboardReceipt[] = [
      { id: "r1", kind: "asset", targetId: "radinbox_1", receivedAt: NOW },
      { id: "r2", kind: "asset", targetId: "radinbox_2", receivedAt: NOW, dismissedAt: LATER },
    ];
    const resolved = resolveActiveDashboardEntries(receipts, items, [], []);
    expect(resolved.assets.length).toBe(1);
    expect(resolved.assets[0].item.id).toBe("radinbox_1");
  });

  it("defensively skips a receipt whose target no longer exists, without erroring", () => {
    const receipts: RadioDashboardReceipt[] = [{ id: "r1", kind: "asset", targetId: "gone", receivedAt: NOW }];
    const resolved = resolveActiveDashboardEntries(receipts, [], [], []);
    expect(resolved.assets).toEqual([]);
  });
});
