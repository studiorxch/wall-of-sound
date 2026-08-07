import type { DjPhraseBoundary } from "../../data/djTrackPreparationTypes";
import type { MusicalGrid } from "../../data/loopTypes";
import { applySnap } from "../loops/timelineSelection";

export type CanonicalBarMove = "previous" | "nearest" | "next";

export interface CanonicalBarTarget {
  barIndex: number;
  frame: number;
}

export interface CanonicalBarAlignment extends CanonicalBarTarget {
  phraseBoundaries: DjPhraseBoundary[];
}

export function resolveCanonicalBarTarget(
  frame: number,
  grid: MusicalGrid | null,
  move: CanonicalBarMove,
): CanonicalBarTarget | null {
  const barFrames = grid?.barFrames ?? [];
  if (barFrames.length === 0) return null;

  if (move === "nearest") {
    const snappedFrame = applySnap(frame, "bar", grid);
    const barIndex = barFrames.indexOf(snappedFrame);
    return barIndex < 0 ? null : { barIndex, frame: barFrames[barIndex] };
  }

  if (move === "previous") {
    for (let barIndex = barFrames.length - 1; barIndex >= 0; barIndex--) {
      if (barFrames[barIndex] < frame) return { barIndex, frame: barFrames[barIndex] };
    }
    return null;
  }

  for (let barIndex = 0; barIndex < barFrames.length; barIndex++) {
    if (barFrames[barIndex] > frame) return { barIndex, frame: barFrames[barIndex] };
  }
  return null;
}

export function resolveCanonicalBarAlignment(
  frame: number,
  grid: MusicalGrid | null,
  phraseBoundaries: DjPhraseBoundary[],
): CanonicalBarAlignment | null {
  const barIndex = grid?.barFrames.indexOf(frame) ?? -1;
  if (barIndex < 0 || !grid) return null;
  return {
    barIndex,
    frame: grid.barFrames[barIndex],
    phraseBoundaries: phraseBoundaries
      .filter((boundary) => boundary.barIndex === barIndex)
      .sort((a, b) => a.groupingBars - b.groupingBars),
  };
}
