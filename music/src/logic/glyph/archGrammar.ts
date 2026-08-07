// Glyph Audio — Arch Script v1 geometry
// (docs/glyph-audio/06_GLYPH_AUDIO_Glyph_Grammar_01.md). Two
// responsibilities: turning ArchGrammarParameters into monoline stroke
// geometry (buildArchStrokes), and composing the mapping-evaluation +
// handmade-deformation pipeline into one GeneratedGlyphInstance per beat
// (generateGlyphInstances) — the one place that pipeline runs, so the live
// preview and the SVG export call the exact same function and therefore
// always produce identical centerlines
// (10_GLYPH_AUDIO_Acceptance_Criteria.md §9).
//
// Local coordinate convention for buildArchStrokes: baseline at y = 0;
// positive `height` extends upward, i.e. negative y (a y-down SVG system
// renders this as a peak above the baseline once placed by layout). x runs
// left -> right from 0 to `width`. dotEnabled/dotSize/dotOffset exist on
// ArchGrammarParameters but are not consumed here — dot punctuation is tied
// to boundary-rule evaluation, deferred past this slice
// (13_GLYPH_AUDIO_Consolidated_Implementation_Plan.md §8).

import type { Point, Stroke } from "../../data/glyphStrokeTypes";
import type { ArchGrammarParameters, GeneratedGlyphInstance, GlyphGrammar } from "../../data/glyphGrammarTypes";
import type { GlyphParameterSet } from "../../data/glyphMappingTypes";
import type { BeatUnit } from "../../data/glyphAudioTypes";
import type { MappingPreset } from "../../data/glyphMappingTypes";
import { evaluateMappingForBeat } from "./mappingEvaluation";
import { applyHandmadeDeformation } from "./handmadeDeformation";

export function buildArchStrokes(params: ArchGrammarParameters): Stroke[] {
  const archCount = Math.max(1, Math.min(6, Math.round(params.archCount)));
  const sharpness = Math.max(0, Math.min(1, params.curveSharpness));
  const width = Math.max(0.01, params.width);
  const archWidth = width / archCount;
  const peakY = -params.height * (1 - Math.max(0, Math.min(1, params.localCompression)) * 0.3);

  const points: Point[] = [];

  // Entry stroke — a short overshoot below the baseline before the first
  // arch begins, per the grammar's entryOvershoot parameter.
  points.push({ x: -params.entryOvershoot, y: params.entryOvershoot * 0.4 });
  points.push({ x: 0, y: params.baselineOffset });

  for (let i = 0; i < archCount; i++) {
    const footLeftX = i * archWidth;
    const footRightX = (i + 1) * archWidth;
    const localAsymmetry = params.asymmetry * (i % 2 === 0 ? 1 : -1);
    const rawPeakX = footLeftX + archWidth * (0.5 + localAsymmetry * 0.15);
    // Clamped inside [footLeftX, footRightX] so x stays strictly
    // non-decreasing across the whole stroke — the structural guarantee
    // against self-intersection (10_GLYPH_AUDIO_Acceptance_Criteria.md §6).
    const peakX = Math.max(footLeftX, Math.min(footRightX, rawPeakX));

    // Shape continuum (06_GLYPH_AUDIO_Glyph_Grammar_01.md, "Shape
    // continuum"): rounded/sine-like below 0.35 (several interpolated
    // points along a smooth arc), pointed/triangle-like between 0.35 and
    // 0.75 (a single sharp peak point), clipped/square-like at 0.75+ (a
    // short flat plateau at the peak instead of one point).
    if (sharpness < 0.35) {
      const shoulderSteps = 4;
      for (let s = 1; s <= shoulderSteps; s++) {
        const t = s / (shoulderSteps + 1);
        const angle = t * Math.PI;
        points.push({
          x: footLeftX + (footRightX - footLeftX) * t,
          y: peakY * Math.sin(angle),
        });
      }
    } else if (sharpness < 0.75) {
      points.push({ x: peakX, y: peakY });
    } else {
      const plateauHalfWidth = archWidth * 0.12 * ((sharpness - 0.75) / 0.25 + 0.3);
      points.push({ x: Math.max(footLeftX, peakX - plateauHalfWidth), y: peakY });
      points.push({ x: Math.min(footRightX, peakX + plateauHalfWidth), y: peakY });
    }

    points.push({ x: footRightX, y: params.baselineOffset });
  }

  // Exit stroke — mirrors the entry overshoot.
  points.push({ x: width + params.exitOvershoot, y: params.exitOvershoot * 0.4 });

  return [{ points, mode: "freehand" }];
}

function archParametersToParameterSet(p: ArchGrammarParameters): GlyphParameterSet {
  return {
    height: p.height,
    width: p.width,
    curveSharpness: p.curveSharpness,
    archCount: p.archCount,
    baselineOffset: p.baselineOffset,
    spacingBefore: 0,
    spacingAfter: 0,
    connectorLength: p.connectorLength,
    connectorSag: p.connectorSag,
    dotSize: p.dotSize,
    dotOffset: p.dotOffset,
    asymmetry: p.asymmetry,
    localCompression: p.localCompression,
    handmadeVariance: p.handmadeVariance,
  };
}

// Fields on ArchGrammarParameters that GlyphParameterSet has no target for
// (entryOvershoot, exitOvershoot, dotEnabled) are preserved from the
// grammar's own base parameters — a mapping rule can never touch them,
// which is correct: they aren't in VisualTargetProperty at all.
function parameterSetToArchParameters(base: ArchGrammarParameters, mapped: GlyphParameterSet): ArchGrammarParameters {
  return {
    ...base,
    height: mapped.height,
    width: mapped.width,
    curveSharpness: mapped.curveSharpness,
    archCount: Math.max(1, Math.round(mapped.archCount)),
    baselineOffset: mapped.baselineOffset,
    connectorLength: mapped.connectorLength,
    connectorSag: mapped.connectorSag,
    dotSize: mapped.dotSize,
    dotOffset: mapped.dotOffset,
    asymmetry: mapped.asymmetry,
    localCompression: mapped.localCompression,
    handmadeVariance: mapped.handmadeVariance,
  };
}

export function generateGlyphInstances(
  beats: BeatUnit[],
  preset: MappingPreset,
  grammar: GlyphGrammar,
  seed: number,
): GeneratedGlyphInstance[] {
  const baseParams = archParametersToParameterSet(grammar.defaultParameters);

  return beats.map((beat, index) => {
    const { parameters: mapped } = evaluateMappingForBeat(beat, preset, baseParams);
    const merged = parameterSetToArchParameters(grammar.defaultParameters, mapped);
    const deformed = applyHandmadeDeformation(merged, seed, index);

    return {
      id: `glyph-${beat.id}`,
      beatUnitId: beat.id,
      grammarId: "arch-script-v1",
      parameters: deformed,
      seed,
    };
  });
}
