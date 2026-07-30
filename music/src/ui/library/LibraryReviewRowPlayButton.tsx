// 0728H_MUSIC_Review_Dialog_Playback_And_Audio_Evidence — a compact Play/
// Pause button for a review-dialog row, byte-for-byte the same 4-state
// logic (current/playing/paused/idle) and CSS classes as LibraryDataGrid's
// own row Play button (renderLibraryCell's "title" case) — reused here
// rather than reimplemented so a review dialog is never a second playback
// system. `auditionTrackId`/`playbackStatus` are the SAME app-wide values
// the grid and the bottom transport already share via App.tsx's single
// `audioRef` — clicking Play here takes over the real transport exactly
// like clicking Play in the grid does, and "only one track plays at a
// time" falls out for free since there is only ever one auditionTrackId.

import type { Track } from "../../data/trackTypes";

interface Props {
  track: Track;
  onAuditionTrack?: (id: string) => void;
  auditionTrackId?: string | null;
  playbackStatus?: string;
  onPauseTrack?: () => void;
  onResumeTrack?: () => void;
}

export function LibraryReviewRowPlayButton({
  track, onAuditionTrack, auditionTrackId, playbackStatus, onPauseTrack, onResumeTrack,
}: Props) {
  if (!onAuditionTrack) return null;
  const hasAudio = !!(track.audioRelPath || track.objectUrl || track.filePath);
  const isCurrent = auditionTrackId === track.trackId;
  const isPlaying = isCurrent && playbackStatus === "playing";
  const isPaused = isCurrent && playbackStatus === "paused";
  return (
    <button
      className={`tb-btn sm col-play-btn${isCurrent ? " tb-btn-playing" : ""}`}
      disabled={!hasAudio}
      title={hasAudio ? (isPlaying ? "Pause" : "Play") : "Audio file not linked"}
      onClick={(e) => {
        e.stopPropagation();
        if (!hasAudio) return;
        if (isPlaying) onPauseTrack?.();
        else if (isPaused) onResumeTrack?.();
        else onAuditionTrack(track.trackId);
      }}
    >{isPlaying ? "⏸" : "▶"}</button>
  );
}
