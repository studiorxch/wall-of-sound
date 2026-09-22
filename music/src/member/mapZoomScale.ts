/**
 * Calibration V1 Revision 7: the Map's geographic drawing engine reprojects
 * a Mark's authored POSITIONS on every camera move (`mbr.project()` in
 * surfaceDrawingRuntime.js), but never scaled rendered WIDTH by zoom at
 * all -- Width was always a literal canvas-pixel number, independent of
 * the current Mapbox zoom. Measured directly on a real stroke: authored at
 * zoom 12.8 (width:length ratio 0.17, proportionate), the SAME stroke's
 * screen-space width:length ratio balloons to 1.17 at zoom 10, 4.25 at
 * zoom 8, and 17 at zoom 6 -- the "Artwork becomes enormous when the
 * camera zooms out" report.
 *
 * Fix: each geographic Mark now (where captured) carries its own
 * `authoredZoom` -- the Mapbox camera zoom at the moment the gesture
 * began. At render time, the SAME authored Width number is scaled by
 *
 *   zoomScale = 2^(currentZoom - authoredZoom)
 *
 * which is exactly Mapbox's own "one zoom level = 2x tile/pixel scale"
 * model, so a Mark rendered at its own authored zoom is bit-for-bit its
 * original Width, and the SAME Mark's visual size shrinks/grows with the
 * camera exactly the way a real object painted on the ground would.
 *
 * `authoredZoom` is NOT YET persisted to Firestore (the canonical Mark
 * schema's Firestore rules use a strict `keys().hasOnly([...])` allowlist
 * that does not include it -- adding it without a rules change would
 * reject every Map stroke/erasure write outright). Until that rules change
 * is explicitly approved and deployed, `authoredZoom` lives only in the
 * in-memory Wall runtime object for the current session (still correct
 * live, right after drawing) and is absent after reload/hydration -- see
 * `resolveZoomScale`'s fallback below, which is exactly the SAME path a
 * pre-authoredZoom legacy Mark takes.
 */

/**
 * The Map's own default camera zoom (see DEFAULT_CAMERA in
 * wall/runtimes/mapboxViewportRuntime.js) -- used as the authored-zoom
 * fallback for any Mark that doesn't carry its own (every currently
 * *persisted* Mark, until the Firestore rules change below is deployed,
 * plus any genuinely legacy Mark from before this revision). This is a
 * shared-reference approximation, not per-Mark-correct: a Mark actually
 * authored far from this zoom will not scale perfectly relative to its own
 * true drawing moment. It is deliberately the SAME constant used at Map
 * boot, so a member who never zoomed before drawing gets exact behavior.
 */
export const MAP_SURFACE_REFERENCE_ZOOM = 12.8;

/**
 * `2^(currentZoom - authoredZoom)`, the exact geometric relationship
 * Mapbox's own zoom levels already use (each level doubles screen-pixel
 * density) -- deliberately UNCLAMPED here. Presentation policy (a floor so
 * Artwork never disappears entirely at extreme overview, a ceiling so it
 * never explodes past some sane limit) is a decision layered ABOVE this
 * correct scale math, not baked into it -- callers apply their own bounds
 * if/when that policy is defined.
 */
export function resolveZoomScale(currentZoom: number, authoredZoom: number | undefined): number {
  const baseline = authoredZoom ?? MAP_SURFACE_REFERENCE_ZOOM;
  return Math.pow(2, currentZoom - baseline);
}
