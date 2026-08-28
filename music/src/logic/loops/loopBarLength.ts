// 0828_MUSIC_Looper_Loop_Library_Tagging — exact bar-length and bar/beat
// display math, extracted from SectionalLooperWorkspace.tsx's own
// already-shipped inline calculations (never re-derives BPM/meter — reads
// activeGrid's existing values only). Consolidating this into one tested
// function also fixes a real, pre-existing inconsistency: one inline call
// site used a hardcoded meter of 4 instead of the grid's own
// meterNumerator.

import type { MusicalGrid } from "../../data/loopTypes";

export function secondsPerBar(bpm: number, meterNumerator: number): number {
  return (60 / bpm) * meterNumerator;
}

// Loop length in bars, given a real BPM/meter — the exact math already used
// at the primary DurationDisplay call site (previously duplicated,
// sometimes incorrectly, elsewhere in the file).
export function computeLoopBars(durationSeconds: number, bpm: number, meterNumerator: number): number {
  return durationSeconds / secondsPerBar(bpm, meterNumerator);
}

export interface FrameBarBeat {
  bar: number;
  beat: number;
}

// Locates the nearest bar (by index into grid.barFrames) at or before
// `frame`, and how many beats into that bar `frame` falls — both 1-indexed
// for display (bar 1 beat 1 is the start of the recording), matching how
// musicians count. Returns null when the grid has no usable bar frames
// (an honest "unavailable" case, same as the ruler itself).
export function frameToBarBeat(frame: number, grid: MusicalGrid | null): FrameBarBeat | null {
  if (!grid || grid.barFrames.length === 0 || grid.beatFrames.length === 0) return null;
  let barIndex = 0;
  for (let i = 0; i < grid.barFrames.length; i++) {
    if (grid.barFrames[i] <= frame) barIndex = i;
    else break;
  }
  const barStartFrame = grid.barFrames[barIndex];
  const beatsPerBar = grid.meterNumerator;
  // Count beats strictly within [barStartFrame, next bar) that are <= frame.
  const nextBarFrame = grid.barFrames[barIndex + 1] ?? Infinity;
  let beatInBar = 0;
  for (const b of grid.beatFrames) {
    if (b < barStartFrame) continue;
    if (b >= nextBarFrame) break;
    if (b <= frame) beatInBar++;
    else break;
  }
  return { bar: barIndex + 1, beat: Math.min(Math.max(beatInBar, 1), beatsPerBar) };
}
