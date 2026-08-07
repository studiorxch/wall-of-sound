// Glyph Notes — continuous shared-endpoint "mmmm" geometry
// (docs/glyph-audio/0804_GLYPH_NOTES_Full_Canvas_Pulse_Truth_Drum_Layer_Spec_v0.1.0.md §9-10;
// spacing/gap behavior revised by 0804D,
// docs/glyph-audio/0804_GLYPH_NOTES_Silent_Bar_Spacing_Event_Dot_Reassignment_Spec_v0.1.0.md).
//
// Replaces the prior build's "independent arches + a separate connector
// path between them" construction entirely. Within a bar, arch[n].end is
// literally the same Point object used as arch[n+1].start, so there is no
// possibility of a visible gap, doubled line, or open tail there — the
// geometric guarantee comes from how the points are constructed, not from a
// downstream check.
//
// 0804D correction: bars are no longer punctuated with a dot. A bar
// boundary is now silent horizontal SPACING — the next arch's start is
// pushed forward by an extra gap (§ "Recommended spacing hierarchy"), and
// the path lifts its pen (a fresh "M") at that point rather than drawing a
// stretched/diagonal connector across the gap. This never adds a pulse,
// never breaks the RUN (still one ContinuousGlyphRun, one section), and
// never creates a mark that could be confused with a drum-event dot — see
// GlyphSegmentBoundaryReason. Phrase boundaries use the same mechanism at a
// larger multiplier; section boundaries remain the only thing that actually
// ends a run (§9.6, unchanged from 0804C).
//
// Reuses BoundaryBehavior (glyphConnectionTypes.ts, 0804B's own vocabulary)
// for the two behavior fields rather than a parallel enum — but defines its
// own gap-size multipliers here, scoped to this pipeline's nominal-pulse-
// width coordinate space, rather than reusing 0804B's punctuationGapSize/
// sectionGapMultiplier (calibrated for manuscriptLayout.ts's unrelated
// beat-width/mm coordinate space — reusing those NUMBERS directly would
// produce wrong-scale gaps here, even though the BEHAVIOR vocabulary is
// shared). DEFAULT_CONNECTION_GRAMMAR (connectionGrammar.ts) is
// deliberately NOT imported or modified — it remains 0804B's own live
// default, still used by that build's own intact, unwired, still-tested
// pipeline.

import type { Point, GlyphBounds } from "../../data/glyphStrokeTypes";
import type { ArchGrammarParameters } from "../../data/glyphGrammarTypes";
import type { PulseTruthUnit } from "../../data/glyphPulseTruthTypes";
import type {
  ContinuousGlyphRun, PulseArchGeometry, GlyphPathCommand, GlyphSegmentBoundaryReason, BoundaryBehavior,
} from "../../data/glyphConnectionTypes";

// A nominal, pre-layout ribbon width — fullCanvasLayout.ts rescales every
// run's geometry (via transformPathCommands) to whatever pulseWidth its
// auto-fit algorithm actually chooses; this value only affects the SHAPE
// (crest/asymmetry proportions), never the final placed size.
export const NOMINAL_PULSE_WIDTH = 20;
const NOMINAL_BASELINE_Y = 0;

export type GlyphSpacingConfig = {
  barBoundaryBehavior: BoundaryBehavior;
  phraseBoundaryBehavior: BoundaryBehavior;
  // Multiples of the PRECEDING arch's own width — "1.5x to 2x base pulse
  // spacing" / "approximately 3x base pulse spacing" per the spec's
  // recommended hierarchy.
  barGapMultiplier: number;
  phraseGapMultiplier: number;
};

export const DEFAULT_GLYPH_SPACING: GlyphSpacingConfig = {
  barBoundaryBehavior: "smallGap",
  phraseBoundaryBehavior: "gap",
  barGapMultiplier: 1.75,
  phraseGapMultiplier: 3,
};

export function buildPulseArchGeometry(
  pulse: PulseTruthUnit,
  startPoint: Point,
  params: ArchGrammarParameters,
  segmentBoundaryReason: GlyphSegmentBoundaryReason | null = null,
): PulseArchGeometry {
  const width = Math.max(0.01, params.width);
  const height = Math.max(0, params.height);
  const asymmetry = Math.max(-1, Math.min(1, params.asymmetry));
  const tension = Math.max(0, Math.min(1, params.curveSharpness));

  const rawCrestX = startPoint.x + width * (0.5 + asymmetry * 0.15);
  // Clamped inside the arch's own foot span so x stays non-decreasing
  // across the whole run — the same non-self-intersection guarantee the
  // prior arch grammar relied on, now load-bearing for a run of hundreds
  // of arches instead of just one glyph.
  const crestX = Math.max(startPoint.x, Math.min(startPoint.x + width, rawCrestX));
  const crest: Point = { x: crestX, y: startPoint.y - height };
  // baselineOffset (handmade deformation's own existing knob) lets the
  // baseline drift arch to arch (§9.8) without ever breaking the shared
  // endpoint — the NEXT arch's start is simply wherever this one's end
  // landed.
  const end: Point = { x: startPoint.x + width, y: startPoint.y + (params.baselineOffset || 0) };

  return {
    pulseId: pulse.id, start: startPoint, crest, end, width, height, asymmetry, tension,
    startsNewSegment: segmentBoundaryReason !== null,
    segmentBoundaryReason,
  };
}

// Exported so fullCanvasLayout.ts can rebuild a fresh continuous path for
// a ROW-sized slice of a run's own archGeometries (a run may span many
// rows once placed) — reusing the exact same construction, never a
// re-derived approximation. Every row slice's own first arch always gets a
// fresh "M" regardless of startsNewSegment (a row break is itself always a
// pen-lift), matching 0804C's existing row-boundary behavior unchanged.
export function buildRunPathCommands(geometries: PulseArchGeometry[]): GlyphPathCommand[] {
  if (geometries.length === 0) return [];
  const commands: GlyphPathCommand[] = [];
  geometries.forEach((g, i) => {
    if (i === 0 || g.startsNewSegment) {
      commands.push({ type: "M", x: g.start.x, y: g.start.y });
    }
    // rise: baseline start -> crest
    commands.push({ type: "Q", cx: (g.start.x + g.crest.x) / 2, cy: g.crest.y, x: g.crest.x, y: g.crest.y });
    // descend: crest -> shared baseline endpoint (this arch's end == next arch's start, UNLESS the next arch starts a new segment, i.e. a bar/phrase gap follows)
    commands.push({ type: "Q", cx: (g.crest.x + g.end.x) / 2, cy: g.crest.y, x: g.end.x, y: g.end.y });
  });
  return commands;
}

export function pathCommandsToSvgPathData(commands: GlyphPathCommand[]): string {
  return commands
    .map((c) => {
      if (c.type === "M") return `M ${c.x} ${c.y}`;
      if (c.type === "L") return `L ${c.x} ${c.y}`;
      if (c.type === "Q") return `Q ${c.cx} ${c.cy} ${c.x} ${c.y}`;
      return `C ${c.c1x} ${c.c1y} ${c.c2x} ${c.c2y} ${c.x} ${c.y}`;
    })
    .join(" ");
}

// Used by fullCanvasLayout.ts to re-anchor a pre-layout ribbon (or a
// row-sized slice of one) into real canvas coordinates. A pure linear
// transform preserves shared-endpoint equality exactly.
export function transformPathCommands(
  commands: GlyphPathCommand[],
  transform: { dx: number; dy: number; scaleX: number; scaleY: number },
): GlyphPathCommand[] {
  const tx = (x: number) => x * transform.scaleX + transform.dx;
  const ty = (y: number) => y * transform.scaleY + transform.dy;
  return commands.map((c): GlyphPathCommand => {
    if (c.type === "M" || c.type === "L") return { type: c.type, x: tx(c.x), y: ty(c.y) };
    if (c.type === "Q") return { type: "Q", cx: tx(c.cx), cy: ty(c.cy), x: tx(c.x), y: ty(c.y) };
    return { type: "C", c1x: tx(c.c1x), c1y: ty(c.c1y), c2x: tx(c.c2x), c2y: ty(c.c2y), x: tx(c.x), y: ty(c.y) };
  });
}

export function transformPoint(p: Point, transform: { dx: number; dy: number; scaleX: number; scaleY: number }): Point {
  return { x: p.x * transform.scaleX + transform.dx, y: p.y * transform.scaleY + transform.dy };
}

function computeGeometryBounds(geometries: PulseArchGeometry[]): GlyphBounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const g of geometries) {
    for (const p of [g.start, g.crest, g.end]) {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    }
  }
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 1, height: 1 };
  return { minX, minY, maxX, maxY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

// §9.6 — a new section always starts a new run; this remains the ONLY
// thing that ends a run/breaks it into a new ContinuousGlyphRun object.
// Bar and phrase boundaries (0804D) never break the run — they insert
// silent horizontal spacing (a fresh path segment via startsNewSegment,
// see buildRunPathCommands) while staying part of the SAME run, same
// section, same pulseIds sequence. Row breaks remain a LAYOUT-time concern
// (fullCanvasLayout.ts re-segments a run's own archGeometries into rows,
// never this stage).
export function buildContinuousGlyphRuns(
  pulses: PulseTruthUnit[],
  parametersFor: (pulse: PulseTruthUnit, index: number) => ArchGrammarParameters,
  spacing: GlyphSpacingConfig = DEFAULT_GLYPH_SPACING,
): ContinuousGlyphRun[] {
  const runs: ContinuousGlyphRun[] = [];
  if (pulses.length === 0) return runs;

  let currentPulseIds: string[] = [];
  let currentGeometries: PulseArchGeometry[] = [];
  let cursor: Point = { x: 0, y: NOMINAL_BASELINE_Y };
  let currentSectionId = pulses[0].sectionId;

  function flush() {
    if (currentGeometries.length === 0) return;
    const pathCommands = buildRunPathCommands(currentGeometries);
    runs.push({
      id: `run-${runs.length}-${currentPulseIds[0]}`,
      sectionId: currentSectionId,
      pulseIds: [...currentPulseIds],
      pathCommands,
      startPoint: currentGeometries[0].start,
      endPoint: currentGeometries[currentGeometries.length - 1].end,
      bounds: computeGeometryBounds(currentGeometries),
      archGeometries: [...currentGeometries],
    });
    currentPulseIds = [];
    currentGeometries = [];
  }

  const barGapEnabled = spacing.barBoundaryBehavior !== "keepConnected";
  const phraseGapEnabled = spacing.phraseBoundaryBehavior !== "keepConnected";

  pulses.forEach((pulse, index) => {
    let boundaryReason: GlyphSegmentBoundaryReason | null = null;

    if (index === 0) {
      boundaryReason = "runStart";
    } else if (pulse.sectionId !== currentSectionId) {
      flush();
      cursor = { x: 0, y: NOMINAL_BASELINE_Y };
      currentSectionId = pulse.sectionId;
      boundaryReason = "runStart";
    } else {
      const prev = pulses[index - 1];
      const prevWidth = currentGeometries.length > 0
        ? currentGeometries[currentGeometries.length - 1].width
        : NOMINAL_PULSE_WIDTH;
      // Phrase boundaries take precedence over a coincident bar boundary
      // (a phrase change is also, structurally, a bar change) — exactly
      // one gap is ever inserted per pulse pair, never both stacked.
      if (phraseGapEnabled && pulse.phraseId !== prev.phraseId) {
        boundaryReason = "phrase";
        cursor = { x: cursor.x + prevWidth * spacing.phraseGapMultiplier, y: cursor.y };
      } else if (barGapEnabled && pulse.barIndex !== prev.barIndex) {
        boundaryReason = "bar";
        cursor = { x: cursor.x + prevWidth * spacing.barGapMultiplier, y: cursor.y };
      }
    }

    const params = parametersFor(pulse, index);
    const geometry = buildPulseArchGeometry(pulse, cursor, params, boundaryReason);
    currentGeometries.push(geometry);
    currentPulseIds.push(pulse.id);
    cursor = geometry.end;
  });
  flush();

  return runs;
}

// 0804D diagnostics — two independently-derived counts of the same thing,
// which the required invariant (bar boundaries = inserted bar gaps) checks
// against each other. countBarBoundaries is the "should exist" source of
// truth, computed directly from the input pulses, completely independent
// of buildContinuousGlyphRuns; countInsertedBarGaps is the "actually built"
// measurement, read back from the real archGeometries buildContinuousGlyphRuns
// produced. A mismatch would mean a real bug in gap insertion, never a
// rendering choice — mirroring the expectedPulseCount/generated invariant
// pattern already established in pulseTruth.ts.
export function countBarBoundaries(pulses: PulseTruthUnit[]): number {
  let count = 0;
  for (let i = 1; i < pulses.length; i++) {
    const prev = pulses[i - 1];
    const curr = pulses[i];
    if (curr.sectionId !== prev.sectionId) continue; // section break, not a bar gap
    if (curr.phraseId !== prev.phraseId) continue; // counted as a phrase gap instead, matching buildContinuousGlyphRuns' own precedence
    if (curr.barIndex !== prev.barIndex) count++;
  }
  return count;
}

export function countInsertedBarGaps(runs: ContinuousGlyphRun[]): number {
  let count = 0;
  for (const run of runs) {
    for (const g of run.archGeometries) {
      if (g.segmentBoundaryReason === "bar") count++;
    }
  }
  return count;
}
