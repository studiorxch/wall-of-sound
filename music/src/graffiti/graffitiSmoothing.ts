// ── graffitiSmoothing ──────────────────────────────────────────────────────────
// 0818_SUBWAY_Artwork_Creation_Drawing_App_v1.0.0 — BUILD §14
//
// A deterministic quadratic-midpoint smoothing pass, shared by every brush
// that renders a continuous line (marker, fatcap's centerline, mop's
// centerline before drip simulation). Pure function of the input points —
// no randomness, no hidden state — so it never breaks stroke/undo
// determinism.
//
// Deliberately mild: this is midpoint-averaging over a 1-point window, not
// a heavy multi-pass filter — enough to remove raw-pointer-sample jaggedness
// without flattening intentional hand movement (BUILD §14: "do not apply
// aggressive smoothing that destroys intentional hand movement").

import type { StrokePoint } from "./graffitiTypes";

// Returns the sequence of (control, endpoint) pairs a quadratic-curve
// renderer can walk directly: for points [p0,p1,p2,...,pn], produces
// midpoints m(i,i+1) as curve endpoints with the ORIGINAL point as the
// control — the standard "quadratic through midpoints" technique. Requires
// at least 2 points; returns an empty array otherwise (nothing to smooth).
export function smoothedCurveSegments(points: StrokePoint[]): Array<{ controlX: number; controlY: number; endX: number; endY: number }> {
  if (points.length < 2) return [];
  const segments: Array<{ controlX: number; controlY: number; endX: number; endY: number }> = [];
  for (let i = 1; i < points.length - 1; i++) {
    const p = points[i], next = points[i + 1];
    segments.push({ controlX: p.x, controlY: p.y, endX: (p.x + next.x) / 2, endY: (p.y + next.y) / 2 });
  }
  // Final segment always ends exactly at the last real point — never
  // overshoots past the true stroke end (BUILD §14 "no path overshoot").
  const last = points[points.length - 1];
  const secondLast = points[points.length - 2];
  segments.push({ controlX: secondLast.x, controlY: secondLast.y, endX: last.x, endY: last.y });
  return segments;
}
