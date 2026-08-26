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

// TEMPORARY diagnostics (0820_MAPS_Itinerary_Execution_Lifecycle_Delivery) —
// a real capture showed the wall-side boot check repeatedly finding a
// days-old command instead of a fresh one, immediately after a genuine
// LIVE MAP reload that only happens once this file's own start()/
// openOrFocusLiveMap() have both run. That's only possible if sendCommand's
// write is silently failing (its own try/catch swallows any exception with
// no trace) or landing somewhere unreadable back. This makes the write
// itself directly provable: every call records whether the write threw,
// and — critically — immediately reads the key back and confirms the
// commandId round-trips, which a quota/serialization failure would not
// silently pass. Never used by production logic — read-only. Remove once
// the delivery gap is root-caused.
type BridgeDiagEntry = { at: number; op: string; detail: Record<string, unknown> };
const _bridgeDiagLog: BridgeDiagEntry[] = [];
const MAX_BRIDGE_DIAG_LOG = 30;
function _logBridgeDiag(op: string, detail: Record<string, unknown>): void {
  _bridgeDiagLog.push({ at: Date.now(), op, detail });
  if (_bridgeDiagLog.length > MAX_BRIDGE_DIAG_LOG) _bridgeDiagLog.shift();
}

function sendCommand(cmd: Command): void {
  const json = JSON.stringify(cmd);
  let writeThrew: string | null = null;
  let writeThrewName: string | null = null;
  let writeIsQuotaError = false;
  try {
    localStorage.setItem(STORAGE_COMMAND_KEY, json);
  } catch (e) {
    const err = e as Error;
    writeThrew = err?.message || String(e);
    writeThrewName = err?.name || null;
    // 0820_MAPS_Itinerary_Execution_Lifecycle_Storage — a real production
    // capture found the ROOT cause of this whole delivery investigation: an
    // unrelated SUBWAY key (wos:subwayLogicalRollingStock:v1, unbounded
    // growth over 6+ days) exhausted this shared origin's localStorage
    // quota, and THIS exact catch block swallowed the resulting
    // QuotaExceededError with no trace — the itinerary command silently
    // never wrote, while the UI proceeded as if it had. Naming the error
    // explicitly (not just its message, which varies by browser) makes a
    // quota failure here unmistakable on the next capture instead of
    // looking like any other storage error.
    writeIsQuotaError = writeThrewName === "QuotaExceededError" || writeThrewName === "NS_ERROR_DOM_QUOTA_REACHED";
    /* best-effort — cross-context transport, nothing local to fall back to */
  }
  // Read back immediately — proves the write actually landed and round-trips,
  // rather than assuming setItem() not throwing means the value is readable.
  let readBackCommandId: string | null = null;
  let readBackError: string | null = null;
  try {
    const raw = localStorage.getItem(STORAGE_COMMAND_KEY);
    readBackCommandId = raw ? (JSON.parse(raw) as Command).commandId : null;
  } catch (e) {
    readBackError = (e as Error)?.message || String(e);
  }
  _logBridgeDiag("sendCommand", {
    type: cmd.type,
    commandId: cmd.commandId,
    issuedAt: cmd.issuedAt,
    jsonLength: json.length,
    writeThrew,
    writeThrewName,
    writeIsQuotaError,
    readBackCommandId,
    readBackMatches: readBackCommandId === cmd.commandId,
    readBackError,
  });
}

// Read-only — exposes the diagnostic log above for direct console
// inspection: JSON.stringify(wallItineraryRunBridge.getBridgeDiagnostics()).
export function getBridgeDiagnostics(): BridgeDiagEntry[] {
  return _bridgeDiagLog.slice();
}

// TEMPORARY (0820_MAPS_Itinerary_Execution_Lifecycle_Storage) — enumerates
// every key at this origin (localStorage is shared across MUSIC and every
// wall/-side authority reached via /wall-app/, so a quota problem in ANY
// one of them is a quota problem for ALL of them, including this bridge's
// own command write) with size and share-of-total, so a dominant offender
// is directly visible rather than inferred from a single stack trace.
// Byte length uses each character's UTF-16 code-unit count, not exact wire
// bytes for non-ASCII content — sufficient precision for "what's dominant,"
// not billed-storage accounting.
export type StorageUsageEntry = { key: string; length: number; approxBytes: number; percentOfTotal: number };
export function measureLocalStorage(): { totalApproxBytes: number; keyCount: number; entries: StorageUsageEntry[] } {
  const raw: { key: string; length: number }[] = [];
  let total = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key == null) continue;
      const value = localStorage.getItem(key) ?? "";
      const length = key.length + value.length;
      raw.push({ key, length });
      total += length;
    }
  } catch {
    /* best-effort read-only measurement */
  }
  const entries: StorageUsageEntry[] = raw
    .map((r) => ({ key: r.key, length: r.length, approxBytes: r.length, percentOfTotal: total > 0 ? (r.length / total) * 100 : 0 }))
    .sort((a, b) => b.length - a.length);
  return { totalApproxBytes: total, keyCount: entries.length, entries };
}

// TEMPORARY (0820_MAPS_Itinerary_Execution_Lifecycle_Delivery) — a real
// capture showed a console `import()` of this exact file path reporting an
// EMPTY log immediately after a real Run Itinerary click that demonstrably
// caused a LIVE MAP reload — meaning either the click never reaches this
// module's sendCommand() at all, or (far more likely in a Vite dev server
// with HMR) the console's `import()` and the already-mounted React
// component's own import resolved to two DIFFERENT module instances, each
// with its own separate `_bridgeDiagLog` closure. A module re-evaluated by
// Fast Refresh gets a fresh top-level scope — a bare `import()` of the same
// path from the console has no guarantee of resolving to that same
// instance's cached URL (Vite internally rewrites HMR-updated imports with
// a cache-busting query the browser treats as a genuinely different module).
//
// This line runs once per module EVALUATION — every time, including every
// HMR reload — so window.__wallItineraryRunBridge always points at
// whichever instance most recently finished evaluating, which in practice
// is the instance Fast Refresh just wired into the live component tree.
// _moduleInstanceId — random per evaluation — makes two different
// instances directly, unambiguously distinguishable instead of assumed:
// if the id read from `window.__wallItineraryRunBridge` right after a real
// click differs from the id captured a moment before the click, the click
// reached a genuinely different/newer instance than whatever was inspected
// previously. Read via window.__wallItineraryRunBridge.getBridgeDiagnostics()
// in the SAME devtools console the app itself is running in — never via a
// fresh `import()`, which is exactly the ambiguity this exists to remove.
const _moduleInstanceId = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
if (typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__wallItineraryRunBridge = {
    moduleInstanceId: _moduleInstanceId,
    evaluatedAt: new Date().toISOString(),
    getBridgeDiagnostics,
    measureLocalStorage,
    start,
    getSnapshot,
    hasLiveOwner,
  };
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
    const hadRef = !!_liveMapWindowRef;
    const refWasClosed = _liveMapWindowRef ? _liveMapWindowRef.closed : null;
    if (_liveMapWindowRef && !_liveMapWindowRef.closed) {
      _logBridgeDiag("openOrFocusLiveMap:focus", { hadRef, refWasClosed });
      _liveMapWindowRef.focus();
    } else {
      try {
        _liveMapWindowRef = window.open("/wall-app/", LIVE_MAP_WINDOW_NAME);
      } catch (e) {
        _liveMapWindowRef = null;
        _logBridgeDiag("openOrFocusLiveMap:windowOpen", { hadRef, refWasClosed, threw: (e as Error)?.message || String(e) });
      }
      if (!_liveMapWindowRef) {
        _logBridgeDiag("openOrFocusLiveMap:popupBlocked", { hadRef, refWasClosed });
        resolve({ ok: false, reason: "popup_blocked" });
        return;
      }
      _logBridgeDiag("openOrFocusLiveMap:windowOpen", { hadRef, refWasClosed, opened: true });
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
        _logBridgeDiag("openOrFocusLiveMap:resolved", { ok: true, requestId, msSinceRequest: Date.now() - (deadline - timeoutMs) });
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
        _logBridgeDiag("openOrFocusLiveMap:resolved", { ok: false, reason: "timeout", requestId });
        resolve({ ok: false, reason: "timeout" });
        return;
      }
      pollTimer = window.setTimeout(poll, 200);
    }

    window.addEventListener("storage", onStorage);
    try {
      localStorage.setItem(STORAGE_LIVEMAP_REQUEST_KEY, JSON.stringify({ requestId, issuedAt: new Date().toISOString() }));
      _logBridgeDiag("openOrFocusLiveMap:readyRequestWrite", { requestId });
    } catch (e) {
      _logBridgeDiag("openOrFocusLiveMap:readyRequestWrite", { requestId, threw: (e as Error)?.message || String(e) });
    }
    poll(); // also covers the case where a response was already published before this listener attached
  });
}
