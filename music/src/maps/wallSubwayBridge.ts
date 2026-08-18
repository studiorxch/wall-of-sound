// ── wallSubwayBridge ───────────────────────────────────────────────────────────
// 0818_SUBWAY_Logical_Rolling_Stock_v1.0.0_BUILD — Navigation Addition
//
// Opens or focuses SUBWAY on the SAME canonical wall/ tab
// wallItineraryRunBridge.ts's openOrFocusLiveMap() / wallRacetrackBridge.ts's
// openOrFocusRacetrack() use (LIVE_MAP_WINDOW_NAME — deliberately reused, not
// a new named window). Unlike RACETRACK, SUBWAY isn't even a separate walled
// mode — it renders directly onto the same canonical live map — but it still
// needs the `?mode=subway` boot flag to auto-activate on load, so the same
// "always window.open with the same name, never .focus()-only" pattern
// applies: a plain focus would leave an already-open tab stuck on whatever
// mode it last loaded; window.open on the same named target with a different
// URL both navigates AND focuses/reuses the tab.

import { LIVE_MAP_WINDOW_NAME } from "./wallItineraryRunBridge";

const SUBWAY_URL = "/wall-app/?mode=subway";

export type OpenSubwayResult = { ok: true } | { ok: false; reason: "popup_blocked" };

let _subwayWindowRef: Window | null = null;

export function openOrFocusSubway(): OpenSubwayResult {
  try {
    _subwayWindowRef = window.open(SUBWAY_URL, LIVE_MAP_WINDOW_NAME);
  } catch {
    _subwayWindowRef = null;
  }
  if (!_subwayWindowRef) return { ok: false, reason: "popup_blocked" };
  return { ok: true };
}

// Test-only — never used by production code.
export const __test = {
  getWindowRef: () => _subwayWindowRef,
  SUBWAY_URL,
};
