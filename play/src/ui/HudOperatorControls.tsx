// Compact Broadcast HUD operator cluster — lives in the single top row (TopBar).
// Secondary-layer cycle, pin, grid toggle, and playback status light.

import type { BroadcastSecondaryMode } from "./BroadcastSecondaryLayer";
import type { PlaybackStatus } from "../data/playbackTypes";

const SECONDARY_LABELS: Record<BroadcastSecondaryMode, string> = {
  none:               "—",
  now_playing:        "▶",
  playlist_identity:  "◈",
  next_up:            "→",
  upcoming_buffet:    "≡",
};

const SECONDARY_TITLES: Record<BroadcastSecondaryMode, string> = {
  none:               "Secondary layer: off",
  now_playing:        "Show Now Playing",
  playlist_identity:  "Show Playlist Identity",
  next_up:            "Show Next Up",
  upcoming_buffet:    "Show Coming Up",
};

type Props = {
  secondaryMode: BroadcastSecondaryMode;
  pinned: boolean;
  gridVisible: boolean;
  playbackStatus: PlaybackStatus;
  accent: string;
  onCycleSecondary: () => void;
  onTogglePin: () => void;
  onToggleGrid: () => void;
};

export function HudOperatorControls({
  secondaryMode, pinned, gridVisible, playbackStatus, accent,
  onCycleSecondary, onTogglePin, onToggleGrid,
}: Props) {
  const isPlaying = playbackStatus === "playing";
  return (
    <div className="hud-op-controls">
      <button
        className={`hud-ctl-btn${secondaryMode !== "none" ? " active" : ""}`}
        onClick={onCycleSecondary}
        title={SECONDARY_TITLES[secondaryMode]}
        style={secondaryMode !== "none" ? { color: accent } : {}}
      >
        {SECONDARY_LABELS[secondaryMode]}
      </button>
      <button
        className={`hud-ctl-btn${pinned ? " active" : ""}`}
        onClick={onTogglePin}
        title={pinned ? "Unpin secondary layer" : "Pin secondary layer (prevent auto-dismiss)"}
        style={pinned ? { color: accent } : {}}
      >
        ◫
      </button>
      <button
        className={`hud-ctl-btn${gridVisible ? " active" : ""}`}
        onClick={onToggleGrid}
        title={gridVisible ? "Hide grid" : "Show grid overlay"}
        style={gridVisible ? { color: accent } : {}}
      >
        ⊞
      </button>
      <div className={`hud-status-dot${isPlaying ? " playing" : ""}`} title={playbackStatus} />
    </div>
  );
}
