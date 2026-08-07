// Glyph Audio — beat-grid review (docs/glyph-audio/09_GLYPH_AUDIO_MVP_Spec.md,
// "Beat-grid review"). Shows the existing detected beat timestamps
// (Track.beatMap.beatTimesSeconds, reused unchanged), lets a person play the
// track and confirm the grid before anything downstream generates glyphs.
// Add/move/remove of individual beat markers is deferred past this slice —
// only Confirm is wired.
//
// Play/Pause reuses the exact same app-wide audition props both Review
// dialogs already use (0728H_MUSIC_Review_Dialog_Playback_And_Audio_Evidence)
// — never a second playback system.
//
// Styled entirely with inline styles (no new styles.css rules — this
// build's file allowlist does not include styles.css) plus the two
// existing reusable button classes (tb-btn, tb-btn sm).

import type { Track } from "../../data/trackTypes";
import type { BeatGridDraft } from "../../logic/glyph/beatGridAdapter";

type Props = {
  track: Track;
  grid: BeatGridDraft;
  beatsPerBarDraft: number;
  onBeatsPerBarChange: (value: number) => void;
  confirmed: boolean;
  onConfirm: () => void;
  onAuditionTrack?: (trackId: string) => void;
  auditionTrackId?: string | null;
  playbackStatus?: string;
  onPauseTrack?: () => void;
  onResumeTrack?: () => void;
  currentTimeSeconds?: number;
};

export function GlyphBeatGridReview({
  track, grid, beatsPerBarDraft, onBeatsPerBarChange, confirmed, onConfirm,
  onAuditionTrack, auditionTrackId, playbackStatus, onPauseTrack, onResumeTrack, currentTimeSeconds,
}: Props) {
  const isCurrent = auditionTrackId === track.trackId;
  const isPlaying = isCurrent && playbackStatus === "playing";
  const isPaused = isCurrent && playbackStatus === "paused";

  function handlePlayPause() {
    if (isPlaying) onPauseTrack?.();
    else if (isPaused) onResumeTrack?.();
    else onAuditionTrack?.(track.trackId);
  }

  const duration = Math.max(0.001, grid.durationSeconds);
  const playheadPct = isCurrent && currentTimeSeconds != null ? Math.min(100, (currentTimeSeconds / duration) * 100) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button className="tb-btn sm" onClick={handlePlayPause} disabled={!onAuditionTrack}>
          {isPlaying ? "Pause" : "Play"}
        </button>
        <span style={{ fontSize: 12, opacity: 0.8 }}>
          {grid.beatTimesSeconds.length === 0
            ? "No beat grid detected for this track."
            : `${grid.beatTimesSeconds.length} beats detected${grid.bpm ? ` · ${grid.bpm.toFixed(1)} BPM` : ""}`}
        </span>
      </div>

      {grid.beatTimesSeconds.length > 0 && (
        <div style={{ position: "relative", height: 24, background: "rgba(255,255,255,0.05)", borderRadius: 4 }}>
          {grid.beatTimesSeconds.map((t, i) => (
            <div
              key={i}
              title={`Beat ${i + 1} at ${t.toFixed(2)}s`}
              style={{
                position: "absolute", left: `${Math.min(100, (t / duration) * 100)}%`, top: 0,
                width: 2, height: "100%", background: "rgba(56,189,248,0.6)",
              }}
            />
          ))}
          {playheadPct != null && (
            <div
              style={{
                position: "absolute", left: `${playheadPct}%`, top: 0,
                width: 2, height: "100%", background: "#f43f5e",
              }}
            />
          )}
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
          Beats per bar:
          <input
            type="number"
            min={1}
            max={16}
            value={beatsPerBarDraft}
            onChange={(e) => onBeatsPerBarChange(Math.max(1, Math.round(Number(e.target.value) || 1)))}
            disabled={confirmed}
            style={{ width: 48 }}
          />
        </label>
        {!grid.beatsPerBarConfirmed && (
          <span style={{ opacity: 0.7 }}>
            (defaulted — no detected time signature; confirm or adjust before generating)
          </span>
        )}
      </div>

      <button className="tb-btn sm" onClick={onConfirm} disabled={confirmed || grid.beatTimesSeconds.length === 0}>
        {confirmed ? "Grid confirmed" : "Confirm Grid"}
      </button>
    </div>
  );
}
