import { useState, useEffect, useRef, forwardRef } from "react";
import type { PlaylistRecord, TrackPlaybackIssue } from "../data/playProjectTypes";
import type { Track } from "../data/trackTypes";
import type { TrackSlot, TrackLock } from "../data/playlistTypes";
import type { PlaybackStatus } from "../data/playbackTypes";
import type { NowNextQueueState } from "../logic/nowNextQueue";
import type { ScheduleBlock, ResolvedSchedule } from "../data/scheduleTypes";
import type { SmartGridComposition } from "../data/smartGridTypes";
import type { PlayColorTheme } from "../logic/colorLab";
import { DEFAULT_PLAY_COLOR_THEME } from "../logic/colorLab";
import {
  BroadcastSecondaryLayer,
  type BroadcastSecondaryMode,
} from "./BroadcastSecondaryLayer";
import { BroadcastGridLayer } from "./BroadcastGridLayer";
import {
  resolveBroadcastRouteUrl,
  wosCanvasUrl,
  type BroadcastRouteStatus,
} from "../logic/broadcastRouteSource";
import { TypedTrackIndexOverlay } from "./TypedTrackIndexOverlay";
import { BroadcastMicrographicsGrid } from "./BroadcastMicrographicsGrid";
import { BroadcastSignalStrip } from "./BroadcastSignalStrip";
import { BroadcastRouteCameraInstrumentation, type CamPovModeId } from "./BroadcastRouteCameraInstrumentation";
import { BroadcastSmartGridOverlay } from "./BroadcastSmartGridOverlay";
import type { SyncState, StopResult } from "../runtime/broadcastIndicatorRegistry";
import { requestSnapViaWall, type SnapResult } from "../runtime/broadcastScreensnap";

// 0625G: BroadcastViewMode (operate/show) removed — TAB is the only visibility toggle.

type WallLocation = { city: string; region: string; lat: number | null; lng: number | null };

function WallLocationTag({ city, region, lat, lng }: WallLocation) {
  const label = city
    ? city + (region && region !== "—" ? ", " + region : "")
    : region && region !== "—"
    ? region
    : lat != null
    ? lat.toFixed(3) + ", " + (lng ?? 0).toFixed(3)
    : null;
  if (!label) return null;
  return (
    <div className="play-map-loc" aria-hidden="true">
      <span className="play-map-loc__cap">near</span>
      <span className="play-map-loc__label">{label}</span>
    </div>
  );
}

// ─── PROTECTED SURFACES REGISTRY ──────────────────────────────────────────────
// Do not remove, hide, or silently omit these during Broadcast HUD cleanup.
// Each entry must either open or carry an explicit reason it cannot.
//
// Vehicle / Camera controls: provided by WOS #wos-nav (traversalControlDeck).
//   WOS nav is kept visible in embed mode so these controls remain accessible.
//   PLAY has no separate vehicle/camera control layer.
//
// Route controls: wired via launchRoute() / routeStatus — live.
// ──────────────────────────────────────────────────────────────────────────────

type ProtectedSurfaceStatus = "live" | "missing-route";

type ProtectedSurface = {
  id: string;
  label: string;
  status: ProtectedSurfaceStatus;
  href?: string;
  reason?: string; // required when status = "missing-route"
};

type Props = {
  playlist: PlaylistRecord;
  allPlaylists: PlaylistRecord[];
  slots: TrackSlot[];
  locks: TrackLock[];
  tracksById: Map<string, Track>;
  libraryTracks: Track[];
  currentSlotIdx: number | null;
  hoveredSlotIndex: number | null;
  playbackStatus: PlaybackStatus;
  currentTrack: Track | undefined;
  autoplayNext: boolean;
  currentTimeSeconds: number;
  durationSeconds: number;
  trackPlaybackIssues?: Record<string, TrackPlaybackIssue>;
  errorMessage?: string;
  onPlay: () => void;
  onPause: () => void;
  onStop: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onAutoplayToggle: () => void;
  onSeek: (t: number) => void;
  onNodeHoverChange: (idx: number | null) => void;
  onExitHud: () => void;
  secondaryMode: BroadcastSecondaryMode;
  secondaryModeKey: string;
  secondaryTimerDurationMs: number;
  gridVisible: boolean;
  queue: NowNextQueueState | null;
  scheduleLater?: ScheduleBlock[];
  gridComposition?: SmartGridComposition;
  resolvedSchedule?: ResolvedSchedule;
};

function getActiveTheme(playlist: PlaylistRecord): PlayColorTheme {
  if (playlist.colorThemes && playlist.colorThemes.length > 0) {
    return (
      playlist.colorThemes.find((t) => t.id === playlist.activeColorThemeId) ??
      playlist.colorThemes[0]
    );
  }
  return playlist.colorTheme ?? DEFAULT_PLAY_COLOR_THEME;
}

function themeVars(theme: PlayColorTheme): React.CSSProperties {
  return {
    "--play-map-dominant": theme.dominant,
    "--play-map-accent":   theme.accent,
    "--play-map-glow":     theme.glow,
    "--play-map-shadow":   theme.shadow,
    "--play-map-muted":    theme.muted,
    "--play-sky-top":      theme.skyTop,
    "--play-sky-mid":      theme.skyMid,
    "--play-sky-haze":     theme.haze,
  } as React.CSSProperties;
}


// Searched: wall/main.js, wall/systems/world/subwayTopologyRuntime.js — subway is a WOS layer, no standalone URL.
// Searched: entire wall-of-sound repo — no Website or Kinetic Fish standalone route file found.
// Studio/Canvas: wired to wosCanvasUrl() → playlist.broadcastIdentity.mapChannelUrl or localhost:5500.
function buildProtectedSurfaces(studioHref: string): ProtectedSurface[] {
  return [
    {
      id: "studio-canvas",
      label: "Studio / Canvas",
      status: "live",
      href: studioHref,
    },
    {
      id: "subway-map",
      label: "Subway Map",
      status: "missing-route",
      reason: "Subway is a WOS map layer (subwayTopologyRuntime.js), not a standalone URL. Access via WOS Studio.",
    },
    {
      id: "website",
      label: "Website",
      status: "missing-route",
      reason: "No website route found in wall-of-sound repo. TODO: wire project site URL.",
    },
    {
      id: "kinetic-fish",
      label: "Kinetic Fish",
      status: "missing-route",
      reason: "No Kinetic Fish route found in wall-of-sound repo. TODO: identify surface path.",
    },
  ];
}

// Route iframe — fills the map stage; ref forwarded so parent can postMessage to WOS.
const RouteIframe = forwardRef<HTMLIFrameElement, { url: string }>(function RouteIframe(
  { url },
  ref,
) {
  return (
    <iframe
      ref={ref}
      className="hud-route-iframe"
      src={url}
      title="WOS Routes"
      loading="eager"
      allow="fullscreen"
    />
  );
});

// Error / launch card rendered when route is idle or failed
function RouteCard({
  status,
  resolution,
  onLaunch,
}: {
  status: BroadcastRouteStatus;
  resolution: ReturnType<typeof resolveBroadcastRouteUrl>;
  onLaunch: () => void;
}) {
  if (status === "idle") {
    return (
      <div className="hud-route-card">
        <span className="hud-route-card__title">Routes not launched</span>
        {resolution.url ? (
          <>
            <span className="hud-route-card__url">{resolution.url}</span>
            <button className="hud-route-card__btn" onClick={onLaunch}>
              Launch Routes
            </button>
          </>
        ) : (
          <>
            <span className="hud-route-card__msg">
              No route/map source configured.
            </span>
            <span className="hud-route-card__hint">
              Set a map channel URL in playlist Identity, or start WOS local server.
            </span>
          </>
        )}
      </div>
    );
  }
  if (status === "error") {
    return (
      <div className="hud-route-card hud-route-card--error">
        <span className="hud-route-card__title">Routes unavailable</span>
        <span className="hud-route-card__msg">{resolution.error ?? "Source failed to load."}</span>
        <button className="hud-route-card__btn" onClick={onLaunch}>
          Retry
        </button>
      </div>
    );
  }
  return null;
}

export function BroadcastHudShell({
  playlist, allPlaylists, slots, tracksById,
  currentSlotIdx,
  currentTrack, currentTimeSeconds, durationSeconds,
  playbackStatus, onPlay, onPause,
  secondaryMode, secondaryModeKey, secondaryTimerDurationMs, gridVisible, queue,
  scheduleLater, gridComposition, resolvedSchedule,
}: Props) {
  const theme = getActiveTheme(playlist);
  const accent = playlist.accentColor ?? "var(--accent)";

  const [routeStatus, setRouteStatus] = useState<BroadcastRouteStatus>("idle");
  const [activeRouteUrl, setActiveRouteUrl] = useState<string | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [activeCamMode, setActiveCamMode] = useState<CamPovModeId>("ext_follow");
  const [skyRenderer, setSkyRenderer] = useState<"sky-bridge" | "three-sky" | "unavailable">("sky-bridge");
  const [skyRendererBlockReason, setSkyRendererBlockReason] = useState<string | undefined>(undefined);
  // 0625I — runtime bridge state
  const [syncState, setSyncState] = useState<SyncState>("missing");
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [wallCanStop, setWallCanStop] = useState(false);
  const [stopResult, setStopResult] = useState<StopResult>("idle");
  const [snapStatus, setSnapStatus] = useState<SnapResult | null>(null);
  const [wallTransport, setWallTransport] = useState<string>("flight");
  const [wallLocation, setWallLocation] = useState<WallLocation | null>(null);
  const snapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHeartbeatAtRef = useRef<number | null>(null);
  const pendingPingsRef = useRef<Map<string, number>>(new Map());
  const wosIframeRef = useRef<HTMLIFrameElement>(null);

  const resolution = resolveBroadcastRouteUrl(playlist);
  const prevTrackIdRef = useRef<string | undefined>(undefined);
  const [trackChangedKey, setTrackChangedKey] = useState(0);

  // TAB toggles control visibility (covers TopBar via position:fixed on shell).
  // S triggers screensnap. capture:true ensures both fire even when iframe has focus.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t?.tagName === "INPUT" || t?.tagName === "TEXTAREA" || t?.isContentEditable) return;
      if (e.key === "Tab") {
        e.preventDefault();
        setControlsVisible((v) => {
          const next = !v;
          wosIframeRef.current?.contentWindow?.postMessage(
            { type: "play:controls-visibility", visible: next }, "*",
          );
          // 0625P — arm 2s ack timeout; cleared on wall:controls-visibility-ack receipt
          if (ackTimerRef.current) clearTimeout(ackTimerRef.current);
          ackTimerRef.current = setTimeout(() => {
            console.warn("[PLAY clean capture] WALL visibility ack missing — iframe may not be loaded");
          }, 2000);
          return next;
        });
      }
      if (e.key === "s" || e.key === "S") {
        if (e.ctrlKey || e.metaKey) return; // don't intercept Ctrl/Cmd+S
        requestSnapViaWall(wosIframeRef.current, currentSlotIdx, (result) => {
          setSnapStatus(result);
          if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
          snapTimerRef.current = setTimeout(() => setSnapStatus(null), 3000);
        });
      }
    }
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSlotIdx]);

  // 0625I — unified WALL → PLAY message handler.
  // Handles: wall:sky-status, wall:heartbeat, wall:pong, wall:route-stop-result.
  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!e.data) return;
      switch (e.data.type) {
        case "wall:sky-status": {
          const r = e.data.renderer;
          if (r === "three-sky" || r === "sky-bridge" || r === "unavailable") {
            setSkyRenderer(r);
            setSkyRendererBlockReason(e.data.blockReason ?? undefined);
          }
          break;
        }
        case "wall:heartbeat": {
          const p = e.data.payload;
          if (!p) break;
          lastHeartbeatAtRef.current = Date.now();
          setSyncState("locked");
          if (typeof p.canStop === "boolean") setWallCanStop(p.canStop);
          if (p.skyRenderer === "three-sky") setSkyRenderer("three-sky");
          if (typeof p.transport === "string") setWallTransport(p.transport);
          break;
        }
        case "wall:controls-visibility-ack": {
          const p = e.data.payload;
          if (!p) break;
          if (ackTimerRef.current) { clearTimeout(ackTimerRef.current); ackTimerRef.current = null; }
          console.log(`[PLAY clean capture] WALL ack controls=${p.visible} mapboxControlsFound=${p.mapboxControlsFound} wosNavFound=${p.wosNavFound} bodyClassApplied=${p.bodyClassApplied}`);
          break;
        }
        case "wall:pong": {
          const p = e.data.payload;
          if (!p || typeof p.pingId !== "string" || typeof p.sentAt !== "number") break;
          const sentAt = pendingPingsRef.current.get(p.pingId);
          if (sentAt !== undefined) {
            const rtt = performance.now() - sentAt;
            setLatencyMs(Math.round(rtt * 10) / 10);
            pendingPingsRef.current.delete(p.pingId);
          }
          break;
        }
        case "wall:location": {
          const p = e.data.payload;
          if (p && (p.city || p.region)) {
            setWallLocation({
              city:   p.city   ?? "",
              region: p.region ?? "",
              lat:    typeof p.latitude  === "number" ? p.latitude  : null,
              lng:    typeof p.longitude === "number" ? p.longitude : null,
            });
          }
          break;
        }
        case "wall:route-stop-result": {
          const p = e.data.payload;
          if (!p) break;
          setStopResult(p.ok ? "stopped" : "failed");
          break;
        }
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // 0625O — sync body.broadcast-clean-capture class with controlsVisible state.
  // Must be a useEffect, not a side effect inside setState updater, to avoid Strict Mode double-fire.
  useEffect(() => {
    document.body.classList.toggle("broadcast-clean-capture", !controlsVisible);
    return () => document.body.classList.remove("broadcast-clean-capture");
  }, [controlsVisible]);

  // Sync state decay — re-evaluates every 500ms so DEGRADED/LOST appear when heartbeats stop.
  useEffect(() => {
    function computeSyncState(lastAt: number | null): SyncState {
      if (lastAt === null) return "missing";
      const age = Date.now() - lastAt;
      if (age <= 2500) return "locked";
      if (age <= 7500) return "degraded";
      return "lost";
    }
    const id = setInterval(() => {
      setSyncState(computeSyncState(lastHeartbeatAtRef.current));
    }, 500);
    return () => clearInterval(id);
  }, []);

  // Ping sender — sends play:ping to WOS iframe every 3s; WALL replies wall:pong for RTT.
  useEffect(() => {
    const id = setInterval(() => {
      const iframe = wosIframeRef.current;
      if (!iframe?.contentWindow) return;
      const pingId = Math.random().toString(36).slice(2);
      const sentAt = performance.now();
      pendingPingsRef.current.set(pingId, sentAt);
      iframe.contentWindow.postMessage({ type: "play:ping", payload: { pingId, sentAt } }, "*");
      setTimeout(() => pendingPingsRef.current.delete(pingId), 10000);
    }, 3000);
    return () => clearInterval(id);
  }, []);

  // Detect track change for typed overlay
  useEffect(() => {
    const id = currentTrack?.trackId;
    if (id !== prevTrackIdRef.current) {
      prevTrackIdRef.current = id;
      setTrackChangedKey((k) => k + 1);
    }
  }, [currentTrack?.trackId]);

  // 0628A — broadcast composition diagnostic: register window.PLAY.BroadcastComposition.getNowPlayingA3Report
  useEffect(() => {
    function getNowPlayingA3Report() {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const nowPlaying = document.querySelector<HTMLElement>('.bti-overlay');
      const topBar     = document.querySelector<HTMLElement>('.top-bar');
      const wallFrame  = document.querySelector<HTMLElement>('.hud-route-iframe');
      const rightCluster = document.querySelector<HTMLElement>('.hud-right-cluster');

      function elInfo(el: HTMLElement | null) {
        if (!el) return { exists: false, visible: false, rect: null };
        const s = window.getComputedStyle(el);
        const vis = s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0.01;
        const r = el.getBoundingClientRect();
        return {
          exists: true,
          visible: vis,
          rect: vis ? { top: Math.round(r.top), left: Math.round(r.left),
                        right: Math.round(r.right), bottom: Math.round(r.bottom),
                        width: Math.round(r.width), height: Math.round(r.height) } : null,
        };
      }

      function rectsOverlap(a: DOMRect | null | {top:number;left:number;right:number;bottom:number},
                            b: DOMRect | null | {top:number;left:number;right:number;bottom:number}) {
        if (!a || !b) return false;
        return !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
      }

      const npInfo = elInfo(nowPlaying);
      const tbInfo = elInfo(topBar);
      const wfInfo = elInfo(wallFrame);

      const earthCenter = { top: Math.round(vh * 0.30), left: Math.round(vw * 0.30),
                            right: Math.round(vw * 0.70), bottom: Math.round(vh * 0.70) };

      // A3 zone: right 1/3, top 1/3 of viewport
      const a3Zone = { top: 0, left: Math.round(vw * 0.67), right: vw, bottom: Math.round(vh * 0.33) };
      const inA3 = npInfo.rect ? rectsOverlap(npInfo.rect, a3Zone) : false;
      const outsideViewport = npInfo.rect
        ? (npInfo.rect.right > vw || npInfo.rect.bottom > vh || npInfo.rect.left < 0 || npInfo.rect.top < 0)
        : false;

      const broadcastActive = document.body.classList.contains('broadcast-clean-capture');

      const blockers: string[] = [];
      if (npInfo.visible && rectsOverlap(npInfo.rect, tbInfo.rect)) blockers.push('now-playing-overlaps-top-bar');
      if (npInfo.visible && rectsOverlap(npInfo.rect, earthCenter)) blockers.push('now-playing-overlaps-earth-center');
      if (npInfo.visible && outsideViewport) blockers.push('now-playing-outside-viewport');

      return {
        timestamp: performance.now(),
        viewport: { width: vw, height: vh, aspectRatio: vh > 0 ? Math.round((vw / vh) * 100) / 100 : 0 },
        nowPlaying: {
          exists: npInfo.exists,
          visible: npInfo.visible,
          rect: npInfo.rect,
          zone: inA3 ? 'A3' : (npInfo.rect && npInfo.rect.left > vw * 0.5 ? 'B3/C3' : 'B1/C1'),
          textReadable: npInfo.visible,
          pointerEvents: nowPlaying ? window.getComputedStyle(nowPlaying).pointerEvents : 'none',
        },
        topBar: tbInfo,
        wallFrame: wfInfo,
        rightCluster: elInfo(rightCluster),
        overlaps: {
          nowPlayingOverTopBar:      rectsOverlap(npInfo.rect, tbInfo.rect),
          nowPlayingOverTransport:   false, // transport is WALL-side
          nowPlayingOverEarthCenter: rectsOverlap(npInfo.rect, earthCenter),
          nowPlayingOutsideViewport: outsideViewport,
        },
        mode: {
          broadcastActive,
          orbitalEarthActive: false, // PLAY frame has no direct knowledge of WALL orbital state
          wallEmbedActive: !!wallFrame,
        },
        passed: blockers.length === 0,
        blockers,
      };
    }

    const w = window as unknown as Record<string, unknown>;
    const play = (w.PLAY || (w.PLAY = {})) as Record<string, unknown>;
    const bc = (play.BroadcastComposition || (play.BroadcastComposition = {})) as Record<string, unknown>;
    bc.getNowPlayingA3Report = getNowPlayingA3Report;
    return () => { delete bc.getNowPlayingA3Report; };
  }, []);

  // Auto-launch if a URL is resolvable on mount
  useEffect(() => {
    if (routeStatus === "idle" && resolution.url) {
      launchRoute();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function launchRoute() {
    if (!resolution.url) {
      setRouteStatus("error");
      return;
    }
    setRouteStatus("launching");
    setActiveRouteUrl(resolution.url);
    // Mark live after a short tick (iframe begins loading)
    setTimeout(() => setRouteStatus("live"), 400);
  }

  // Route stop bridge — two-step confirm happens in SmartGridOverlay; shell sends the message.
  function handleRouteStop() {
    const requestId = Math.random().toString(36).slice(2);
    setStopResult("sent");
    wosIframeRef.current?.contentWindow?.postMessage(
      { type: "play:route-stop", payload: { armed: true, requestId } },
      "*",
    );
  }

  // POV bridge — sends postMessage to WOS iframe; WOS listener in wall/index.html
  // calls SBE.CameraShotSelectorUI.setShot(mode).
  function handleCameraMode(mode: CamPovModeId) {
    setActiveCamMode(mode);
    wosIframeRef.current?.contentWindow?.postMessage(
      { type: "play:set-camera-mode", mode },
      "*",
    );
  }

  const assignedSlots = slots.filter((s) => s.assignedTrackId);
  const totalDur = assignedSlots.reduce(
    (sum, s) => sum + (tracksById.get(s.assignedTrackId!)?.durationSeconds ?? 0), 0,
  );
  const count = assignedSlots.length;

  const bgSrc = playlist.backgroundImage?.src;
  const coverSrc = playlist.coverImage?.src;

  const shellClass = [
    "hud-shell hud-shell-stage",
    controlsVisible ? "hud-shell--controls-visible" : "hud-shell--controls-hidden",
  ].join(" ");

  return (
    <div className={shellClass} style={themeVars(theme)}>
      {/* Background (non-map playlists) */}
      {bgSrc ? (
        <div className="hud-bg" style={{ backgroundImage: `url(${bgSrc})` }} />
      ) : coverSrc ? (
        <div className="hud-bg hud-bg-cover-blur" style={{ backgroundImage: `url(${coverSrc})` }} />
      ) : null}

      {/* Route / map stage — always present */}
      <div className="hud-route-stage">
        {routeStatus === "live" && activeRouteUrl ? (
          <RouteIframe ref={wosIframeRef} url={activeRouteUrl} />
        ) : (
          <RouteCard
            status={routeStatus}
            resolution={resolution}
            onLaunch={launchRoute}
          />
        )}
        {/* Current-location label — received from WALL via wall:location postMessage */}
        {wallLocation && <WallLocationTag {...wallLocation} />}
      </div>

      {/* Subtle atmosphere wash — pointer-events: none */}
      <div className="hud-atmosphere-wash" />

      {/* Typed track index reveal — appears on track change, pointer-transparent */}
      <TypedTrackIndexOverlay
        key={trackChangedKey}
        trackIndex={currentSlotIdx}
        totalTracks={count}
        title={currentTrack?.title}
        artist={currentTrack?.artist}
        playlistTitle={playlist.title}
      />

      {/* Smart Grid overlay — top-left audio/system cluster (0625H/I) */}
      <BroadcastSmartGridOverlay
        controlsVisible={controlsVisible}
        playbackStatus={playbackStatus}
        currentTrack={currentTrack}
        onPlay={onPlay}
        onPause={onPause}
        wosUrl={activeRouteUrl}
        syncState={syncState}
        latencyMs={latencyMs}
        wallCanStop={wallCanStop}
        stopResult={stopResult}
        onRouteStop={handleRouteStop}
        snapStatus={snapStatus}
      />

      {/* Signal strip — clock/weather, bottom-left, tied to controlsVisible */}
      <BroadcastSignalStrip controlsVisible={controlsVisible} />

      {/* Top-right HUD column — shared container ensures left-edge alignment */}
      <div className="hud-right-cluster">
        <BroadcastMicrographicsGrid
          routeStatus={routeStatus}
          trackIndex={currentSlotIdx}
          totalTracks={count}
          source={resolution.source}
          playlistTitle={playlist.title}
        />
        <BroadcastRouteCameraInstrumentation
          controlsVisible={controlsVisible}
          hourOfDay={new Date().getHours()}
          activeCamMode={activeCamMode}
          onCameraMode={handleCameraMode}
          skyRenderer={skyRenderer}
          skyRendererBlockReason={skyRendererBlockReason}
          transport={wallTransport}
          syncState={syncState}
        />
      </div>

      {/* Main body (grid / secondary layers) */}
      <div className="hud-body">
        <div className="hud-atmosphere-zone" />
        <BroadcastGridLayer
          visible={gridVisible}
          rows={4} columns={6}
          composition={gridComposition}
          resolvedSchedule={resolvedSchedule}
          activePlaylist={playlist}
        />
        {queue && (
          <BroadcastSecondaryLayer
            mode={secondaryMode} modeKey={secondaryModeKey}
            playlist={playlist} allPlaylists={allPlaylists}
            queue={queue} currentTrack={currentTrack}
            currentTimeSeconds={currentTimeSeconds} durationSeconds={durationSeconds}
            accent={accent} totalDur={totalDur} trackCount={count}
            timerDurationMs={secondaryTimerDurationMs} scheduleLater={scheduleLater}
          />
        )}
      </div>

      {/* Operator toolbar — TAB is the only hide/show toggle (0625G: removed Operate/Show/Snapshot) */}
      {/* 0625H: music button moved to BroadcastSmartGridOverlay (top-left audio cluster) */}
      <div className="hud-operator-bar">
        {/* Route status pill */}
        {routeStatus === "live" && (
          <span className="hud-route-status hud-route-status--live">Routes: Live</span>
        )}
        {routeStatus === "launching" && (
          <span className="hud-route-status">Launching…</span>
        )}
        {routeStatus === "idle" && !resolution.url && (
          <span className="hud-route-status hud-route-status--missing">No route source</span>
        )}
        {/* Protected surface access cluster — driven by PROTECTED_SURFACES registry */}
        <div className="hud-access-cluster">
          {buildProtectedSurfaces(wosCanvasUrl(playlist)).map((surface) =>
            surface.status === "live" && surface.href ? (
              <a
                key={surface.id}
                className="hud-access-item hud-access-item--live"
                href={surface.href}
                target="_blank"
                rel="noreferrer"
                title={`Open ${surface.label}`}
              >
                {surface.label} ↗
              </a>
            ) : (
              <span
                key={surface.id}
                className="hud-access-item hud-access-item--missing"
                title={surface.reason ?? `${surface.label}: no route`}
              >
                {surface.label} (no route)
              </span>
            )
          )}
        </div>
        {theme.name && theme.name !== "Default" && (
          <span className="hud-theme-label">{theme.name}</span>
        )}
      </div>

      {/* TAB hint — visible only when controls are hidden */}
      {!controlsVisible && (
        <div className="hud-tab-hint">TAB</div>
      )}
    </div>
  );
}
