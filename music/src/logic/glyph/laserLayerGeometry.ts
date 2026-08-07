// Glyph Notes — Laser layer geometry
// (docs/glyph-audio/0804_GLYPH_NOTES_Event_Vocabulary_Laser_Layer_Spec_v0.1.0.md §9).
//
// Pure geometry — no color. Produces either a continuous oscillating path
// (oscillationLine) or discrete tick marks (segmentedBeam) from already-
// placed LaserPlacedSegment points (laserLayerLayout.ts). "Opacity"/
// "intensity" here are numeric render-intensity scalars (the same kind of
// number RenderProfile's strokeWidthMm/dotRadiusMm already are), never
// colors — actual stroke color is resolved only by the interface/export
// layer via GlyphColorMode, per the pre-implementation review's
// color-agnostic-geometry correction.

import type { GlyphPathCommand } from "../../data/glyphConnectionTypes";
import type { LaserPlacedSegment, LaserRenderSettings } from "../../data/glyphLaserLayerTypes";

export type LaserBeamMark = {
  x: number;
  y: number;
  height: number;
  opacity: number;
};

// §9 oscillationLine mapping: time -> path position (x/y already placed);
// modulationAmount -> oscillation amplitude; modulationRate -> wavelength
// (a higher rate compresses the wobble's per-point phase step, reading as
// a shorter wavelength); activity -> the point's own intensity, carried
// through unchanged for the render layer's opacity/visibility mapping.
export function buildOscillationLinePath(
  segment: LaserPlacedSegment,
  settings: Pick<LaserRenderSettings, "amplitude" | "smoothing">,
): GlyphPathCommand[] {
  const points = segment.points;
  if (points.length === 0) return [];
  if (points.length === 1) {
    const p = points[0];
    return [{ type: "M", x: p.x, y: p.y }, { type: "L", x: p.x, y: p.y }];
  }

  let phase = 0;
  const commands: GlyphPathCommand[] = [{ type: "M", x: points[0].x, y: points[0].y }];
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    // modulationRate in [0,1] controls the phase step per point — a higher
    // rate advances phase faster, reading as a shorter wavelength.
    phase += 0.3 + p.modulationRate * 1.2;
    const amplitude = settings.amplitude * p.modulationAmount * (0.4 + settings.smoothing * 0.6);
    const wobble = Math.sin(phase) * amplitude;
    commands.push({ type: "L", x: p.x, y: p.y + wobble });
  }
  return commands;
}

// §9 segmentedBeam mapping: activity -> segment presence (only
// above-threshold points ever reach this function, via laserLayerLayout.ts
// filtering); strength/activity -> segment size; modulation -> vertical
// displacement.
export function buildSegmentedBeamMarks(
  segment: LaserPlacedSegment,
  settings: Pick<LaserRenderSettings, "amplitude">,
): LaserBeamMark[] {
  return segment.points.map((p) => ({
    x: p.x,
    y: p.y - p.modulationAmount * settings.amplitude * 0.5,
    height: Math.max(1, p.activity * settings.amplitude * 4),
    opacity: p.intensity,
  }));
}
