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
    // Real Spray Pass build brief, section 3: "real flares are not only
    // width changes... lighter/more translucent as it opens." Raised from
    // 0.4 (prior pass) to 0.55 -- output at full distance is now 45% of
    // output at rest, a visibly translucent aerosol bloom rather than a
    // still-fairly-solid wide tube, matching the reference "balloon" read.
    outputAttenuation: (t) => 1 - 0.55 * clamp01(t),
    endpointShapingAuthority: 0.4,
  },
  blackbook: {
    distanceSensitivity: 0.5,
    // Quick early rise, capped to a tight/narrow max range.
    widthExpansion: (t) => BLACKBOOK_MAX_WIDTH * Math.pow(clamp01(t), 0.6),
    transitionSmoothing: 0.4,
    // Restrained -- a small fraction of wall's bloom at any given distance.
    textureBloom: (t) => 0.25 * clamp01(t),
    // Mild attenuation, raised slightly (0.15->0.2) alongside Wall's for the
    // same "not just width" reason -- still deliberately restrained relative
    // to Wall, matching Blackbook's own controlled/calligraphic character.
    outputAttenuation: (t) => 1 - 0.2 * clamp01(t),
    endpointShapingAuthority: 0.2,
  },
  wild: {
    distanceSensitivity: 1.6,
    // Fast, aggressive rise to an EXTENDED max range beyond wall's.
    widthExpansion: (t) => WILD_MAX_WIDTH * Math.pow(clamp01(t), 0.5),
    transitionSmoothing: 0.75,
    // Strong -- rises faster and higher than wall at every distance.
    textureBloom: (t) => Math.min(1.4, 1.4 * clamp01(t)),
    // Flair Stroke Envelope Stabilization build brief, section 4: every real
    // mode must be ABLE to produce "wider while lighter" (a cap should be
    // able to, "depending on mode/preset" — not every mode is required to
    // default to strong falloff, but a mode with literally NO attenuation
    // shape has nothing for the `outputFalloff` control to scale, per
    // `scaleRatio`'s own baseline-zero branch — confirmed dead by a V0.8.3
    // test). A small, genuine default (10% at full distance, "optional/
    // stylized" in character, not a real physical claim) replaces the prior
    // flat `() => 1`, giving Wild's own Output Falloff control real range to
    // work with while staying its own default near-imperceptible.
    outputAttenuation: (t) => 1 - 0.1 * clamp01(t),
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
  // Applies this mode's own DEFAULT Depth Response (section A2) — keeps this
  // canonical-only evaluation consistent with what
  // `resolveFlairModulationWithParams(mode, canonicalDefaults, input)` would
  // produce. `off`'s default is `far-wide`, but its curves ignore polarity
  // entirely (identity either way), so this changes nothing for `off`.
  const t = resolveDepthResponseCurveInput(input.distance01, FLAIR_MODE_DEFAULT_DEPTH_RESPONSE[mode]);
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
 *
 * NOTE (Flair Stroke Envelope Stabilization build brief): `flairRange` — a
 * relative multiplier of each mode's own curve magnitude — has been REMOVED
 * from this bundle. It is replaced by explicit `flairMinSize`/`flairMaxSize`
 * (absolute wall units, see `FlairSizeEnvelope` below), which is now the
 * SOLE size-envelope authority. Keeping both would have meant two controls
 * fighting over the same thing (Range scaled a relative shape magnitude that
 * only ever mattered THROUGH denormalization into absolute size — once
 * Min/Max own that denormalization directly, Range has nothing left to
 * govern). See the checkpoint doc's "state model" section for the full
 * reasoning.
 */
export interface FlairProControlMetadata {
  flairAmount: number;
  flairSmoothing: number;
  bloomResponse: number;
  outputFalloff: number;
  /** See `FlairDepthResponseId` below — a mapping POLARITY, not a new curve. */
  depthResponse: FlairDepthResponseId;
}

/**
 * Flair Stabilization build brief, section A2: which physical direction of
 * simulated-distance change produces a WIDER spray. `far-wide` (the
 * pre-existing, only prior behavior): moving farther/outward widens.
 * `near-wide`: moving nearer widens instead. This is a mapping POLARITY
 * only — see `resolveDepthResponseCurveInput` below, the single place it is
 * applied. It never creates a second renderer or a second curve family;
 * every mode's `widthExpansion`/`textureBloom`/`outputAttenuation` SHAPE is
 * reused completely unmodified, just fed a (possibly) mirrored input.
 */
export type FlairDepthResponseId = "far-wide" | "near-wide";

/** Section A2's defaults table. `off` is listed for completeness only — `applyFlairOutputToPoint`/the `off` branch everywhere else never reaches this, since `off` is always identity regardless of polarity. */
export const FLAIR_MODE_DEFAULT_DEPTH_RESPONSE: Record<FlairModeId, FlairDepthResponseId> = {
  off: "far-wide",
  wall: "far-wide",
  blackbook: "near-wide",
  wild: "far-wide",
};

/** Mirrors normalized simulated distance around its own midpoint when the polarity is `near-wide`; identity for `far-wide`. Self-inverse (`flip(flip(t)) === t`), which is what lets `inverseEffectiveFlairDistance` below reuse it directly. */
function resolveDepthResponseCurveInput(distance01: number, depthResponse: FlairDepthResponseId): number {
  const t = clamp01(distance01);
  return depthResponse === "near-wide" ? 1 - t : t;
}

export function getFlairProControlMetadata(mode: FlairModeId): FlairProControlMetadata {
  const curves = FLAIR_CURVES[mode];
  return {
    flairAmount: curves.distanceSensitivity,
    flairSmoothing: curves.transitionSmoothing,
    bloomResponse: curves.textureBloom(1),
    outputFalloff: 1 - curves.outputAttenuation(1),
    depthResponse: FLAIR_MODE_DEFAULT_DEPTH_RESPONSE[mode],
  };
}

// ---------------------------------------------------------------------------
// Explicit size envelope (Flair Stroke Envelope Stabilization build brief,
// sections 1-2) — the fix for "Flair inherits the previous stroke's
// terminal size." A stroke's width no longer floats free as whatever the
// generic `size` override happens to hold; it is always resolved from an
// EXPLICIT `[flairMinSize, flairMaxSize]` envelope plus a `flairStartPosition`
// policy, both stated here rather than implied by leftover session state.

export type FlairStartPositionId = "min" | "max" | "center";

/**
 * Section 1's stroke-start policy. `reset-to-start` (the only implemented
 * value in this pass, per the brief's own "for now, default to
 * reset-to-start") means every new stroke's starting width is resolved fresh
 * from `flairStartPosition`, never inherited from wherever the previous
 * stroke's transient modulation left off. `continue-from-last` is named here
 * as the documented future option but has no resolution logic yet — see
 * `main.ts`'s `resetTrackMarksFlairForNewStroke`, the single place this
 * policy is applied.
 */
export type FlairStrokeStartPolicy = "reset-to-start" | "continue-from-last";

export const FLAIR_STROKE_START_POLICY: FlairStrokeStartPolicy = "reset-to-start";

export interface FlairSizeEnvelope {
  flairMinSize: number;
  flairMaxSize: number;
  flairStartPosition: FlairStartPositionId;
}

/**
 * Cap-family response tier (Flair Stroke Envelope Stabilization -- Real
 * Spray Pass build brief, sections 4/5/B): FAT caps can widen strongly with
 * a soft/translucent flare body; MID caps widen moderately; THIN caps widen
 * only a little and lean on texture/mist degradation instead, preserving a
 * skinny cap's identity rather than "suddenly behaving like a giant fat
 * cap." `getFlairCapTier` is the only place a cap id maps to a tier — Track
 * Marks is the only cap with a real runtime mapping (still the only Flair
 * consumer at runtime, per every prior brief's own "Track Marks only"
 * scope); every other id defaults to `"mid"` for schema completeness should
 * a future cap ever be wired in, never wiring anything new itself.
 */
export type FlairCapTier = "fat" | "mid" | "thin";

export function getFlairCapTier(capId: string): FlairCapTier {
  if (capId === "track-marks") return "fat";
  return "mid";
}

/**
 * Default envelope ratios, expressed relative to the CAP'S OWN preset
 * `baseRadius` (never the live/overridden session size — using the live size
 * would reintroduce exactly the carryover bug the prior pass fixed, since
 * the live size already reflects wherever a previous stroke or drag left
 * off). "Keep the model cap-relative where possible": a thin cap like Needle
 * (`baseRadius` 5) and a fat cap like Track Marks (`baseRadius` 42) each get
 * a sensible, proportionate envelope from ratios scaled by their own TIER —
 * see `FlairCurves.test.ts`'s dedicated Needle-shaped (tier "thin")
 * validation: very small minimum remains usable, only a MODEST maximum
 * expansion (unlike fat's dramatic one), no minimum-width collapse.
 *
 * FAT's own max ratios were raised from the prior pass (wall 1.5->1.8, wild
 * 2.4->2.8) — real headroom to open up, per section 4's "evaluate whether
 * Flair should work relative to a smaller base so the stroke can actually
 * expand." Track Marks' own resting `baseRadius` (42, Flair OFF) is
 * deliberately UNTOUCHED — every "Flair off unchanged" test/behavior this
 * whole arc has locked stays true; the extra headroom instead comes from
 * widening the FAT tier's own max ratio, which only ever multiplies the
 * FLAIR envelope, never the cap's own canonical size.
 */
const FLAIR_SIZE_MIN_RATIO_BY_TIER: Record<FlairCapTier, number> = {
  fat: 0.1,
  mid: 0.14,
  thin: 0.35,
};
const FLAIR_SIZE_MIN_FLOOR = 2;
const FLAIR_SIZE_MAX_RATIO_BY_TIER_MODE: Record<FlairCapTier, Record<FlairModeId, number>> = {
  fat: { off: 1, wall: 1.8, blackbook: 1.1, wild: 2.8 },
  mid: { off: 1, wall: 1.4, blackbook: 0.9, wild: 2.0 },
  // THIN: minimal width growth by design (section 5 — "less dramatic width
  // expansion... preserve the identity of a skinny cap"). The compensating
  // "more ugly spray/diffusion/mist" lives in `FLAIR_BLOOM_TIER_MULTIPLIER`
  // below, not in extra width.
  thin: { off: 1, wall: 1.15, blackbook: 0.75, wild: 1.35 },
};

/**
 * Section 5: thin caps trade width growth for MORE texture/mist emphasis at
 * the same `bloom01` value — a genuinely different response character, not
 * just a scaled-down fat cap. Applied once, in `resolveFlairModulationWithParams`
 * below, as a tier-aware multiplier on `bloom01` alongside the existing
 * user-editable `bloomResponse` override.
 */
const FLAIR_BLOOM_TIER_MULTIPLIER: Record<FlairCapTier, number> = {
  fat: 1,
  mid: 0.85,
  thin: 1.4,
};

export function getFlairBloomTierMultiplier(tier: FlairCapTier): number {
  return FLAIR_BLOOM_TIER_MULTIPLIER[tier];
}

export function getFlairSizeDefaults(mode: FlairModeId, capBaseRadius: number, tier: FlairCapTier = "fat"): { min: number; max: number } {
  const min = Math.max(FLAIR_SIZE_MIN_FLOOR, capBaseRadius * FLAIR_SIZE_MIN_RATIO_BY_TIER[tier]);
  const max = Math.max(min + 1, capBaseRadius * FLAIR_SIZE_MAX_RATIO_BY_TIER_MODE[tier][mode]);
  return { min, max };
}

/**
 * Real Spray Pass build brief, section 1/A: "Wall flare = typically small ->
 * wide as the can moves away / opens up... there should be a clean way to
 * define start width and end width." Every real mode now defaults to
 * `"min"` — a stroke starts thin/controlled and OPENS as the user pulls back
 * (far-wide) or presses in (near-wide, Blackbook's own polarity — "small ->
 * wide" still holds, just triggered by the opposite physical motion). This
 * replaces the prior pass's `"center"` default, which — combined with each
 * mode's own resolved size already sitting fairly close to its max — left
 * too little PERCEIVED room to open and made a light near-drag read as
 * "narrowing the wrong way" rather than "returning to a thin default."
 */
export function getFlairStartPositionDefault(mode: FlairModeId): FlairStartPositionId {
  return mode === "off" ? "center" : "min";
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

/** `EffectiveFlairParams` = the mode-scalar bundle PLUS the explicit size envelope (min/max/start) — one merged shape covering every Brush Studio Flair control, baseline or overridden. */
export type EffectiveFlairParams = FlairProControlMetadata & FlairSizeEnvelope;

/** Ratio-scale one canonical curve shape by how far `effective` has moved from `baseline`; 1 (no-op) when the baseline itself is 0 (nothing to scale against) and the effective value is also 0. */
function scaleRatio(effective: number, baseline: number): number {
  if (baseline === 0) return effective === 0 ? 1 : effective;
  return effective / baseline;
}

/**
 * The mode's own `widthExpansion` shape, normalized to [0,1] by its own
 * magnitude at t=1 — pure SHAPE (physically-bounded/tight/extended curvature
 * personality), with the magnitude itself cancelled out. Section 3: "map
 * normalized depth strictly into [Flair Min Size ... Flair Max Size] rather
 * than mutating generic brush size state directly" — this is the piece that
 * makes that possible: width is now always a clean 0-1 fraction of the way
 * from Min to Max, with the mode's shape governing ONLY where along that
 * fraction a given distance lands, never the absolute endpoints themselves.
 */
function widthShapeNormalized(mode: FlairModeId, curveT: number): number {
  const base = FLAIR_CURVES[mode];
  const shapeMax = base.widthExpansion(1) || 1;
  return clamp01(base.widthExpansion(clamp01(curveT)) / shapeMax);
}

/**
 * Numeric inverse of `widthShapeNormalized` — mode-only (no envelope
 * involved, since the shape is pure/normalized now), binary search against
 * the always-monotonic-increasing raw curve.
 */
function inverseWidthShapeNormalized(mode: FlairModeId, targetNormalized: number): number {
  const base = FLAIR_CURVES[mode];
  const shapeMax = base.widthExpansion(1) || 1;
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (base.widthExpansion(mid) / shapeMax < targetNormalized) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Same role as `resolveFlairModulation`, but driven by an explicit
 * `EffectiveFlairParams` bundle (a mode default merged with a Brush Studio
 * session override — see `FlairProperties.ts`) instead of reading the mode's
 * canonical scalars directly. `off` is unaffected regardless of `params`: it
 * is never editable in Brush Studio and its own canonical shape already
 * ignores every scalar (see module doc). `width01` is now ALWAYS a clean
 * [0,1] shape fraction (see `widthShapeNormalized`) — denormalize it into an
 * absolute size with `resolveFlairSize` below, using the SAME `params` this
 * call received, so a given `width01` always means the same absolute size
 * for a given envelope ("the same depth gesture should produce a
 * deterministic width every time," section 3).
 */
export function resolveFlairModulationWithParams(
  mode: FlairModeId,
  params: EffectiveFlairParams,
  input: FlairModulationInput,
): FlairModulationResult {
  const baseline = getFlairProControlMetadata(mode);
  const base = FLAIR_CURVES[mode];
  // Depth Response (section A2): the SAME curve shapes, fed a mirrored input
  // when the polarity is `near-wide` — applied once, here, so width, bloom,
  // and output attenuation all reinterpret "distance" consistently rather
  // than each channel picking its own polarity. `off`'s own curve is the
  // plain identity `t => t` (not direction-symmetric), so unlike every real
  // mode it is NOT depth-response-invariant by construction — `off` must
  // stay a hard identity regardless of any `depthResponse` override, so it
  // is excluded here explicitly rather than relying on the curve shape.
  const curveT = mode === "off" ? clamp01(input.distance01) : resolveDepthResponseCurveInput(input.distance01, params.depthResponse);
  const bloomScale = scaleRatio(params.bloomResponse, baseline.bloomResponse);
  const falloffScale = scaleRatio(params.outputFalloff, baseline.outputFalloff);
  const attenuation = 1 - (1 - base.outputAttenuation(curveT)) * falloffScale;
  return {
    ...input,
    width01: mode === "off" ? curveT : widthShapeNormalized(mode, curveT),
    bloom01: base.textureBloom(curveT) * bloomScale,
    endpointAuthority: base.endpointShapingAuthority,
    output: input.output * attenuation,
  };
}

/** Denormalizes a [0,1] `width01` (from `resolveFlairModulationWithParams`) into an absolute wall-unit size within `params`' own `[flairMinSize, flairMaxSize]` envelope — the ONLY place that envelope is consumed to produce a real size. */
export function resolveFlairSize(width01: number, params: FlairSizeEnvelope): number {
  return params.flairMinSize + clamp01(width01) * (params.flairMaxSize - params.flairMinSize);
}

/** Inverse of `resolveFlairSize` — an absolute size back to its [0,1] fraction of `params`' envelope. Degenerates to 0 for a zero-width envelope (`flairMaxSize === flairMinSize`) rather than dividing by zero. */
export function normalizeFlairSize(size: number, params: FlairSizeEnvelope): number {
  const span = params.flairMaxSize - params.flairMinSize;
  if (span <= 0) return 0;
  return clamp01((size - params.flairMinSize) / span);
}

/**
 * POLARITY-AWARE numeric inverse: finds the `distance01` that would produce
 * `targetSize` (an ABSOLUTE wall-unit size) under this mode+params' envelope
 * and Depth Response. Always inverts the pure normalized SHAPE (monotonic-
 * increasing by construction) and un-mirrors the result afterward —
 * `resolveDepthResponseCurveInput` is self-inverse, so applying it a second
 * time correctly reverses it; inverting the mirrored combination directly
 * would break a `near-wide` mode's own binary search, since it is monotonic-
 * DECREASING in `distance01`. Used to seed a fresh drag, AND to resolve
 * section 1's stroke-start policy (`resolveFlairStartDistance` below) from
 * an explicit target size instead of the cap's live/leftover one.
 */
export function inverseEffectiveFlairDistance(mode: FlairModeId, params: EffectiveFlairParams, targetSize: number): number {
  const targetNormalized = normalizeFlairSize(targetSize, params);
  const curveT = mode === "off" ? targetNormalized : inverseWidthShapeNormalized(mode, targetNormalized);
  return mode === "off" ? curveT : resolveDepthResponseCurveInput(curveT, params.depthResponse);
}

/**
 * Section 1/5's stroke-start resolution: the `distance01` a fresh stroke
 * should begin at, given `params.flairStartPosition` ("min" | "max" |
 * "center") and the CURRENT envelope + Depth Response — so `reset-to-start`
 * always initializes deterministically regardless of session history. Pure;
 * `main.ts`'s `resetTrackMarksFlairForNewStroke` is the only caller, invoked
 * unconditionally at every `pointerdown` (the actual bug fix — see the
 * checkpoint doc's root-cause section for why seeding on first Alt-drag
 * sample alone was insufficient).
 */
export function resolveFlairStartDistance(mode: FlairModeId, params: EffectiveFlairParams): number {
  const targetNormalized = params.flairStartPosition === "min" ? 0 : params.flairStartPosition === "max" ? 1 : 0.5;
  const targetSize = params.flairMinSize + targetNormalized * (params.flairMaxSize - params.flairMinSize);
  return inverseEffectiveFlairDistance(mode, params, targetSize);
}
