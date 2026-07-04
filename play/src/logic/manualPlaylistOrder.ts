import type { TrackSlot, TrackLock } from "../data/playlistTypes";
import type { Track } from "../data/trackTypes";

// ── Internal helpers ──────────────────────────────────────────────────────────

function isLocked(trackId: string | undefined, locks: TrackLock[]): boolean {
  if (!trackId) return false;
  return locks.some((l) => l.trackId === trackId);
}

/** Rebuild slotIndex, slotId, and startTimeSeconds sequentially from durations. */
export function reindexPlaylistSlots(slots: TrackSlot[], tracksById: Map<string, Track>): TrackSlot[] {
  let time = 0;
  return slots.map((s, i) => {
    const dur = s.assignedTrackId ? (tracksById.get(s.assignedTrackId)?.durationSeconds ?? 0) : 0;
    const out = { ...s, slotIndex: i, slotId: `slot_${i}`, startTimeSeconds: time };
    time += dur;
    return out;
  });
}

/** Alias kept for callers that don't supply tracksById (times stay unchanged). */
export function recalculateSlotStartTimes(slots: TrackSlot[], tracksById: Map<string, Track>): TrackSlot[] {
  return reindexPlaylistSlots(slots, tracksById);
}

// ── Compact removal ───────────────────────────────────────────────────────────

/**
 * Remove the slot at slotIndex and compact — no gap left.
 * Returns a new array with sequential indexes; start times are NOT recalculated
 * here (call reindexPlaylistSlots afterward with tracksById).
 */
export function removeSlotCompact(slots: TrackSlot[], slotIndex: number): TrackSlot[] {
  if (slotIndex < 0 || slotIndex >= slots.length) return slots;
  const next = [...slots.slice(0, slotIndex), ...slots.slice(slotIndex + 1)];
  return next.map((s, i) => ({ ...s, slotIndex: i }));
}

// ── Leave-gap removal ─────────────────────────────────────────────────────────

/** Clear the assignedTrackId on the slot but keep the slot in place. */
export function removeSlotLeaveGap(slots: TrackSlot[], slotIndex: number): TrackSlot[] {
  if (slotIndex < 0 || slotIndex >= slots.length) return slots;
  return slots.map((s, i) => i === slotIndex ? { ...s, assignedTrackId: undefined } : s);
}

// ── Replace / insert / append ─────────────────────────────────────────────────

/** Replace the track in an existing slot with a different track. */
export function replaceSlot(slots: TrackSlot[], slotIndex: number, trackId: string): TrackSlot[] {
  if (slotIndex < 0 || slotIndex >= slots.length) return slots;
  return slots.map((s, i) => i === slotIndex ? { ...s, assignedTrackId: trackId } : s);
}

/**
 * Insert a new slot carrying trackId immediately after slotIndex.
 * Pass slotIndex = -1 to prepend.
 */
export function insertTrackAfterSlot(
  slots: TrackSlot[],
  afterSlotIndex: number,
  trackId: string,
): TrackSlot[] {
  const insertAt = Math.min(Math.max(afterSlotIndex + 1, 0), slots.length);
  const template = slots[Math.max(afterSlotIndex, 0)] ?? slots[slots.length - 1];
  const newSlot: TrackSlot = {
    slotId: `slot_insert_${Date.now()}`,
    slotIndex: insertAt,
    startTimeSeconds: template?.startTimeSeconds ?? 0,
    targetEnergy: template?.targetEnergy ?? 0.5,
    targetBpm: template?.targetBpm ?? 120,
    assignedTrackId: trackId,
    warningLevel: "none",
    warningMessages: [],
  };
  const next = [...slots.slice(0, insertAt), newSlot, ...slots.slice(insertAt)];
  return next.map((s, i) => ({ ...s, slotIndex: i }));
}

/** Append a track as a new slot at the end of the playlist. */
export function appendTrackToPlaylist(slots: TrackSlot[], trackId: string): TrackSlot[] {
  const last = slots[slots.length - 1];
  const newSlot: TrackSlot = {
    slotId: `slot_append_${Date.now()}`,
    slotIndex: slots.length,
    startTimeSeconds: last ? last.startTimeSeconds : 0,
    targetEnergy: last?.targetEnergy ?? 0.5,
    targetBpm: last?.targetBpm ?? 120,
    assignedTrackId: trackId,
    warningLevel: "none",
    warningMessages: [],
  };
  return [...slots, newSlot];
}

// ── Manual reorder ────────────────────────────────────────────────────────────

export function reorderPlaylistSlot(params: {
  slots: TrackSlot[];
  fromSlotIndex: number;
  toSlotIndex: number;
  locks: TrackLock[];
}): TrackSlot[] {
  const { slots, fromSlotIndex, toSlotIndex, locks } = params;
  if (fromSlotIndex === toSlotIndex) return slots;

  const fromTrackId = slots[fromSlotIndex]?.assignedTrackId;
  const toTrackId = slots[toSlotIndex]?.assignedTrackId;
  if (fromTrackId && locks.some((l) => l.trackId === fromTrackId)) return slots;
  if (toTrackId && locks.some((l) => l.trackId === toTrackId)) return slots;

  const ids: (string | undefined)[] = slots.map((s) => s.assignedTrackId);
  const [moved] = ids.splice(fromSlotIndex, 1);
  ids.splice(toSlotIndex, 0, moved);

  return slots.map((s, i) => ({ ...s, assignedTrackId: ids[i] }));
}

export function moveSlotUp(params: {
  slots: TrackSlot[];
  slotIndex: number;
  locks: TrackLock[];
}): TrackSlot[] {
  const { slots, slotIndex, locks } = params;
  if (slotIndex <= 0) return slots;

  const targetIndex = slotIndex - 1;
  if (
    isLocked(slots[slotIndex].assignedTrackId, locks) ||
    isLocked(slots[targetIndex].assignedTrackId, locks)
  ) return slots;

  return slots.map((s, i) => {
    if (i === slotIndex) return { ...s, assignedTrackId: slots[targetIndex].assignedTrackId };
    if (i === targetIndex) return { ...s, assignedTrackId: slots[slotIndex].assignedTrackId };
    return s;
  });
}

export function moveSlotDown(params: {
  slots: TrackSlot[];
  slotIndex: number;
  locks: TrackLock[];
}): TrackSlot[] {
  const { slots, slotIndex, locks } = params;
  if (slotIndex >= slots.length - 1) return slots;

  const targetIndex = slotIndex + 1;
  if (
    isLocked(slots[slotIndex].assignedTrackId, locks) ||
    isLocked(slots[targetIndex].assignedTrackId, locks)
  ) return slots;

  return slots.map((s, i) => {
    if (i === slotIndex) return { ...s, assignedTrackId: slots[targetIndex].assignedTrackId };
    if (i === targetIndex) return { ...s, assignedTrackId: slots[slotIndex].assignedTrackId };
    return s;
  });
}
