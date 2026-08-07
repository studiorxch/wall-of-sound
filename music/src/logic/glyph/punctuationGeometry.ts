// Glyph Notes — punctuation mark geometry
// (docs/glyph-audio/0804_GLYPH_NOTES_Connection_Grammar_Spec_v0.1.0.md §16).
// Pure and deterministic: no RNG anywhere — "deterministic spacing" for a
// dot cluster means a fixed offset pattern, not a jittered one (handmade
// jitter is exclusively handmadeDeformation.ts's job, applied earlier in
// the pipeline to glyph parameters, never here). "gap" intentionally
// returns no marks at all (§16 "No path. Adds layout spacing.") — spacing
// itself is a manuscriptLayout.ts concern.

import type { ConnectionGrammar, PunctuationMark, PunctuationType } from "../../data/glyphConnectionTypes";

const MIN_RADIUS = 0.05;

export function buildPunctuationMarks(
  type: PunctuationType,
  x: number,
  y: number,
  grammar: ConnectionGrammar,
  sourceBoundaryId: string,
): PunctuationMark[] {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return [];

  const dotRadius = Math.max(MIN_RADIUS, grammar.punctuationDotSize * 0.5);

  switch (type) {
    case "gap":
      return [];

    case "dot":
      return [{ id: `punct-${sourceBoundaryId}-dot`, type: "dot", x, y, radius: dotRadius, sourceBoundaryId }];

    case "dotCluster": {
      // Two or three dots with deterministic spacing (§16) — three dots
      // centered on the boundary point, spaced by the grammar's own dot
      // size so larger dot presets naturally spread the cluster wider.
      const spacing = Math.max(MIN_RADIUS * 2, grammar.punctuationDotSize * 1.5);
      const clusterRadius = Math.max(MIN_RADIUS, dotRadius * 0.7);
      return [-1, 0, 1].map((slot) => ({
        id: `punct-${sourceBoundaryId}-dotCluster-${slot + 1}`,
        type: "dotCluster" as const,
        x: x + slot * spacing,
        y,
        radius: clusterRadius,
        sourceBoundaryId,
      }));
    }

    case "restMark": {
      // Reserved for later temporal-mode/long-silence representation (§16)
      // — deferred from v1 UI controls (§30), but the geometry itself is a
      // real, deterministic, plot-safe mark (a scaled cross), not a stub.
      const scale = Math.max(MIN_RADIUS, grammar.restMarkScale);
      return [{ id: `punct-${sourceBoundaryId}-restMark`, type: "restMark", x, y, scale, sourceBoundaryId }];
    }

    default:
      return [];
  }
}
