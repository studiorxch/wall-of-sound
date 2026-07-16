// 0715B_MUSIC_Timeline_Range_Selection_And_Compact_Loop_Workspace — pure
// selection-model logic (§6-§15). Frame boundaries are authoritative;
// seconds are always derived, never the source of truth (§7). Never
// re-derives the beat-map/BPM grid itself — snap operations only READ an
// already-computed MusicalGrid's own frame arrays.

import type { MusicalGrid, TimelineSelection, TimelineSelectionSource, TimelineSnapMode } from "../../data/loopTypes";
import { computeSubdivisionSnapTarget } from "./subdivisionSnap";
import { findZeroCrossing } from "./zeroCrossingSnap";

// §7 — normalizes a reverse drag (pointer moved right-to-left) into a
// forward range, and clamps both ends within [0, sourceFrameCount].
export function normalizeAndClamp(
  frameA: number, frameB: number, sourceFrameCount: number,
): { startFrame: number; endFrame: number } {
  const lo = Math.max(0, Math.min(frameA, frameB));
  const hi = Math.min(sourceFrameCount, Math.max(frameA, frameB));
  return { startFrame: lo, endFrame: hi };
}

function nearestFrame(target: number, candidates: number[]): number | null {
  if (candidates.length === 0) return null;
  let best = candidates[0];
  let bestDist = Math.abs(candidates[0] - target);
  for (let i = 1; i < candidates.length; i++) {
    const d = Math.abs(candidates[i] - target);
    if (d < bestDist) { best = candidates[i]; bestDist = d; }
  }
  return best;
}

// §10/§11 — grid-locked snap, using the grid's OWN real frame arrays
// (never rounded-seconds math). Falls back to the raw frame when the grid
// has no usable marks for the requested mode (e.g. no trusted grid).
export function applySnap(frame: number, mode: TimelineSnapMode, grid: MusicalGrid | null): number {
  if (mode === "off" || mode === "frame" || !grid) return frame;
  if (mode === "bar") return nearestFrame(frame, grid.barFrames) ?? frame;
  if (mode === "beat" || mode === "subdivision") return nearestFrame(frame, grid.beatFrames) ?? frame;
  // zero_crossing requires real decoded sample data — not derivable from
  // the grid alone; callers needing it must supply frames separately
  // (§13). Not implemented in this pass — falls through to raw frame.
  return frame;
}

// 0715C §5-§9 — completes the snap model with subdivision and zero-crossing
// modes. Kept SEPARATE from `applySnap` above (which stays grid-only and
// unchanged, so bar/beat/off keep their existing behavior and tests)
// because these two modes need decoded PCM data that isn't always
// available (e.g. mid-drag, before a commit). Callers must only invoke the
// zero-crossing branch at commit time (pointerup/blur/keyboard-commit) —
// never per drag-move — since the windowed sample scan is too expensive to
// repeat on every pointermove.
export function applySnapWithAudio(
  frame: number,
  mode: TimelineSnapMode,
  grid: MusicalGrid | null,
  audio: { channelData: Float32Array[]; sampleRate: number } | null,
  subdivisionDivision: 4 | 8 | 16 | 32 = 16,
): number {
  if (mode === "subdivision" && grid) {
    const target = computeSubdivisionSnapTarget(frame, grid, subdivisionDivision, audio?.sampleRate ?? 44100);
    if (target) return target.frame;
    return frame;
  }
  if (mode === "zero_crossing" && audio) {
    return findZeroCrossing(frame, audio.channelData, audio.sampleRate).frame;
  }
  return applySnap(frame, mode, grid);
}

const MIN_SELECTION_FRAMES = 1;

// §6/§7 — builds a canonical, validated TimelineSelection. Rejects
// (returns null) a zero-length or inverted range after clamping.
export function createSelection(
  sourceTrackId: string,
  frameA: number,
  frameB: number,
  sourceFrameCount: number,
  sampleRate: number,
  source: TimelineSelectionSource,
  snapMode: TimelineSnapMode,
  grid: MusicalGrid | null,
  extra?: { candidateId?: string; segmentId?: string; loopId?: string; regionId?: string },
  now: string = new Date().toISOString(),
): TimelineSelection | null {
  const snappedA = applySnap(frameA, snapMode, grid);
  const snappedB = applySnap(frameB, snapMode, grid);
  const { startFrame, endFrame } = normalizeAndClamp(snappedA, snappedB, sourceFrameCount);
  if (endFrame - startFrame < MIN_SELECTION_FRAMES) return null;
  return {
    sourceTrackId,
    startFrame, endFrame,
    startSeconds: startFrame / sampleRate,
    endSeconds: endFrame / sampleRate,
    durationSeconds: (endFrame - startFrame) / sampleRate,
    source, snapMode,
    ...extra,
    createdAt: now, updatedAt: now,
  };
}

// §14/§15 — moves ONE boundary (numeric edit or handle drag), re-validates
// against the other boundary and source bounds, never allowing inversion.
export function moveSelectionBoundary(
  selection: TimelineSelection,
  which: "start" | "end",
  newFrame: number,
  sourceFrameCount: number,
  sampleRate: number,
  snapMode: TimelineSnapMode,
  grid: MusicalGrid | null,
  now: string = new Date().toISOString(),
): TimelineSelection | null {
  const snapped = applySnap(newFrame, snapMode, grid);
  const clamped = Math.max(0, Math.min(sourceFrameCount, snapped));
  const nextStart = which === "start" ? clamped : selection.startFrame;
  const nextEnd = which === "end" ? clamped : selection.endFrame;
  if (nextEnd - nextStart < MIN_SELECTION_FRAMES) return null;
  return {
    ...selection,
    startFrame: nextStart, endFrame: nextEnd,
    startSeconds: nextStart / sampleRate, endSeconds: nextEnd / sampleRate,
    durationSeconds: (nextEnd - nextStart) / sampleRate,
    updatedAt: now,
  };
}

export interface SelectionClampBounds { minFrame: number; maxFrame: number; }

// 0716A §"Movable Selection Body" — shifts BOTH edges by the same delta,
// preserving exact-frame width (never re-snapping each edge independently,
// which could silently change width). The new START is snapped as a single
// unit, then the end is re-derived from start+width — this is what keeps a
// fixed bar-length selection exactly fixed while it moves. `clampBounds`
// defaults to the full source range; callers pass audible-content bounds
// (§"clamp movement to audible-content bounds") when known. Returns null
// only if the selection's own width can never fit inside clampBounds.
export function moveSelection(
  selection: TimelineSelection,
  deltaFrames: number,
  sourceFrameCount: number,
  sampleRate: number,
  snapMode: TimelineSnapMode,
  grid: MusicalGrid | null,
  clampBounds?: SelectionClampBounds,
  now: string = new Date().toISOString(),
): TimelineSelection | null {
  const width = selection.endFrame - selection.startFrame;
  const minFrame = Math.max(0, clampBounds?.minFrame ?? 0);
  const maxFrame = Math.min(sourceFrameCount, clampBounds?.maxFrame ?? sourceFrameCount);
  if (width > maxFrame - minFrame) return null;
  const rawStart = selection.startFrame + deltaFrames;
  const snappedStart = applySnap(rawStart, snapMode, grid);
  const nextStart = Math.max(minFrame, Math.min(maxFrame - width, snappedStart));
  const nextEnd = nextStart + width;
  if (nextEnd - nextStart < MIN_SELECTION_FRAMES) return null;
  return {
    ...selection,
    startFrame: nextStart, endFrame: nextEnd,
    startSeconds: nextStart / sampleRate, endSeconds: nextEnd / sampleRate,
    durationSeconds: width / sampleRate,
    updatedAt: now,
  };
}

export function isValidSelection(selection: TimelineSelection, sourceFrameCount: number): boolean {
  return selection.startFrame >= 0
    && selection.startFrame < selection.endFrame
    && selection.endFrame <= sourceFrameCount;
}
