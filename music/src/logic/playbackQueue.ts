import type { TrackSlot } from "../data/playlistTypes";

export function getPlayableSlots(slots: TrackSlot[]): TrackSlot[] {
  return slots.filter((s) => !!s.assignedTrackId);
}

export function getNextPlayableSlot(params: {
  slots: TrackSlot[];
  currentSlotIndex: number;
}): TrackSlot | null {
  const { slots, currentSlotIndex } = params;
  for (let i = currentSlotIndex + 1; i < slots.length; i++) {
    if (slots[i].assignedTrackId) return slots[i];
  }
  return null;
}

export function getPreviousPlayableSlot(params: {
  slots: TrackSlot[];
  currentSlotIndex: number;
}): TrackSlot | null {
  const { slots, currentSlotIndex } = params;
  for (let i = currentSlotIndex - 1; i >= 0; i--) {
    if (slots[i].assignedTrackId) return slots[i];
  }
  return null;
}
