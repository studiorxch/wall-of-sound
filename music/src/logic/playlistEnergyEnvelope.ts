// Playlist Section Energy Envelopes (0712_MUSIC_Playlist_Section_Energy_Envelopes).
// Pure, deterministic helpers for the per-section energy envelope: no
// randomness, no track/crate knowledge — callers (the wizard UI and the
// shape-based generator) read/write track energy and section state; this
// module only knows about the envelope's own start/end/shape math.
//
// Scale deviation from the spec (documented, deliberate): the spec's draft
// assumed an app-wide 1–10 energy scale. This codebase's actual energy scale
// is 0–1 everywhere (Track.energy, ENERGY_TARGET_RANGES, scoreTrackForSlot) —
// there is no 1–10 scale anywhere else in the app. To avoid introducing a
// second energy unit and a conversion layer at every boundary, the envelope
// stores start/end on the SAME 0–1 scale as the rest of the app. All shape
// names, inference rules, normalization rules, and curve semantics are
// otherwise implemented exactly as specified.

import type {
  PlaylistEnergyShape,
  PlaylistEnergyShapeSource,
  PlaylistSectionEnergyEnvelope,
} from "../data/playlistShapeTypes";

export const ENERGY_MIN = 0;
export const ENERGY_MAX = 1;
// Internal storage is a continuous 0–1 value, NOT stepped/quantized — a
// fractional value like 3/9 must survive normalization exactly (see
// 0712_MUSIC_Playlist_Energy_Scale_Mapping_Fix). Display-side quantization to
// whole 1–10 steps happens only at the UI boundary via energyToDisplay/
// energyFromDisplay below, never in this module's own storage math.

const VALID_SHAPES: PlaylistEnergyShape[] = ["flat", "rise", "fall", "arc", "valley"];

// A pure isochronous flat section with legacy start !== end data drifts only
// slightly toward the end rather than snapping or fully interpolating — the
// UI's own Flat safeguard (§6.5) keeps start/end locked together going
// forward, so this only ever matters for not-yet-normalized legacy records.
const FLAT_DRIFT_FACTOR = 0.1;

// How far an arc/valley may lift/dip from the straight-line interpolation,
// before being clamped to whatever headroom is actually available.
const CURVE_DESIRED_HEIGHT = 0.2;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// Clamps to the valid normalized range only — no step-rounding. Normalized
// storage must preserve fractional values (e.g. 3/9 = 0.3333...) exactly.
export function clampEnergyValue(value: number): number {
  return Math.max(ENERGY_MIN, Math.min(ENERGY_MAX, value));
}

// ── UI-boundary display conversion (0712_MUSIC_Playlist_Energy_Scale_Mapping_Fix) ──
// The ONLY place a 1–10 display scale exists. Internal storage (everything
// else in this module, the generator, and persistence) stays 0–1 always —
// these two functions must never be called from non-UI code.

export function energyFromDisplay(value: number): number {
  return (Math.min(10, Math.max(1, Math.round(value))) - 1) / 9;
}

export function energyToDisplay(value: number): number {
  return Math.round(Math.min(1, Math.max(0, value)) * 9) + 1;
}

export function inferEnergyShape(start: number, end: number): PlaylistEnergyShape {
  if (start === end) return "flat";
  return end > start ? "rise" : "fall";
}

export function normalizeEnergyEnvelope(
  envelope: Partial<PlaylistSectionEnergyEnvelope> | undefined,
  fallback: PlaylistSectionEnergyEnvelope,
): PlaylistSectionEnergyEnvelope {
  const rawStart = envelope?.start;
  const rawEnd = envelope?.end;
  const start = typeof rawStart === "number" && Number.isFinite(rawStart) ? clampEnergyValue(rawStart) : fallback.start;
  const end = typeof rawEnd === "number" && Number.isFinite(rawEnd) ? clampEnergyValue(rawEnd) : fallback.end;

  const requestedShape = envelope?.shape;
  const isValidShape = typeof requestedShape === "string" && VALID_SHAPES.includes(requestedShape as PlaylistEnergyShape);
  const isExplicitSource: boolean = envelope?.shapeSource === "explicit";

  if (isValidShape && (requestedShape === "arc" || requestedShape === "valley")) {
    // Arc/valley cannot be produced by inference (inferEnergyShape only ever
    // returns flat/rise/fall) — so a record claiming arc/valley without
    // explicit provenance is contradictory/untrustworthy. Fall back to a
    // genuinely inferred shape instead of preserving the claim.
    if (isExplicitSource) {
      return { start, end, shape: requestedShape as PlaylistEnergyShape, shapeSource: "explicit" };
    }
    return { start, end, shape: inferEnergyShape(start, end), shapeSource: "inferred" };
  }

  if (isValidShape) {
    const shapeSource: PlaylistEnergyShapeSource = isExplicitSource ? "explicit" : "inferred";
    return { start, end, shape: requestedShape as PlaylistEnergyShape, shapeSource };
  }

  // Shape absent or an unsupported string — infer from the endpoints.
  return { start, end, shape: inferEnergyShape(start, end), shapeSource: "inferred" };
}

export function getEnergyTargetAtPosition(envelope: PlaylistSectionEnergyEnvelope, position: number): number {
  const p = clamp01(position);
  const { start, end, shape } = envelope;

  switch (shape) {
    case "flat":
      if (start === end) return start;
      return clampEnergyValue(start + (end - start) * p * FLAT_DRIFT_FACTOR);
    case "rise":
    case "fall":
      return clampEnergyValue(start + (end - start) * p);
    case "arc": {
      const base = start + (end - start) * p;
      const midpoint = (start + end) / 2;
      const headroom = Math.max(0, ENERGY_MAX - midpoint);
      const height = Math.min(CURVE_DESIRED_HEIGHT, headroom);
      const lift = Math.sin(Math.PI * p) * height;
      return clampEnergyValue(base + lift);
    }
    case "valley": {
      const base = start + (end - start) * p;
      const midpoint = (start + end) / 2;
      const floorSpace = Math.max(0, midpoint - ENERGY_MIN);
      const depth = Math.min(CURVE_DESIRED_HEIGHT, floorSpace);
      const dip = Math.sin(Math.PI * p) * depth;
      return clampEnergyValue(base - dip);
    }
    default:
      return clampEnergyValue(start + (end - start) * p);
  }
}

export function getEnergyEnvelopePreview(envelope: PlaylistSectionEnergyEnvelope, sampleCount = 10): number[] {
  const n = Math.max(2, sampleCount);
  const samples: number[] = [];
  for (let i = 0; i < n; i++) {
    const position = i / (n - 1);
    samples.push(i === 0 ? envelope.start : i === n - 1 ? envelope.end : getEnergyTargetAtPosition(envelope, position));
  }
  return samples;
}

// ── Curve trace geometry (0712_MUSIC_Playlist_Shape_Inline_Editing "Fix
// SectionEnergyMeter curve rendering") ──────────────────────────────────────
// A point's horizontal position on the shared energy axis must always be its
// OWN sampled energy value — never its sample index — or a Fall envelope
// (start > end) renders as if it were a Rise. Chronological order (p: 0→1,
// i.e. Start→End) is preserved as a SEPARATE dimension so direction stays
// legible: for Fall, point 0 (p=0, value=start) sits at the highest x, and
// point N (p=1, value=end) sits at the lowest x — the trace visibly runs
// right-to-left, exactly reflecting "begins at Start, travels to End."

export interface EnergyCurvePoint {
  p: number;     // chronological position through the section, 0 (Start) → 1 (End)
  value: number; // this point's own sampled energy value (0–1) — the x-axis coordinate
}

export function sampleEnergyCurvePoints(envelope: PlaylistSectionEnergyEnvelope, sampleCount = 12): EnergyCurvePoint[] {
  const n = Math.max(2, sampleCount);
  const points: EnergyCurvePoint[] = [];
  for (let i = 0; i < n; i++) {
    const p = i / (n - 1);
    const value = i === 0 ? envelope.start : i === n - 1 ? envelope.end : getEnergyTargetAtPosition(envelope, p);
    points.push({ p, value });
  }
  return points;
}

// The bracket highlight must cover the FULL rendered curve, not just the
// Start/End endpoints — Arc/Valley legitimately bulge past both endpoints on
// the energy axis (that bulge IS the peak/dip), and clipping it back to
// [min(start,end), max(start,end)] would silently erase the shape.
export function getEnergyCurveBounds(envelope: PlaylistSectionEnergyEnvelope, sampleCount = 12): { min: number; max: number } {
  const values = sampleEnergyCurvePoints(envelope, sampleCount).map((pt) => pt.value);
  values.push(envelope.start, envelope.end);
  return { min: Math.min(...values), max: Math.max(...values) };
}

// ── Migration defaults (§4.2) ────────────────────────────────────────────────
// Exact fractional mapping of the spec's intended 1–10 display defaults
// (Intro 1→4, Middle 4→6, Peak 7→9, Outro 3→1) via energyFromDisplay's
// formula: (display - 1) / 9. Written as literal fractions rather than a
// energyFromDisplay() call so the constant's value is visible at a glance and
// doesn't depend on evaluation order.

export function makeEnvelope(start: number, end: number, shape: PlaylistEnergyShape, shapeSource: PlaylistEnergyShapeSource): PlaylistSectionEnergyEnvelope {
  return { start: clampEnergyValue(start), end: clampEnergyValue(end), shape, shapeSource };
}

export const DEFAULT_INTRO_ENVELOPE: PlaylistSectionEnergyEnvelope = {
  start: 0, end: 3 / 9, shape: "rise", shapeSource: "inferred",
};

export const DEFAULT_MIDDLE_ENVELOPE: PlaylistSectionEnergyEnvelope = {
  start: 3 / 9, end: 5 / 9, shape: "rise", shapeSource: "inferred",
};

export const DEFAULT_PEAK_ENVELOPE: PlaylistSectionEnergyEnvelope = {
  start: 6 / 9, end: 8 / 9, shape: "rise", shapeSource: "inferred",
};

export const DEFAULT_OUTRO_ENVELOPE: PlaylistSectionEnergyEnvelope = {
  start: 2 / 9, end: 0, shape: "fall", shapeSource: "inferred",
};

export function defaultEnvelopeForSection(sectionId: string): PlaylistSectionEnergyEnvelope {
  if (sectionId === "intro") return { ...DEFAULT_INTRO_ENVELOPE };
  if (sectionId === "outro") return { ...DEFAULT_OUTRO_ENVELOPE };
  // Peak section when identifiable — the middle-most block is treated as
  // "peak" per §4.2 (see playlistShapeBuilder.ts's peakIndex); earlier/later
  // middle blocks get the plain middle default.
  return { ...DEFAULT_MIDDLE_ENVELOPE };
}

export function peakEnvelope(): PlaylistSectionEnergyEnvelope {
  return { ...DEFAULT_PEAK_ENVELOPE };
}

// ── Coverage / diagnostics (§8) ──────────────────────────────────────────────

export interface SectionEnergyCoverageInput {
  energies: Array<number | undefined | null>;
  envelope: PlaylistSectionEnergyEnvelope;
  sampleCount?: number;
}

export interface SectionEnergyCoverage {
  candidateCount: number;
  knownEnergyCount: number;
  missingEnergyCount: number;
  minimumAvailableEnergy: number | null;
  maximumAvailableEnergy: number | null;
  preferredMatchCount: number;
  weakMatchCount: number;
}

// Tolerance bands (§7.2), expressed on the 0–1 scale as a fraction of the
// spec's ±1/±2 (out of a 9-point 1–10 range) — i.e. ±1/9 and ±2/9.
export const PREFERRED_TOLERANCE = 1 / 9;
export const ACCEPTABLE_TOLERANCE = 2 / 9;

export function computeSectionEnergyCoverage(input: SectionEnergyCoverageInput): SectionEnergyCoverage {
  const known = input.energies.filter((e): e is number => typeof e === "number" && Number.isFinite(e));
  const targetSamples = getEnergyEnvelopePreview(input.envelope, input.sampleCount ?? 10);
  // For each known-energy candidate, compare against the nearest sampled
  // target across the section's positions (a candidate is "preferred" if it
  // could satisfy the envelope somewhere in the section, not just at one
  // arbitrary position).
  let preferredMatchCount = 0;
  let weakMatchCount = 0;
  for (const e of known) {
    let bestDist = Infinity;
    for (const target of targetSamples) {
      const dist = Math.abs(e - target);
      if (dist < bestDist) bestDist = dist;
    }
    if (bestDist <= PREFERRED_TOLERANCE) preferredMatchCount++;
    else if (bestDist > ACCEPTABLE_TOLERANCE) weakMatchCount++;
  }

  return {
    candidateCount: input.energies.length,
    knownEnergyCount: known.length,
    missingEnergyCount: input.energies.length - known.length,
    minimumAvailableEnergy: known.length ? Math.min(...known) : null,
    maximumAvailableEnergy: known.length ? Math.max(...known) : null,
    preferredMatchCount,
    weakMatchCount,
  };
}

export function describeSectionEnergyWarning(sectionLabel: string, coverage: SectionEnergyCoverage, envelope: PlaylistSectionEnergyEnvelope): string | null {
  if (coverage.candidateCount === 0) return null;
  if (coverage.knownEnergyCount === 0) {
    return `"${sectionLabel}" has no candidates with known energy — the energy envelope cannot be enforced for this section.`;
  }
  if (coverage.knownEnergyCount / coverage.candidateCount < 0.5) {
    return `"${sectionLabel}": fewer than half of its candidates (${coverage.knownEnergyCount}/${coverage.candidateCount}) have known energy — envelope matching will be weaker than usual.`;
  }
  const envelopeMax = Math.max(envelope.start, envelope.end);
  const envelopeMin = Math.min(envelope.start, envelope.end);
  if (coverage.maximumAvailableEnergy != null && envelopeMax > coverage.maximumAvailableEnergy + PREFERRED_TOLERANCE) {
    return `"${sectionLabel}" reaches energy ${envelopeMax.toFixed(2)}, but this section's candidate pool currently covers ${coverage.minimumAvailableEnergy?.toFixed(2)}–${coverage.maximumAvailableEnergy.toFixed(2)}.`;
  }
  if (coverage.minimumAvailableEnergy != null && envelopeMin < coverage.minimumAvailableEnergy - PREFERRED_TOLERANCE) {
    return `"${sectionLabel}" reaches down to energy ${envelopeMin.toFixed(2)}, but this section's candidate pool currently covers ${coverage.minimumAvailableEnergy.toFixed(2)}–${coverage.maximumAvailableEnergy?.toFixed(2)}.`;
  }
  if (coverage.preferredMatchCount < 2) {
    return `"${sectionLabel}" has fewer than two candidates within the preferred energy band for a substantial part of the section.`;
  }
  return null;
}
