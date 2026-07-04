export type DeckId = "A" | "B";

export interface DeckState {
  deckId: DeckId;
  playlistId?: string;
  currentTrackId?: string;
  currentIndex: number;
  isPlaying: boolean;
  currentTime: number;
  duration?: number;
  volume: number;
  loopTrack: boolean;
  loopPlaylist: boolean;
  error?: string;
}
