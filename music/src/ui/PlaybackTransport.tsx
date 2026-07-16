import type { PlaybackStatus } from "../data/playbackTypes";
import type { Track, TrackRating } from "../data/trackTypes";

function fmtTime(s: number): string {
  if (isNaN(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

type Props = {
  status: PlaybackStatus;
  currentSlotIndex: number | null;
  currentTrack: Track | undefined;
  errorMessage?: string;
  totalSlots: number;
  currentTimeSeconds: number;
  durationSeconds: number;
  volume?: number;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onPlayFromSlot: (slotIndex: number) => void;
  onSeek: (time: number) => void;
  onVolumeChange?: (v: number) => void;
  onRateTrack?: (trackId: string, rating: TrackRating) => void;
};

function DockStars({ track, onChange }: { track: Track; onChange?: (id: string, r: TrackRating) => void }) {
  const rating = (track.rating ?? 0) as TrackRating;
  return (
    <span className="pd-stars">
      {([1, 2, 3, 4, 5] as TrackRating[]).map((n) => (
        <button
          key={n}
          className={`pd-star${n <= rating ? " filled" : ""}`}
          onClick={() => onChange?.(track.trackId, n === rating ? 0 : n)}
          title={`Rate ${n}`}
        >★</button>
      ))}
    </span>
  );
}

function fmtBpm(bpm: number | undefined | null) {
  if (!bpm || isNaN(bpm)) return null;
  return `${Math.round(bpm)} BPM`;
}
function fmtEnergy(e: number | undefined | null) {
  if (e == null || isNaN(e)) return null;
  return `E ${e.toFixed(2)}`;
}

export function PlaybackTransport({
  status, currentSlotIndex, currentTrack, errorMessage,
  totalSlots, currentTimeSeconds, durationSeconds,
  volume = 1.0,
  onPlay, onPause, onStop, onNext, onPrevious, onPlayFromSlot, onSeek, onVolumeChange, onRateTrack,
}: Props) {
  const isPlaying = status === "playing";
  const hasSlot = currentSlotIndex !== null;
  const pct = durationSeconds > 0 ? (currentTimeSeconds / durationSeconds) * 100 : 0;

  const slotNum = hasSlot ? `#${String(currentSlotIndex! + 1).padStart(2, "0")}` : "—";
  const timeLabel = durationSeconds > 0
    ? `${fmtTime(currentTimeSeconds)} / ${fmtTime(durationSeconds)}`
    : currentTimeSeconds > 0 ? fmtTime(currentTimeSeconds) : "";

  const bpmStr = fmtBpm(currentTrack?.bpm);
  const keyStr = currentTrack?.camelotKey?.trim() || null;
  const energyStr = fmtEnergy(currentTrack?.energy);
  const hasStats = currentTrack && (bpmStr || keyStr || energyStr);

  // suppress unused — kept for keyboard handler in App
  void onStop; void onPlayFromSlot; void totalSlots;

  return (
    <div className="playback-dock">
      <div className="pd-row">
        {/* Slot badge */}
        <span className="pd-slot">{slotNum}</span>

        {/* Track info */}
        <div className="pd-info">
          <span className="pd-title">{currentTrack?.title ?? (hasSlot ? "(no file)" : "—")}</span>
          <span className="pd-artist">{currentTrack?.artist ?? ""}</span>
          <div className="pd-stats-row">
            {currentTrack && <DockStars track={currentTrack} onChange={onRateTrack} />}
            {hasStats && (
              <span className="pd-stat-pills">
                {bpmStr && <span className="pd-stat">{bpmStr}</span>}
                {keyStr && <span className="pd-stat">{keyStr}</span>}
                {energyStr && <span className="pd-stat">{energyStr}</span>}
              </span>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="pd-controls">
          <button className="pd-btn" onClick={onPrevious} disabled={!hasSlot} title="Previous">⏮</button>
          <button
            className={`pd-btn pd-play${isPlaying ? " active" : ""}`}
            onClick={isPlaying ? onPause : onPlay}
            title={isPlaying ? "Pause" : "Play"}
          >{isPlaying ? "‖" : "▶"}</button>
          <button className="pd-btn" onClick={onNext} disabled={!hasSlot} title="Next">⏭</button>
        </div>

        {/* Time */}
        <span className="pd-time">{timeLabel}</span>
        {errorMessage && <span className="pd-error" title={errorMessage}>⚠</span>}

        {/* Volume */}
        {onVolumeChange && (
          <div className="pd-vol-row">
            <span className="pd-vol-lbl">Vol</span>
            <input
              type="range" min={0} max={1} step={0.01} value={volume}
              className="pd-vol"
              onChange={(e) => onVolumeChange(Number(e.target.value))}
              title={`Volume: ${Math.round(volume * 100)}%`}
            />
            <span className="pd-vol-val">{Math.round(volume * 100)}</span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="pd-progress-track">
        <div className="pd-progress-fill" style={{ width: `${pct}%` }} />
        <input
          className="pd-progress-input"
          type="range"
          min={0}
          max={durationSeconds || 100}
          step={0.5}
          value={currentTimeSeconds}
          onChange={(e) => onSeek(parseFloat(e.target.value))}
          title={timeLabel}
        />
      </div>
    </div>
  );
}
