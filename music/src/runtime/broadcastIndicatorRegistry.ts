// Broadcast HUD indicator registry.
// Every visible indicator must have a truth state so no value is silently fake.

export type IndicatorTruthState = "live" | "derived" | "static" | "missing";

export type BroadcastIndicator = {
  id: string;
  label: string;
  value: string;
  truthState: IndicatorTruthState;
  source: string;
  missingReason?: string;
  priority: "primary" | "secondary" | "tertiary";
};

export type SyncState = "locked" | "degraded" | "lost" | "missing";
export type StopResult = "idle" | "sent" | "stopped" | "failed";

type AudioIndicatorInput = {
  playbackStatus: "idle" | "playing" | "paused" | "error";
  currentTrackTitle?: string;
  uptimeSeconds: number;
  wosUrl: string | null;
  syncState: SyncState;
  latencyMs: number | null;
  wallCanStop: boolean;
  stopResult: StopResult;
};

function fmtUptime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, "0")).join(":");
}

function resolveSourceFeed(url: string | null): { value: string; truthState: IndicatorTruthState; reason?: string } {
  if (!url) return { value: "MISSING", truthState: "missing", reason: "no WOS URL configured" };
  if (url.includes("localhost") || url.includes("127.0.0.1")) return { value: "WOS LOCAL", truthState: "live" };
  return { value: "WOS REMOTE", truthState: "live" };
}

export function buildAudioIndicators(input: AudioIndicatorInput): BroadcastIndicator[] {
  const { playbackStatus, currentTrackTitle, uptimeSeconds, wosUrl, syncState, latencyMs, wallCanStop, stopResult } = input;

  const audioValue =
    playbackStatus === "playing"
      ? "AUDIO LIVE"
      : playbackStatus === "paused"
      ? "PAUSED"
      : currentTrackTitle
      ? "READY"
      : "NO TRACK";

  const txValue = playbackStatus === "playing" ? "TX ACTIVE" : "IDLE";

  const sourceFeed = resolveSourceFeed(wosUrl);

  return [
    {
      id: "audio-state",
      label: "AUDIO",
      value: audioValue,
      truthState: "live",
      source: "PLAY playback engine / playbackStatus",
      priority: "primary",
    },
    {
      id: "tx-state",
      label: "TX",
      value: txValue,
      truthState: "derived",
      source: "derived from playbackStatus",
      priority: "primary",
    },
    {
      id: "source-feed",
      label: "SOURCE",
      value: sourceFeed.value,
      truthState: sourceFeed.truthState,
      source: "iframe URL / wosUrl",
      missingReason: sourceFeed.reason,
      priority: "secondary",
    },
    {
      id: "uptime-play",
      label: "UPTIME",
      value: `PLAY ${fmtUptime(uptimeSeconds)}`,
      truthState: "derived",
      source: "BroadcastHudShell mount timestamp",
      priority: "secondary",
    },
    {
      id: "sync-state",
      label: "SYNC",
      value: syncState === "locked" ? "LOCKED" : syncState === "degraded" ? "DEGRADED" : syncState === "lost" ? "LOST" : "MISSING",
      truthState: syncState === "missing" ? "missing" : "live",
      source: "wall:heartbeat postMessage (1s interval)",
      missingReason: syncState === "missing" ? "no heartbeat received" : undefined,
      priority: "tertiary",
    },
    {
      id: "latency",
      label: "LATENCY",
      value: latencyMs !== null
        ? (latencyMs % 1 === 0 ? `${latencyMs} MS` : `${latencyMs.toFixed(1)} MS`)
        : "MISSING",
      truthState: latencyMs !== null ? "live" : "missing",
      source: "play:ping / wall:pong RTT (3s interval)",
      missingReason: latencyMs === null ? "no pong received" : undefined,
      priority: "tertiary",
    },
    {
      id: "stop-control",
      label: "STOP",
      value: stopResult === "sent" ? "SENT"
        : stopResult === "stopped" ? "STOPPED"
        : stopResult === "failed" ? "FAILED"
        : wallCanStop ? "AVAILABLE"
        : syncState === "missing" ? "MISSING"
        : "UNAVAILABLE",
      truthState: syncState === "missing" ? "missing" : "live",
      source: "SBE.TraversalControlDeck.stop() via play:route-stop bridge",
      missingReason: syncState === "missing" ? "no bridge — WALL not connected" : undefined,
      priority: "tertiary",
    },
  ];
}
