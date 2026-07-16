export type PlaybackStatus = "idle" | "playing" | "paused" | "error";

export type PlaylistPlaybackState = {
  status: PlaybackStatus;
  currentSlotIndex: number | null;
  autoplayNext: boolean;
  errorMessage?: string;
};
