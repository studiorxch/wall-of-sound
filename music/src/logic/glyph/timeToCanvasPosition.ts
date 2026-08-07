// Glyph Notes — canonical time -> canvas position mapping
// (docs/glyph-audio/0804_GLYPH_NOTES_Full_Canvas_Pulse_Truth_Drum_Layer_Spec_v0.1.0.md §18).
// The ONE shared mapping the pulse manuscript's playhead and the drum
// layer's tick placement both use — never a second, independently-derived
// position calculation. Snaps to the nearest placed pulse point rather than
// interpolating across a row boundary (which would draw a diagonal jump
// where none is visually intended) — acceptable for a diagnostic mark
// (§17) and for playhead highlighting, where "nearest pulse" is exactly
// the desired semantic anyway (§20's currentPulse rule).
//
// Off-grid drum-event times are NEVER quantized onto the pulse grid by this
// function or by anything upstream of it — this only answers "where on the
// canvas does this moment in time correspond to," it does not alter the
// event's own stored timeSeconds.

import type { Point } from "../../data/glyphStrokeTypes";
import type { FullCanvasLayoutResult } from "../../data/glyphCanvasTypes";

export type NearestPlacedPoint = {
  point: Point;
  timeSeconds: number;
  rowIndex: number;
  sectionId: string | null;
};

// 0804E (docs/glyph-audio/0804_GLYPH_NOTES_Event_Vocabulary_Laser_Layer_Spec_v0.1.0.md
// §11) — the laser layer needs to know which ROW a given moment in time
// lands on (to break its own path at the same row boundaries the pulse
// manuscript already breaks at), which the plain Point timeToCanvasPosition
// returns doesn't carry. This is the same nearest-point search, just
// returning the richer record; timeToCanvasPosition below is now a thin
// wrapper over it so existing callers (playhead, drum layer) are
// byte-for-byte unchanged.
export function nearestPlacedPoint(timeSeconds: number, layout: FullCanvasLayoutResult): NearestPlacedPoint | null {
  let best: NearestPlacedPoint | null = null;
  let bestDistance = Infinity;
  for (const run of layout.placedRuns) {
    for (const p of run.pulsePoints) {
      const distance = Math.abs(p.timeSeconds - timeSeconds);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { point: p.point, timeSeconds: p.timeSeconds, rowIndex: run.rowIndex, sectionId: run.sectionId };
      }
    }
  }
  return best;
}

export function timeToCanvasPosition(timeSeconds: number, layout: FullCanvasLayoutResult): Point | null {
  return nearestPlacedPoint(timeSeconds, layout)?.point ?? null;
}
