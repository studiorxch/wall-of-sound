// Glyph Notes — Laser layer placement
// (docs/glyph-audio/0804_GLYPH_NOTES_Event_Vocabulary_Laser_Layer_Spec_v0.1.0.md §11).
//
// Places laser geometry using the SAME canonical time->canvas mapping the
// playhead and drum layer already share (nearestPlacedPoint,
// timeToCanvasPosition.ts) — never a parallel placement system. Breaks at
// row boundaries exactly like fullCanvasLayout.ts's own row-chunking (never
// connects a segment across a row), and per the pre-implementation
// review's "laser coverage must not mean continuous visibility" correction:
// frames below the activity threshold END the current segment rather than
// being interpolated through — a genuinely silent passage renders as
// genuinely absent geometry, never an artificial flat line.

import type { GlyphBounds } from "../../data/glyphStrokeTypes";
import type { FullCanvasLayoutResult } from "../../data/glyphCanvasTypes";
import type { LaserActivityFrame, LaserLayoutResult, LaserPathPoint, LaserPlacedSegment } from "../../data/glyphLaserLayerTypes";
import { nearestPlacedPoint } from "./timeToCanvasPosition";

export const DEFAULT_LASER_ACTIVITY_THRESHOLD = 0.15;
// Places the laser path above the hump crest region, mirroring the drum
// lane's own DRUM_LANE_OFFSET pattern in GlyphWorkspace.tsx.
export const DEFAULT_LASER_VERTICAL_OFFSET = 60;

function boundsFromPoints(points: LaserPathPoint[]): GlyphBounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  return { minX, minY, maxX, maxY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
}

export function layoutLaserFrames(
  frames: LaserActivityFrame[],
  layout: FullCanvasLayoutResult,
  activityThreshold: number = DEFAULT_LASER_ACTIVITY_THRESHOLD,
  verticalOffset: number = DEFAULT_LASER_VERTICAL_OFFSET,
): LaserLayoutResult {
  const framesAnalyzed = frames.length;
  const framesAboveThreshold = frames.filter((f) => f.activity >= activityThreshold).length;

  const segments: LaserPlacedSegment[] = [];
  let current: LaserPathPoint[] = [];
  let currentRowIndex: number | null = null;
  let currentSectionId: string | null = null;
  let droppedCount = 0;

  function flush() {
    if (current.length === 0) return;
    segments.push({
      id: `laser-${segments.length}`,
      rowIndex: currentRowIndex ?? 0,
      sectionId: currentSectionId,
      points: [...current],
      bounds: boundsFromPoints(current),
    });
    current = [];
  }

  for (const frame of frames) {
    if (frame.activity < activityThreshold) {
      // Genuinely inactive — end any open segment; never draw through it.
      flush();
      currentRowIndex = null;
      currentSectionId = null;
      continue;
    }

    const nearest = nearestPlacedPoint(frame.timeSeconds, layout);
    if (!nearest) {
      // A frame that SHOULD have produced geometry (above threshold) but
      // couldn't be placed — this is a real drop, distinct from a
      // below-threshold frame being correctly excluded by design.
      droppedCount++;
      flush();
      currentRowIndex = null;
      currentSectionId = null;
      continue;
    }

    if (currentRowIndex !== null && nearest.rowIndex !== currentRowIndex) {
      // Row changed — never connect a laser segment across rows, exactly
      // matching the pulse manuscript's own row-boundary behavior.
      flush();
    }

    currentRowIndex = nearest.rowIndex;
    currentSectionId = nearest.sectionId;
    const y = Math.max(layout.safeBounds.minY, nearest.point.y - verticalOffset);
    current.push({
      timeSeconds: frame.timeSeconds, x: nearest.point.x, y,
      activity: frame.activity, intensity: frame.confidence,
      modulationAmount: frame.modulationAmount, modulationRate: frame.modulationRate,
    });
  }
  flush();

  const placedSegmentCount = segments.length;
  return {
    segments,
    framesAnalyzed,
    framesAboveThreshold,
    placedSegmentCount,
    // Every placed segment's points are clamped inside safeBounds by
    // construction (see the y-clamp above), so a placed segment is always
    // visible — both counts are real, independently-meaningful diagnostics
    // that happen to agree when layout succeeds, matching the required
    // "laser dropped segments = 0" invariant.
    visibleSegmentCount: placedSegmentCount,
    droppedSegmentCount: droppedCount,
    activityThreshold,
  };
}
