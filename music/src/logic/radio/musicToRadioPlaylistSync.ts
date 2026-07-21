// 0717D_RADIO_Playlist_Inbox_and_Performance_Foundation §6.3/§6.4 —
// "Send Playlist to RADIO": creates or updates a draft RadioPlaylist
// linked to its source MUSIC playlist, preserving order, resolving-or-
// creating one Inbox item per distinct track, and never dropping a locked
// entry even when its source track leaves the MUSIC playlist. Pure — no
// mutation of inputs, no side effects; the caller persists whatever is
// returned.
//
// Idempotency: the ordered-assigned-trackId signature (modeled on the
// existing optionsGeneratedFromTrackSignature pattern) is compared against
// the stored sourceMusicPlaylistRevision — an unchanged source playlist
// short-circuits to the existing draft, unchanged, with zero new Inbox
// items.
//
// Immutability: a PUBLISHED RadioPlaylist is never mutated in place — a
// re-send while the active version is published creates a fresh draft
// record instead (same immutable-version doctrine as RadioLoopPackageManifest).
//
// 0718A_MUSIC_RADIO_Clean_Board_and_Explicit_Send_Flows §2 — RADIO cards
// render entirely from data snapshotted here at send time, never a live
// MUSIC lookup: title/coverImage/accentColor/durationSeconds are all
// refreshed from `sourcePlaylist` on EVERY send (first send and every
// re-send — title is no longer "sticky after creation"). If the MUSIC
// source is later renamed/re-covered/deleted, the RADIO card keeps
// rendering its last-sent snapshot unchanged until the next explicit send.

import type { PlaylistRecord } from "../../data/playProjectTypes";
import type { Track } from "../../data/trackTypes";
import type { RadioInboxItem } from "../../data/radioInboxTypes";
import type { RadioPlaylist, RadioPlaylistEntry } from "../../data/radioPlaylistTypes";
import { resolveOrCreateInboxItem, assignInboxItemToPlaylist } from "./radioInboxResolver";
import { computeSourceFingerprint } from "../playbackBounds/computeTrackPlaybackBounds";

function genRadioPlaylistId(): string {
  return `radplaylist_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function genRadioPlaylistEntryId(): string {
  return `radplaylistentry_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function computeMusicPlaylistTrackSignature(sourcePlaylist: PlaylistRecord): string {
  return sourcePlaylist.slots
    .slice()
    .sort((a, b) => a.slotIndex - b.slotIndex)
    .map((s) => s.assignedTrackId ?? "")
    .filter((id) => id !== "")
    .join(",");
}

export interface SendPlaylistToRadioResult {
  radioPlaylist: RadioPlaylist;
  inboxItems: RadioInboxItem[];
  changed: boolean;
}

export function sendPlaylistToRadio(
  sourcePlaylist: PlaylistRecord,
  existingRadioPlaylist: RadioPlaylist | null,
  inboxItems: RadioInboxItem[],
  tracks: Track[],
  now: string = new Date().toISOString(),
): SendPlaylistToRadioResult {
  const signature = computeMusicPlaylistTrackSignature(sourcePlaylist);
  const orderedTrackIds = signature === "" ? [] : signature.split(",");
  const trackById = new Map(tracks.map((t) => [t.trackId, t]));
  const snapshotDurationSeconds = orderedTrackIds.reduce((sum, id) => sum + (trackById.get(id)?.durationSeconds ?? 0), 0);

  // A PUBLISHED playlist is immutable — treat this send as "start a fresh
  // draft" rather than as an update target.
  const targetExisting = existingRadioPlaylist && existingRadioPlaylist.state !== "PUBLISHED" ? existingRadioPlaylist : null;

  // A true no-op requires BOTH the track signature AND every snapshotted
  // display field (0718A §2: title/coverImage/accentColor/durationSeconds)
  // to be unchanged — a title-only rename with the same tracks still
  // counts as a real send that must refresh the snapshot.
  if (
    targetExisting &&
    targetExisting.sourceMusicPlaylistRevision === signature &&
    targetExisting.title === sourcePlaylist.title &&
    targetExisting.coverImage?.src === sourcePlaylist.coverImage?.src &&
    targetExisting.accentColor === sourcePlaylist.accentColor &&
    targetExisting.durationSeconds === snapshotDurationSeconds
  ) {
    return { radioPlaylist: targetExisting, inboxItems, changed: false };
  }

  let workingInboxItems = inboxItems;
  const playlistId = targetExisting?.id ?? genRadioPlaylistId();

  const priorEntries = targetExisting ? [...targetExisting.entries] : [];
  const consumedEntryIds = new Set<string>();

  function takePriorEntryForInboxItem(inboxItemId: string): RadioPlaylistEntry | undefined {
    const match = priorEntries.find((e) => !consumedEntryIds.has(e.id) && e.inboxItemId === inboxItemId);
    if (match) consumedEntryIds.add(match.id);
    return match;
  }

  const nextEntries: RadioPlaylistEntry[] = [];
  for (const trackId of orderedTrackIds) {
    const track = trackById.get(trackId);
    const pathHint = track?.audioRelPath ?? track?.filePath ?? trackId;
    const durationSeconds = track?.durationSeconds ?? 0;

    const resolved = resolveOrCreateInboxItem(
      workingInboxItems,
      "track",
      { sourceTrackId: trackId, sourceFingerprint: computeSourceFingerprint(pathHint, durationSeconds) },
      now,
    );
    if (resolved.created) workingInboxItems = [...workingInboxItems, resolved.item];

    let item = resolved.item;
    const assigned = assignInboxItemToPlaylist(item, playlistId, now);
    if (assigned !== item) {
      workingInboxItems = workingInboxItems.map((it) => (it.id === assigned.id ? assigned : it));
      item = assigned;
    }

    const prior = takePriorEntryForInboxItem(item.id);
    nextEntries.push(
      prior
        ? { ...prior, order: nextEntries.length }
        : {
            id: genRadioPlaylistEntryId(),
            inboxItemId: item.id,
            order: nextEntries.length,
            locked: false,
            includedInPublish: true,
            stemPolicy: "none",
          },
    );
  }

  // Locked entries whose track left the source playlist are preserved,
  // appended after the synced set in their original relative order —
  // never silently dropped or reordered away.
  for (const entry of priorEntries) {
    if (consumedEntryIds.has(entry.id)) continue;
    if (!entry.locked) continue;
    nextEntries.push({ ...entry, order: nextEntries.length });
  }

  const version = targetExisting
    ? targetExisting.version
    : existingRadioPlaylist
      ? String(Number(existingRadioPlaylist.version) + 1)
      : "1";

  const radioPlaylist: RadioPlaylist = {
    id: playlistId,
    sourceMusicPlaylistId: sourcePlaylist.playlistId,
    sourceMusicPlaylistRevision: signature,
    title: sourcePlaylist.title,
    version,
    state: targetExisting?.state ?? "DRAFT",
    entries: nextEntries,
    storageBudgetBytes: targetExisting?.storageBudgetBytes,
    estimatedPublishBytes: targetExisting?.estimatedPublishBytes ?? 0,
    createdAt: targetExisting?.createdAt ?? now,
    updatedAt: now,
    publishedAt: targetExisting?.publishedAt,
    coverImage: sourcePlaylist.coverImage,
    accentColor: sourcePlaylist.accentColor,
    durationSeconds: snapshotDurationSeconds,
    unpublishedAt: targetExisting?.unpublishedAt,
  };

  return { radioPlaylist, inboxItems: workingInboxItems, changed: true };
}
