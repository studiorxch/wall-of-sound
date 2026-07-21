// 0718A_MUSIC_RADIO_Clean_Board_and_Explicit_Send_Flows §6 — publication
// tracking is HONESTLY LOCAL-ONLY: no server route, manifest field, or
// runtime consumer exists yet that would make flipping RadioPlaylist.state
// actually deliver anything to a public web player. The internal
// RadioPlaylistState enum is unchanged for bookkeeping purposes, but every
// user-facing render of it must go through radioPlaylistStateLabel — never
// render or say "Published"/"Publish to Web"/"Unpublish" anywhere in the
// UI. Pure — no mutation of inputs, no side effects.

import type { RadioPlaylist, RadioPlaylistState } from "../../data/radioPlaylistTypes";

export function radioPlaylistStateLabel(state: RadioPlaylistState): string {
  switch (state) {
    case "DRAFT":
      return "Draft";
    case "PREPARING":
      return "Preparing";
    case "READY":
      return "Ready";
    case "PUBLISHED":
      return "Marked Ready for Publishing";
    case "RETIRED":
      return "Retired";
  }
}

export interface PublishPatchResult {
  targetPatch: Partial<Pick<RadioPlaylist, "state" | "publishedAt" | "unpublishedAt">>;
  othersToUnpublish: Array<{ id: string; patch: Partial<Pick<RadioPlaylist, "state" | "unpublishedAt">> }>;
}

// "Mark Ready for Publishing" — only one RadioPlaylist per source lineage
// (same sourceMusicPlaylistId) is ever marked ready at a time. Any other
// currently-marked-ready sibling of the same lineage is reverted to READY
// (fully recoverable, never deleted) as part of the same action.
export function computePublishPatch(
  target: RadioPlaylist,
  allPlaylists: RadioPlaylist[],
  now: string = new Date().toISOString(),
): PublishPatchResult {
  const othersToUnpublish = allPlaylists
    .filter((p) => p.id !== target.id && p.state === "PUBLISHED" && p.sourceMusicPlaylistId === target.sourceMusicPlaylistId)
    .map((p) => ({ id: p.id, patch: { state: "READY" as const, unpublishedAt: now } }));

  return {
    targetPatch: { state: "PUBLISHED", publishedAt: now, unpublishedAt: undefined },
    othersToUnpublish,
  };
}

// "Remove Publication Mark" — never clears publishedAt (that's the
// historical "was marked ready at X" fact) and never touches entries, any
// RadioInboxItem, or any RadioLoop package. Fully re-markable afterward.
export function computeUnpublishPatch(
  _target: RadioPlaylist,
  now: string = new Date().toISOString(),
): Partial<Pick<RadioPlaylist, "state" | "unpublishedAt">> {
  return { state: "READY", unpublishedAt: now };
}
