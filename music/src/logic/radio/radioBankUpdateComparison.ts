// 0718A_MUSIC_RADIO_Clean_Board_and_Explicit_Send_Flows §4/§8 — mirrors
// radioPlaylistUpdateComparison.ts's compareMusicPlaylistToRadioPlaylist
// exactly, for the bank side: backs the shared explicit update-comparison
// dialog so source MUSIC bank changes are never silently applied over a
// locked RadioBank. Pure — no mutation, no side effects.

import type { PlaylistRecord } from "../../data/playProjectTypes";
import type { RadioBank } from "../../data/radioBankTypes";
import type { RadioInboxItem } from "../../data/radioInboxTypes";
import { computeMusicPlaylistTrackSignature } from "./musicToRadioPlaylistSync";

export interface RadioBankUpdateDiff {
  orderChanged: boolean;
  membershipChanged: boolean;
  addedTrackIds: string[];
  removedTrackIds: string[];
  changedFields: string[];
}

export function compareMusicBankToRadioBank(
  sourceBank: PlaylistRecord,
  radioBank: RadioBank,
  inboxItems: RadioInboxItem[],
): RadioBankUpdateDiff {
  const signature = computeMusicPlaylistTrackSignature(sourceBank);
  const currentTrackIds = signature === "" ? [] : signature.split(",");

  const inboxItemById = new Map(inboxItems.map((i) => [i.id, i]));
  const priorTrackIds = radioBank.entries
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((e) => inboxItemById.get(e.inboxItemId)?.sourceSoundId)
    .filter((id): id is string => !!id);

  const currentSet = new Set(currentTrackIds);
  const priorSet = new Set(priorTrackIds);

  const addedTrackIds = currentTrackIds.filter((id) => !priorSet.has(id));
  const removedTrackIds = priorTrackIds.filter((id) => !currentSet.has(id));
  const membershipChanged = addedTrackIds.length > 0 || removedTrackIds.length > 0;

  const commonCurrentOrder = currentTrackIds.filter((id) => priorSet.has(id)).join(",");
  const commonPriorOrder = priorTrackIds.filter((id) => currentSet.has(id)).join(",");
  const orderChanged = commonCurrentOrder !== commonPriorOrder;

  const changedFields: string[] = [];
  if (orderChanged) changedFields.push("order");
  if (membershipChanged) changedFields.push("membership");

  return { orderChanged, membershipChanged, addedTrackIds, removedTrackIds, changedFields };
}
