import { useState, useEffect, useRef } from "react";
import type { PlaybackStatus } from "../data/playbackTypes";
import type { Track } from "../data/trackTypes";
import { buildAudioIndicators } from "../runtime/broadcastIndicatorRegistry";
import type {
  SyncState,
  StopResult,
} from "../runtime/broadcastIndicatorRegistry";
import type { SnapResult } from "../runtime/broadcastScreensnap";

type Props = {
  controlsVisible: boolean;
  playbackStatus: PlaybackStatus;
  currentTrack: Track | undefined;
  onPlay: () => void;
  onPause: () => void;
  wosUrl: string | null;
  syncState: SyncState;
  latencyMs: number | null;
  wallCanStop: boolean;
  stopResult: StopResult;
  onRouteStop: () => void;
  snapStatus?: SnapResult | null;
};

export function BroadcastSmartGridOverlay({
  controlsVisible,
  playbackStatus,
  currentTrack,
  onPlay,
  onPause,
  wosUrl,
  syncState,
  latencyMs,
  wallCanStop,
  stopResult,
  onRouteStop,
  snapStatus,
}: Props) {
  const mountRef = useRef(Date.now());
  const [uptimeSeconds, setUptimeSeconds] = useState(0);
  const [stopArmed, setStopArmed] = useState(false);
  const armTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      setUptimeSeconds(Math.floor((Date.now() - mountRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (stopResult !== "idle" || !wallCanStop) {
      setStopArmed(false);
      if (armTimerRef.current) clearTimeout(armTimerRef.current);
    }
  }, [stopResult, wallCanStop]);

  if (!controlsVisible) return null;

  const isPlaying = playbackStatus === "playing";

  const indicators = buildAudioIndicators({
    playbackStatus: playbackStatus === "error" ? "idle" : playbackStatus,
    currentTrackTitle: currentTrack?.title,
    uptimeSeconds,
    wosUrl,
    syncState,
    latencyMs,
    wallCanStop,
    stopResult,
  });

  const audioInds = indicators.filter(
    (i) => i.id === "audio-state" || i.id === "tx-state",
  );
  const sourceInds = indicators.filter(
    (i) => i.id === "source-feed" || i.id === "uptime-play",
  );
  const bridgeInds = indicators.filter(
    (i) => i.id === "sync-state" || i.id === "latency",
  );
  const stopInd = indicators.find((i) => i.id === "stop-control");

  function handleStopClick() {
    if (stopResult === "sent" || stopResult === "stopped") return;
    if (!stopArmed) {
      setStopArmed(true);
      armTimerRef.current = setTimeout(() => setStopArmed(false), 3000);
    } else {
      if (armTimerRef.current) clearTimeout(armTimerRef.current);
      setStopArmed(false);
      onRouteStop();
    }
  }

  function syncClass(state: SyncState) {
    if (state === "locked") return "bsgo-value bsgo-value--live";
    if (state === "degraded") return "bsgo-value bsgo-value--warn";
    if (state === "lost") return "bsgo-value bsgo-value--error";
    return "bsgo-value bsgo-value--missing";
  }

  return (
    <div className="bsgo-cluster">
      {/* ── Identity ──────────────────────────────────────────── */}
      <div className="bsgo-ident">
        <span className="bsgo-sys-id">SURFACE</span>
        <span className="bsgo-sys-sub">AUDIO BROADCAST SYSTEM</span>
      </div>

      {/* ── Audio Signal ──────────────────────────────────────── */}
      <div className="bsgo-section-rule">
        <span className="bsgo-section-label">AUDIO SIG</span>
      </div>

      {audioInds.map((ind) => (
        <div key={ind.id} className="bsgo-row">
          <span className="bsgo-label">{ind.label}</span>
          <span
            className={[
              "bsgo-value",
              ind.id === "audio-state" && isPlaying ? "bsgo-value--live" : "",
              ind.id === "audio-state" && !currentTrack
                ? "bsgo-value--dim"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {ind.value}
          </span>
          {ind.id === "audio-state" && currentTrack && (
            <button
              className={`bsgo-audio-ctl${isPlaying ? " bsgo-audio-ctl--active" : ""}`}
              onClick={isPlaying ? onPause : onPlay}
              title={isPlaying ? "Pause audio" : "Resume audio"}
            >
              {isPlaying ? "▪" : "▶"}
            </button>
          )}
        </div>
      ))}

      {/* SOURCE + UPTIME in same section — no extra divider */}
      {sourceInds.map((ind) => (
        <div key={ind.id} className="bsgo-row">
          <span className="bsgo-label bsgo-label--sub">{ind.label}</span>
          <span
            className={`bsgo-value bsgo-value--sub${ind.truthState === "missing" ? " bsgo-value--missing" : ""}`}
          >
            {ind.value}
            {ind.missingReason && (
              <span className="bsgo-missing-reason">
                {" "}
                — {ind.missingReason}
              </span>
            )}
          </span>
        </div>
      ))}

      {/* ── Runtime Bridge ────────────────────────────────────── */}
      <div className="bsgo-section-rule">
        <span className="bsgo-section-label">BRIDGE</span>
      </div>

      {bridgeInds.map((ind) => (
        <div key={ind.id} className="bsgo-row">
          <span className="bsgo-label bsgo-label--sub">
            {ind.id === "latency" ? "LAT" : ind.label}
          </span>
          <span
            className={
              ind.id === "sync-state"
                ? syncClass(syncState)
                : `bsgo-value${ind.truthState === "missing" ? " bsgo-value--missing" : ""}`
            }
          >
            {ind.value}
            {ind.missingReason && (
              <span className="bsgo-missing-reason">
                {" "}
                — {ind.missingReason}
              </span>
            )}
          </span>
        </div>
      ))}

      {/* STOP — guarded control */}
      {stopInd && (
        <div className="bsgo-row bsgo-row--stop">
          <span className="bsgo-label bsgo-label--sub">STOP</span>
          {syncState === "missing" ? (
            <span className="bsgo-value bsgo-value--missing">
              MISSING
              <span className="bsgo-missing-reason"> — WALL not connected</span>
            </span>
          ) : stopResult === "sent" ? (
            <span className="bsgo-value bsgo-value--warn">SENT</span>
          ) : stopResult === "stopped" ? (
            <span className="bsgo-value bsgo-value--live">STOPPED</span>
          ) : stopResult === "failed" ? (
            <span className="bsgo-value bsgo-value--error">FAILED</span>
          ) : wallCanStop ? (
            <button
              className={`bsgo-stop-ctl${stopArmed ? " bsgo-stop-ctl--armed" : ""}`}
              onClick={handleStopClick}
              title={
                stopArmed
                  ? "Click again to confirm route stop"
                  : "Click to arm route stop"
              }
            >
              {stopArmed ? "CONFIRM ▪" : "[ STOP ]"}
            </button>
          ) : (
            <span className="bsgo-value bsgo-value--missing">
              UNAVAIL
              <span className="bsgo-missing-reason"> — no active route</span>
            </span>
          )}
        </div>
      )}

      {/* Screensnap status — temporary, clears after 3s */}
      {snapStatus && (
        <div
          className={`bsgo-snap-row${snapStatus.ok ? " bsgo-snap-row--ok" : " bsgo-snap-row--fail"}`}
        >
          {snapStatus.ok ? `SNAP SAVED` : `SNAP FAILED — ${snapStatus.reason}`}
        </div>
      )}
    </div>
  );
}
