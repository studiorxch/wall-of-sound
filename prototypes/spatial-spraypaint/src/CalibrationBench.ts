import { createStrokeRandom, SprayBrushEngine } from "./SprayBrushEngine";
import { type SprayCapPreset } from "./SprayCapPresets";
import { type CustomSprayBrush } from "./CustomBrush";
import { type StrokePoint } from "./types";

/**
 * Spray Cap Calibration Bench — deterministic, side-by-side comparison
 * infrastructure. Pure logic only (matrix definitions, point generation,
 * width resolution, property/difference computation, the real-engine
 * rendering call itself); DOM wiring lives in `CalibrationBenchController.ts`
 * and is exercised by live browser verification, matching this codebase's
 * existing split (see `BrushStudio.ts`'s own header comment).
 *
 * This is calibration/authoring tooling, not another cap-tuning pass — it
 * never writes to `SPRAY_CAP_PRESETS` or any preset object; every "effective"
 * value here (Matched Width in particular) is Bench-local only.
 */

/** Either a built-in preset or a Brush Studio custom brush's preset — same shape the rest of Brush Studio already treats interchangeably (see `BrushStudio.findSprayBrushPreset`). */
export type CalibrationPreset = SprayCapPreset | CustomSprayBrush["preset"];

// ---------------------------------------------------------------------------
// 1. The deterministic test matrix (brief section 3, samples A-J).

export type CalibrationSampleId =
  | "quick-dot"
  | "short-dwell"
  | "long-dwell"
  | "slow-straight"
  | "fast-straight"
  | "curve"
  | "start-stop"
  | "fill-one-sweep"
  | "fill-three-pass"
  | "diagonal";

export interface CalibrationSample {
  id: CalibrationSampleId;
  label: string;
  /** "fill" samples render with fillMode=true through the real engine, same ceiling mechanism as any other Fill stroke. */
  kind: "dot" | "stroke" | "fill";
  /** Number of separate released strokes replayed over the same path — 3 for "Fill — three passes", 1 for everything else. */
  passes: number;
}

export const CALIBRATION_MATRIX: readonly CalibrationSample[] = [
  { id: "quick-dot", label: "A. Quick dot", kind: "dot", passes: 1 },
  { id: "short-dwell", label: "B. Short dwell", kind: "dot", passes: 1 },
  { id: "long-dwell", label: "C. Long dwell", kind: "dot", passes: 1 },
  { id: "slow-straight", label: "D. Slow straight", kind: "stroke", passes: 1 },
  { id: "fast-straight", label: "E. Fast straight", kind: "stroke", passes: 1 },
  { id: "curve", label: "F. Curve", kind: "stroke", passes: 1 },
  { id: "start-stop", label: "G. Start / stop", kind: "stroke", passes: 1 },
  { id: "fill-one-sweep", label: "H. Fill — one sweep", kind: "fill", passes: 1 },
  { id: "fill-three-pass", label: "I. Fill — three passes", kind: "fill", passes: 3 },
  { id: "diagonal", label: "J. Diagonal", kind: "stroke", passes: 1 },
];

export function getCalibrationSample(id: CalibrationSampleId): CalibrationSample {
  const found = CALIBRATION_MATRIX.find((sample) => sample.id === id);
  if (!found) throw new Error(`Unknown calibration sample: ${id}`);
  return found;
}

// ---------------------------------------------------------------------------
// 2. Deterministic point generation. Every sample's coordinates/timing are a
// pure function of (sampleId, strokeWidth) alone — the SAME path is used for
// any cap, at any width mode; only `strokeWidth` (the resolved radius fed to
// the engine) varies between Left and Right or Native/Matched.

export const CALIBRATION_SAMPLE_WIDTH = 240;
export const CALIBRATION_SAMPLE_HEIGHT = 130;

function linePath(strokeWidth: number, x0: number, y0: number, x1: number, y1: number, steps: number, msPerStep: number, velocity: number): StrokePoint[] {
  const points: StrokePoint[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = steps === 0 ? 0 : i / steps;
    points.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, timestamp: i * msPerStep, velocity, width: strokeWidth, opacity: 1 });
  }
  return points;
}

function dwellPath(strokeWidth: number, x: number, y: number, repeats: number, msPerStep: number, velocity: number): StrokePoint[] {
  const points: StrokePoint[] = [];
  for (let i = 0; i <= repeats; i += 1) {
    points.push({ x, y, timestamp: i * msPerStep, velocity, width: strokeWidth, opacity: 1 });
  }
  return points;
}

/** Returns one or more discrete strokes (each its own beginStroke()/pointer-down session) for the given sample. */
export function buildCalibrationStrokes(sampleId: CalibrationSampleId, strokeWidth: number): StrokePoint[][] {
  const w = CALIBRATION_SAMPLE_WIDTH;
  const h = CALIBRATION_SAMPLE_HEIGHT;
  const left = w * 0.12;
  const right = w - left;
  const midY = h * 0.5;

  switch (sampleId) {
    case "quick-dot":
      return [dwellPath(strokeWidth, w / 2, midY, 0, 16, 0.3)];
    case "short-dwell":
      return [dwellPath(strokeWidth, w / 2, midY, 3, 40, 0.05)];
    case "long-dwell":
      return [dwellPath(strokeWidth, w / 2, midY, 10, 40, 0.03)];
    case "slow-straight":
      return [linePath(strokeWidth, left, midY, right, midY, 10, 90, 0.12)];
    case "fast-straight":
      return [linePath(strokeWidth, left, midY, right, midY, 10, 18, 1.1)];
    case "curve": {
      const steps = 16;
      const points: StrokePoint[] = [];
      for (let i = 0; i <= steps; i += 1) {
        const t = i / steps;
        points.push({
          x: left + (right - left) * t,
          y: midY - Math.sin(t * Math.PI * 2) * (h * 0.24),
          timestamp: i * 40,
          velocity: 0.3,
          width: strokeWidth,
          opacity: 1,
        });
      }
      return [points];
    }
    case "start-stop": {
      const segmentLength = (right - left) / 5;
      const strokes: StrokePoint[][] = [];
      for (let segment = 0; segment < 3; segment += 1) {
        const x0 = left + segment * 2 * segmentLength;
        strokes.push(linePath(strokeWidth, x0, midY, x0 + segmentLength, midY, 4, 45, 0.35));
      }
      return strokes;
    }
    case "diagonal":
      return [linePath(strokeWidth, left, h * 0.18, right, h * 0.82, 12, 40, 0.32)];
    case "fill-one-sweep":
    case "fill-three-pass":
      return [linePath(strokeWidth, left, midY, right, midY, 16, 30, 0.3)];
  }
}

// ---------------------------------------------------------------------------
// 3. Native vs. Matched Width (brief section 4). Both are pure functions of
// the presets themselves — neither ever writes back to a preset object.

export type CalibrationWidthMode = "native" | "matched";

/** Default Matched Width target: the narrower of the two selected caps' own native radius — always achievable without exceeding either cap's real range, and reduces to Native's own value when both sides already match. */
export function resolveMatchedWidthRadius(leftPreset: CalibrationPreset, rightPreset: CalibrationPreset): number {
  return Math.min(leftPreset.baseRadius, rightPreset.baseRadius);
}

export function resolveCalibrationEffectiveRadius(
  preset: CalibrationPreset,
  mode: CalibrationWidthMode,
  matchedWidthRadius: number,
): number {
  return mode === "native" ? preset.baseRadius : matchedWidthRadius;
}

// ---------------------------------------------------------------------------
// 4. Rendering — the real SprayBrushEngine, no fake preview imagery. Fill
// samples reuse the exact same engine/ceiling mechanism as every other Fill
// stroke in the app (see SprayBrushEngine's FILL_MODE_CORE_CEILING).

export const CALIBRATION_SEED = 909;
const CALIBRATION_COLOR = "#f4f3f0";
/** How much of a resolved "radius" a calibration swatch actually draws at — tuned so Astro Fat's 62 and Needle's 5 both read clearly within one fixed-size swatch without either clipping or vanishing. */
const CALIBRATION_RADIUS_SCALE = 0.55;

export function resolveCalibrationStrokeWidth(effectiveRadius: number): number {
  return Math.max(1.5, Math.min(CALIBRATION_SAMPLE_HEIGHT * 0.9, effectiveRadius * CALIBRATION_RADIUS_SCALE));
}

/**
 * Renders one calibration sample for one cap into `ctx`, using a fresh
 * `SprayBrushEngine` instance scoped to this single call — so Left and Right
 * (and every sample cell) render fully independently, with no shared engine
 * state leaking between them. "Fill — three passes" replays the identical
 * path across `sample.passes` separate `beginStroke()` sessions on that same
 * fresh engine, exactly matching how a real repeated Fill pass composites
 * (see SprayBrushEngine.test.ts's `drawFillStroke` for the same pattern).
 */
export function renderCalibrationSample(
  ctx: CanvasRenderingContext2D,
  sampleId: CalibrationSampleId,
  preset: CalibrationPreset,
  effectiveRadius: number,
): void {
  const sample = getCalibrationSample(sampleId);
  ctx.clearRect(0, 0, CALIBRATION_SAMPLE_WIDTH, CALIBRATION_SAMPLE_HEIGHT);
  const strokeWidth = resolveCalibrationStrokeWidth(effectiveRadius);
  const strokes = buildCalibrationStrokes(sampleId, strokeWidth);
  const engine = new SprayBrushEngine();
  const fillMode = sample.kind === "fill";

  for (let pass = 0; pass < sample.passes; pass += 1) {
    for (const strokePoints of strokes) {
      const random = createStrokeRandom(CALIBRATION_SEED);
      engine.beginStroke();
      let previous: StrokePoint | null = null;
      for (const point of strokePoints) {
        engine.renderSegment(ctx, previous, point, CALIBRATION_COLOR, preset as SprayCapPreset, random, 1, fillMode);
        previous = point;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Property readout (brief section 5) — a compact, real-fields-only list.
// Halo/ring/streak rows only appear when the cap actually has that field set.

export interface CalibrationPropertyRow {
  key: string;
  label: string;
  value: number | string | boolean;
  unit?: string;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function buildCalibrationPropertyReadout(preset: CalibrationPreset, effectiveRadius: number): CalibrationPropertyRow[] {
  const rows: CalibrationPropertyRow[] = [
    { key: "effectiveRadius", label: "Effective size", value: round2(effectiveRadius), unit: "wall units" },
    { key: "baseRadius", label: "Native size", value: preset.baseRadius, unit: "wall units" },
    { key: "coreDensity", label: "Core density", value: round2(preset.coreDensity) },
    { key: "coreOpacity", label: "Core opacity", value: round2(preset.coreOpacity) },
    { key: "edgeFalloff", label: "Edge softness", value: round2(preset.edgeFalloff) },
    { key: "particleCount", label: "Overspray amount", value: preset.particleCount },
    { key: "particleSpread", label: "Overspray spread", value: round2(preset.particleSpread) },
    { key: "particleOpacity", label: "Overspray opacity", value: round2(preset.particleOpacity) },
    { key: "flowRate", label: "Flow rate", value: round2(preset.flowRate) },
    { key: "accumulationRate", label: "Accumulation rate", value: round2(preset.accumulationRate) },
    { key: "velocityResponse", label: "Velocity response", value: round2(preset.velocityResponse) },
    { key: "endpointBehavior", label: "Endpoint behavior", value: preset.endpointBehavior },
    { key: "depositionShape", label: "Shape", value: preset.depositionShape },
    { key: "defaultFillMode", label: "Fill default", value: preset.defaultFillMode },
  ];
  if (preset.haloRadius > 0 || preset.haloOpacity > 0) {
    rows.push({ key: "haloRadius", label: "Halo radius", value: round2(preset.haloRadius) });
    rows.push({ key: "haloOpacity", label: "Halo opacity", value: round2(preset.haloOpacity) });
  }
  if (preset.ringRadius > 0) {
    rows.push({ key: "ringRadius", label: "Ring radius", value: round2(preset.ringRadius) });
    rows.push({ key: "ringThickness", label: "Ring thickness", value: round2(preset.ringThickness) });
    rows.push({ key: "ringOpacity", label: "Ring opacity", value: round2(preset.ringOpacity) });
    rows.push({ key: "centerOpacity", label: "Center opacity", value: round2(preset.centerOpacity) });
  }
  if (preset.streakLanes > 0) {
    rows.push({ key: "streakLanes", label: "Streak lanes", value: preset.streakLanes });
  }
  return rows;
}

export interface CalibrationPropertyComparisonRow {
  key: string;
  label: string;
  leftValue?: number | string | boolean;
  rightValue?: number | string | boolean;
  unit?: string;
}

/** Merges two independently-built readouts (they can have different rows — e.g. only one side has a halo) into one ordered side-by-side table, Left's own row order first, then any Right-only rows appended. */
export function mergeCalibrationPropertyRows(
  leftRows: readonly CalibrationPropertyRow[],
  rightRows: readonly CalibrationPropertyRow[],
): CalibrationPropertyComparisonRow[] {
  const rightByKey = new Map(rightRows.map((row) => [row.key, row]));
  const seen = new Set<string>();
  const merged: CalibrationPropertyComparisonRow[] = [];
  for (const left of leftRows) {
    const right = rightByKey.get(left.key);
    merged.push({ key: left.key, label: left.label, leftValue: left.value, rightValue: right?.value, unit: left.unit });
    seen.add(left.key);
  }
  for (const right of rightRows) {
    if (seen.has(right.key)) continue;
    merged.push({ key: right.key, label: right.label, leftValue: undefined, rightValue: right.value, unit: right.unit });
  }
  return merged;
}

// ---------------------------------------------------------------------------
// 6. Difference summary (brief section 6) — actual data differences only, no
// subjective wording ("more authentic", etc.) anywhere in this module.

export interface CalibrationDifferenceRow {
  key: string;
  label: string;
  kind: "numeric" | "categorical";
  leftValue: number | string;
  rightValue: number | string;
  /** Right relative to Left, as a percentage; null when Left is 0 (division undefined) or the row is categorical. */
  percentDelta: number | null;
}

const NUMERIC_DIFF_FIELDS: ReadonlyArray<{ key: keyof SprayCapPreset; label: string }> = [
  { key: "coreDensity", label: "Core density" },
  { key: "coreOpacity", label: "Core opacity" },
  { key: "edgeFalloff", label: "Edge softness" },
  { key: "particleCount", label: "Overspray amount" },
  { key: "particleSpread", label: "Overspray spread" },
  { key: "particleOpacity", label: "Overspray opacity" },
  { key: "flowRate", label: "Flow rate" },
  { key: "accumulationRate", label: "Accumulation rate" },
  { key: "velocityResponse", label: "Velocity response" },
];

const CATEGORICAL_DIFF_FIELDS: ReadonlyArray<{ key: keyof SprayCapPreset; label: string }> = [
  { key: "endpointBehavior", label: "Endpoint" },
  { key: "depositionShape", label: "Shape" },
];

export function buildCalibrationDifferenceSummary(
  leftPreset: CalibrationPreset,
  rightPreset: CalibrationPreset,
  leftEffectiveRadius: number,
  rightEffectiveRadius: number,
): CalibrationDifferenceRow[] {
  const rows: CalibrationDifferenceRow[] = [{
    key: "size",
    label: "Size",
    kind: "numeric",
    leftValue: round2(leftEffectiveRadius),
    rightValue: round2(rightEffectiveRadius),
    percentDelta: percentDelta(leftEffectiveRadius, rightEffectiveRadius),
  }];
  for (const { key, label } of NUMERIC_DIFF_FIELDS) {
    const l = Number(leftPreset[key]);
    const r = Number(rightPreset[key]);
    rows.push({ key, label, kind: "numeric", leftValue: round2(l), rightValue: round2(r), percentDelta: percentDelta(l, r) });
  }
  for (const { key, label } of CATEGORICAL_DIFF_FIELDS) {
    rows.push({ key, label, kind: "categorical", leftValue: String(leftPreset[key]), rightValue: String(rightPreset[key]), percentDelta: null });
  }
  return rows;
}

function percentDelta(left: number, right: number): number | null {
  if (left === 0) return null;
  return Math.round(((right - left) / left) * 1000) / 10;
}

// ---------------------------------------------------------------------------
// 7. Reference-evidence area (brief section 7) — session-only, in-memory
// text fields. No persistence of any kind (matches "no fake persistent
// storage" — this resets on reload, same as the Custom Brush registry).

export interface CalibrationReferenceNotes {
  sourceDescription: string;
  observedDotShape: string;
  observedLineCharacter: string;
  apparentWidth: string;
  oversprayNotes: string;
  dwellNotes: string;
  confidence: string;
  calibrationConclusions: string;
}

export const EMPTY_CALIBRATION_REFERENCE_NOTES: CalibrationReferenceNotes = {
  sourceDescription: "",
  observedDotShape: "",
  observedLineCharacter: "",
  apparentWidth: "",
  oversprayNotes: "",
  dwellNotes: "",
  confidence: "",
  calibrationConclusions: "",
};

export const CALIBRATION_NOTE_FIELDS: ReadonlyArray<{ key: keyof CalibrationReferenceNotes; label: string }> = [
  { key: "sourceDescription", label: "Source description" },
  { key: "observedDotShape", label: "Observed dot shape" },
  { key: "observedLineCharacter", label: "Observed line character" },
  { key: "apparentWidth", label: "Apparent width" },
  { key: "oversprayNotes", label: "Overspray notes" },
  { key: "dwellNotes", label: "Dwell notes" },
  { key: "confidence", label: "Confidence" },
  { key: "calibrationConclusions", label: "Calibration conclusions" },
];

// ---------------------------------------------------------------------------
// 8. Snapshot (brief section 11) — a bounded, text-only "Copy Calibration
// Snapshot": cap names, width mode, classification, the difference table,
// and any filled-in reference notes. A composited PNG of all 20 swatch
// canvases plus both panels was judged too invasive for V1 (see checkpoint
// doc) — this covers the same informational content in copyable text.

export function buildCalibrationSnapshotText(
  leftPreset: CalibrationPreset,
  rightPreset: CalibrationPreset,
  mode: CalibrationWidthMode,
  leftEffectiveRadius: number,
  rightEffectiveRadius: number,
  leftStatusLabel: string,
  rightStatusLabel: string,
  notes: CalibrationReferenceNotes,
): string {
  const diff = buildCalibrationDifferenceSummary(leftPreset, rightPreset, leftEffectiveRadius, rightEffectiveRadius);
  const lines: string[] = [];
  lines.push(`Spray Cap Calibration Bench — ${leftPreset.name} vs ${rightPreset.name}`);
  lines.push(`Width mode: ${mode === "native" ? "Native" : "Matched"} (left ${round2(leftEffectiveRadius)}, right ${round2(rightEffectiveRadius)} wall units)`);
  lines.push(`Classification: ${leftPreset.name} — ${leftStatusLabel} · ${rightPreset.name} — ${rightStatusLabel}`);
  lines.push("");
  lines.push("Differences (left -> right):");
  for (const row of diff) {
    if (row.kind === "categorical") {
      lines.push(`  ${row.label}: ${row.leftValue} vs ${row.rightValue}`);
    } else {
      const deltaText = row.percentDelta === null ? "n/a" : `${row.percentDelta > 0 ? "+" : ""}${row.percentDelta}%`;
      lines.push(`  ${row.label}: ${deltaText} (${row.leftValue} -> ${row.rightValue})`);
    }
  }
  const filledNotes = CALIBRATION_NOTE_FIELDS.filter(({ key }) => notes[key].trim().length > 0);
  if (filledNotes.length > 0) {
    lines.push("");
    lines.push("Reference notes:");
    for (const { key, label } of filledNotes) lines.push(`  ${label}: ${notes[key]}`);
  }
  return lines.join("\n");
}
