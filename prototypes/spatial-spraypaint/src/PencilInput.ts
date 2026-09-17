/**
 * Apple Pencil input audit + normalization (Flair Stabilization + Pencil V1
 * Prep build brief, sections C/D/E). Two concerns kept strictly separate,
 * per the brief's own canonical boundary diagram:
 *
 *   Mouse / Pencil / Hand
 *         v
 *   Input Normalizer        <-- this module, `normalizePointerSample`
 *         v
 *   CanonicalSprayState      <-- x/y/distance/angle/output/velocity/dwell (ToolTaxonomy.ts)
 *         v
 *   Flair Mapping             <-- FlairCurves.ts, unaffected by this module
 *         v
 *   Cap Renderer
 *
 * This module ONLY reads raw hardware values and produces a normalized,
 * DOM-free sample. It never touches `baseRadius`, Flair's distance dial, or
 * any cap-specific geometry — "Pencil should populate canonical state, not
 * directly manipulate cap geometry." `main.ts`'s own gated write sites (see
 * `applyPencilTrackMarksMapping` below) are the only place a normalized
 * sample is allowed to reach anything rendered, and only for Track Marks.
 *
 * "Do not guess support": every field below is read directly off the actual
 * `PointerEvent` the browser delivers, with the exact fallback the Pointer
 * Events spec itself defines when a device doesn't report a value (pressure
 * defaults to 0.5 for a device with no pressure sensor while a button/finger
 * is down, 0 otherwise; tilt/twist default to 0) — never inferred or faked.
 */

/**
 * The minimal shape this module needs from a real `PointerEvent` — kept as
 * its own interface (rather than importing the DOM `PointerEvent` type
 * directly) so `normalizePointerSample` is callable from tests with a plain
 * object, no jsdom/browser PointerEvent construction required. A real
 * `PointerEvent` satisfies this structurally with zero adaptation.
 */
export interface PointerEventLike {
  pointerType: string;
  pressure: number;
  tiltX: number;
  tiltY: number;
  twist: number;
  clientX: number;
  clientY: number;
  timeStamp: number;
  getCoalescedEvents?: () => readonly { clientX: number; clientY: number }[];
}

/** Raw, unmodified values read straight off one `PointerEvent` — the diagnostic layer's own record, before any derived/normalized field is computed. */
export interface RawPointerSample {
  pointerType: string;
  pressure: number;
  tiltX: number;
  tiltY: number;
  twist: number;
  x: number;
  y: number;
  timestamp: number;
}

/** `RawPointerSample` plus derived, still hardware-agnostic fields — the actual "Input Normalizer" output. */
export interface NormalizedPointerSample extends RawPointerSample {
  /** Screen-pixels per millisecond between this sample and the previous one (0 for the first sample of a sequence). Same derivation shape as `CanonicalStrokeManager`'s own velocity, kept independent so this module never depends on stroke state. */
  velocity: number;
  /** `pointerType === "pen"` — Apple Pencil and other stylus input. */
  isPencil: boolean;
  /** `pointerType === "touch"` — finger input, distinguished from Pencil per section F's "finger and Pencil can be distinguished." */
  isTouch: boolean;
  /** Number of coalesced sub-samples the browser bundled into this one event (`event.getCoalescedEvents().length`), 0 when unsupported or none. Diagnostic count only in this pass — NOT yet consumed for higher-resolution deposition (see module doc / build brief section F: "coalesced events do not create duplicate deposition" is satisfied by not using them for deposition at all yet). */
  coalescedCount: number;
}

/**
 * The Input Normalizer. Pure given its inputs — no DOM access, no
 * `Math.random`, no wall-clock reads beyond what the event itself reports.
 * `previous` is the last `RawPointerSample` (raw is enough; velocity only
 * needs x/y/timestamp) from the SAME logical pointer, or `null` for the
 * first sample of a sequence.
 */
export function normalizePointerSample(event: PointerEventLike, previous: RawPointerSample | null): NormalizedPointerSample {
  const pointerType = event.pointerType || "mouse";
  const pressure = typeof event.pressure === "number" ? event.pressure : 0.5;
  const tiltX = typeof event.tiltX === "number" ? event.tiltX : 0;
  const tiltY = typeof event.tiltY === "number" ? event.tiltY : 0;
  const twist = typeof event.twist === "number" ? event.twist : 0;
  const x = event.clientX;
  const y = event.clientY;
  const timestamp = event.timeStamp;

  let velocity = 0;
  if (previous) {
    const dt = Math.max(1, timestamp - previous.timestamp);
    const dx = x - previous.x;
    const dy = y - previous.y;
    velocity = Math.hypot(dx, dy) / dt;
  }

  const coalescedCount = typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents().length : 0;

  return {
    pointerType,
    pressure,
    tiltX,
    tiltY,
    twist,
    x,
    y,
    timestamp,
    velocity,
    isPencil: pointerType === "pen",
    isTouch: pointerType === "touch",
    coalescedCount,
  };
}

// ---------------------------------------------------------------------------
// Pencil Mapping V1 (section E) — Track Marks only, reusing EXISTING generic
// per-brush override channels rather than inventing new rendering:
//
//   pressure -> output/deposition  : reuses `coverage` (already a generic
//                                    0-1 per-brush deposition control)
//   tilt     -> spray angle        : reuses `sprayAngle` (already a generic
//                                    per-brush property every cap accepts,
//                                    though only a `plume` cap like Pink Dot
//                                    visibly responds to it)
//   velocity -> existing behavior  : already automatic — CanonicalStrokeManager
//                                    computes velocity from x/y/timestamp
//                                    regardless of input source, Pencil included.
//   distance                       : UNTOUCHED — never written from pressure/tilt,
//                                    per the brief's explicit "distance remains
//                                    independent" / "do not map pressure to distance."
//
// Both mappings are pure value resolvers; the actual write (and its
// Track-Marks-only gate) lives in `main.ts`, mirroring every other
// "safe sandbox" mechanism already established in this codebase — a generic
// channel, gated by capId at the WRITE site, not a new per-cap code path.

/** Pressure (0-1) -> coverage (0-1). A dead-zone floor keeps a light touch from reading as near-zero deposition; full pressure reaches full coverage. */
export function resolvePencilCoverage(pressure: number): number {
  const clamped = Math.max(0, Math.min(1, pressure));
  return 0.35 + clamped * 0.65;
}

/** Combined tilt magnitude (0-1, from tiltX/tiltY's own -90..90 range) -> spray angle degrees, within `[0, maxAngleDegrees]`. A flat pencil (tilt near 0) yields a near-zero mapped angle; a steeply tilted pencil approaches `maxAngleDegrees`. */
export function resolvePencilSprayAngle(tiltX: number, tiltY: number, maxAngleDegrees: number): number {
  const magnitude = Math.min(1, Math.hypot(tiltX, tiltY) / 90);
  return magnitude * maxAngleDegrees;
}
