// Glyph Audio — live SVG preview
// (docs/glyph-audio/09_GLYPH_AUDIO_MVP_Spec.md, "Preview"). Renders the
// exact same LayoutDocument + GeneratedGlyphInstance[] that glyphSvgExport.ts
// exports, via the exact same buildArchStrokes/buildSmoothPathData call
// path, so the preview and the exported file are always the same
// centerlines (10_GLYPH_AUDIO_Acceptance_Criteria.md §9). Highlights the
// beat/glyph nearest the live playhead.
//
// Connectors and punctuation (docs/glyph-audio/0804_GLYPH_NOTES_Connection_Grammar_Spec_v0.1.0.md
// §20, §22) reuse the exact same connectorGeometry.ts/punctuationGeometry.ts
// functions glyphSvgExport.ts calls, in the same mm coordinate space,
// wrapped in a single `scale(MM_TO_PX)` transform for on-screen display —
// so preview and export always draw identical connector/punctuation
// geometry, never a re-derived approximation.

import type { ReactNode } from "react";
import type { LayoutDocument, PlacedGlyph } from "../../data/glyphLayoutTypes";
import type { GeneratedGlyphInstance } from "../../data/glyphGrammarTypes";
import type { BeatUnit } from "../../data/glyphAudioTypes";
import type { ConnectionDecision, ConnectionGrammar } from "../../data/glyphConnectionTypes";
import { buildArchStrokes } from "../../logic/glyph/archGrammar";
import { getGlyphBounds, buildSmoothPathData } from "../../logic/glyph/glyphStrokeGeometry";
import { buildConnectorPath, getArchEndpoints, placeEndpoints } from "../../logic/glyph/connectorGeometry";
import { buildPunctuationMarks } from "../../logic/glyph/punctuationGeometry";

type Props = {
  layout: LayoutDocument;
  glyphInstances: GeneratedGlyphInstance[];
  beats: BeatUnit[];
  currentTimeSeconds?: number;
  connectionDecisions?: ConnectionDecision[];
  connectionGrammar?: ConnectionGrammar;
};

const MM_TO_PX = 3; // display-only scale factor; export uses real mm units regardless

function findCurrentBeatId(beats: BeatUnit[], currentTimeSeconds: number | undefined): string | null {
  if (currentTimeSeconds == null || beats.length === 0) return null;
  let best: BeatUnit | null = null;
  for (const b of beats) {
    if (b.startSeconds <= currentTimeSeconds) best = b;
    else break;
  }
  return best?.id ?? beats[0].id;
}

export function GlyphPreviewCanvas({
  layout, glyphInstances, beats, currentTimeSeconds, connectionDecisions, connectionGrammar,
}: Props) {
  const instanceById = new Map(glyphInstances.map((g) => [g.id, g]));
  const beatByGlyphId = new Map(glyphInstances.map((g) => [g.id, g.beatUnitId]));
  const currentBeatId = findCurrentBeatId(beats, currentTimeSeconds);

  function renderGlyph(placed: PlacedGlyph, index: number) {
    const instance = instanceById.get(placed.glyphInstanceId);
    if (!instance) return null;

    const strokes = buildArchStrokes(instance.parameters);
    const bounds = getGlyphBounds({ strokes });
    if (!bounds) return null;

    const isCurrent = currentBeatId != null && beatByGlyphId.get(placed.glyphInstanceId) === currentBeatId;
    const tx = (placed.x - bounds.minX * placed.scaleX) * MM_TO_PX;
    const ty = (placed.y - bounds.minY * placed.scaleY) * MM_TO_PX;

    return (
      <g
        key={placed.glyphInstanceId || index}
        transform={`translate(${tx} ${ty}) scale(${placed.scaleX * MM_TO_PX} ${placed.scaleY * MM_TO_PX}) rotate(${placed.rotationDegrees})`}
      >
        {strokes.map((stroke, si) => {
          const d = buildSmoothPathData(stroke, bounds);
          if (!d) return null;
          return (
            <path
              key={si}
              d={d}
              fill="none"
              stroke={isCurrent ? "#38bdf8" : "#f5f5f5"}
              strokeWidth={isCurrent ? 0.6 : 0.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          );
        })}
      </g>
    );
  }

  function renderConnections() {
    if (!connectionDecisions || !connectionGrammar) return null;
    const sortedGlyphs = [...layout.placedGlyphs].sort((a, b) => a.orderIndex - b.orderIndex);
    const decisionByToPulseId = new Map(connectionDecisions.map((d) => [d.toPulseId, d]));
    const elements: ReactNode[] = [];

    for (let i = 1; i < sortedGlyphs.length; i++) {
      const prevPlaced = sortedGlyphs[i - 1];
      const currPlaced = sortedGlyphs[i];
      // Never draw a connector across rows (§12.5, §18).
      if (prevPlaced.rowIndex !== currPlaced.rowIndex) continue;

      const prevInstance = instanceById.get(prevPlaced.glyphInstanceId);
      const currInstance = instanceById.get(currPlaced.glyphInstanceId);
      if (!prevInstance || !currInstance) continue;

      const decision = decisionByToPulseId.get(currInstance.beatUnitId);
      if (!decision || decision.fromPulseId !== prevInstance.beatUnitId) continue;

      const prevBounds = getGlyphBounds({ strokes: buildArchStrokes(prevInstance.parameters) });
      const currBounds = getGlyphBounds({ strokes: buildArchStrokes(currInstance.parameters) });
      if (!prevBounds || !currBounds) continue;

      const prevEndpoints = placeEndpoints(getArchEndpoints(prevInstance.parameters), prevBounds, prevPlaced);
      const currEndpoints = placeEndpoints(getArchEndpoints(currInstance.parameters), currBounds, currPlaced);
      const isCurrent = currentBeatId != null && currInstance.beatUnitId === currentBeatId;

      if (decision.result === "connected") {
        const d = buildConnectorPath(prevEndpoints, currEndpoints, connectionGrammar);
        if (d) {
          elements.push(
            <path
              key={`conn-${decision.id}`}
              d={d}
              fill="none"
              stroke={isCurrent ? "#38bdf8" : "#f5f5f5"}
              strokeWidth={isCurrent ? 0.6 : 0.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              transform={`scale(${MM_TO_PX})`}
            />,
          );
        }
      }

      if (decision.punctuation) {
        const marks = buildPunctuationMarks(
          decision.punctuation, currEndpoints.start.x, currEndpoints.start.y, connectionGrammar, decision.id,
        );
        for (const mark of marks) {
          if (mark.type === "gap") continue;
          const r = Math.max(0.05, (mark.radius ?? connectionGrammar.punctuationDotSize) * (mark.scale ?? 1));
          elements.push(
            <circle key={mark.id} cx={mark.x * MM_TO_PX} cy={mark.y * MM_TO_PX} r={r * MM_TO_PX} fill="#f5f5f5" />,
          );
        }
      }
    }

    return elements;
  }

  return (
    <svg
      width="100%"
      style={{ background: "#050505", borderRadius: 4 }}
      viewBox={`0 0 ${layout.page.widthMm * MM_TO_PX} ${layout.page.heightMm * MM_TO_PX}`}
    >
      <rect
        x={0}
        y={0}
        width={layout.page.widthMm * MM_TO_PX}
        height={layout.page.heightMm * MM_TO_PX}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
      />
      {renderConnections()}
      {layout.placedGlyphs.map((placed, i) => renderGlyph(placed, i))}
    </svg>
  );
}
