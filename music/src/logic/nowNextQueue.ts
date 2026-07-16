import type { PlaylistRecord } from "../data/playProjectTypes";
import type { TrackPlaybackIssue } from "../data/playProjectTypes";
import type { Track } from "../data/trackTypes";

export type QueuePanelTrack = {
  slotIndex: number;
  trackId?: string;
  title: string;
  artist?: string;
  durationSeconds?: number;
  isCurrent?: boolean;
  isNext?: boolean;
  isPlayable: boolean;
  playbackIssueCode?: string;
  isEmptySlot: boolean;
};

export type NowNextQueueState = {
  now?: QueuePanelTrack;
  next?: QueuePanelTrack;
  upNext: QueuePanelTrack[];
  autoplayEnabled: boolean;
  currentSlotIndex?: number;
  totalSlots: number;
  playableRemainingCount: number;
  skippedUnplayableCount: number;
  skippedEmptyCount: number;
};

export function buildNowNextQueueState(params: {
  playlist: PlaylistRecord;
  tracksById: Map<string, Track>;
  currentSlotIndex?: number | null;
  playbackIssues?: Record<string, TrackPlaybackIssue>;
  autoplayEnabled: boolean;
  maxUpNextItems?: number;
}): NowNextQueueState {
  const { playlist, tracksById, currentSlotIndex, playbackIssues, autoplayEnabled, maxUpNextItems = 3 } = params;
  const slots = playlist.slots;

  function isPlayable(trackId?: string): boolean {
    if (!trackId) return false;
    const issue = playbackIssues?.[trackId];
    if (issue?.status === "unplayable") return false;
    return tracksById.has(trackId);
  }

  function toQueueTrack(slotIndex: number): QueuePanelTrack {
    const slot = slots[slotIndex];
    const trackId = slot?.assignedTrackId;
    const track = trackId ? tracksById.get(trackId) : undefined;
    const issue = trackId ? playbackIssues?.[trackId] : undefined;
    const isEmpty = !trackId;
    const playable = isPlayable(trackId);
    return {
      slotIndex,
      trackId,
      title: track?.title ?? (isEmpty ? "(empty slot)" : "(missing file)"),
      artist: track?.artist,
      durationSeconds: track?.durationSeconds,
      isPlayable: playable,
      playbackIssueCode: issue?.code,
      isEmptySlot: isEmpty,
    };
  }

  // Build NOW
  let now: QueuePanelTrack | undefined;
  if (currentSlotIndex != null && currentSlotIndex >= 0 && currentSlotIndex < slots.length) {
    now = { ...toQueueTrack(currentSlotIndex), isCurrent: true };
  }

  // Find playable slots after current
  const afterCurrent = currentSlotIndex != null
    ? slots.slice(currentSlotIndex + 1)
    : slots;
  const afterCurrentStartIdx = currentSlotIndex != null ? currentSlotIndex + 1 : 0;

  let skippedUnplayableCount = 0;
  let skippedEmptyCount = 0;
  const playableRemaining: number[] = [];

  afterCurrent.forEach((slot, relIdx) => {
    const absIdx = afterCurrentStartIdx + relIdx;
    if (!slot.assignedTrackId) {
      skippedEmptyCount++;
    } else if (!isPlayable(slot.assignedTrackId)) {
      skippedUnplayableCount++;
    } else {
      playableRemaining.push(absIdx);
    }
  });

  let next: QueuePanelTrack | undefined;
  if (playableRemaining.length > 0) {
    next = { ...toQueueTrack(playableRemaining[0]), isNext: true };
  }

  const upNext: QueuePanelTrack[] = playableRemaining.slice(1, 1 + maxUpNextItems).map(toQueueTrack);

  return {
    now,
    next,
    upNext,
    autoplayEnabled,
    currentSlotIndex: currentSlotIndex ?? undefined,
    totalSlots: slots.length,
    playableRemainingCount: playableRemaining.length,
    skippedUnplayableCount,
    skippedEmptyCount,
  };
}
