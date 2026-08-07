// Glyph Audio — pure, model-driven SVG export
// (docs/glyph-audio/09_GLYPH_AUDIO_MVP_Spec.md, "SVG export";
// 10_GLYPH_AUDIO_Acceptance_Criteria.md §9). No DOM access anywhere in this
// file — it is a pure `(LayoutDocument, glyph instances, RenderProfile,
// metadata) -> string` function, never a scrape of an on-screen node (the
// one thing apps/glyphlab-reference/src/App.tsx:244-267's exportSVG got
// wrong for this purpose). Calls the exact same buildArchStrokes
// (archGrammar.ts) the live preview calls, so exported centerlines always
// match the preview.

import type { LayoutDocument, PlacedGlyph } from "../../data/glyphLayoutTypes";
import type { GeneratedGlyphInstance } from "../../data/glyphGrammarTypes";
import type { RenderProfile } from "../../data/glyphCompositionTypes";
import type { ConnectionDecision, ConnectionGrammar } from "../../data/glyphConnectionTypes";
import { buildArchStrokes } from "./archGrammar";
import { getGlyphBounds, buildSmoothPathData } from "./glyphStrokeGeometry";
import { buildConnectorPath, getArchEndpoints, placeEndpoints } from "./connectorGeometry";
import { buildPunctuationMarks } from "./punctuationGeometry";

export const GLYPH_SVG_RENDERER_VERSION = "glyph-svg-export-v1";

export type GlyphSvgMetadata = {
  compositionId: string;
  analysisId: string;
  mappingPresetId: string;
  grammarId: string;
  layoutPresetId: string;
  seed: number;
  rendererVersion: string;
};

// Optional — connectors/punctuation only render when both are supplied
// (a composition saved before the Connection Grammar build has neither).
export type GlyphSvgConnections = {
  decisions: ConnectionDecision[];
  grammar: ConnectionGrammar;
};

function buildConnectorsAndPunctuation(
  sortedGlyphs: PlacedGlyph[],
  instanceById: Map<string, GeneratedGlyphInstance>,
  connections: GlyphSvgConnections,
  strokeColor: string,
  strokeWidthMm: number,
  dotRadiusMm: number,
): string {
  const decisionByToPulseId = new Map(connections.decisions.map((d) => [d.toPulseId, d]));
  const parts: string[] = [];

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

    const prevPlacedEndpoints = placeEndpoints(getArchEndpoints(prevInstance.parameters), prevBounds, prevPlaced);
    const currPlacedEndpoints = placeEndpoints(getArchEndpoints(currInstance.parameters), currBounds, currPlaced);

    if (decision.result === "connected") {
      const d = buildConnectorPath(prevPlacedEndpoints, currPlacedEndpoints, connections.grammar);
      if (d) {
        parts.push(
          `<path d="${d}" fill="none" stroke="${strokeColor}" stroke-width="${strokeWidthMm}" stroke-linecap="round" stroke-linejoin="round" />`,
        );
      }
    }

    if (decision.punctuation) {
      const marks = buildPunctuationMarks(
        decision.punctuation, currPlacedEndpoints.start.x, currPlacedEndpoints.start.y, connections.grammar, decision.id,
      );
      for (const mark of marks) {
        if (mark.type === "gap") continue;
        const r = Math.max(0.05, (mark.radius ?? dotRadiusMm) * (mark.scale ?? 1));
        parts.push(`<circle cx="${mark.x}" cy="${mark.y}" r="${r}" fill="${strokeColor}" />`);
      }
    }
  }

  return parts.join("\n");
}

export function buildGlyphSvgDocument(
  layout: LayoutDocument,
  glyphInstances: GeneratedGlyphInstance[],
  renderProfile: RenderProfile,
  metadata: GlyphSvgMetadata,
  connections?: GlyphSvgConnections,
): string {
  const instanceById = new Map(glyphInstances.map((g) => [g.id, g]));

  // Deterministic path order — placedGlyphs is consumed in orderIndex
  // order exactly as manuscriptLayout.ts produced it, never re-sorted.
  const sortedGlyphs = [...layout.placedGlyphs].sort((a, b) => a.orderIndex - b.orderIndex);

  const groups = sortedGlyphs
    .map((placed) => {
      const instance = instanceById.get(placed.glyphInstanceId);
      if (!instance) return "";

      const strokes = buildArchStrokes(instance.parameters);
      const bounds = getGlyphBounds({ strokes });
      if (!bounds) return "";

      const paths = strokes
        .map((stroke) => {
          const d = buildSmoothPathData(stroke, bounds);
          if (!d) return "";
          return `<path d="${d}" fill="none" stroke="${renderProfile.strokeColor}" stroke-width="${renderProfile.strokeWidthMm}" stroke-linecap="round" stroke-linejoin="round" />`;
        })
        .filter(Boolean)
        .join("");

      if (!paths) return "";

      const tx = placed.x - bounds.minX * placed.scaleX;
      const ty = placed.y - bounds.minY * placed.scaleY;
      return `<g transform="translate(${tx} ${ty}) scale(${placed.scaleX} ${placed.scaleY}) rotate(${placed.rotationDegrees})">${paths}</g>`;
    })
    .filter(Boolean)
    .join("\n");

  const connectorsAndPunctuation = connections
    ? buildConnectorsAndPunctuation(
        sortedGlyphs, instanceById, connections,
        renderProfile.strokeColor, renderProfile.strokeWidthMm, renderProfile.dotRadiusMm,
      )
    : "";

  const metaComment =
    `glyph-audio-export composition:${metadata.compositionId} analysis:${metadata.analysisId} ` +
    `mapping:${metadata.mappingPresetId} grammar:${metadata.grammarId} layout:${metadata.layoutPresetId} ` +
    `seed:${metadata.seed} renderer:${metadata.rendererVersion}`;

  // width/height carry physical mm units; viewBox uses the same numeric
  // extents, so 1 user unit == 1mm — the acceptance-criterion requirement
  // that width/height and viewBox use matching physical units
  // (10_GLYPH_AUDIO_Acceptance_Criteria.md §9). fill="none" on every path,
  // monochrome stroke, round caps/joins, no <text>, no filters, no raster.
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.page.widthMm}mm" height="${layout.page.heightMm}mm" viewBox="0 0 ${layout.page.widthMm} ${layout.page.heightMm}">\n` +
    `<!-- ${metaComment} -->\n` +
    `${groups}\n` +
    (connectorsAndPunctuation ? `${connectorsAndPunctuation}\n` : "") +
    `</svg>`
  );
}

// Full Canvas / Pulse Truth / Drum Layer
// (docs/glyph-audio/0804_GLYPH_NOTES_Full_Canvas_Pulse_Truth_Drum_Layer_Spec_v0.1.0.md §23)
// — a SEPARATE export function for the new pulse-truth-driven pipeline,
// rather than folding it into buildGlyphSvgDocument above (which stays
// exactly as 0804B left it, serving any composition still on the
// manuscriptRows-layout pipeline). Continuous-path geometry already lives
// in placed, absolute canvas coordinates (fullCanvasLayout.ts), so this
// function only assembles the required layer groups — it builds no
// geometry of its own. Required layer order per §23:
//   <g id="pulse-manuscript"> <g id="bar-punctuation">
//   <g id="drum-events">      <g id="section-markers">

import { pathCommandsToSvgPathData } from "./continuousGlyphRuns";
import { buildOscillationLinePath, buildSegmentedBeamMarks } from "./laserLayerGeometry";
import { resolveColorPalette } from "./glyphColorPresets";
import type { FullCanvasLayoutResult, GlyphCanvasPreset } from "../../data/glyphCanvasTypes";
import type { GlyphLayerVisibility, GlyphColorMode } from "../../data/glyphCompositionTypes";
import type { GlyphPlacedEvent } from "../../data/glyphEventVocabularyTypes";
import type { LaserPlacedSegment, LaserRenderSettings } from "../../data/glyphLaserLayerTypes";
import type { DrumMark } from "./drumLayerLayout";

// v3 (0804E, docs/glyph-audio/0804_GLYPH_NOTES_Event_Vocabulary_Laser_Layer_Spec_v0.1.0.md)
// — adds clap/accent/laser layer groups and color-mode resolution. Bumped
// so any cache/hash keyed on this version correctly treats pre-0804E
// output as stale, per the "preserve deterministic cache behavior"
// requirement (a real output-shape change must produce a different cache
// key, not silently reuse the old one).
export const GLYPH_FULL_CANVAS_RENDERER_VERSION = "glyph-full-canvas-export-v3";

export type FullCanvasSvgMetadata = {
  compositionId: string;
  analysisId: string;
  confirmedBpm: number;
  canvasShape: string;
  drumSource: string | null;
  laserSource: string | null;
  colorMode: GlyphColorMode;
  seed: number;
  rendererVersion: string;
};

export function buildFullCanvasSvgDocument(
  canvas: GlyphCanvasPreset,
  layout: FullCanvasLayoutResult,
  drumMarks: DrumMark[],
  placedEvents: GlyphPlacedEvent[],
  laserSegments: LaserPlacedSegment[],
  laserRenderSettings: LaserRenderSettings,
  layerVisibility: GlyphLayerVisibility,
  renderProfile: RenderProfile,
  metadata: FullCanvasSvgMetadata,
): string {
  const toMm = (v: number) => v * canvas.unitsToMm;
  const widthMm = toMm(canvas.widthUnits);
  const heightMm = toMm(canvas.heightUnits);

  // Every coordinate in `layout` is in canvas UNITS — the physical export
  // uses unitsToMm as the SVG's user-unit scale (a top-level group
  // transform), so path data itself never needs per-coordinate rescaling.
  const unitScale = canvas.unitsToMm;
  // The ONLY place this function reads actual color values from — see
  // glyphColorPresets.ts's header comment. Geometry (paths/points/marks)
  // is computed entirely upstream, color-agnostic; this function only
  // paints it.
  const palette = resolveColorPalette(metadata.colorMode);

  const backgroundRect = metadata.colorMode === "cover"
    ? `<rect x="0" y="0" width="${canvas.widthUnits}" height="${canvas.heightUnits}" fill="${palette.background}" />\n`
    : "";

  const pulseManuscriptGroup = layerVisibility.pulseManuscript
    ? layout.placedRuns
        .map((run) => {
          const d = pathCommandsToSvgPathData(run.pathCommands);
          if (!d) return "";
          return `<path d="${d}" fill="none" stroke="${palette.pulseManuscript}" stroke-width="${renderProfile.strokeWidthMm / unitScale}" stroke-linecap="round" stroke-linejoin="round" />`;
        })
        .filter(Boolean)
        .join("\n")
    : "";

  // 0804D — bars are silent spacing now, never a dot; this group stays in
  // the document (empty) purely to preserve §23's required layer order for
  // anything downstream that expects it.
  const barPunctuationGroup = "";

  const drumEventsGroup = layerVisibility.drumEvents
    ? drumMarks
        .map((m) => `<line x1="${m.point.x}" y1="${m.point.y}" x2="${m.point.x}" y2="${m.point.y - m.height}" stroke="${palette.drums}" stroke-width="${Math.max(0.02, renderProfile.strokeWidthMm / unitScale / 2)}" stroke-linecap="round" />`)
        .join("\n")
    : "";

  // §7/§17 — open ring, optional faint halo when confidence is high.
  const clapEventsGroup = layerVisibility.clapEvents
    ? placedEvents
        .filter((e) => e.family === "clap")
        .map((e) => {
          const strokeWidth = Math.max(0.02, renderProfile.strokeWidthMm / unitScale);
          const halo = e.symbol.haloEnabled
            ? `<circle cx="${e.point.x}" cy="${e.point.y}" r="${e.symbol.radius * 1.8}" fill="none" stroke="${palette.clapRings}" stroke-width="${strokeWidth / 2}" opacity="0.25" />`
            : "";
          return `${halo}<circle cx="${e.point.x}" cy="${e.point.y}" r="${e.symbol.radius}" fill="none" stroke="${palette.clapRings}" stroke-width="${strokeWidth}" />`;
        })
        .join("\n")
    : "";

  // §7 — larger filled dot or larger ring; avoid decorative complexity.
  const accentEventsGroup = layerVisibility.accentEvents
    ? placedEvents
        .filter((e) => e.family === "accent")
        .map((e) => {
          if (e.symbol.shape === "ring") {
            const strokeWidth = Math.max(0.02, (renderProfile.strokeWidthMm / unitScale) * 1.4);
            return `<circle cx="${e.point.x}" cy="${e.point.y}" r="${e.symbol.radius}" fill="none" stroke="${palette.clapRings}" stroke-width="${strokeWidth}" />`;
          }
          return `<circle cx="${e.point.x}" cy="${e.point.y}" r="${e.symbol.radius}" fill="${palette.drums}" />`;
        })
        .join("\n")
    : "";

  // §9/§17 — one deterministic laser path (or beam-mark group) per placed
  // row segment, never connecting across rows (laserSegments already
  // enforces this — see laserLayerLayout.ts).
  const laserLayerGroup = layerVisibility.laserLayer
    ? laserSegments
        .map((seg) => {
          const strokeWidth = Math.max(0.02, laserRenderSettings.strokeWidth / unitScale);
          if (laserRenderSettings.mode === "segmentedBeam") {
            return buildSegmentedBeamMarks(seg, laserRenderSettings)
              .map((m) => `<line x1="${m.x}" y1="${m.y}" x2="${m.x}" y2="${m.y - m.height}" stroke="${palette.laser}" stroke-width="${strokeWidth}" stroke-linecap="round" opacity="${Math.max(0.15, m.opacity).toFixed(2)}" />`)
              .join("\n");
          }
          const d = pathCommandsToSvgPathData(buildOscillationLinePath(seg, laserRenderSettings));
          if (!d) return "";
          return `<path d="${d}" fill="none" stroke="${palette.laser}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" />`;
        })
        .join("\n")
    : "";

  const sectionMarkersGroup = layerVisibility.sections
    ? layout.sectionStartPoints
        .map((s) => `<line x1="${s.point.x}" y1="${layout.safeBounds.minY}" x2="${s.point.x}" y2="${layout.safeBounds.maxY}" stroke="${palette.pulseManuscript}" stroke-width="${Math.max(0.01, renderProfile.strokeWidthMm / unitScale / 4)}" stroke-dasharray="2,2" opacity="0.3" />`)
        .join("\n")
    : "";

  const safeAreaGroup = layerVisibility.safeArea
    ? `<rect x="${layout.safeBounds.minX}" y="${layout.safeBounds.minY}" width="${layout.safeBounds.width}" height="${layout.safeBounds.height}" fill="none" stroke="${palette.pulseManuscript}" stroke-width="${Math.max(0.01, renderProfile.strokeWidthMm / unitScale / 4)}" opacity="0.15" />`
    : "";

  const metaComment =
    `glyph-full-canvas-export composition:${metadata.compositionId} analysis:${metadata.analysisId} ` +
    `bpm:${metadata.confirmedBpm} canvas:${metadata.canvasShape} drums:${metadata.drumSource ?? "none"} ` +
    `laser:${metadata.laserSource ?? "none"} color:${metadata.colorMode} ` +
    `seed:${metadata.seed} renderer:${metadata.rendererVersion}`;

  // width/height in physical mm; viewBox spans the canvas in its own
  // logical units, scaled to mm via a single top-level <g transform> —
  // 1 viewBox unit corresponds to unitsToMm mm, so width/height and viewBox
  // stay in exact physical correspondence (§23 "physical dimensions in
  // millimeters"). fill="none" line paths, round caps/joins, no text, no
  // filters, no raster — same acceptance rules as the manuscriptRows
  // exporter above.
  // §17 required group order: pulse-manuscript, bar-punctuation,
  // drum-events, clap-events, accent-events, laser-layer, section-markers.
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${widthMm}mm" height="${heightMm}mm" viewBox="0 0 ${canvas.widthUnits} ${canvas.heightUnits}">\n` +
    `<!-- ${metaComment} -->\n` +
    backgroundRect +
    `<g id="pulse-manuscript">${pulseManuscriptGroup}</g>\n` +
    `<g id="bar-punctuation">${barPunctuationGroup}</g>\n` +
    `<g id="drum-events">${drumEventsGroup}</g>\n` +
    `<g id="clap-events">${clapEventsGroup}</g>\n` +
    `<g id="accent-events">${accentEventsGroup}</g>\n` +
    `<g id="laser-layer">${laserLayerGroup}</g>\n` +
    `<g id="section-markers">${sectionMarkersGroup}${safeAreaGroup}</g>\n` +
    `</svg>`
  );
}
