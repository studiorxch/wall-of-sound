import type { StrokePoint } from "./types";
import type { FlairModeId, SurfaceContextId } from "./ToolTaxonomy";

/**
 * Flair, concretely: for each `FlairModeId` (see `ToolTaxonomy.ts`), a set of
 * deterministic, pure, normalized 0-1 curves — no `Math.random`, no wall-
 * clock reads, no DOM. Every curve is a function of `t` (a normalized
 * simulated-distance input, 0 = near/close to the surface, 1 = far/pulled
 * back) except `transitionSmoothing` and `endpointShapingAuthority`, which
 * are per-mode constants (a rate and an authority scalar, not distance-
 * dependent shapes).
 *
 * This module defines BEHAVIOR, not rendering. Nothing here draws a pixel or
 * knows about any cap's geometry — see `resolveFlairModulation` and
 * `applyFlairOutputToPoint` below for the only two places a Flair value
 * reaches something a renderer consumes, and both only ever touch the
 * already-generic `output`/`opacity` channel every cap's `StrokePoint`
 * already carries (see `SprayBrushEngine`'s existing `point.opacity` use as
 * `sprayOutput`). Width/size denormalization into an actual `baseRadius`
 * value is the caller's job (see `main.ts`'s `adjustTrackMarksFlairDistance`).
 */
export interface FlairCurveSet {
  /**
   * Gain applied to a raw input delta (e.g. screen-pixel drag distance)
   * before it accumulates into a simulated-distance value. Higher = the same
   * physical input produces a larger simulated-distance change. Matches the
   * brief's table: wall HIGH, blackbook LOW-MEDIUM, wild EXAGGERATED.
   */
  distanceSensitivity: number;
  /**
   * Normalized simulated distance (0-1) -> normalized width fraction.
   * Monotonically increasing on [0,1] for every real mode (never for `off`,
   * which is the identity `t => t` — see `FLAIR_CURVES.off`). The curve's
   * value AT t=1 is that mode's effective width RANGE: wall is "physically
   * bounded" (max 1), blackbook is "tight" (a narrower max than wall), wild
   * is "extended" (a max beyond wall's, i.e. > 1 — genuinely exceeding the
   * physically-bounded range, matching "may exceed plausible physical spray
   * behavior").
   */
  widthExpansion: (t: number) => number;
  /**
   * Lerp rate applied once per input sample when chasing a new target
   * simulated-distance value (see `main.ts`). 1 = instant/no smoothing (only
   * `off`). Lower = slower, smoother transitions (wall); higher = quicker
   * (blackbook) or aggressive (wild).
   */
  transitionSmoothing: number;
  /** Normalized simulated distance (0-1) -> texture-bloom magnitude (0-1+). Wall rises with distance, blackbook stays restrained, wild is strong. Schema-level in this pass — not yet wired to any renderer (see module doc). */
  textureBloom: (t: number) => number;
  /** Normalized simulated distance (0-1) -> a multiplier applied to `output`/opacity. Wall attenuates with distance (real falloff); blackbook is mild; wild is 1 everywhere ("optional/stylized" — deliberately not attenuated, per the brief). `off` is always 1. */
  outputAttenuation: (t: number) => number;
  /** Constant 0-1 scalar: how much authority this mode claims over endpoint shaping — physical (wall, moderate), controlled (blackbook, low), expressive (wild, high). Schema-level in this pass — Track Marks' own endpoint behavior is unchanged; see module doc. */
  endpointShapingAuthority: number;
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const IDENTITY_CURVES: FlairCurveSet = {
  distanceSensitivity: 1,
  widthExpansion: (t) => clamp01(t),
  transitionSmoothing: 1,
  textureBloom: () => 0,
  outputAttenuation: () => 1,
  endpointShapingAuthority: 0,
};

const WALL_MAX_WIDTH = 1;
const BLACKBOOK_MAX_WIDTH = 0.55;
const WILD_MAX_WIDTH = 1.6;

export const FLAIR_CURVES: Record<FlairModeId, FlairCurveSet> = {
  off: IDENTITY_CURVES,
  wall: {
    distanceSensitivity: 1,
    // Slower-starting, "physically bounded" rise -- never exceeds 1.
    widthExpansion: (t) => WALL_MAX_WIDTH * Math.pow(clamp01(t), 1.3),
    transitionSmoothing: 0.12,
    // Rises with distance, per the brief's own table.
    textureBloom: (t) => clamp01(t),
    // Real attenuation: output at full distance is 60% of output at rest.
    outputAttenuation: (t) => 1 - 0.4 * clamp01(t),
    endpointShapingAuthority: 0.4,
  },
  blackbook: {
    distanceSensitivity: 0.5,
    // Quick early rise, capped to a tight/narrow max range.
    widthExpansion: (t) => BLACKBOOK_MAX_WIDTH * Math.pow(clamp01(t), 0.6),
    transitionSmoothing: 0.4,
    // Restrained -- a small fraction of wall's bloom at any given distance.
    textureBloom: (t) => 0.25 * clamp01(t),
    // Mild attenuation only.
    outputAttenuation: (t) => 1 - 0.15 * clamp01(t),
    endpointShapingAuthority: 0.2,
  },
  wild: {
    distanceSensitivity: 1.6,
    // Fast, aggressive rise to an EXTENDED max range beyond wall's.
    widthExpansion: (t) => WILD_MAX_WIDTH * Math.pow(clamp01(t), 0.5),
    transitionSmoothing: 0.75,
    // Strong -- rises faster and higher than wall at every distance.
    textureBloom: (t) => Math.min(1.4, 1.4 * clamp01(t)),
    // "Optional/stylized" -- deliberately no physical falloff.
    outputAttenuation: () => 1,
    endpointShapingAuthority: 0.85,
  },
};

export interface FlairModulationInput {
  /** Normalized simulated distance, 0 (near) - 1 (far). */
  distance01: number;
  /** Baseline output/opacity (0-1) before Flair's attenuation. */
  output: number;
  velocity: number;
  angle: number;
}

export interface FlairModulationResult extends FlairModulationInput {
  width01: number;
  bloom01: number;
  endpointAuthority: number;
}

/**
 * The "Flair Mapping" step of the architecture:
 *   Input -> Surface Context -> Flair Mapping -> CanonicalSprayState -> Cap Renderer
 * Pure and deterministic. `velocity`/`angle` pass through unmodified in this
 * distance-only pass (matching the Flare V1 precedent of shipping distance
 * modulation first). `off` returns `output` unchanged and `width01` equal to
 * `distance01` -- true identity, no extra modulation.
 */
export function resolveFlairModulation(mode: FlairModeId, input: FlairModulationInput): FlairModulationResult {
  const curves = FLAIR_CURVES[mode];
  const t = clamp01(input.distance01);
  return {
    ...input,
    width01: curves.widthExpansion(t),
    bloom01: curves.textureBloom(t),
    endpointAuthority: curves.endpointShapingAuthority,
    output: input.output * curves.outputAttenuation(t),
  };
}

/**
 * Numeric inverse of `widthExpansion` (each curve is monotonic non-
 * decreasing on [0,1], so a plain binary search is sufficient — no need to
 * store or expose each curve's own exponent). Used to SEED a fresh
 * simulated-distance gesture from whatever absolute size a cap is already
 * at, so the very first modulated sample continues smoothly from there
 * instead of snapping to a stale prior distance value — see `main.ts`'s
 * `beginSimulatedDistanceDrag` for why this matters ("no sudden jumps").
 */
export function inverseWidthExpansion(mode: FlairModeId, targetWidth01: number): number {
  const curve = FLAIR_CURVES[mode].widthExpansion;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (curve(mid) < targetWidth01) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Section 3 of the brief: surface context selects or biases the Flair default only -- never hard-codes screen position as depth. */
export function resolveDefaultFlairMode(surfaceContext: SurfaceContextId): FlairModeId {
  switch (surfaceContext) {
    case "wall": return "wall";
    case "blackbook": return "blackbook";
    case "neutral": return "off";
  }
}

/**
 * The ONLY point a Flair-resolved value reaches a `StrokePoint` -- and it
 * only ever multiplies the existing generic `opacity` channel
 * (`SprayBrushEngine` already reads this as `sprayOutput`/core-pass alpha
 * for every cap). Scoped to Track Marks only, per the brief's "safe creative
 * sandbox" instruction: any other cap id, or Track Marks with Flair `off`,
 * returns `point` completely untouched (identity), so every physical cap and
 * every non-Alt-drag stroke stays byte-identical to its pre-Flair behavior.
 */
export function applyFlairOutputToPoint(
  point: StrokePoint,
  capId: string,
  mode: FlairModeId,
  outputMultiplier: number,
): StrokePoint {
  if (capId !== "track-marks" || mode === "off") return point;
  return { ...point, opacity: point.opacity * outputMultiplier };
}

/**
 * Section 7 of the brief: non-invasive pro-control metadata, derived (never
 * hand-duplicated) from each mode's own curve constants. Labels only, no new
 * editor UI in this pass -- see the checkpoint doc for why Brush Studio
 * integration was deferred.
 */
export interface FlairProControlMetadata {
  flairAmount: number;
  flairSmoothing: number;
  flairRange: number;
  bloomResponse: number;
  outputFalloff: number;
}

export function getFlairProControlMetadata(mode: FlairModeId): FlairProControlMetadata {
  const curves = FLAIR_CURVES[mode];
  return {
    flairAmount: curves.distanceSensitivity,
    flairSmoothing: curves.transitionSmoothing,
    flairRange: curves.widthExpansion(1),
    bloomResponse: curves.textureBloom(1),
    outputFalloff: 1 - curves.outputAttenuation(1),
  };
}

// ---------------------------------------------------------------------------
// Brush Studio Flair controls (V0.8.1) — the FIVE pro-control scalars above
// are not just readouts, they're the EDITABLE surface a Brush Studio session
// override can move. Critically, this does NOT change any curve's equation
// or shape: `resolveFlairModulationWithParams` reuses each mode's own
// `widthExpansion`/`textureBloom`/`outputAttenuation` SHAPE unmodified and
// only rescales its MAGNITUDE by the ratio between the effective (possibly
// overridden) scalar and that mode's own canonical scalar — "control
// surface, not new physics," per the build brief. `flairAmount` and
// `flairSmoothing` map directly (they were already exactly these scalars —
// `distanceSensitivity`/`transitionSmoothing` — with no curve shape to
// preserve).

/** `EffectiveFlairParams` is structurally `FlairProControlMetadata` — the same five scalars, just possibly overridden rather than read straight off a mode's canonical curve. One shape, two roles (baseline vs. effective), kept as a type alias so the two are always interchangeable. */
export type EffectiveFlairParams = FlairProControlMetadata;

/** Ratio-scale one canonical curve shape by how far `effective` has moved from `baseline`; 1 (no-op) when the baseline itself is 0 (nothing to scale against) and the effective value is also 0. */
function scaleRatio(effective: number, baseline: number): number {
  if (baseline === 0) return effective === 0 ? 1 : effective;
  return effective / baseline;
}

/** The effective, possibly-rescaled `widthExpansion` curve for a mode + params — used by both `resolveFlairModulationWithParams` and `inverseEffectiveWidthExpansion` so seeding and live modulation always agree on the same shape. */
function resolveEffectiveWidthExpansionCurve(mode: FlairModeId, params: EffectiveFlairParams): (t: number) => number {
  const baseline = getFlairProControlMetadata(mode);
  const rangeScale = scaleRatio(params.flairRange, baseline.flairRange);
  return (t: number) => FLAIR_CURVES[mode].widthExpansion(t) * rangeScale;
}

/**
 * Same role as `resolveFlairModulation`, but driven by an explicit
 * `EffectiveFlairParams` bundle (a mode default merged with a Brush Studio
 * session override — see `FlairProperties.ts`) instead of reading the mode's
 * canonical scalars directly. `off` is unaffected regardless of `params`: it
 * is never editable in Brush Studio and its own canonical shape already
 * ignores every scalar (see module doc).
 */
export function resolveFlairModulationWithParams(
  mode: FlairModeId,
  params: EffectiveFlairParams,
  input: FlairModulationInput,
): FlairModulationResult {
  const baseline = getFlairProControlMetadata(mode);
  const base = FLAIR_CURVES[mode];
  const t = clamp01(input.distance01);
  const bloomScale = scaleRatio(params.bloomResponse, baseline.bloomResponse);
  const falloffScale = scaleRatio(params.outputFalloff, baseline.outputFalloff);
  const widthExpansion = resolveEffectiveWidthExpansionCurve(mode, params);
  const attenuation = 1 - (1 - base.outputAttenuation(t)) * falloffScale;
  return {
    ...input,
    width01: widthExpansion(t),
    bloom01: base.textureBloom(t) * bloomScale,
    endpointAuthority: base.endpointShapingAuthority,
    output: input.output * attenuation,
  };
}

/** Numeric inverse of `resolveEffectiveWidthExpansionCurve` — same binary-search technique as `inverseWidthExpansion`, generalized to an overridden `flairRange`. Used to seed a fresh drag from the cap's current size under whatever Range is currently in effect for this brush + mode. */
export function inverseEffectiveWidthExpansion(mode: FlairModeId, params: EffectiveFlairParams, targetWidth01: number): number {
  const curve = resolveEffectiveWidthExpansionCurve(mode, params);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (curve(mid) < targetWidth01) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Track Marks' own wall-unit size range for Flair's normalized `width01` —
 * a floor plus a span, shared by the live routing hook (`main.ts`) and
 * Brush Studio's preview/readouts so both denormalize identically. The floor
 * matches the legacy Alt-drag clamp's own floor (see `main.ts`) so toggling
 * Flair on/off never jumps the resolved size range.
 */
export const TRACK_MARKS_FLAIR_MIN_SIZE = 4;
export const TRACK_MARKS_FLAIR_SIZE_SPAN = 60;

export function denormalizeTrackMarksFlairWidth(width01: number): number {
  return TRACK_MARKS_FLAIR_MIN_SIZE + width01 * TRACK_MARKS_FLAIR_SIZE_SPAN;
}

export function normalizeTrackMarksFlairWidth(size: number): number {
  return Math.max(0, (size - TRACK_MARKS_FLAIR_MIN_SIZE) / TRACK_MARKS_FLAIR_SIZE_SPAN);
}

/**
 * Track Marks' TRUE resolved size range (wall units) at the given mode +
 * effective params — for display only (Brush Studio's "Effective Range"
 * readout, build brief section 7: "ensure Brush Studio displays the true
 * effective Track Marks width/range without lying/clamping"). Unlike the
 * compact `#brush-radius` slider (a shared control with its own `max="72"`
 * HTML attribute, correct for every physical cap but cosmetically clamped
 * for Wild — see the checkpoint doc), this reads directly off the same
 * curve `resolveFlairModulationWithParams` itself uses, so it can never
 * under-report Wild's genuinely extended range.
 */
export function resolveTrackMarksFlairSizeRange(mode: FlairModeId, params: EffectiveFlairParams): { min: number; max: number } {
  const curve = resolveEffectiveWidthExpansionCurve(mode, params);
  return {
    min: denormalizeTrackMarksFlairWidth(curve(0)),
    max: denormalizeTrackMarksFlairWidth(curve(1)),
  };
}
