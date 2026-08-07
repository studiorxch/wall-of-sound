// Glyph Notes — drum-lane placement
// (docs/glyph-audio/0804_GLYPH_NOTES_Full_Canvas_Pulse_Truth_Drum_Layer_Spec_v0.1.0.md §17-18).
// Places each drum event as a small mark in a lane above the pulse
// manuscript, using the ONE shared time->canvas mapping
// (timeToCanvasPosition.ts) both this layer and the playhead use. A drum
// event's own timeSeconds is never altered or quantized onto the pulse
// grid — only its DISPLAY position borrows the nearest pulse's placement.

import type { Point } from "../../data/glyphStrokeTypes";
import type { FullCanvasLayoutResult } from "../../data/glyphCanvasTypes";
import type { DrumEvent } from "../../data/glyphDrumLayerTypes";
import { timeToCanvasPosition } from "./timeToCanvasPosition";

export type DrumMark = {
  eventId: string;
  point: Point;
  height: number;
};

const MIN_MARK_HEIGHT = 1;

export function layoutDrumEvents(
  events: DrumEvent[],
  layout: FullCanvasLayoutResult,
  laneOffset: number,
  maxMarkHeight: number,
): DrumMark[] {
  const marks: DrumMark[] = [];
  for (const event of events) {
    const anchor = timeToCanvasPosition(event.timeSeconds, layout);
    if (!anchor) continue;
    // A lane sits ABOVE its pulse row — smaller y is "up" in this
    // y-down canvas convention — clamped so it never pokes above the
    // safe area regardless of laneOffset configuration.
    const y = Math.max(layout.safeBounds.minY, anchor.y - laneOffset);
    marks.push({
      eventId: event.id,
      point: { x: anchor.x, y },
      height: Math.max(MIN_MARK_HEIGHT, event.strength * maxMarkHeight),
    });
  }
  return marks;
}
