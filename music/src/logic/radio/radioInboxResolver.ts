// 0717D_RADIO_Playlist_Inbox_and_Performance_Foundation §6.2/§6.3 —
// resolve-or-create for RADIO Inbox items, modeled on
// sectionalRadioLoopResolver.ts's reuse/create-new shape. Pure — no
// mutation, no side effects; the caller persists whatever is returned.
//
// Dedup key = kind + every populated source-ref field + fingerprint +
// frame bounds — never slot/entry/playlist identity. This is what makes
// "the same track referenced twice in one source playlist" resolve to ONE
// deduped Inbox item legally assigned to two playlists (or twice within
// one), rather than creating a duplicate.

import type { RadioAssetKind, RadioInboxItem } from "../../data/radioInboxTypes";
import { computeRadioAssetReadiness } from "./radioAssetReadiness";

export interface RadioInboxSourceRef {
  sourceTrackId?: string;
  sourceLoopId?: string;
  sourceSoundId?: string;
  sourceStemId?: string;
  sourceSectionId?: string;
  sourceFingerprint: string;
  sourceRevisionId?: string | null;
  startFrame?: number;
  endFrame?: number;
}

export interface ResolveOrCreateInboxItemResult {
  item: RadioInboxItem;
  created: boolean;
}

function genRadioInboxItemId(): string {
  return `radinbox_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function computeInboxDedupKey(kind: RadioAssetKind, ref: RadioInboxSourceRef): string {
  return [
    kind,
    ref.sourceTrackId ?? "",
    ref.sourceLoopId ?? "",
    ref.sourceSoundId ?? "",
    ref.sourceStemId ?? "",
    ref.sourceSectionId ?? "",
    ref.sourceFingerprint,
    ref.sourceRevisionId ?? "",
    ref.startFrame ?? "",
    ref.endFrame ?? "",
  ].join("::");
}

// Exact-source idempotency: calling this twice with the same kind+sourceRef
// against the growing `existingItems` array returns the SAME item, never a
// duplicate. Readiness for a newly created item comes straight from
// computeRadioAssetReadiness — kinds with no packaging path always start
// NOT_YET_PACKAGEABLE, never a fabricated UNPREPARED-that-could-improve.
export function resolveOrCreateInboxItem(
  existingItems: RadioInboxItem[],
  kind: RadioAssetKind,
  sourceRef: RadioInboxSourceRef,
  now: string = new Date().toISOString(),
): ResolveOrCreateInboxItemResult {
  const key = computeInboxDedupKey(kind, sourceRef);
  const existing = existingItems.find((item) => computeInboxDedupKey(item.kind, item) === key);
  if (existing) return { item: existing, created: false };

  const { readiness } = computeRadioAssetReadiness({ kind });
  const item: RadioInboxItem = {
    id: genRadioInboxItemId(),
    kind,
    ...sourceRef,
    state: "INBOX",
    readiness,
    assignedPlaylistIds: [],
    createdAt: now,
    updatedAt: now,
  };
  return { item, created: true };
}

// Adds `playlistId` to assignedPlaylistIds without duplicating it — the
// same Inbox item legally belongs to more than one playlist, or twice
// within one playlist's entries, never a second item.
export function assignInboxItemToPlaylist(
  item: RadioInboxItem,
  playlistId: string,
  now: string = new Date().toISOString(),
): RadioInboxItem {
  if (item.assignedPlaylistIds.includes(playlistId)) return item;
  return { ...item, assignedPlaylistIds: [...item.assignedPlaylistIds, playlistId], updatedAt: now };
}

// 0718A §4/§8 — mirrors assignInboxItemToPlaylist exactly, but on the
// separate assignedBankIds list so bank membership never conflates with
// playlist membership.
export function assignInboxItemToBank(
  item: RadioInboxItem,
  bankId: string,
  now: string = new Date().toISOString(),
): RadioInboxItem {
  const assignedBankIds = item.assignedBankIds ?? [];
  if (assignedBankIds.includes(bankId)) return item;
  return { ...item, assignedBankIds: [...assignedBankIds, bankId], updatedAt: now };
}
