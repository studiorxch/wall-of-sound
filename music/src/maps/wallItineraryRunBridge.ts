// ── wallItineraryRunBridge ────────────────────────────────────────────────────
// 0730D_MAPS_Itinerary_Runner_and_Active_Orb_Traversal
//
// Cross-context command/snapshot transport client — deliberately NOT a
// wrapper around a same-page `window.SBE.ItineraryRunAuthority` global, since
// that global never exists in MUSIC's page. The Itinerary Runner executes
// ONLY on canonical LIVE MAP (wall/index.html), which has the real map,
// HeroVehicleRuntime, and OrbProfileRenderer this build depends on; MUSIC has
// none of that. This bridge writes commands to `wos:itineraryRun:command`
// (a shared-origin localStorage key, reached via /wall-app — same mechanism
// every other MAPS bridge already uses, just command/snapshot shaped instead
// of same-page-authority shaped) and reads the snapshot LIVE MAP's own
// ItineraryRunAuthority publishes back to `wos:itineraryRun:snapshot`.

import type { ItineraryRunPayload, ItineraryRunSnapshot } from "../data/itineraryRunTypes";
import { IDLE_RUN_SNAPSHOT } from "../data/itineraryRunTypes";

const STORAGE_COMMAND_KEY = "wos:itineraryRun:command";
const STORAGE_SNAPSHOT_KEY = "wos:itineraryRun:snapshot";
const STORAGE_OWNER_KEY = "wos:itineraryRun:owner";

// 0805A — launch readiness handshake keys. See openOrFocusLiveMap().
const STORAGE_LIVEMAP_REQUEST_KEY = "wos:liveMap:readyRequest";
const STORAGE_LIVEMAP_READY_KEY = "wos:liveMap:ready";
// Exported (0805F) so other same-runtime launchers — e.g. wallRacetrackBridge.ts's
// openOrFocusRacetrack() — target the exact same named browser window rather
// than risking a second, independently-spelled name string. Named-target
// window.open reuse is a browser-level guarantee, not JS-reference based, so
// two independent callers using this same constant correctly reuse/focus one
// physical tab even though they hold separate `Window` refs.
export const LIVE_MAP_WINDOW_NAME = "studiorich-live-map";

type Command =
  | {
      type: "start";
      payload: ItineraryRunPayload;
      speedMultiplier?: number;
      heroAltitudeMeters?: number;
      heroVisualLiftPixels?: number;
      initialFollowEnabled?: boolean;
      commandId: string;
      issuedAt: string;
    }
  | { type: "pause" | "resume" | "stop" | "restart" | "locate"; commandId: string; issuedAt: string }
  | { type: "setPlaybackRate"; rate: number; commandId: string; issuedAt: string }
  | { type: "setHeroAltitude"; meters: number; commandId: string; issuedAt: string }
  | { type: "setHeroVisualLift"; pixels: number; commandId: string; issuedAt: string }
  | { type: "setFollowHero"; enabled: boolean; commandId: string; issuedAt: string };

function genId(): string {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
}

function sendCommand(cmd: Command): void {
  try {
    localStorage.setItem(STORAGE_COMMAND_KEY, JSON.stringify(cmd));
  } catch {
    /* best-effort — cross-context transport, nothing local to fall back to */
  }
}

export function start(
  payload: ItineraryRunPayload,
  speedMultiplier?: number,
  heroAltitudeMeters?: number,
  heroVisualLiftPixels?: number,
  initialFollowEnabled?: boolean,
): void {
  sendCommand({
    type: "start",
    payload,
    speedMultiplier,
    heroAltitudeMeters,
    heroVisualLiftPixels,
    initialFollowEnabled,
    commandId: genId(),
    issuedAt: new Date().toISOString(),
  });
}

export function pause(): void {
  sendCommand({ type: "pause", commandId: genId(), issuedAt: new Date().toISOString() });
}

export function resume(): void {
  sendCommand({ type: "resume", commandId: genId(), issuedAt: new Date().toISOString() });
}

export function stop(): void {
  sendCommand({ type: "stop", commandId: genId(), issuedAt: new Date().toISOString() });
}

export function restart(): void {
  sendCommand({ type: "restart", commandId: genId(), issuedAt: new Date().toISOString() });
}

// Live-adjust while Running or Paused. Settles elapsed at the OLD rate
// before applying the new one (handled wall-side) — position/accumulated
// time are preserved, only subsequent advancement changes.
export function setPlaybackRate(rate: number): void {
  sendCommand({ type: "setPlaybackRate", rate, commandId: genId(), issuedAt: new Date().toISOString() });
}

// Live-adjust while Running or Paused. Presentation-only — never touches
// route/distance/duration/progress/heading.
export function setHeroAltitude(meters: number): void {
  sendCommand({ type: "setHeroAltitude", meters, commandId: genId(), issuedAt: new Date().toISOString() });
}

// Live-adjust while Running or Paused. A SECOND, independent presentation
// offset from setHeroAltitude (0805A diagnostic bridge) — never touches
// route geometry/progress/duration/distance/heading/actor coordinates.
export function setHeroVisualLift(pixels: number): void {
  sendCommand({ type: "setHeroVisualLift", pixels, commandId: genId(), issuedAt: new Date().toISOString() });
}

// One-time camera jump to the run's current position. Not continuous
// follow — a single discrete flyTo, no stored mode.
export function locateHero(): void {
  sendCommand({ type: "locate", commandId: genId(), issuedAt: new Date().toISOString() });
}

// Explicit continuous-camera-follow toggle. While enabled, canonical LIVE
// MAP re-centers on the actor every tick (zoom/pitch/bearing untouched);
// real manual map interaction there disables it, which surfaces back here
// via the next published snapshot's `followHeroEnabled` field.
export function setFollowHero(enabled: boolean): void {
  sendCommand({ type: "setFollowHero", enabled, commandId: genId(), issuedAt: new Date().toISOString() });
}

// Reads the last snapshot canonical LIVE MAP published. If no LIVE MAP tab
// has ever run anything (or the key is missing/corrupt), returns the real
// idle default — never a fabricated "running" state.
export function getSnapshot(): ItineraryRunSnapshot {
  try {
    const raw = localStorage.getItem(STORAGE_SNAPSHOT_KEY);
    if (raw) return JSON.parse(raw) as ItineraryRunSnapshot;
  } catch {
    /* fall through to idle default */
  }
  return IDLE_RUN_SNAPSHOT;
}

// Real, honest signal for "is a run currently owned by some LIVE MAP tab" —
// checked via the same heartbeat-staleness window the wall/-side authority
// uses, so MUSIC's UI doesn't report a run as active when its owning tab has
// actually gone stale (crashed/closed without a clean stop).
export function hasLiveOwner(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_OWNER_KEY);
    if (!raw) return false;
    const lock = JSON.parse(raw) as { heartbeatAt?: number };
    if (!lock.heartbeatAt) return false;
    // Mirrors HEARTBEAT_MS * STALE_MULTIPLIER in itineraryRunAuthority.js
    // (0730E: widened to ~80s so a backgrounded-but-still-owning LIVE MAP tab
    // isn't reported stale just because its own heartbeat timer is throttled
    // by the same hidden-tab clamping this tolerance exists to survive).
    return Date.now() - lock.heartbeatAt <= 2000 * 40;
  } catch {
    return false;
  }
}

// Fires whenever the snapshot key changes in ANOTHER tab (i.e. canonical
// LIVE MAP publishing an update) — 'storage' events never fire in the same
// tab that made the write, which is exactly the cross-context signal we want.
export function subscribe(fn: () => void): () => void {
  function onStorage(e: StorageEvent) {
    if (e.key === STORAGE_SNAPSHOT_KEY || e.key === STORAGE_OWNER_KEY) fn();
  }
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

export type LiveMapReadyResult = { ok: true } | { ok: false; reason: "popup_blocked" | "timeout" };

// Held for the lifetime of this MUSIC page — window.open with a NAMED target
// reuses/focuses the same real browser window on repeated calls even without
// this reference (named-target semantics are browser-level, not JS-reference
// based), but keeping it lets a still-open window be focused without
// re-navigating it (avoiding an unnecessary reload of an already-running
// LIVE MAP session).
let _liveMapWindowRef: Window | null = null;

// Opens or focuses ONE reusable canonical LIVE MAP window, then waits for a
// genuine readiness response tied to THIS specific request — never a bare
// flag. A crashed wall/ tab can leave `wos:liveMap:ready` behind with no
// `beforeunload` ever firing to clear it; treating that stale value as proof
// of current readiness would be wrong. Each call issues a fresh requestId to
// `wos:liveMap:readyRequest` and only accepts a `wos:liveMap:ready` response
// whose requestId matches — a leftover/stale response is ignored, not
// treated as readiness.
export function openOrFocusLiveMap(timeoutMs = 15000): Promise<LiveMapReadyResult> {
  return new Promise((resolve) => {
    if (_liveMapWindowRef && !_liveMapWindowRef.closed) {
      _liveMapWindowRef.focus();
    } else {
      try {
        _liveMapWindowRef = window.open("/wall-app/", LIVE_MAP_WINDOW_NAME);
      } catch {
        _liveMapWindowRef = null;
      }
      if (!_liveMapWindowRef) {
        resolve({ ok: false, reason: "popup_blocked" });
        return;
      }
    }

    const requestId = genId();
    const deadline = Date.now() + timeoutMs;
    let settled = false;
    let pollTimer: number | undefined;

    function cleanup() {
      window.removeEventListener("storage", onStorage);
      if (pollTimer != null) window.clearTimeout(pollTimer);
    }
    function acceptIfMatching(): boolean {
      try {
        const raw = localStorage.getItem(STORAGE_LIVEMAP_READY_KEY);
        if (!raw) return false;
        const resp = JSON.parse(raw) as { requestId?: string };
        if (resp.requestId !== requestId) return false; // stale/mismatched — never accepted as proof of readiness
        settled = true;
        cleanup();
        resolve({ ok: true });
        return true;
      } catch {
        return false;
      }
    }
    function onStorage(e: StorageEvent) {
      if (settled || e.key !== STORAGE_LIVEMAP_READY_KEY || !e.newValue) return;
      acceptIfMatching();
    }
    function poll() {
      if (settled) return;
      if (acceptIfMatching()) return;
      if (Date.now() > deadline) {
        settled = true;
        cleanup();
        resolve({ ok: false, reason: "timeout" });
        return;
      }
      pollTimer = window.setTimeout(poll, 200);
    }

    window.addEventListener("storage", onStorage);
    try {
      localStorage.setItem(STORAGE_LIVEMAP_REQUEST_KEY, JSON.stringify({ requestId, issuedAt: new Date().toISOString() }));
    } catch {
      /* best-effort */
    }
    poll(); // also covers the case where a response was already published before this listener attached
  });
}
