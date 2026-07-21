// 0718A_MUSIC_RADIO_Clean_Board_and_Explicit_Send_Flows §4 — "Send Bank to
// RADIO": creates or updates a RadioBank linked to its source MUSIC Bank (a
// PlaylistRecord with playlistKind: "reference_overlay"). Mirrors
// musicToRadioPlaylistSync.ts's sendPlaylistToRadio almost line-for-line —
// a MUSIC Bank IS a PlaylistRecord, using the same TrackSlot[] mechanism —
// minus the publish-only fields a bank doesn't have (no lifecycle state,
// no version, no publishedAt). Pure — no mutation of inputs, no side
// effects; the caller persists whatever is returned.
//
// Kind is always "sound": that's what MUSIC banks actually contain today
// (flat sourceOwner: "reference" tracks) — per spec's "do not invent
// missing media," this build does not fabricate loop/stem/fill kinds a
// bank has no way to hold.

import type { PlaylistRecord } from "../../data/playProjectTypes";
import type { Track } from "../../data/trackTypes";
import type { RadioInboxItem } from "../../data/radioInboxTypes";
import type { RadioBank, RadioBankEntry } from "../../data/radioBankTypes";
import { resolveOrCreateInboxItem, assignInboxItemToBank } from "./radioInboxResolver";
import { computeSourceFingerprint } from "../playbackBounds/computeTrackPlaybackBounds";
import { computeMusicPlaylistTrackSignature } from "./musicToRadioPlaylistSync";

function genRadioBankId(): string {
  return `radbank_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function genRadioBankEntryId(): string {
  return `radbankentry_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface SendBankToRadioResult {
  radioBank: RadioBank;
  inboxItems: RadioInboxItem[];
  changed: boolean;
}

export function sendBankToRadio(
  sourceBank: PlaylistRecord,
  existingRadioBank: RadioBank | null,
  inboxItems: RadioInboxItem[],
  tracks: Track[],
  now: string = new Date().toISOString(),
): SendBankToRadioResult {
  const signature = computeMusicPlaylistTrackSignature(sourceBank);
  const orderedTrackIds = signature === "" ? [] : signature.split(",");

  // True no-op requires BOTH the member signature and the snapshotted
  // title to be unchanged (0718A §2's title-refresh doctrine, banks
  // included, minus the artwork/duration fields banks don't have).
  if (
    existingRadioBank &&
    existingRadioBank.sourceMusicBankRevision === signature &&
    existingRadioBank.title === sourceBank.title
  ) {
    return { radioBank: existingRadioBank, inboxItems, changed: false };
  }

  const trackById = new Map(tracks.map((t) => [t.trackId, t]));
  let workingInboxItems = inboxItems;
  const bankId = existingRadioBank?.id ?? genRadioBankId();

  const priorEntries = existingRadioBank ? [...existingRadioBank.entries] : [];
  const consumedEntryIds = new Set<string>();

  function takePriorEntryForInboxItem(inboxItemId: string): RadioBankEntry | undefined {
    const match = priorEntries.find((e) => !consumedEntryIds.has(e.id) && e.inboxItemId === inboxItemId);
    if (match) consumedEntryIds.add(match.id);
    return match;
  }

  const nextEntries: RadioBankEntry[] = [];
  for (const trackId of orderedTrackIds) {
    const track = trackById.get(trackId);
    const pathHint = track?.audioRelPath ?? track?.filePath ?? trackId;
    const durationSeconds = track?.durationSeconds ?? 0;

    const resolved = resolveOrCreateInboxItem(
      workingInboxItems,
      "sound",
      { sourceSoundId: trackId, sourceFingerprint: computeSourceFingerprint(pathHint, durationSeconds) },
      now,
    );
    if (resolved.created) workingInboxItems = [...workingInboxItems, resolved.item];

    let item = resolved.item;
    const assigned = assignInboxItemToBank(item, bankId, now);
    if (assigned !== item) {
      workingInboxItems = workingInboxItems.map((it) => (it.id === assigned.id ? assigned : it));
      item = assigned;
    }

    const prior = takePriorEntryForInboxItem(item.id);
    nextEntries.push(
      prior
        ? { ...prior, order: nextEntries.length }
        : { id: genRadioBankEntryId(), inboxItemId: item.id, order: nextEntries.length, locked: false },
    );
  }

  // Locked entries whose source track left the source bank are preserved,
  // appended after the synced set in their original relative order —
  // never silently dropped or reordered away (same doctrine as playlists).
  for (const entry of priorEntries) {
    if (consumedEntryIds.has(entry.id)) continue;
    if (!entry.locked) continue;
    nextEntries.push({ ...entry, order: nextEntries.length });
  }

  const radioBank: RadioBank = {
    id: bankId,
    sourceMusicBankId: sourceBank.playlistId,
    sourceMusicBankRevision: signature,
    title: sourceBank.title,
    entries: nextEntries,
    createdAt: existingRadioBank?.createdAt ?? now,
    updatedAt: now,
  };

  return { radioBank, inboxItems: workingInboxItems, changed: true };
}
