// 0718A_MUSIC_RADIO_Clean_Board_and_Explicit_Send_Flows — the RADIO
// Dashboard receipt model. Dashboard visibility is driven by an explicit,
// persisted receipt log — never derived from live playlist/bank
// association state, so a directly-sent asset that later becomes a
// playlist/bank member never silently disappears from view. Pure — no
// DOM, no Node.

export type RadioDashboardReceiptKind = "asset" | "playlist" | "bank";

export type RadioDashboardReceipt = {
  id: string;
  kind: RadioDashboardReceiptKind;
  targetId: string; // RadioInboxItem.id | RadioPlaylist.id | RadioBank.id
  receivedAt: string;
  dismissedAt?: string;
};
