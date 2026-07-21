// 0718A_MUSIC_RADIO_Clean_Board_and_Explicit_Send_Flows — the persisted
// RADIO Dashboard receipt model (architecture decision 7). Dashboard
// visibility is driven ENTIRELY by this explicit, persisted receipt log —
// never derived from live playlist/bank association state. Without this,
// a directly-sent asset that later becomes a playlist/bank member would
// silently disappear from the dashboard the moment that association forms
// — exactly the surprising, data-dependent behavior this model exists to
// prevent. Pure — no mutation of inputs, no side effects; the caller
// persists whatever is returned.

import type { RadioDashboardReceipt, RadioDashboardReceiptKind } from "../../data/radioDashboardReceiptTypes";
import type { RadioInboxItem } from "../../data/radioInboxTypes";
import type { RadioPlaylist } from "../../data/radioPlaylistTypes";
import type { RadioBank } from "../../data/radioBankTypes";

function genReceiptId(): string {
  return `radreceipt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function addOrReactivate(
  receipts: RadioDashboardReceipt[],
  kind: RadioDashboardReceiptKind,
  targetId: string,
  now: string,
): RadioDashboardReceipt[] {
  const existing = receipts.find((r) => r.kind === kind && r.targetId === targetId);
  if (!existing) {
    return [...receipts, { id: genReceiptId(), kind, targetId, receivedAt: now }];
  }
  if (!existing.dismissedAt) {
    // Active receipt already covers this target — a true no-op.
    return receipts;
  }
  // Dismissed receipt for this target — reactivate in place, never
  // duplicate, and never touch the original receivedAt (a historical
  // fact).
  return receipts.map((r) => (r.id === existing.id ? { ...r, dismissedAt: undefined } : r));
}

// Called from the individual-send handlers on EVERY explicit direct send
// (handleSendTrackToRadio/handleSendLoopToRadio), using the Inbox item id
// resolveOrCreateInboxItem resolves to — regardless of whether that call
// reported created: true or false. This is what gives an asset that first
// entered RADIO only as a playlist/bank member (no asset receipt was ever
// created for it — see addOrReactivateReceipt below) its first visible
// receipt the moment it's later sent directly, and what reactivates a
// dismissed receipt on a repeat direct send instead of duplicating it.
export function addAssetReceipt(
  receipts: RadioDashboardReceipt[],
  inboxItemId: string,
  now: string = new Date().toISOString(),
): RadioDashboardReceipt[] {
  return addOrReactivate(receipts, "asset", inboxItemId, now);
}

// Called from handleSendPlaylistToRadio/handleSendBankToRadio ONLY when
// the sync result reports changed: true — an unchanged re-send stays a
// true no-op, touching no receipt at all. NEVER called from inside the
// playlist/bank member-resolution loop, so individually-unremarkable
// members never get their own receipt.
export function addOrReactivateReceipt(
  receipts: RadioDashboardReceipt[],
  kind: "playlist" | "bank",
  targetId: string,
  now: string = new Date().toISOString(),
): RadioDashboardReceipt[] {
  return addOrReactivate(receipts, kind, targetId, now);
}

// Sets dismissedAt on one receipt; touches nothing else. Since receipts
// are persisted state (not component state), a dismissal survives
// remounts/reloads.
export function dismissReceipt(
  receipts: RadioDashboardReceipt[],
  receiptId: string,
  now: string = new Date().toISOString(),
): RadioDashboardReceipt[] {
  return receipts.map((r) => (r.id === receiptId ? { ...r, dismissedAt: now } : r));
}

// Pure, idempotent backfill: for every RadioInboxItem with NO playlist/
// bank association and no existing receipt already targeting it,
// synthesizes one kind:"asset" receipt with receivedAt: inboxItem.createdAt
// — so pre-receipt-model items (sent under 0717D's now-removed picker)
// get a real receipt instead of requiring a schema version flag. A
// second run is a no-op since a backfilled item now has a receipt.
export function migrateLegacyInboxItemsToReceipts(
  inboxItems: RadioInboxItem[],
  receipts: RadioDashboardReceipt[],
): RadioDashboardReceipt[] {
  const targetedIds = new Set(receipts.filter((r) => r.kind === "asset").map((r) => r.targetId));
  const toBackfill = inboxItems.filter((item) => {
    const hasPlaylist = (item.assignedPlaylistIds ?? []).length > 0;
    const hasBank = (item.assignedBankIds ?? []).length > 0;
    return !hasPlaylist && !hasBank && !targetedIds.has(item.id);
  });
  if (toBackfill.length === 0) return receipts;
  return [
    ...receipts,
    ...toBackfill.map((item): RadioDashboardReceipt => ({
      id: genReceiptId(),
      kind: "asset",
      targetId: item.id,
      receivedAt: item.createdAt,
    })),
  ];
}

export interface ActiveDashboardEntries {
  assets: Array<{ receipt: RadioDashboardReceipt; item: RadioInboxItem }>;
  playlists: Array<{ receipt: RadioDashboardReceipt; playlist: RadioPlaylist }>;
  banks: Array<{ receipt: RadioDashboardReceipt; bank: RadioBank }>;
}

// Joins non-dismissed receipts to their live target record for rendering.
// Defensively skips a receipt whose target no longer exists, without
// deleting the orphaned receipt.
export function resolveActiveDashboardEntries(
  receipts: RadioDashboardReceipt[],
  inboxItems: RadioInboxItem[],
  playlists: RadioPlaylist[],
  banks: RadioBank[],
): ActiveDashboardEntries {
  const inboxById = new Map(inboxItems.map((i) => [i.id, i]));
  const playlistById = new Map(playlists.map((p) => [p.id, p]));
  const bankById = new Map(banks.map((b) => [b.id, b]));

  const active = receipts.filter((r) => !r.dismissedAt);

  const assets: ActiveDashboardEntries["assets"] = [];
  const playlistEntries: ActiveDashboardEntries["playlists"] = [];
  const bankEntries: ActiveDashboardEntries["banks"] = [];

  for (const receipt of active) {
    if (receipt.kind === "asset") {
      const item = inboxById.get(receipt.targetId);
      if (item) assets.push({ receipt, item });
    } else if (receipt.kind === "playlist") {
      const playlist = playlistById.get(receipt.targetId);
      if (playlist) playlistEntries.push({ receipt, playlist });
    } else if (receipt.kind === "bank") {
      const bank = bankById.get(receipt.targetId);
      if (bank) bankEntries.push({ receipt, bank });
    }
  }

  return { assets, playlists: playlistEntries, banks: bankEntries };
}
