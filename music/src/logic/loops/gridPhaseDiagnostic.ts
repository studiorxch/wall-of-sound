// 0715F_MUSIC_Sample_Accurate_Loop_Audition_And_Playhead_Synchronization §15 —
// distinguishes playback lateness from musical-grid misalignment. Pure,
// read-only comparison against an existing MusicalGrid — never alters
// detector output. The temporary preview-offset nudges are audition-only
// (session state in the workspace), never persisted as a trusted grid edit.

import type { MusicalGrid } from "../../data/loopTypes";

export interface GridPhaseComparison {
  selectedStartFrame: number;
  gridAvailable: boolean;
  nearestGridFrame?: number;
  originFrame?: number;
  offsetFromGridFrames?: number;
  offsetFromOriginFrames?: number;
}

export function compareToGrid(selectedStartFrame: number, grid?: MusicalGrid): GridPhaseComparison {
  if (!grid) return { selectedStartFrame, gridAvailable: false };

  let nearest: number | undefined;
  let bestDistance = Infinity;
  for (const frame of grid.barFrames) {
    const d = Math.abs(frame - selectedStartFrame);
    if (d < bestDistance) { bestDistance = d; nearest = frame; }
  }
  for (const frame of grid.beatFrames) {
    const d = Math.abs(frame - selectedStartFrame);
    if (d < bestDistance) { bestDistance = d; nearest = frame; }
  }

  return {
    selectedStartFrame,
    gridAvailable: true,
    nearestGridFrame: nearest,
    originFrame: grid.originFrame,
    offsetFromGridFrames: nearest !== undefined ? selectedStartFrame - nearest : undefined,
    offsetFromOriginFrames: selectedStartFrame - grid.originFrame,
  };
}

// §15 — the sanctioned temporary diagnostic shift steps, in milliseconds.
export const PREVIEW_OFFSET_MS_STEPS = [-100, -50, -20, 0, 20, 50, 100] as const;
export type PreviewOffsetMs = (typeof PREVIEW_OFFSET_MS_STEPS)[number];

// Applies a temporary, session-only offset to a preview's loop boundaries.
// Never writes back to TimelineSelection/LoopAsset/MusicalGrid — the caller
// must keep this scoped to the live audition request only.
export function applyPreviewOffsetFrames(
  startFrame: number,
  endFrame: number,
  offsetMs: number,
  sampleRate: number,
): { startFrame: number; endFrame: number } {
  const offsetFrames = Math.round((offsetMs / 1000) * sampleRate);
  return { startFrame: startFrame + offsetFrames, endFrame: endFrame + offsetFrames };
}
