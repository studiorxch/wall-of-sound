// ── stationGeometryEditGeometry.ts — pure platform-footprint edit ops ────────
// 0908_WOS_Subway_Bay_Ridge_Av_Station_Geometry — Editor V0 checkpoint.
//
// Pure functions only, kept separate from StationGeometryEditor.tsx so the
// actual geometry-editing behavior is unit-testable without React. Every
// function treats `undefined` (not authored yet) and `[]` (authored as
// empty — never produced by these functions) as distinct, per
// stationGeometryTypes.ts's own StationPlatform.footprint doc.

import type { LocalPoint2D } from "../../data/stationGeometryTypes";

/** Appends one vertex, turning an unauthored (`undefined`) footprint into a real one-point start. */
export function addFootprintVertex(footprint: LocalPoint2D[] | undefined, point: LocalPoint2D): LocalPoint2D[] {
  return [...(footprint ?? []), point];
}

/** Replaces the vertex at `index`. Out-of-range indices are a no-op (returns the input unchanged). */
export function moveFootprintVertex(footprint: LocalPoint2D[], index: number, point: LocalPoint2D): LocalPoint2D[] {
  if (index < 0 || index >= footprint.length) return footprint;
  const next = footprint.slice();
  next[index] = point;
  return next;
}

/** Removes the vertex at `index`. Out-of-range indices are a no-op. */
export function removeFootprintVertex(footprint: LocalPoint2D[], index: number): LocalPoint2D[] {
  if (index < 0 || index >= footprint.length) return footprint;
  return footprint.filter((_, i) => i !== index);
}

/** Returns to the genuinely-unauthored state — `undefined`, never `[]`. */
export function clearFootprint(): undefined {
  return undefined;
}

/** Rounds a local point to a sane display/storage precision (millimeters) without changing its meaning. */
export function roundLocalPoint(point: LocalPoint2D): LocalPoint2D {
  return { x: Math.round(point.x * 1000) / 1000, y: Math.round(point.y * 1000) / 1000 };
}
