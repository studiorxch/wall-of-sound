// ── wallRacetrackBridge ───────────────────────────────────────────────────────
// 0805F_RACETRACK_Fixes_Catalog_Bootstrap_Presentation_Runtime_Readiness
//
// Opens or focuses RACETRACK on the SAME canonical wall/ tab
// wallItineraryRunBridge.ts's openOrFocusLiveMap() uses (LIVE_MAP_WINDOW_NAME
// — deliberately reused, not a new named window: RACETRACK is another mode
// on the same runtime, per the spec's own "no second map renderer"
// requirement). Unlike openOrFocusLiveMap(), this ALWAYS calls
// `window.open(url, name)` rather than short-circuiting to `.focus()` on an
// already-open ref — a plain focus would leave a tab already showing LIVE
// MAP stuck on the wrong mode; window.open on the same named target with a
// different URL both navigates AND focuses/reuses the tab, per browser
// semantics, which is what "repeated clicks focus the existing RACETRACK tab
// instead of creating duplicates" actually requires here. No readiness
// handshake is needed (unlike itinerary run commands, there's nothing to
// send immediately after open).

import { LIVE_MAP_WINDOW_NAME } from "./wallItineraryRunBridge";

const RACETRACK_URL = "/wall-app/?mode=racetrack";

export type OpenRacetrackResult = { ok: true } | { ok: false; reason: "popup_blocked" };

let _racetrackWindowRef: Window | null = null;

export function openOrFocusRacetrack(): OpenRacetrackResult {
  try {
    _racetrackWindowRef = window.open(RACETRACK_URL, LIVE_MAP_WINDOW_NAME);
  } catch {
    _racetrackWindowRef = null;
  }
  if (!_racetrackWindowRef) return { ok: false, reason: "popup_blocked" };
  return { ok: true };
}

// Test-only — never used by production code.
export const __test = {
  getWindowRef: () => _racetrackWindowRef,
  RACETRACK_URL,
};
