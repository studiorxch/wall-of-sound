// 0828_MUSIC_Looper_Loop_Library_Tagging — N-bar snap granularity
// (Off/Beat/1/2/4/8/16 Bar). Deliberately does NOT touch applySnap/
// createSelection/moveSelectionBoundary/moveSelection/applySnapWithAudio
// (timelineSelection.ts) or their many call sites — those stay grid-only
// and unchanged. Instead this module derives a GRID VARIANT whose
// `barFrames` has already been decimated to every Nth bar, so the existing,
// unmodified `mode === "bar"` branch in applySnap naturally snaps to the
// coarser grid it's handed — the same pattern subdivisionSnap.ts already
// uses for a distinct concept, just applied a layer earlier (at the grid
// itself, not inside the snap function).

import type { MusicalGrid } from "../../data/loopTypes";

export type BarMultiple = 1 | 2 | 4 | 8 | 16;

// Picks every Nth entry of grid.barFrames, ANCHORED AT INDEX 0 (bar 0 of
// the grid) — standard "snap to every Nth bar line from the grid origin"
// behavior. barFrames already has exactly one authoritative frame per bar
// (no interpolation needed/performed).
export function decimateBarFrames(barFrames: number[], barMultiple: BarMultiple): number[] {
  if (barMultiple <= 1) return barFrames;
  const out: number[] = [];
  for (let i = 0; i < barFrames.length; i += barMultiple) out.push(barFrames[i]);
  return out;
}

// Returns a shallow-copied grid for snap purposes only — every other field
// (bpm, meterNumerator, beatFrames, trust, confidence, ...) stays identical
// to the source grid, since only bar-snap granularity changes. Returns the
// SAME grid reference when barMultiple is 1 (no-op), so callers doing
// reference-equality checks elsewhere aren't affected by this being called
// on every render.
export function gridWithBarMultiple(grid: MusicalGrid, barMultiple: BarMultiple): MusicalGrid {
  if (barMultiple <= 1) return grid;
  return { ...grid, barFrames: decimateBarFrames(grid.barFrames, barMultiple) };
}
