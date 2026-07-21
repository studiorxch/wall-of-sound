// 0717D_RADIO_Playlist_Inbox_and_Performance_Foundation §6.4 — backs the
// mandatory "explicit update comparison" dialog: source MUSIC playlist
// changes must be presented as a comparison, never silently applied over a
// locked or published RADIO version. Modeled directly on
// radioVersionCompare.ts's compareRadioLoopVersions shape. Pure — no
// mutation, no side effects.

import type { PlaylistRecord } from "../../data/playProjectTypes";
import type { RadioPlaylist } from "../../data/radioPlaylistTypes";
import type { RadioInboxItem } from "../../data/radioInboxTypes";
import { computeMusicPlaylistTrackSignature } from "./musicToRadioPlaylistSync";

export interface RadioPlaylistUpdateDiff {
  orderChanged: boolean;
  membershipChanged: boolean;
  addedTrackIds: string[];
  removedTrackIds: string[];
  changedFields: string[];
}

export function compareMusicPlaylistToRadioPlaylist(
  sourcePlaylist: PlaylistRecord,
  radioPlaylist: RadioPlaylist,
  inboxItems: RadioInboxItem[],
): RadioPlaylistUpdateDiff {
  const signature = computeMusicPlaylistTrackSignature(sourcePlaylist);
  const currentTrackIds = signature === "" ? [] : signature.split(",");

  const inboxItemById = new Map(inboxItems.map((i) => [i.id, i]));
  const priorTrackIds = radioPlaylist.entries
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((e) => inboxItemById.get(e.inboxItemId)?.sourceTrackId)
    .filter((id): id is string => !!id);

  const currentSet = new Set(currentTrackIds);
  const priorSet = new Set(priorTrackIds);

  const addedTrackIds = currentTrackIds.filter((id) => !priorSet.has(id));
  const removedTrackIds = priorTrackIds.filter((id) => !currentSet.has(id));
  const membershipChanged = addedTrackIds.length > 0 || removedTrackIds.length > 0;

  // Order comparison ignores added/removed tracks — only the relative
  // order of the tracks present on BOTH sides counts as a reorder.
  const commonCurrentOrder = currentTrackIds.filter((id) => priorSet.has(id)).join(",");
  const commonPriorOrder = priorTrackIds.filter((id) => currentSet.has(id)).join(",");
  const orderChanged = commonCurrentOrder !== commonPriorOrder;

  const changedFields: string[] = [];
  if (orderChanged) changedFields.push("order");
  if (membershipChanged) changedFields.push("membership");

  return { orderChanged, membershipChanged, addedTrackIds, removedTrackIds, changedFields };
}
