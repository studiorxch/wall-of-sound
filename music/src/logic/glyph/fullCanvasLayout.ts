// Glyph Notes — Full Canvas layout
// (docs/glyph-audio/0804_GLYPH_NOTES_Full_Canvas_Pulse_Truth_Drum_Layer_Spec_v0.1.0.md §11-12;
// row-count/gap accounting revised by 0804D,
// docs/glyph-audio/0804_GLYPH_NOTES_Silent_Bar_Spacing_Event_Dot_Reassignment_Spec_v0.1.0.md).
//
// Auto-fit algorithm (§12): try the largest pulse width that lets every
// pulse fit inside the safe area; if none does, use the minimum width
// anyway (never drop a pulse — "fail closed if any pulse is missing" means
// fail closed on MISSING pulses, not on rendering at all) and report the
// resulting overflow honestly via warnings/allPulsesVisible.
//
// Row wrapping (0804D correction): a run's own archGeometries already carry
// bar/phrase gap offsets baked into their x-coordinates by
// continuousGlyphRuns.ts — a fixed "N pulses per row" count is therefore NO
// LONGER a safe way to decide row boundaries, since the same pulse count
// now spans a WIDER real distance whenever gaps fall inside it. Row
// wrapping instead WALKS each run's real accumulated width
// (chunkRunIntoRows) and cuts a row wherever that real width would exceed
// the safe area — used identically by the candidate-selection phase (to
// estimate row COUNT / contentHeight honestly) and the placement phase (to
// build the actual PlacedGlyphRun objects), so the auto-fit search and the
// real output can never disagree about how many rows a candidate needs.
// Each row still rebuilds a fresh path per slice via
// continuousGlyphRuns.ts's buildRunPathCommands — never reusing the
// pre-layout ribbon's raw (unplaced) coordinates directly, and never
// connecting a slice's path across a row boundary.

import type { GlyphBounds, Point } from "../../data/glyphStrokeTypes";
import type { ContinuousGlyphRun, GlyphPathCommand, PulseArchGeometry } from "../../data/glyphConnectionTypes";
import type {
  FullCanvasLayoutInput, FullCanvasLayoutResult, PlacedGlyphRun, GlyphCanvasWarning,
} from "../../data/glyphCanvasTypes";
import {
  NOMINAL_PULSE_WIDTH, buildRunPathCommands, transformPathCommands, transformPoint,
  countBarBoundaries, countInsertedBarGaps,
} from "./continuousGlyphRuns";

const ROW_HEIGHT_RATIO = 1.8; // rowHeight = pulseWidth * ROW_HEIGHT_RATIO — a fixed proportion matching typical arch height
const CANDIDATE_STEPS = 40;
// Fraction of rowHeight from the row's top at which the baseline sits —
// leaves headroom above the baseline for the arch's own crest (a peak
// extends UPWARD, i.e. to smaller y) so the very first row never pokes
// above the safe area.
const BASELINE_FRACTION = 0.7;

// Walks a run's own (nominal-space, gap-inflated) archGeometries and cuts
// row boundaries wherever the REAL accumulated width — measured directly
// from start/end x-coordinates, which already include any bar/phrase gap
// this run's geometry carries — would exceed the safe area at the given
// candidate scale. Always advances by at least one pulse per row (so a
// single pulse wider than the safe area still gets its own row rather than
// looping forever), matching the existing "never drop a pulse" guarantee.
function chunkRunIntoRows(
  geometries: PulseArchGeometry[],
  scale: number,
  safeWidthUnits: number,
): Array<[number, number]> {
  const chunks: Array<[number, number]> = [];
  if (geometries.length === 0) return chunks;
  let rowStart = 0;
  while (rowStart < geometries.length) {
    const originX = geometries[rowStart].start.x;
    let end = rowStart;
    while (end < geometries.length) {
      const spanScaled = (geometries[end].end.x - originX) * scale;
      if (spanScaled > safeWidthUnits && end > rowStart) break;
      end++;
    }
    chunks.push([rowStart, end]);
    rowStart = end;
  }
  return chunks;
}

function commandsBounds(commands: GlyphPathCommand[]): GlyphBounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of commands) {
    const points: Array<[number, number]> =
      c.type === "Q" ? [[c.cx, c.cy], [c.x, c.y]]
      : c.type === "C" ? [[c.c1x, c.c1y], [c.c2x, c.c2y], [c.x, c.y]]
      : [[c.x, c.y]];
    for (const [x, y] of points) {
      minX = Math.min(minX, x); minY = Math.min(minY, y);
      maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  return { minX, minY, maxX, maxY, width: Math.max(0, maxX - minX), height: Math.max(0, maxY - minY) };
}

function unionBounds(a: GlyphBounds, b: GlyphBounds): GlyphBounds {
  const minX = Math.min(a.minX, b.minX), minY = Math.min(a.minY, b.minY);
  const maxX = Math.max(a.maxX, b.maxX), maxY = Math.max(a.maxY, b.maxY);
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

type FitCandidate = { pulseWidth: number; rowHeight: number; totalRows: number; contentHeight: number };

// Row count is now measured by the SAME chunkRunIntoRows walk the placement
// phase uses (0804D correction) — never a "safeWidth / pulseWidth" count
// estimate, which would silently under-count rows once bar/phrase gaps
// widen real per-row content beyond what a uniform-pulse-width guess
// assumes. This is what keeps the auto-fit search — and therefore
// contentHeight / overflowBottom — honest about gap-inflated geometry.
function evaluateCandidate(runs: ContinuousGlyphRun[], pulseWidth: number, safeWidth: number, rowGap: number, sectionGap: number): FitCandidate {
  const scale = pulseWidth / NOMINAL_PULSE_WIDTH;
  const rowHeight = pulseWidth * ROW_HEIGHT_RATIO;
  let totalRows = 0;
  runs.forEach((run) => {
    totalRows += Math.max(1, chunkRunIntoRows(run.archGeometries, scale, safeWidth).length);
  });
  const rowGaps = Math.max(0, totalRows - 1) * rowGap;
  const sectionGaps = Math.max(0, runs.length - 1) * sectionGap;
  const contentHeight = totalRows * rowHeight + rowGaps + sectionGaps;
  return { pulseWidth, rowHeight, totalRows, contentHeight };
}

export function computeFullCanvasLayout(input: FullCanvasLayoutInput): FullCanvasLayoutResult {
  const { canvas, pulses, runs, safeArea } = input;
  const canvasBounds: GlyphBounds = { minX: 0, minY: 0, maxX: canvas.widthUnits, maxY: canvas.heightUnits, width: canvas.widthUnits, height: canvas.heightUnits };
  const safeBounds: GlyphBounds = {
    minX: safeArea.left, minY: safeArea.top,
    maxX: canvas.widthUnits - safeArea.right, maxY: canvas.heightUnits - safeArea.bottom,
    width: Math.max(0, canvas.widthUnits - safeArea.left - safeArea.right),
    height: Math.max(0, canvas.heightUnits - safeArea.top - safeArea.bottom),
  };

  // Computed once, reused by every return branch — both counts are honest
  // regardless of whether placement itself succeeds, since gap insertion
  // happens upstream (continuousGlyphRuns.ts) before layout ever runs.
  const barBoundaryCount = countBarBoundaries(pulses);
  const insertedBarGapCount = countInsertedBarGaps(runs);

  const warnings: GlyphCanvasWarning[] = [];
  if (safeBounds.width <= 0 || safeBounds.height <= 0) {
    warnings.push("safeAreaTooSmall");
    return {
      placedRuns: [], pulseWidth: 0, rowHeight: 0, rowCount: 0,
      contentBounds: safeBounds, canvasBounds, safeBounds,
      overflowRight: 0, overflowBottom: 0, allPulsesPlaced: pulses.length === 0, allPulsesVisible: false,
      warnings, sectionStartPoints: [], barBoundaryCount, insertedBarGapCount,
    };
  }

  if (runs.length === 0 || pulses.length === 0) {
    return {
      placedRuns: [], pulseWidth: 0, rowHeight: 0, rowCount: 0,
      contentBounds: { minX: safeBounds.minX, minY: safeBounds.minY, maxX: safeBounds.minX, maxY: safeBounds.minY, width: 0, height: 0 },
      canvasBounds, safeBounds, overflowRight: 0, overflowBottom: 0,
      allPulsesPlaced: true, allPulsesVisible: true, warnings, sectionStartPoints: [], barBoundaryCount, insertedBarGapCount,
    };
  }

  // §12 Auto-Fit Algorithm — try candidates from maxPulseWidth down to
  // minPulseWidth; the first (largest) that fits wins. If none fits, fall
  // back to minPulseWidth and report the overflow honestly rather than
  // dropping any pulse.
  const step = Math.max(0.01, (input.maxPulseWidth - input.minPulseWidth) / CANDIDATE_STEPS);
  let chosen: FitCandidate | null = null;
  let smallestCandidate: FitCandidate | null = null;
  for (let w = input.maxPulseWidth; w >= input.minPulseWidth - 1e-9; w -= step) {
    const candidate = evaluateCandidate(runs, w, safeBounds.width, input.rowGap, input.sectionGap);
    smallestCandidate = candidate;
    if (candidate.contentHeight <= safeBounds.height) {
      chosen = candidate;
      break;
    }
  }
  if (!chosen) {
    // Nothing fit even at the minimum — fail closed on VISIBILITY, not on
    // placement: use the smallest candidate anyway so every pulse is still
    // placed and represented, and report the overflow via warnings.
    chosen = smallestCandidate ?? evaluateCandidate(runs, input.minPulseWidth, safeBounds.width, input.rowGap, input.sectionGap);
    warnings.push("minimumPulseWidthReached", "contentStillOverflows");
  }

  const scale = chosen.pulseWidth / NOMINAL_PULSE_WIDTH;
  const placedRuns: PlacedGlyphRun[] = [];
  let rowIndex = 0;
  let rowTopY = safeBounds.minY;
  let contentBounds: GlyphBounds | null = null;
  let placedPulseCount = 0;
  const pulseById = new Map(pulses.map((p) => [p.id, p]));
  const sectionStartPoints: FullCanvasLayoutResult["sectionStartPoints"] = [];

  runs.forEach((run, runIndex) => {
    if (runIndex > 0) rowTopY += input.sectionGap;
    const geometries = run.archGeometries;
    let sectionStartRecorded = false;
    // Real-width row chunking (0804D) — the SAME walk evaluateCandidate
    // used to pick chosen.pulseWidth, so the row count actually built here
    // always matches what the auto-fit search already accounted for.
    const rowChunks = chunkRunIntoRows(geometries, scale, safeBounds.width);
    for (const [chunkStart, chunkEnd] of rowChunks) {
      const chunk = geometries.slice(chunkStart, chunkEnd);
      const chunkPulseIds = run.pulseIds.slice(chunkStart, chunkEnd);
      const localPathCommands = buildRunPathCommands(chunk);

      const baselineY = rowTopY + chosen!.rowHeight * BASELINE_FRACTION;
      const dx = safeBounds.minX - chunk[0].start.x * scale;
      const dy = baselineY - chunk[0].start.y * scale;
      const transform = { dx, dy, scaleX: scale, scaleY: scale };
      const placedCommands = transformPathCommands(localPathCommands, transform);
      const bounds = commandsBounds(placedCommands);

      const pulsePoints = chunk.map((g, i) => ({
        pulseId: chunkPulseIds[i],
        timeSeconds: pulseById.get(chunkPulseIds[i])?.timeSeconds ?? 0,
        point: transformPoint(g.crest, transform),
      }));

      if (!sectionStartRecorded) {
        sectionStartPoints.push({ sectionId: run.sectionId, point: transformPoint(chunk[0].start, transform) });
        sectionStartRecorded = true;
      }

      placedRuns.push({
        id: `placed-${run.id}-row${rowIndex}`,
        sourceRunId: run.id,
        sectionId: run.sectionId,
        pulseIds: chunkPulseIds,
        pathCommands: placedCommands,
        rowIndex,
        bounds,
        pulsePoints,
      });

      contentBounds = contentBounds ? unionBounds(contentBounds, bounds) : bounds;
      placedPulseCount += chunk.length;
      rowTopY += chosen!.rowHeight + input.rowGap;
      rowIndex += 1;
    }
    // Undo the trailing rowGap added after this run's last row so the next
    // run's sectionGap is the ONLY gap applied between runs.
    rowTopY -= input.rowGap;
  });

  const finalContentBounds = contentBounds ?? { minX: safeBounds.minX, minY: safeBounds.minY, maxX: safeBounds.minX, maxY: safeBounds.minY, width: 0, height: 0 };
  const overflowRight = Math.max(0, finalContentBounds.maxX - safeBounds.maxX);
  const overflowBottom = Math.max(0, finalContentBounds.maxY - safeBounds.maxY);
  const allPulsesPlaced = placedPulseCount === pulses.length;
  const allPulsesVisible = overflowRight === 0 && overflowBottom === 0
    && finalContentBounds.minX >= safeBounds.minX - 1e-6 && finalContentBounds.minY >= safeBounds.minY - 1e-6;

  if (!allPulsesVisible && !warnings.includes("contentStillOverflows")) warnings.push("contentStillOverflows");
  if (!allPulsesPlaced) warnings.push("notationTooDenseForCanvas");

  return {
    placedRuns,
    pulseWidth: chosen.pulseWidth,
    rowHeight: chosen.rowHeight,
    rowCount: rowIndex,
    contentBounds: finalContentBounds,
    canvasBounds,
    safeBounds,
    overflowRight,
    overflowBottom,
    allPulsesPlaced,
    allPulsesVisible,
    warnings,
    sectionStartPoints,
    barBoundaryCount,
    insertedBarGapCount,
  };
}

export function placedRunPoint(layout: FullCanvasLayoutResult, pulseId: string): Point | null {
  for (const run of layout.placedRuns) {
    const found = run.pulsePoints.find((p) => p.pulseId === pulseId);
    if (found) return found.point;
  }
  return null;
}
