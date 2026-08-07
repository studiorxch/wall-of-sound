// Glyph Notes — Full Canvas live preview
// (docs/glyph-audio/0804_GLYPH_NOTES_Full_Canvas_Pulse_Truth_Drum_Layer_Spec_v0.1.0.md §11.4, §17, §20;
// event/laser layers + color modes added by 0804E,
// docs/glyph-audio/0804_GLYPH_NOTES_Event_Vocabulary_Laser_Layer_Spec_v0.1.0.md).
// Renders the exact same FullCanvasLayoutResult + drum marks + placed
// events + laser segments that glyphSvgExport.ts's buildFullCanvasSvgDocument
// exports, via the same pathCommandsToSvgPathData/buildOscillationLinePath/
// buildSegmentedBeamMarks functions and the same resolveColorPalette lookup
// — so preview and export are always the same geometry AND the same color
// (§19/§21.15). `fitCanvas` (default) keeps the entire canvas boundary
// visible with no internal scrollbars, per §11.4.

import type { GlyphCanvasPreset, FullCanvasLayoutResult, GlyphViewportMode } from "../../data/glyphCanvasTypes";
import type { GlyphLayerVisibility, GlyphColorMode } from "../../data/glyphCompositionTypes";
import type { GlyphPlacedEvent } from "../../data/glyphEventVocabularyTypes";
import type { LaserPlacedSegment, LaserRenderSettings } from "../../data/glyphLaserLayerTypes";
import type { DrumMark } from "../../logic/glyph/drumLayerLayout";
import { pathCommandsToSvgPathData } from "../../logic/glyph/continuousGlyphRuns";
import { buildOscillationLinePath, buildSegmentedBeamMarks } from "../../logic/glyph/laserLayerGeometry";
import { resolveColorPalette } from "../../logic/glyph/glyphColorPresets";
import { timeToCanvasPosition } from "../../logic/glyph/timeToCanvasPosition";

type Props = {
  canvas: GlyphCanvasPreset;
  layout: FullCanvasLayoutResult;
  drumMarks: DrumMark[];
  placedEvents: GlyphPlacedEvent[];
  laserSegments: LaserPlacedSegment[];
  laserRenderSettings: LaserRenderSettings;
  colorMode: GlyphColorMode;
  layerVisibility: GlyphLayerVisibility;
  viewportMode: GlyphViewportMode;
  currentTimeSeconds?: number;
};

export function GlyphFullCanvasPreview({
  canvas, layout, drumMarks, placedEvents, laserSegments, laserRenderSettings, colorMode,
  layerVisibility, viewportMode, currentTimeSeconds,
}: Props) {
  const currentPoint = currentTimeSeconds != null ? timeToCanvasPosition(currentTimeSeconds, layout) : null;
  const palette = resolveColorPalette(colorMode);

  // Monochrome strokes match the SVG export's implicit light/print backing
  // (no background rect drawn — see glyphSvgExport.ts), so the preview's own
  // chrome must sit on a light backdrop in that mode or the marks vanish
  // against the app's dark UI. Cover mode already paints its own dark
  // palette.background rect inside the SVG, so the wrapper stays dark there.
  const containerBackground = colorMode === "cover" ? "#050505" : "#f2f0ea";

  // fitCanvas: the SVG's own viewBox always spans the full canvas, and the
  // element itself never exceeds its container — "no internal scrollbars,"
  // the whole boundary is always visible, by construction of the viewBox
  // scaling behavior. fitWidth/actualSize adjust only the ELEMENT's own
  // rendered size relative to its container, never the underlying geometry.
  const svgStyle =
    viewportMode === "actualSize"
      ? { width: canvas.widthUnits, height: canvas.heightUnits, maxWidth: "none" as const }
      : viewportMode === "fitWidth"
        ? { width: "100%", height: "auto" as const }
        : { width: "100%", height: "100%", maxHeight: "70vh" };

  return (
    <div style={{ overflow: viewportMode === "actualSize" ? "auto" : "hidden", background: containerBackground, borderRadius: 4 }}>
      <svg
        viewBox={`0 0 ${canvas.widthUnits} ${canvas.heightUnits}`}
        style={{ ...svgStyle, display: "block" }}
        preserveAspectRatio="xMidYMid meet"
      >
        {colorMode === "cover" && (
          <rect x={0} y={0} width={canvas.widthUnits} height={canvas.heightUnits} fill={palette.background} />
        )}

        {layerVisibility.safeArea && (
          <rect
            x={layout.safeBounds.minX} y={layout.safeBounds.minY}
            width={layout.safeBounds.width} height={layout.safeBounds.height}
            fill="none" stroke="rgba(255,255,255,0.15)" strokeDasharray="6,6"
          />
        )}

        {layerVisibility.sections && layout.sectionStartPoints.map((s, i) => (
          <line
            key={`section-${i}`}
            x1={s.point.x} y1={layout.safeBounds.minY} x2={s.point.x} y2={layout.safeBounds.maxY}
            stroke="rgba(56,189,248,0.25)" strokeDasharray="4,4"
          />
        ))}

        {layerVisibility.pulseManuscript && layout.placedRuns.map((run) => {
          const isCurrentRun = currentPoint != null && run.pulsePoints.some((p) => p.point.x === currentPoint.x && p.point.y === currentPoint.y);
          const d = pathCommandsToSvgPathData(run.pathCommands);
          if (!d) return null;
          return (
            <path
              key={run.id} d={d} fill="none"
              stroke={isCurrentRun ? "#38bdf8" : palette.pulseManuscript}
              strokeWidth={Math.max(1, canvas.widthUnits / 1500)}
              strokeLinecap="round" strokeLinejoin="round"
            />
          );
        })}

        {layerVisibility.drumEvents && drumMarks.map((m) => (
          <line
            key={m.eventId} x1={m.point.x} y1={m.point.y} x2={m.point.x} y2={m.point.y - m.height}
            stroke={palette.drums} strokeWidth={Math.max(1, canvas.widthUnits / 2000)} strokeLinecap="round"
          />
        ))}

        {layerVisibility.clapEvents && placedEvents.filter((e) => e.family === "clap").map((e) => (
          <g key={e.eventId}>
            {e.symbol.haloEnabled && (
              <circle cx={e.point.x} cy={e.point.y} r={e.symbol.radius * 1.8} fill="none" stroke={palette.clapRings} strokeWidth={Math.max(0.5, canvas.widthUnits / 4000)} opacity={0.25} />
            )}
            <circle cx={e.point.x} cy={e.point.y} r={e.symbol.radius} fill="none" stroke={palette.clapRings} strokeWidth={Math.max(1, canvas.widthUnits / 2000)} />
          </g>
        ))}

        {layerVisibility.accentEvents && placedEvents.filter((e) => e.family === "accent").map((e) => (
          e.symbol.shape === "ring"
            ? <circle key={e.eventId} cx={e.point.x} cy={e.point.y} r={e.symbol.radius} fill="none" stroke={palette.clapRings} strokeWidth={Math.max(1.4, canvas.widthUnits / 1400)} />
            : <circle key={e.eventId} cx={e.point.x} cy={e.point.y} r={e.symbol.radius} fill={palette.drums} />
        ))}

        {layerVisibility.laserLayer && laserSegments.map((seg) => {
          if (laserRenderSettings.mode === "segmentedBeam") {
            return buildSegmentedBeamMarks(seg, laserRenderSettings).map((m, i) => (
              <line
                key={`${seg.id}-${i}`} x1={m.x} y1={m.y} x2={m.x} y2={m.y - m.height}
                stroke={palette.laser} strokeWidth={Math.max(0.5, canvas.widthUnits / 3000)} strokeLinecap="round"
                opacity={Math.max(0.15, m.opacity)}
              />
            ));
          }
          const d = pathCommandsToSvgPathData(buildOscillationLinePath(seg, laserRenderSettings));
          if (!d) return null;
          return (
            <path key={seg.id} d={d} fill="none" stroke={palette.laser} strokeWidth={Math.max(0.6, canvas.widthUnits / 2500)} strokeLinecap="round" strokeLinejoin="round" />
          );
        })}

        {currentPoint && (
          <circle cx={currentPoint.x} cy={currentPoint.y} r={Math.max(3, canvas.widthUnits / 500)} fill="#38bdf8" />
        )}
      </svg>
    </div>
  );
}
