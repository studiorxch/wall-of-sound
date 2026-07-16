import type { TrackSlot } from "../data/playlistTypes";

export function getPlayableSlots(slots: TrackSlot[]): TrackSlot[] {
  return slots.filter((s) => !!s.assignedTrackId);
}

// Codec/playback safety (0709): pass blockedTrackIds (tracks with unplayable
// playback issues) so queue advance skips known-bad tracks proactively instead
// of letting them error mid-mix and break recordings.
export function getNextPlayableSlot(params: {
  slots: TrackSlot[];
  currentSlotIndex: number;
  blockedTrackIds?: ReadonlySet<string>;
}): TrackSlot | null {
  const { slots, currentSlotIndex, blockedTrackIds } = params;
  for (let i = currentSlotIndex + 1; i < slots.length; i++) {
    const id = slots[i].assignedTrackId;
    if (!id) continue;
    if (blockedTrackIds?.has(id)) continue;
    return slots[i];
  }
  return null;
}

export function getPreviousPlayableSlot(params: {
  slots: TrackSlot[];
  currentSlotIndex: number;
  blockedTrackIds?: ReadonlySet<string>;
}): TrackSlot | null {
  const { slots, currentSlotIndex, blockedTrackIds } = params;
  for (let i = currentSlotIndex - 1; i >= 0; i--) {
    const id = slots[i].assignedTrackId;
    if (!id) continue;
    if (blockedTrackIds?.has(id)) continue;
    return slots[i];
  }
  return null;
}
