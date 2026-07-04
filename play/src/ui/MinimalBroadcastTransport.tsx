// Broadcast HUD transport — passive playback state signal.
// Shows: play/pause state, now-playing info, thin progress line, elapsed/duration.
// Does NOT expose prev/stop/next/autoplay/seek controls — those belong in the Editor.

function fmtTime(s: number): string {
  if (isNaN(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

type Props = {
  isPlaying: boolean;
  slotIndex?: number | null;
  title?: string;
  artist?: string;
  playlistTitle?: string;
  elapsedSeconds?: number;
  durationSeconds?: number;
  accentColor?: string;
  onTogglePlay?: () => void;
};

export function MinimalBroadcastTransport({
  isPlaying,
  slotIndex,
  title,
  artist,
  playlistTitle,
  elapsedSeconds = 0,
  durationSeconds = 0,
  accentColor = "var(--accent)",
  onTogglePlay,
}: Props) {
  const progress = durationSeconds > 0 ? Math.min(1, elapsedSeconds / durationSeconds) : 0;
  const elapsed = fmtTime(elapsedSeconds);
  const total = durationSeconds > 0 ? fmtTime(durationSeconds) : "";
  const timeLabel = total ? `${elapsed} / ${total}` : elapsed || "0:00 / 0:00";

  const slotLabel = slotIndex != null ? `#${String(slotIndex + 1).padStart(2, "0")}` : null;
  const displayTitle = title || "Not playing";
  const hasTrack = !!title;

  const stateGlyph = isPlaying ? "▶" : (hasTrack ? "Ⅱ" : "—");

  return (
    <div className="mbt-shell">
      {/* Now-playing row */}
      <div className="mbt-nowplaying">
        <button
          className={`mbt-state-btn${isPlaying ? " playing" : ""}`}
          style={isPlaying ? { color: accentColor } : {}}
          onClick={onTogglePlay}
          aria-label={isPlaying ? "Pause" : "Play"}
          title={isPlaying ? "Pause" : "Play"}
          disabled={!onTogglePlay}
        >
          {stateGlyph}
        </button>
        <div className="mbt-track-line">
          {slotLabel && (
            <span className="mbt-slot" style={{ color: accentColor }}>{slotLabel}</span>
          )}
          <span className="mbt-title" title={displayTitle}>{displayTitle}</span>
          {artist && <span className="mbt-sep">—</span>}
          {artist && <span className="mbt-artist" title={artist}>{artist}</span>}
          {playlistTitle && <span className="mbt-pl-divider">/</span>}
          {playlistTitle && (
            <span className="mbt-playlist" title={playlistTitle}>{playlistTitle}</span>
          )}
        </div>
        <span className="mbt-time">{timeLabel}</span>
      </div>

      {/* Thin progress line */}
      <div className="mbt-progress">
        <div
          className="mbt-progress-fill"
          style={{ width: `${progress * 100}%`, background: accentColor }}
        />
      </div>
    </div>
  );
}
