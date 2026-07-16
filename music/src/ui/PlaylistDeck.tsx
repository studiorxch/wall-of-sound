import { useMemo } from "react";
import type { Track, TrackRating } from "../data/trackTypes";
import type { TrackSlot } from "../data/playlistTypes";

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export interface PlaylistDeckProps {
  playlistTitle: string;
  slots: TrackSlot[];
  tracksById: Map<string, Track>;
  nowPlayingSlotIndex: number | null;
  playbackStatus: "idle" | "playing" | "paused" | "error" | string;
  currentTimeSeconds: number;
  durationSeconds: number;
  volume: number;
  isPlayingThisPlaylist: boolean;
  onPlayFromSlot: (slotIndex: number) => void;
  onPause: () => void;
  onResume: () => void;
  onSeek?: (time: number) => void;
  onVolumeChange: (volume: number) => void;
  onRateTrack: (trackId: string, rating: TrackRating) => void;
}

export function PlaylistDeck({
  playlistTitle,
  slots,
  tracksById,
  nowPlayingSlotIndex,
  playbackStatus,
  currentTimeSeconds,
  durationSeconds,
  volume,
  isPlayingThisPlaylist,
  onPlayFromSlot,
  onPause,
  onResume,
  onSeek,
  onVolumeChange,
  onRateTrack,
}: PlaylistDeckProps) {
  const assignedSlots = useMemo(
    () => slots.filter((s) => s.assignedTrackId),
    [slots],
  );

  const currentTrack =
    isPlayingThisPlaylist && nowPlayingSlotIndex != null
      ? tracksById.get(slots[nowPlayingSlotIndex]?.assignedTrackId ?? "")
      : null;

  const currentSlotPos =
    isPlayingThisPlaylist && nowPlayingSlotIndex != null
      ? assignedSlots.findIndex((s) => s.slotIndex === nowPlayingSlotIndex) + 1
      : null;

  const isPlaying = isPlayingThisPlaylist && playbackStatus === "playing";
  const isPaused = isPlayingThisPlaylist && playbackStatus === "paused";
  const hasTrack = !!currentTrack;
  const hasAny = assignedSlots.length > 0;

  const prevSlot = useMemo(() => {
    if (!hasTrack || nowPlayingSlotIndex == null) return null;
    const idx = assignedSlots.findIndex((s) => s.slotIndex === nowPlayingSlotIndex);
    return idx > 0 ? assignedSlots[idx - 1] : null;
  }, [assignedSlots, nowPlayingSlotIndex, hasTrack]);

  const nextSlot = useMemo(() => {
    if (nowPlayingSlotIndex == null) return assignedSlots[0] ?? null;
    const idx = assignedSlots.findIndex((s) => s.slotIndex === nowPlayingSlotIndex);
    return idx >= 0 && idx < assignedSlots.length - 1 ? assignedSlots[idx + 1] : null;
  }, [assignedSlots, nowPlayingSlotIndex]);

  const progress =
    durationSeconds > 0 ? Math.min(currentTimeSeconds / durationSeconds, 1) : 0;

  function handlePlayPause() {
    if (!hasAny) return;
    if (isPlaying) {
      onPause();
    } else if (isPaused) {
      onResume();
    } else if (!hasTrack && assignedSlots[0]) {
      onPlayFromSlot(assignedSlots[0].slotIndex);
    } else if (hasTrack && nowPlayingSlotIndex != null) {
      onResume();
    }
  }

  function handleProgressClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!onSeek || !durationSeconds) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(ratio * durationSeconds);
  }

  const statusLabel = isPlaying ? "NOW PLAYING" : isPaused ? "PAUSED" : "READY";
  const deckMod = isPlaying ? " pd--playing" : isPaused ? " pd--paused" : " pd--ready";
  const rating = (currentTrack?.rating ?? 0) as TrackRating;
  const volPct = Math.round(volume * 100);

  return (
    <div className={`pd${deckMod}`}>
      <div className="pd-inner">

        {/* Row 1: status + context */}
        <div className="pd-header-row">
          <span className="pd-status">{statusLabel}</span>
          <span className="pd-context">
            {playlistTitle}
            {currentSlotPos != null && (
              <> · <span className="pd-context-source">Playlist Output</span> · {currentSlotPos} / {assignedSlots.length}</>
            )}
          </span>
        </div>

        {/* Row 2: track meta or hint */}
        {hasTrack && currentTrack ? (
          <>
            <div className="pd-meta">
              <span className="pd-title">{currentTrack.title}</span>
              <span className="pd-sep"> — </span>
              <span className="pd-artist">{currentTrack.artist || "Unknown"}</span>
            </div>
            <div
              className="pd-progress"
              onClick={handleProgressClick}
              title={onSeek ? "Click to seek" : undefined}
            >
              <div className="pd-progress-bar" style={{ width: `${progress * 100}%` }} />
            </div>
          </>
        ) : (
          <div className="pd-ready-hint">
            {hasAny ? "Select a track to preview" : "No tracks in playlist output"}
          </div>
        )}

        {/* Row 3: transport + time + rating + volume */}
        <div className="pd-controls">
          <div className="pd-transport">
            <button
              className="pd-btn pd-btn--prev"
              onClick={() => prevSlot && onPlayFromSlot(prevSlot.slotIndex)}
              disabled={!prevSlot}
              aria-label="Previous playlist track"
            >⏮</button>
            <button
              className={`pd-btn pd-btn--playpause${isPlaying ? " pd-btn--active" : ""}`}
              onClick={handlePlayPause}
              disabled={!hasAny}
              aria-label={isPlaying ? "Pause current playlist track" : isPaused ? "Play current playlist track" : "Play current playlist track"}
            >{isPlaying ? "⏸" : "▶"}</button>
            <button
              className="pd-btn pd-btn--next"
              onClick={() => nextSlot && onPlayFromSlot(nextSlot.slotIndex)}
              disabled={!nextSlot}
              aria-label="Next playlist track"
            >⏭</button>
            {hasTrack && (
              <span className="pd-time">
                {fmtTime(currentTimeSeconds)}
                {durationSeconds > 0 && <> / {fmtTime(durationSeconds)}</>}
              </span>
            )}
          </div>

          {/* Rating */}
          <div className="pd-rating" aria-label="Track rating">
            {([1, 2, 3, 4, 5] as TrackRating[]).map((n) => (
              <button
                key={n}
                className={`pd-star${n <= rating ? " pd-star--on" : ""}`}
                onClick={() => currentTrack && onRateTrack(currentTrack.trackId, n === rating ? 0 : n)}
                disabled={!hasTrack}
                aria-label={`Rate ${n} star${n !== 1 ? "s" : ""}`}
              >★</button>
            ))}
          </div>

          {/* Volume */}
          <div className="pd-vol-group">
            <span className="pd-vol-lbl">Vol</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              className="pd-vol-slider"
              aria-label="Volume"
              onChange={(e) => onVolumeChange(Number(e.target.value))}
            />
            <span className="pd-vol-val">{volPct}</span>
          </div>
        </div>

      </div>
    </div>
  );
}
