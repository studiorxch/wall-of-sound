// ── wallSubwayItineraryRideBridge ─────────────────────────────────────────────
// 0819_SUBWAY_Itinerary_Execution_Map_Authoring
//
// The EXECUTION half of the SUBWAY itinerary bridge — deliberately separate
// from wallSubwayItineraryBridge.ts (resolution). Launches/focuses canonical
// LIVE MAP in SUBWAY mode (reusing LIVE_MAP_WINDOW_NAME + the exact same
// wos:liveMap:readyRequest/ready handshake wallItineraryRunBridge.ts's
// openOrFocusLiveMap() already uses — same keys, same matched-requestId
// contract, so a fresh-browser cold launch is handled identically), then
// talks to wall/systems/transit/subwayItineraryRideAuthority.js over its own
// wos:subwayRide:* channel — a transit leg is never sent through DRIVE's
// wos:itineraryRun:* command shape.
//
// window.open("/wall-app/?mode=subway", LIVE_MAP_WINDOW_NAME) ALWAYS
// navigates the shared canonical tab (never a plain .focus()-only reuse) —
// same deliberate choice wallSubwayBridge.ts's openOrFocusSubway() already
// makes: a stale already-open tab could be sitting on a different mode, and
// window.open on the same named target with a different URL both navigates
// AND focuses/reuses the real tab.

import { LIVE_MAP_WINDOW_NAME } from "./wallItineraryRunBridge";
import type { TransitLegPlan } from "../data/itineraryTypes";

const SUBWAY_URL = "/wall-app/?mode=subway";

const STORAGE_COMMAND_KEY = "wos:subwayRide:command";
const STORAGE_SNAPSHOT_KEY = "wos:subwayRide:snapshot";
const STORAGE_LIVEMAP_REQUEST_KEY = "wos:liveMap:readyRequest";
const STORAGE_LIVEMAP_READY_KEY = "wos:liveMap:ready";

export type RideStatus = "idle" | "waiting_to_board" | "riding" | "approaching_exit" | "completed";

export interface RideSnapshot {
  status: RideStatus;
  itineraryId: string | null;
  stageId: string | null;
  leg: TransitLegPlan | null;
  selectedLogicalTrainId: string | null;
  currentStopId: string | null;
  nextStopId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  lastCommandReason: string | null;
}

export const IDLE_RIDE_SNAPSHOT: RideSnapshot = {
  status: "idle", itineraryId: null, stageId: null, leg: null,
  selectedLogicalTrainId: null, currentStopId: null, nextStopId: null,
  startedAt: null, completedAt: null, lastCommandReason: null,
};

type Command =
  | { type: "startLeg"; itineraryId: string; stageId: string; leg: TransitLegPlan; commandId: string; issuedAt: string }
  | { type: "selectTrain"; logicalTrainId: string; commandId: string; issuedAt: string }
  | { type: "stop"; commandId: string; issuedAt: string };

function genId(): string {
  return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
}

function sendCommand(cmd: Command): void {
  try { localStorage.setItem(STORAGE_COMMAND_KEY, JSON.stringify(cmd)); } catch { /* best-effort */ }
}

export function getSnapshot(): RideSnapshot {
  try {
    const raw = localStorage.getItem(STORAGE_SNAPSHOT_KEY);
    if (raw) return JSON.parse(raw) as RideSnapshot;
  } catch { /* fall through */ }
  return IDLE_RIDE_SNAPSHOT;
}

export function subscribe(fn: () => void): () => void {
  function onStorage(e: StorageEvent) {
    if (e.key === STORAGE_SNAPSHOT_KEY) fn();
  }
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

export function selectTrain(logicalTrainId: string): void {
  sendCommand({ type: "selectTrain", logicalTrainId, commandId: genId(), issuedAt: new Date().toISOString() });
}

export function stopRide(): void {
  sendCommand({ type: "stop", commandId: genId(), issuedAt: new Date().toISOString() });
}

let _liveMapWindowRef: Window | null = null;

export type LaunchResult = { ok: true } | { ok: false; reason: "popup_blocked" | "timeout" };

// Opens/focuses canonical LIVE MAP in SUBWAY mode and waits for the SAME
// genuine readiness handshake DRIVE's openOrFocusLiveMap() uses — a fresh
// cold launch (no LIVE MAP tab open yet) and an already-open tab (on any
// mode, including a stale SUBWAY session) both funnel through this one path.
function openOrFocusSubwayAndWaitReady(timeoutMs = 15000): Promise<LaunchResult> {
  return new Promise((resolve) => {
    // Always navigate, never a plain .focus()-only reuse — same deliberate
    // choice wallSubwayBridge.ts's openOrFocusSubway() already makes (see
    // this file's header comment): a stale already-open tab could be
    // sitting on a different mode, and window.open on the same named
    // target both navigates AND focuses/reuses the real tab in one call.
    try {
      _liveMapWindowRef = window.open(SUBWAY_URL, LIVE_MAP_WINDOW_NAME);
    } catch {
      _liveMapWindowRef = null;
    }
    if (!_liveMapWindowRef) {
      resolve({ ok: false, reason: "popup_blocked" });
      return;
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
        if (resp.requestId !== requestId) return false;
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
    } catch { /* best-effort */ }
    poll();
  });
}

export type TransitLaunchResult = LaunchResult;

// The one entry point ItineraryRunControls.tsx calls for a transit-mode
// "Run Itinerary": open/focus SUBWAY mode and hand off the already-resolved
// leg.
//
// The command is written FIRST, synchronously, BEFORE window.open() — a
// real, reproduced race: window.open(url, LIVE_MAP_WINDOW_NAME) can end up
// navigating/reloading THIS calling tab's own browsing context (whenever
// this tab itself is - or becomes - the named target, not only a genuinely
// separate LIVE MAP tab), which would destroy this async function before it
// ever reached an await-then-send-command step. Writing the command
// synchronously up front means it is already durable in localStorage
// regardless of what happens to this tab immediately afterward.
// subwayItineraryRideAuthority.js's boot-time pending-command check is the
// other half of this fix — it explicitly looks for a fresh command at load,
// rather than relying solely on a live 'storage' event (which never fires
// for a write that already landed before a listener attached). The
// subsequent readiness wait still runs and its result is still returned, so
// the UI can report a genuine popup-blocked/timeout failure — but the ride
// itself no longer depends on this tab surviving to send a second message.
export async function launchTransitLeg(itineraryId: string, stageId: string, leg: TransitLegPlan): Promise<TransitLaunchResult> {
  sendCommand({ type: "startLeg", itineraryId, stageId, leg, commandId: genId(), issuedAt: new Date().toISOString() });
  return openOrFocusSubwayAndWaitReady();
}

