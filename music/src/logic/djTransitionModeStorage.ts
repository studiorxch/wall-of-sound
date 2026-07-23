// DJ Transition Engine (0722D) — capability-gate persistence. Mirrors the
// small localStorage-preference pattern already used by
// PlaylistFlowChart.tsx (readExpandedPref/writeExpandedPref): a single
// namespaced key, defensive try/catch, silent no-persist fallback if
// localStorage is unavailable. Defaults to "off" — the DJ engine is
// dormant until an operator explicitly opts into "shadow".
//
// "active" is a real value in the type (so callers written ahead of task
// #43 don't need to change), but nothing in this build's UI can currently
// set it — see PlaylistPreparationPanel.tsx's mode control, which only
// offers Off/Shadow at this checkpoint.
//
// No colocated unit test: this repo's vitest environment is plain node
// (no jsdom/localStorage — see dualDeckPlayback.test.ts's own header
// comment for the same established convention). Round-trip + reload
// persistence is verified live in the browser instead.

export type DjTransitionMode = "off" | "shadow" | "active";

const STORAGE_KEY = "music.djTransition.mode";

function isDjTransitionMode(value: string | null): value is DjTransitionMode {
  return value === "off" || value === "shadow" || value === "active";
}

export function readDjTransitionMode(): DjTransitionMode {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return isDjTransitionMode(raw) ? raw : "off";
  } catch {
    return "off";
  }
}

export function writeDjTransitionMode(mode: DjTransitionMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // localStorage unavailable — preference just won't persist this session.
  }
}
