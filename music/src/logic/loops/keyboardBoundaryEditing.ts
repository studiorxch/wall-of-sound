// 0715C_MUSIC_Loop_Workspace_Editing_And_Revision_Completion §11, §12 —
// pure keyboard-boundary-move computation, kept separate from DOM event
// handling so it's unit-testable. Returns the CANDIDATE next frame only;
// the caller still runs it through the existing `moveSelectionBoundary`
// (timelineSelection.ts) for the actual inversion/zero-length/out-of-bounds
// guard (§12) — this module never re-implements that guard, it only
// decides "how far, which direction."

import type { MusicalGrid, TimelineSnapMode } from "../../data/loopTypes";

export interface KeyboardMoveModifiers {
  shift: boolean;
  option: boolean; // Option/Alt
  meta: boolean; // Command (mac) / Ctrl (win) — "previous/next grid line"
}

const LARGE_STEP_MULTIPLIER = 4;

function oneMillisecondFrames(sampleRate: number): number {
  return Math.max(1, Math.round(sampleRate / 1000));
}

// §11's "current snap unit" — the grid spacing implied by the active snap
// mode. Falls back to a single frame (finest possible nudge) for Off/Frame
// modes or when no usable grid exists yet.
function snapUnitFrames(snapMode: TimelineSnapMode, grid: MusicalGrid | null): number {
  if (snapMode === "bar" && grid && grid.barFrames.length > 1) {
    return grid.barFrames[1] - grid.barFrames[0];
  }
  if ((snapMode === "beat" || snapMode === "subdivision" || snapMode === "zero_crossing")
    && grid && grid.beatFrames.length > 1) {
    return grid.beatFrames[1] - grid.beatFrames[0];
  }
  return 1;
}

function nearestGridLineInDirection(frame: number, lines: number[], sign: 1 | -1): number | null {
  if (sign < 0) {
    let best: number | null = null;
    for (const l of lines) if (l < frame && (best === null || l > best)) best = l;
    return best;
  }
  let best: number | null = null;
  for (const l of lines) if (l > frame && (best === null || l < best)) best = l;
  return best;
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, value));
}

// Returns the candidate next frame, or null when the requested move is
// structurally unavailable (e.g. Command+Left with no earlier grid line) —
// the UI shows blocked feedback in that case rather than silently no-opping
// (§12).
export function computeKeyboardMove(
  currentFrame: number,
  direction: "left" | "right",
  modifiers: KeyboardMoveModifiers,
  snapMode: TimelineSnapMode,
  grid: MusicalGrid | null,
  sampleRate: number,
  sourceFrameCount: number,
): number | null {
  const sign: 1 | -1 = direction === "left" ? -1 : 1;

  if (modifiers.option) {
    const step = oneMillisecondFrames(sampleRate);
    return clamp(currentFrame + sign * step, 0, sourceFrameCount);
  }

  if (modifiers.meta) {
    if (!grid || grid.barFrames.length === 0) return null;
    const next = nearestGridLineInDirection(currentFrame, grid.barFrames, sign);
    if (next === null) return null;
    return clamp(next, 0, sourceFrameCount);
  }

  const unit = snapUnitFrames(snapMode, grid);
  const step = modifiers.shift ? unit * LARGE_STEP_MULTIPLIER : unit;
  return clamp(currentFrame + sign * step, 0, sourceFrameCount);
}
