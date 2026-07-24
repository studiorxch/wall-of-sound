// 0723_RADIO_One_Action_Publish §7 — Publishing must never infer that an
// externally sourced recording is StudioRich-owned. A track is cleared for
// RADIO web publication only when its OWN existing rights metadata says so
// explicitly — either an explicit "studiorich_stream" platform-use grant,
// or sourceOwner === "studiorich" with no conflicting restriction. Every
// other case (external, reference, unknown, or an explicit
// do_not_publish/reference_only tag) is reported as unresolved rather than
// silently allowed through.

import type { Track } from "../../data/trackTypes";

export function isEntryRightsCleared(track: Track): boolean {
  const uses = track.platformUse ?? [];
  if (uses.includes("do_not_publish") || uses.includes("reference_only")) return false;
  if (uses.includes("studiorich_stream")) return true;
  return track.sourceOwner === "studiorich";
}
