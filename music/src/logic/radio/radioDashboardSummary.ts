// 0718A_MUSIC_RADIO_Clean_Board_and_Explicit_Send_Flows — composes
// radioDashboardReceipts.ts's resolver into the exact shape
// RadioDashboardView.tsx renders: loose received assets, grouped
// playlist/bank receipt cards, a FAILED-only readiness-alert count (
// NOT_YET_PACKAGEABLE is expected/honest, never an alert), and a
// recency-sorted activity feed merging all three receipt kinds. Pure — no
// DOM, no Node.

import type { RadioDashboardReceipt } from "../../data/radioDashboardReceiptTypes";
import type { RadioInboxItem } from "../../data/radioInboxTypes";
import type { RadioPlaylist } from "../../data/radioPlaylistTypes";
import type { RadioBank } from "../../data/radioBankTypes";
import { resolveActiveDashboardEntries } from "./radioDashboardReceipts";

export interface RadioDashboardActivityEntry {
  receipt: RadioDashboardReceipt;
  kind: "asset" | "playlist" | "bank";
  targetId: string;
  receivedAt: string;
}

export interface RadioDashboardSummary {
  looseAssets: Array<{ receipt: RadioDashboardReceipt; item: RadioInboxItem }>;
  playlistReceipts: Array<{ receipt: RadioDashboardReceipt; playlist: RadioPlaylist }>;
  bankReceipts: Array<{ receipt: RadioDashboardReceipt; bank: RadioBank }>;
  alertCount: number;
  activityFeed: RadioDashboardActivityEntry[];
}

export function buildRadioDashboardSummary(
  receipts: RadioDashboardReceipt[],
  inboxItems: RadioInboxItem[],
  playlists: RadioPlaylist[],
  banks: RadioBank[],
): RadioDashboardSummary {
  const resolved = resolveActiveDashboardEntries(receipts, inboxItems, playlists, banks);

  const alertCount = resolved.assets.filter((a) => a.item.readiness === "FAILED").length;

  const activityFeed: RadioDashboardActivityEntry[] = [
    ...resolved.assets.map((a) => ({ receipt: a.receipt, kind: "asset" as const, targetId: a.receipt.targetId, receivedAt: a.receipt.receivedAt })),
    ...resolved.playlists.map((p) => ({ receipt: p.receipt, kind: "playlist" as const, targetId: p.receipt.targetId, receivedAt: p.receipt.receivedAt })),
    ...resolved.banks.map((b) => ({ receipt: b.receipt, kind: "bank" as const, targetId: b.receipt.targetId, receivedAt: b.receipt.receivedAt })),
  ].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));

  return {
    looseAssets: resolved.assets,
    playlistReceipts: resolved.playlists,
    bankReceipts: resolved.banks,
    alertCount,
    activityFeed,
  };
}
