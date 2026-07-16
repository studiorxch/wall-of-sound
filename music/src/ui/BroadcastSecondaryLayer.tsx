// One secondary information object at a time — temporary broadcast interrupt.
// Auto-dismisses after its configured duration unless pinned.

import { useState } from "react";
import type { NowNextQueueState } from "../logic/nowNextQueue";
import type { PlaylistRecord } from "../data/playProjectTypes";
import type { Track } from "../data/trackTypes";
import type { ScheduleBlock } from "../data/scheduleTypes";

export type BroadcastSecondaryMode =
  | "none"
  | "now_playing"
  | "playlist_identity"
  | "next_up"
  | "upcoming_buffet";

export type BroadcastSecondaryTimingConfig = Record<
  Exclude<BroadcastSecondaryMode, "none">,
  number
>;

export const DEFAULT_SECONDARY_TIMING_MS: BroadcastSecondaryTimingConfig = {
  now_playing:        7000,
  playlist_identity: 10000,
  next_up:            8000,
  upcoming_buffet:   16000,
};

// Canonical operator cycle order for the secondary-layer toggle.
export const SECONDARY_CYCLE: BroadcastSecondaryMode[] = [
  "none", "now_playing", "playlist_identity", "next_up", "upcoming_buffet",
];

export type BroadcastUpcomingItem = {
  itemId: string;
  title: string;
  durationSeconds?: number;
  startsInSeconds?: number;
  moodLabel?: string;
  type: "track" | "playlist" | "event";
};

function fmtDur(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function fmtSecs(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Thin rundown line that depletes over timerDurationMs using a CSS animation.
// Keyed by modeKey so the animation restarts on every new mode activation.
function RundownLine({ durationMs, accent, modeKey }: { durationMs: number; accent: string; modeKey: string }) {
  return (
    <div className="bsl-rundown" key={modeKey}>
      <div
        className="bsl-rundown-fill"
        style={{
          animationDuration: `${durationMs}ms`,
          background: accent,
        }}
      />
    </div>
  );
}

function IdentityCard({
  playlist, totalDur, trackCount, accent, timerDurationMs, modeKey,
}: {
  playlist: PlaylistRecord;
  totalDur: number;
  trackCount: number;
  accent: string;
  timerDurationMs: number;
  modeKey: string;
}) {
  const [err, setErr] = useState(false);
  const cover = playlist.coverImage?.src;
  const moodLine = playlist.mood?.tags?.join(" · ") || playlist.description || null;
  return (
    <div className="bsl-layer bsl-identity">
      {cover && !err && (
        <img src={cover} alt={playlist.title} className="bsl-identity-cover" onError={() => setErr(true)} />
      )}
      <div className="bsl-identity-body">
        <div className="bsl-sys-label">PLAYLIST</div>
        <div className="bsl-identity-title">{playlist.title}</div>
        {moodLine && <div className="bsl-identity-desc">{moodLine}</div>}
        <div className="bsl-identity-meta">
          {trackCount} track{trackCount !== 1 ? "s" : ""} · {fmtDur(totalDur)}
        </div>
      </div>
      <RundownLine durationMs={timerDurationMs} accent={accent} modeKey={modeKey} />
    </div>
  );
}

type Props = {
  mode: BroadcastSecondaryMode;
  modeKey: string;
  playlist: PlaylistRecord;
  allPlaylists: PlaylistRecord[];
  queue: NowNextQueueState;
  currentTrack?: Track;
  currentTimeSeconds: number;
  durationSeconds: number;
  accent: string;
  totalDur: number;
  trackCount: number;
  timerDurationMs: number;
  scheduleLater?: ScheduleBlock[];
};

export function BroadcastSecondaryLayer({
  mode, modeKey, playlist, allPlaylists, queue, currentTrack,
  currentTimeSeconds, durationSeconds, accent,
  totalDur, trackCount, timerDurationMs, scheduleLater,
}: Props) {
  if (mode === "none") return null;

  if (mode === "now_playing") {
    const pct = durationSeconds > 0
      ? Math.min(100, (currentTimeSeconds / durationSeconds) * 100)
      : 0;
    return (
      <div className="bsl-layer bsl-now-playing">
        <div className="bsl-sys-label">NOW PLAYING</div>
        <div className="bsl-np-title">{currentTrack?.title ?? "—"}</div>
        {currentTrack?.artist && <div className="bsl-np-artist">{currentTrack.artist}</div>}
        <div className="bsl-np-bar">
          <div className="bsl-np-fill" style={{ width: `${pct}%`, background: accent }} />
        </div>
        <div className="bsl-np-time">
          {fmtSecs(currentTimeSeconds)} / {fmtSecs(durationSeconds)}
        </div>
        <div className="bsl-np-playlist">{playlist.title}</div>
        <RundownLine durationMs={timerDurationMs} accent={accent} modeKey={modeKey} />
      </div>
    );
  }

  if (mode === "playlist_identity") {
    return (
      <IdentityCard
        playlist={playlist}
        totalDur={totalDur}
        trackCount={trackCount}
        accent={accent}
        timerDurationMs={timerDurationMs}
        modeKey={modeKey}
      />
    );
  }

  if (mode === "next_up") {
    const next = queue.next;
    if (!next) return null;
    return (
      <div className="bsl-layer bsl-next-up">
        <div className="bsl-sys-label">NEXT UP</div>
        <div className="bsl-next-title">{next.title}</div>
        {next.artist && <div className="bsl-next-artist">{next.artist}</div>}
        {next.durationSeconds != null && next.durationSeconds > 0 && (
          <div className="bsl-next-dur">{fmtDur(next.durationSeconds)}</div>
        )}
        <RundownLine durationMs={timerDurationMs} accent={accent} modeKey={modeKey} />
      </div>
    );
  }

  if (mode === "upcoming_buffet") {
    // Prefer scheduled future blocks (0621G); fall back to other playlists.
    const fmtBlockTime = (iso: string) =>
      new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const others: BroadcastUpcomingItem[] =
      scheduleLater && scheduleLater.length > 0
        ? scheduleLater.slice(0, 3).map((b) => ({
            itemId: b.blockId,
            title: b.title,
            durationSeconds: b.durationMinutes * 60,
            moodLabel: fmtBlockTime(b.startTimeIso),
            type: "event" as const,
          }))
        : allPlaylists
            .filter((p) => p.playlistId !== playlist.playlistId)
            .slice(0, 3)
            .map((p) => ({
              itemId: p.playlistId,
              title: p.title,
              durationSeconds: undefined,
              moodLabel: p.mood?.tags?.[0] ?? p.description?.split(" ").slice(0, 3).join(" ") ?? undefined,
              type: "playlist" as const,
            }));

    return (
      <div className="bsl-layer bsl-buffet">
        <div className="bsl-sys-label">COMING UP</div>
        {others.length === 0 ? (
          <div className="bsl-next-empty">No upcoming events</div>
        ) : (
          <ul className="bsl-buffet-list">
            {others.map((item, i) => (
              <li key={item.itemId} className="bsl-buffet-item">
                <span className="bsl-buffet-num">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="bsl-buffet-title">{item.title}</span>
                {item.moodLabel && (
                  <span className="bsl-buffet-artist">{item.moodLabel}</span>
                )}
              </li>
            ))}
          </ul>
        )}
        <RundownLine durationMs={timerDurationMs} accent={accent} modeKey={modeKey} />
      </div>
    );
  }

  return null;
}
