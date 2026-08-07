// Glyph Notes — connector endpoint derivation and path generation
// (docs/glyph-audio/0804_GLYPH_NOTES_Connection_Grammar_Spec_v0.1.0.md §9, §12.1, §15).
//
// getArchEndpoints reads endpoints from the exact same buildArchStrokes
// (archGrammar.ts) the preview and SVG export already call — canonical
// glyph geometry, never inferred from rendered DOM (§12.1) — rather than
// duplicating the arch formula independently, so endpoints can never drift
// out of sync with the actual rendered stroke.
//
// buildConnectorPath is pure and deterministic: identical endpoints +
// identical grammar always produce identical path data, and it never
// throws — invalid (non-finite) input returns "" so callers can fall back
// to a break (§25 "Fall back to a break when path construction fails").

import type { GlyphBounds, Point } from "../../data/glyphStrokeTypes";
import type { ArchGrammarParameters } from "../../data/glyphGrammarTypes";
import type { ConnectionGrammar, GlyphEndpoints } from "../../data/glyphConnectionTypes";
import { buildArchStrokes } from "./archGrammar";

export function getArchEndpoints(params: ArchGrammarParameters): GlyphEndpoints {
  const points = buildArchStrokes(params)[0]?.points ?? [];
  if (points.length === 0) {
    const fallback: Point = { x: 0, y: params.baselineOffset };
    return { start: fallback, end: fallback };
  }
  if (points.length === 1) {
    return { start: points[0], end: points[0] };
  }
  return {
    start: points[0],
    end: points[points.length - 1],
    startTangent: points[1],
    endTangent: points[points.length - 2],
  };
}

// Transforms a glyph's own LOCAL endpoints (getArchEndpoints) into
// manuscript/preview coordinates, using the exact same
// translate(placed.x - bounds.minX*scaleX, ...) + scale math the
// stroke-rendering path already applies (GlyphPreviewCanvas.tsx,
// glyphSvgExport.ts) — the ONLY point at which a real, physically
// meaningful connector distance/gap exists (see connectionGrammar.ts's
// header comment on why run-formation-time endpoints cannot be compared
// this way). Called identically by preview and export so a connector
// always matches between them (§22).
export function placeEndpoints(
  endpoints: GlyphEndpoints,
  bounds: GlyphBounds,
  placed: { x: number; y: number; scaleX: number; scaleY: number },
): GlyphEndpoints {
  const tx = placed.x - bounds.minX * placed.scaleX;
  const ty = placed.y - bounds.minY * placed.scaleY;
  const transform = (p: Point): Point => ({ x: tx + p.x * placed.scaleX, y: ty + p.y * placed.scaleY });
  return {
    start: transform(endpoints.start),
    end: transform(endpoints.end),
    startTangent: endpoints.startTangent ? transform(endpoints.startTangent) : undefined,
    endTangent: endpoints.endTangent ? transform(endpoints.endTangent) : undefined,
  };
}

function isFinitePoint(p: Point | undefined): p is Point {
  return !!p && Number.isFinite(p.x) && Number.isFinite(p.y);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function buildConnectorPath(from: GlyphEndpoints, to: GlyphEndpoints, grammar: ConnectionGrammar): string {
  const p0 = from.end;
  const p1 = to.start;
  if (!isFinitePoint(p0) || !isFinitePoint(p1)) return "";

  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;

  switch (grammar.connectorMode) {
    case "straight":
      return `M ${p0.x} ${p0.y} L ${p1.x} ${p1.y}`;

    case "softSag": {
      const midX = p0.x + dx * 0.5;
      const sagY = lerp(p0.y, p1.y, 0.5) + Math.max(0, dx) * grammar.connectorSagAmount;
      if (!Number.isFinite(midX) || !Number.isFinite(sagY)) return "";
      return `M ${p0.x} ${p0.y} Q ${midX} ${sagY} ${p1.x} ${p1.y}`;
    }

    case "softRise": {
      const midX = p0.x + dx * 0.5;
      const riseY = lerp(p0.y, p1.y, 0.5) - Math.max(0, dx) * grammar.connectorRiseAmount;
      if (!Number.isFinite(midX) || !Number.isFinite(riseY)) return "";
      return `M ${p0.x} ${p0.y} Q ${midX} ${riseY} ${p1.x} ${p1.y}`;
    }

    case "tensionCurve": {
      const smoothing = Math.max(0, Math.min(1, grammar.connectorSmoothing));
      const tension = Math.max(0, Math.min(1, grammar.connectorTension));
      const c1x = p0.x + dx * tension;
      const c1y = p0.y + dy * tension * (1 - smoothing);
      const c2x = p1.x - dx * tension;
      const c2y = p1.y - dy * tension * (1 - smoothing);
      if (![c1x, c1y, c2x, c2y].every(Number.isFinite)) return "";
      return `M ${p0.x} ${p0.y} C ${c1x} ${c1y} ${c2x} ${c2y} ${p1.x} ${p1.y}`;
    }

    case "inheritNeighboringCurvature": {
      const exitDir = isFinitePoint(from.endTangent)
        ? { x: p0.x - from.endTangent.x, y: p0.y - from.endTangent.y }
        : { x: 1, y: 0 };
      const entryDir = isFinitePoint(to.startTangent)
        ? { x: to.startTangent.x - p1.x, y: to.startTangent.y - p1.y }
        : { x: -1, y: 0 };
      const reach = Math.max(0.001, Math.hypot(dx, dy)) * 0.35;
      const exitLen = Math.max(0.001, Math.hypot(exitDir.x, exitDir.y));
      const entryLen = Math.max(0.001, Math.hypot(entryDir.x, entryDir.y));
      const c1x = p0.x + (exitDir.x / exitLen) * reach;
      const c1y = p0.y + (exitDir.y / exitLen) * reach;
      const c2x = p1.x + (entryDir.x / entryLen) * reach;
      const c2y = p1.y + (entryDir.y / entryLen) * reach;
      if (![c1x, c1y, c2x, c2y].every(Number.isFinite)) return "";
      return `M ${p0.x} ${p0.y} C ${c1x} ${c1y} ${c2x} ${c2y} ${p1.x} ${p1.y}`;
    }

    default:
      return "";
  }
}
