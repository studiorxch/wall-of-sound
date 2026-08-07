// Glyph Audio — stroke geometry primitives. Copied and generalized from
// apps/glyphlab-reference/src/App.tsx:43-45 (snap), :47-79 (getGlyphBounds),
// :81-116 (buildSmoothPathData) — that file is read-only reference and is
// never modified. These three functions were already fully decoupled from
// any character/font concept in the original, so nothing about their logic
// changed; they are simply relocated and given named exports.

import type { Stroke, Glyph, GlyphBounds } from "../../data/glyphStrokeTypes";

export function snap(value: number, grid = 25): number {
  return Math.round(value / grid) * grid;
}

export function getGlyphBounds(glyph: Glyph): GlyphBounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  glyph.strokes.forEach((stroke) => {
    stroke.points.forEach((point) => {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    });
  });

  if (minX === Infinity || minY === Infinity || maxX === -Infinity || maxY === -Infinity) {
    return null;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

export function buildSmoothPathData(stroke: Stroke, bounds?: GlyphBounds): string {
  if (stroke.points.length < 2) {
    return "";
  }

  const originX = bounds?.minX ?? 0;
  const originY = bounds?.minY ?? 0;

  let pathData = `M ${stroke.points[0].x - originX} ${stroke.points[0].y - originY}`;

  if (stroke.mode === "pen") {
    for (let i = 1; i < stroke.points.length; i++) {
      pathData += ` L ${stroke.points[i].x - originX} ${stroke.points[i].y - originY}`;
    }
    return pathData;
  }

  for (let i = 1; i < stroke.points.length - 1; i++) {
    const current = stroke.points[i];
    const next = stroke.points[i + 1];
    const midX = (current.x + next.x) / 2;
    const midY = (current.y + next.y) / 2;
    pathData += ` Q ${current.x - originX} ${current.y - originY} ${midX - originX} ${midY - originY}`;
  }

  return pathData;
}
