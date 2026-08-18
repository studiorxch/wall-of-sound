// ── graffitiInputController ───────────────────────────────────────────────────
// 0818_SUBWAY_Artwork_Creation_Drawing_App_v1.0.0 — BUILD §6-8
//
// Pointer Events is the ONE canonical input layer (BUILD §7) — this module
// normalizes a raw PointerEvent into a surface-space StrokePoint. No
// separate mouse/touch/pen code paths exist anywhere in this file or its
// callers; `event.pointerType` is read, never inferred from event class.
//
// Never fabricates a stylus metric the browser doesn't supply: `pressure`
// is read as-is EXCEPT the one honest, well-documented Pointer Events
// quirk this must compensate for — a mouse/no-pressure-hardware pointer
// reports a synthetic `pressure` of exactly 0 while a button is held (the
// spec's own default), which would make marker/fatcap width collapse to
// zero for every mouse stroke. Brushes read `point.pressure ?? 1` as their
// fallback; this controller only clears pressure to `undefined` for
// `pointerType === "mouse"` so that fallback engages, and leaves pen/touch
// pressure exactly as reported (including legitimate low values).

import type { PointerKind, StrokePoint } from "./graffitiTypes";

export interface SurfaceRect {
  left: number;
  top: number;
  width: number; // CSS pixel size of the canvas element
  height: number;
}

// Maps a raw PointerEvent's client coordinates into normalized 0..1
// surface-space (BUILD §18) — never stores raw browser pixel coordinates.
// Coordinates are clamped to [0,1] so a pointer that drifts slightly
// outside the canvas element mid-stroke (a real, common occurrence with
// fast pen/touch movement) still produces a bounded, valid point rather
// than an out-of-surface one (BUILD §19 drawing bounds).
export function normalizePointerEvent(
  event: Pick<PointerEvent, "clientX" | "clientY" | "pointerType" | "pressure" | "tiltX" | "tiltY" | "twist" | "timeStamp">,
  rect: SurfaceRect,
): StrokePoint {
  const pointerType = (event.pointerType || "mouse") as PointerKind;
  const rawX = (event.clientX - rect.left) / rect.width;
  const rawY = (event.clientY - rect.top) / rect.height;
  const x = Math.min(1, Math.max(0, rawX));
  const y = Math.min(1, Math.max(0, rawY));

  const point: StrokePoint = {
    x, y,
    pointerType,
    timestamp: event.timeStamp,
  };

  if (pointerType !== "mouse" && typeof event.pressure === "number") point.pressure = event.pressure;
  if (typeof event.tiltX === "number" && event.tiltX !== 0) point.tiltX = event.tiltX;
  if (typeof event.tiltY === "number" && event.tiltY !== 0) point.tiltY = event.tiltY;
  if (typeof event.twist === "number" && event.twist !== 0) point.twist = event.twist;

  return point;
}

// Velocity in normalized-units/ms between two consecutive points — used by
// fatcap (spacing/softness) and mop (dwell detection). Never computed for
// the first point of a stroke (there is no "preceding point" to derive it
// from — BUILD §6 explicitly forbids fabricating a metric with no basis).
export function computeVelocity(prev: StrokePoint, point: StrokePoint): number {
  const dt = Math.max(1, point.timestamp - prev.timestamp);
  const dx = point.x - prev.x, dy = point.y - prev.y;
  return Math.sqrt(dx * dx + dy * dy) / dt;
}

// Builds a canvas-element-relative SurfaceRect, accounting for
// devicePixelRatio-aware CSS sizing (the canvas's CSS box, not its
// internal backing-store pixel size — that scaling is applied separately
// in graffitiCanvasRenderer.ts, so coordinate normalization here stays
// resolution-independent and orientation/resize-safe, per BUILD §7).
export function rectFromElement(el: { getBoundingClientRect(): { left: number; top: number; width: number; height: number } }): SurfaceRect {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}
