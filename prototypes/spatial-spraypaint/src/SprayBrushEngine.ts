import {
  buildContinuousDripStrip,
  resolveDripStripSection,
  type DripSeed,
  type DripStripSection,
} from "./DripLogic";
import { resolveSprayDynamics, type ResolvedSprayDynamics, type SprayCapPreset } from "./SprayCapPresets";
import { type StrokePoint } from "./types";

interface ActiveDrip extends DripSeed {
  color: string;
  startedAt: number;
  lastProgress: number;
  bend: number;
  durationMs: number;
  poolRendered: boolean;
}

/**
 * Fixed physical orientation for the one currently-defined "fixed-transversal"
 * cap (Calligraphy / Transversal). Matches the Marker Chisel's own nib angle so
 * both tool families share one StudioRich transversal convention. A real
 * transversal nozzle keeps this axis constant regardless of travel direction —
 * unlike overspray's anisotropy, which stays travel-relative and is untouched
 * here.
 */
export const TRANSVERSAL_AXIS_ANGLE = (-25 * Math.PI) / 180;

/**
 * Fill mode's per-stroke core-opacity ceiling. A single continuous stroke's
 * own densely-overlapping segments asymptote toward this value instead of
 * ~100%, leaving real headroom for a physically separate stroke (mouse/pen
 * lifted and pressed again) to build further coverage on top via ordinary
 * canvas compositing — which is untouched and already does this correctly.
 * Only applies when the caller opts in per-stroke; normal Spray behavior
 * (fillMode falsy) is completely unaffected.
 */
const FILL_MODE_CORE_CEILING = 0.45;

/**
 * Fill mode's local-saturation grid cell size is derived from the cap's own
 * radius (see usage below) rather than a single fixed constant, so the
 * granularity scales sensibly across thin and fat caps. This factor sets that
 * relationship: smaller than the radius so a fat cap's sweep still spans
 * several cells along its travel direction.
 */
const FILL_MODE_CELL_SIZE_RATIO = 0.6;

/**
 * The angle used to orient a cap's anisotropic squash (core width AND
 * overspray plume shape alike). A directional/"fixed-transversal" cap
 * (anisotropy < 1, currently only Calligraphy) keeps this at its fixed
 * physical axis regardless of travel direction — a real transversal nozzle's
 * orientation doesn't rotate as the hand moves. Every other cap keeps using
 * travel direction, which is a no-op for symmetric caps (anisotropy === 1).
 * Exported as a pure function so the "no wiggle/no rotating ribbon"
 * requirement is directly unit-testable without recording particle draws.
 */
export function resolveOverspraySquashAngle(anisotropy: number, travelAngle: number): number {
  return anisotropy < 1 ? TRANSVERSAL_AXIS_ANGLE : travelAngle;
}

/**
 * Elongation ratios (relative to the resolved deposition radius) for the two
 * shaped-stamp deposition modes. Slot is deliberately MORE elongated than
 * oval (bigger length:width aspect ratio) — "more obvious wide/narrow
 * contrast" than Oval Calligraphy, per the physical-reference brief.
 */
const OVAL_STAMP_LENGTH_RATIO = 1.3;
const OVAL_STAMP_WIDTH_RATIO = 0.55;
const SLOT_STAMP_LENGTH_RATIO = 1.55;
const SLOT_STAMP_WIDTH_RATIO = 0.4;
/** Slot corner radius as a fraction of the stamp's own half-width — enough to soften the rectangle for aerosol realism without reading as an oval. */
const SLOT_STAMP_CORNER_RATIO = 0.22;

export interface ShapedStampGeometry {
  shape: "oval" | "slot";
  halfLength: number;
  halfWidth: number;
  rotation: number;
  cornerRadius: number;
}

/**
 * Pure geometry for one shaped core stamp. Notably takes NO travel-direction
 * input at all — the shape's dimensions and rotation are fixed regardless of
 * how the path moves, which is the actual fix for "must not rotate with the
 * stroke tangent": there is nothing here for travel direction to influence.
 * Returns null for "line" caps, which keep the original stroked-line path.
 */
export function resolveShapedStampGeometry(
  depositionShape: SprayCapPreset["depositionShape"],
  scale: number,
): ShapedStampGeometry | null {
  if (depositionShape !== "oval" && depositionShape !== "slot") return null;
  const lengthRatio = depositionShape === "oval" ? OVAL_STAMP_LENGTH_RATIO : SLOT_STAMP_LENGTH_RATIO;
  const widthRatio = depositionShape === "oval" ? OVAL_STAMP_WIDTH_RATIO : SLOT_STAMP_WIDTH_RATIO;
  const halfWidth = scale * widthRatio;
  return {
    shape: depositionShape,
    halfLength: scale * lengthRatio,
    halfWidth,
    rotation: TRANSVERSAL_AXIS_ANGLE,
    cornerRadius: depositionShape === "slot" ? halfWidth * SLOT_STAMP_CORNER_RATIO : 0,
  };
}

/**
 * The apparent stroke width a fixed-rotation shaped stamp produces when swept
 * along a given travel direction — the standard "support width" of an
 * ellipse/rounded-rect in the direction perpendicular to travel. This is a
 * pure consequence of the stamp's own fixed geometry, not a separate
 * width-modulation rule: travel parallel to the shape's long axis yields
 * ~2*halfWidth (narrow); travel perpendicular yields ~2*halfLength (wide).
 */
export function shapedStampWidthAlongTravel(geometry: ShapedStampGeometry, travelAngle: number): number {
  const perpendicular = travelAngle + Math.PI / 2;
  const local = perpendicular - geometry.rotation;
  return 2 * Math.sqrt(
    (geometry.halfLength * Math.cos(local)) ** 2 + (geometry.halfWidth * Math.sin(local)) ** 2,
  );
}

/**
 * Ring/Donut's annular alpha profile — a genuine hollow structure, not a
 * blurred dot with a halo layered on top. `centerOpacity` sits far below
 * `ringOpacity` (the defining "donut" shape), with a near-zero "moat" between
 * them so the ring band reads as a distinct raised structure rather than a
 * smooth taper. Pure function of the cap's own fields and the resolved
 * scale — no travel angle, no randomness, so it's identical at every stamp.
 */
export interface RingProfile {
  outerRadius: number;
  stops: ReadonlyArray<{ offset: number; alpha: number }>;
}

export function resolveRingProfile(cap: SprayCapPreset, scale: number, alphaScale: number): RingProfile | null {
  if (cap.ringRadius <= 0 || alphaScale <= 0) return null;
  const ringRadius = scale * cap.ringRadius;
  const thickness = Math.max(1, ringRadius * cap.ringThickness);
  const outerRadius = ringRadius + thickness;
  if (outerRadius <= 0) return null;
  const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
  const centerAlpha = cap.centerOpacity * alphaScale;
  const peakAlpha = cap.ringOpacity * alphaScale;
  return {
    outerRadius,
    stops: [
      { offset: 0, alpha: centerAlpha },
      { offset: clamp01((ringRadius - thickness) / outerRadius), alpha: centerAlpha * 0.2 },
      { offset: clamp01(ringRadius / outerRadius), alpha: peakAlpha },
      { offset: clamp01(Math.min(outerRadius, ringRadius + thickness * 0.6) / outerRadius), alpha: peakAlpha * 0.55 },
      { offset: 1, alpha: 0 },
    ],
  };
}

/**
 * Dry/Streak's deterministic lane-visibility gate. A pure function of the
 * resolved radius, which lane this is, and how far along the CURRENT travel
 * direction this segment sits (`alongTravel` — the segment position
 * projected onto the travel angle, so the pattern re-orients with the
 * stroke instead of being fixed to world-space axes). No `Math.random`
 * anywhere: the same inputs always produce the same gate, so replay is
 * pixel-identical. Different lanes get a fixed phase offset so they gap out
 * at different points along the stroke — the "ribbing" — rather than all
 * lanes vanishing together.
 */
const STREAK_CYCLE_LENGTH_RATIO = 2.2;
const STREAK_LANE_PHASE_STEP = (Math.PI * 2) / 5;
const STREAK_GATE_SHARPNESS = 1.6;

export function resolveStreakGate(radius: number, laneIndex: number, alongTravel: number): number {
  const cycleLength = Math.max(1, radius * STREAK_CYCLE_LENGTH_RATIO);
  const phase = (alongTravel / cycleLength) * Math.PI * 2 + laneIndex * STREAK_LANE_PHASE_STEP;
  return Math.max(0, Math.sin(phase)) ** STREAK_GATE_SHARPNESS;
}

export function createStrokeRandom(seed: number): () => number {
  let state = (seed || 1) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Pink Dot Fat's halo-distance correction (see `SprayCapPresets.ts`'s
 * `haloDistanceGain` field doc). Pure function of the cap and the resolved
 * (live) radius — a small resolved size relative to the cap's own
 * `baseRadius` (spraying "close," in effect) suppresses the halo toward a
 * clean hot dot/line; a large resolved size ("pulled back") amplifies it.
 * `haloDistanceGain` 0 always returns gain 1 — the exact legacy strength.
 */
export function resolveHaloDistanceGain(cap: SprayCapPreset, resolvedRadius: number): number {
  if (cap.haloDistanceGain <= 0 || cap.baseRadius <= 0) return 1;
  const sizeRatio = resolvedRadius / cap.baseRadius;
  const clampedRatio = Math.max(0.15, Math.min(1.8, sizeRatio));
  return 1 + (clampedRatio - 1) * cap.haloDistanceGain;
}

/**
 * Below this velocity, spraying reads as a stationary/near-stationary dwell
 * — the halo stays an exact circle (no elongation at all), matching typical
 * dwell fixture velocities (~0.03-0.05) used throughout this codebase's own
 * tests and the Calibration Bench's dwell samples. Real "oblique, moving"
 * spraying starts above this.
 */
const HALO_FLARE_VELOCITY_THRESHOLD = 0.12;

/**
 * Pink Dot Fat's oblique-flare correction (see `haloFlareAnisotropy` field
 * doc). Returns the halo's minor:major axis ratio — 1 is a perfect circle.
 * A stationary/near-stationary dwell (velocity at or below
 * `HALO_FLARE_VELOCITY_THRESHOLD`) always resolves to EXACTLY 1 regardless
 * of `haloFlareAnisotropy`, so dwell behavior is unaffected; faster travel
 * elongates the halo along the segment's own travel angle, reaching full
 * effect at 1.5 units/ms (the same normalization `mapVelocityToDensity`
 * already uses elsewhere in this engine).
 */
export function resolveHaloFlareRatio(cap: SprayCapPreset, velocity: number): number {
  if (cap.haloFlareAnisotropy <= 0) return 1;
  const clampedVelocity = Math.max(0, velocity);
  if (clampedVelocity <= HALO_FLARE_VELOCITY_THRESHOLD) return 1;
  const velocityFactor = Math.min(1, (clampedVelocity - HALO_FLARE_VELOCITY_THRESHOLD) / (1.5 - HALO_FLARE_VELOCITY_THRESHOLD));
  return 1 - cap.haloFlareAnisotropy * velocityFactor;
}

export interface HaloGradientStop {
  offset: number;
  alpha: number;
}

/**
 * Pink Dot Fat's center-plus-ring correction (see `haloRingBias` field doc).
 * At bias 0 this returns the ORIGINAL two-stop linear fade — byte-identical
 * to the pre-correction halo everywhere `haloRingBias` is 0 (every cap but
 * Pink Dot). At bias > 0 it returns a moat-then-peak profile so a large
 * resolved halo reads as a genuine center+ring bloom, not one smooth glow.
 * The stop alphas stay strictly proportional to the input `alpha`, so
 * scaling a cap's `haloOpacity` still scales every stop deterministically.
 */
export function resolveHaloGradientStops(cap: SprayCapPreset, alpha: number): readonly HaloGradientStop[] {
  if (cap.haloRingBias <= 0 || alpha <= 0) {
    return [{ offset: 0, alpha }, { offset: 1, alpha: 0 }];
  }
  const bias = Math.min(1, cap.haloRingBias);
  return [
    { offset: 0, alpha: alpha * (1 - bias * 0.55) },
    { offset: 0.42, alpha: alpha * (1 - bias) * 0.25 },
    { offset: 0.7, alpha: Math.min(1, alpha * (1 + bias * 0.35)) },
    { offset: 1, alpha: 0 },
  ];
}

/**
 * The bounded "sensible oblique maximum" for a simulated spray angle — see
 * `SprayInputState.sprayAngle`. Shared by the input mapper below and by
 * Brush Studio's "Spray Angle" slider / the Alt+wheel painting shortcut, so
 * the UI bound and the physics bound can never drift apart.
 */
export const PLUME_MAX_ANGLE_DEGREES = 45;
const PLUME_MAX_ANGLE_RADIANS = (PLUME_MAX_ANGLE_DEGREES * Math.PI) / 180;

/**
 * Input-neutral canonical spray-physics state (build brief section 6): what
 * `resolvePinkDotPlume` actually consumes. No mouse/pointer/keyboard
 * specifics anywhere in this shape — a future input source (e.g. Apple
 * Pencil tilt -> sprayAngle, pressure -> sprayOutput) only needs its own
 * `resolve*SprayInput` mapper that produces this same shape; the plume
 * resolver itself never changes.
 */
export interface SprayInputState {
  /** Radians. 0 = straight-on (perpendicular to the wall). Bounded to `PLUME_MAX_ANGLE_RADIANS`. */
  sprayAngle: number;
  /** Proxy for physical distance-from-wall. V1: resolved radius / cap baseRadius (the live Size control). 1 = the cap's own native size. Not a literal measurement. */
  sprayDistance: number;
  /** Proxy for spray output/flow, 0-1. V1: point opacity * coverage. */
  sprayOutput: number;
}

/**
 * Mouse/pointer V1's mapping into the canonical `SprayInputState` — the ONLY
 * place mouse-specific values (`point.width`, `sprayAngleDegrees` from the
 * Brush Studio property or the live Alt+wheel shortcut) are read for spray
 * physics purposes. `resolvePinkDotPlume` never sees them directly.
 */
export function resolveMouseSprayInput(
  point: StrokePoint,
  cap: SprayCapPreset,
  coverageFactor: number,
  sprayAngleDegrees: number,
): SprayInputState {
  const boundedDegrees = Math.max(0, Math.min(PLUME_MAX_ANGLE_DEGREES, sprayAngleDegrees));
  return {
    sprayAngle: (boundedDegrees * Math.PI) / 180,
    sprayDistance: cap.baseRadius > 0 ? point.width / cap.baseRadius : 1,
    sprayOutput: Math.max(0, Math.min(1, point.opacity * coverageFactor)),
  };
}

/**
 * Pink Dot Fat's dual-plume state — ONE physical cap, TWO coordinated
 * CONTINUOUS deposition layers, both resolved together from the same
 * inputs so distance/angle/velocity respond coherently across both. Not
 * independent tools: `inner` is a normal continuous line core (see
 * `renderPinkDotInnerCore`); `outer` is a TRUE four-zone radial density
 * field — a genuine low-density (literally unpainted) moat between the
 * core and a raised outer ring, then a fading mist beyond it (see
 * `resolvePinkDotOuterFieldZones`) — swept continuously along the path
 * under it every segment (see `renderPinkDotOuterField`) via ONE
 * geometric construction that handles a stationary point and a moving
 * segment identically (no per-segment velocity branch, no repeated
 * stamping). Both `sprayDistance` (geometry: how big) and dwell time
 * (density: how opaque) feed the SAME resolver, but only the latter is
 * ever applied outside it — radius never changes with dwell duration. See
 * `SprayCapPresets.ts`'s `plume*` field docs for what each input field
 * controls.
 */
export interface PinkDotInnerState {
  radius: number;
  opacity: number;
  /** Pass count — same concept as `ResolvedSprayDynamics.corePasses`, reused directly. */
  density: number;
  /** Same semantics as `SprayCapPreset.edgeFalloff` — higher is tighter/crisper. */
  falloff: number;
  /** Minor:major axis ratio — 1 is a perfect circle. A MODERATE stretch: half of `plumeFlareStrength * flareFactor`, keeping the line body legible under flare. */
  anisotropy: number;
}

export interface PinkDotOuterState {
  ringRadius: number;
  ringThickness: number;
  ringOpacity: number;
  mistRadius: number;
  mistOpacity: number;
  /** Minor:major axis ratio — 1 is a perfect circle. The FULL `plumeFlareStrength * flareFactor` stretch — stronger than the inner layer's. */
  anisotropy: number;
}

export interface PinkDotDualPlumeState {
  inner: PinkDotInnerState;
  outer: PinkDotOuterState;
}

/** Below this velocity, movement alone contributes no flare — matches the dwell-fixture velocities (~0.03-0.05) used throughout this codebase's tests. An explicit `sprayAngle` can still flare a stationary dwell; only the VELOCITY contribution is gated. */
const PLUME_VELOCITY_FLARE_THRESHOLD = 0.12;
/** Velocity (units/ms) at which the velocity-driven flare contribution reaches its full strength — matches `mapVelocityToDensity`'s own normalization elsewhere in this engine. */
const PLUME_VELOCITY_FLARE_FULL = 1.5;
/** The inner (core) layer's flare is deliberately a fraction of the outer layer's — "moderate" vs. "stronger" per the target behavior. */
const PLUME_INNER_FLARE_RATIO = 0.5;
/** The outer (mist) band's distance gain grows faster than the ring's own gain — "far" reads as disproportionately more atmospheric, not just uniformly bigger. */
const PLUME_MIST_GAIN_MULTIPLIER = 1.3;

export function resolvePinkDotDualPlume(
  cap: SprayCapPreset,
  input: SprayInputState,
  velocity: number,
  dynamics: ResolvedSprayDynamics,
): PinkDotDualPlumeState {
  const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

  // Distance gain applies ONLY to the outer bands — the inner core already
  // scales with resolved size directly (dynamics.radius), same as every
  // other cap, so outer always grows faster than inner with distance.
  const distanceRatio = Math.max(0.15, Math.min(1.8, input.sprayDistance));
  const outerGain = cap.plumeDistanceGain <= 0 ? 1 : 1 + (distanceRatio - 1) * cap.plumeDistanceGain;
  const mistGain = 1 + (outerGain - 1) * PLUME_MIST_GAIN_MULTIPLIER;

  // Flare: an explicit simulated spray angle and point velocity can each
  // independently drive elongation; the stronger of the two wins rather
  // than stacking, so combining them never produces an exaggerated effect.
  // Angle alone can flare even a perfectly stationary dwell (velocity 0).
  const angleFactor = clamp01(input.sprayAngle / PLUME_MAX_ANGLE_RADIANS);
  const clampedVelocity = Math.max(0, velocity);
  const velocityFactor = clampedVelocity <= PLUME_VELOCITY_FLARE_THRESHOLD
    ? 0
    : Math.min(1, (clampedVelocity - PLUME_VELOCITY_FLARE_THRESHOLD) / (PLUME_VELOCITY_FLARE_FULL - PLUME_VELOCITY_FLARE_THRESHOLD));
  const flareFactor = Math.max(angleFactor, velocityFactor);
  const outerAnisotropy = cap.plumeFlareStrength <= 0 ? 1 : 1 - cap.plumeFlareStrength * flareFactor;
  const innerAnisotropy = cap.plumeFlareStrength <= 0 ? 1 : 1 - cap.plumeFlareStrength * PLUME_INNER_FLARE_RATIO * flareFactor;

  return {
    inner: {
      radius: dynamics.radius,
      opacity: Math.min(0.72, dynamics.coreOpacity * input.sprayOutput),
      density: dynamics.corePasses,
      falloff: cap.edgeFalloff,
      anisotropy: innerAnisotropy,
    },
    outer: {
      ringRadius: dynamics.radius * cap.plumeRingRadius * outerGain,
      ringThickness: cap.plumeRingThickness,
      ringOpacity: Math.min(1, cap.plumeRingOpacity * input.sprayOutput * outerGain),
      mistRadius: dynamics.radius * cap.plumeMistRadius * mistGain,
      mistOpacity: Math.min(1, cap.plumeMistOpacity * input.sprayOutput * mistGain),
      anisotropy: outerAnisotropy,
    },
  };
}

/**
 * Pink Dot's outer atmosphere as a TRUE four-zone radial density profile —
 * a real low-density MOAT between the inner core and a raised outer RING,
 * then a fading MIST beyond it — expressed as pure geometry (radii, as
 * fractions of `outer.mistRadius`) rather than a gradient or a per-point
 * stamp. The moat is not a low alpha value, it is a region where NOTHING is
 * painted at all: `density(moat) = 0` structurally, strictly below any
 * positive core/ring/mist density, by construction rather than tuning.
 *
 * Both the ring and mist zones render as one continuous swept shape — the
 * Minkowski sum of the segment (or, for a true dwell, a single point) with
 * a disk of the zone's own radius, minus the same sum at the zone's inner
 * radius (see `tracePinkDotCapsule` / `drawPinkDotOuterFieldBand`). This
 * ONE geometric construction is what a stationary bullseye and a moving
 * band actually are: a point's "distance <= r" region is a circle; a
 * segment's "distance <= r" region is a capsule (stadium). There is no
 * separate "dot" vs. "line" renderer and no per-segment velocity branch —
 * the same call always produces the correct shape for whatever `start`/
 * `point` happen to be, including the degenerate `start === point` case.
 */
const RADIAL_MOAT_END_T = 0.55;
const RADIAL_RING_END_T = 0.8;

export interface PinkDotOuterFieldZones {
  moatRadius: number;
  ringOuterRadius: number;
  mistOuterRadius: number;
  ringAlpha: number;
  mistAlpha: number;
}

export function resolvePinkDotOuterFieldZones(outer: PinkDotOuterState): PinkDotOuterFieldZones | null {
  if (outer.mistRadius <= 0 || outer.ringOpacity <= 0) return null;
  return {
    moatRadius: outer.mistRadius * RADIAL_MOAT_END_T,
    ringOuterRadius: outer.mistRadius * RADIAL_RING_END_T,
    mistOuterRadius: outer.mistRadius,
    ringAlpha: outer.ringOpacity,
    // Structurally guaranteed below the ring peak regardless of how
    // mistOpacity/ringOpacity happen to be tuned.
    mistAlpha: Math.min(outer.mistOpacity, outer.ringOpacity * 0.85),
  };
}

/**
 * Pink Dot's TRUE stationary aerosol deposition field — a real physical
 * radial DENSITY CURVE, not four hard-edged vector zones. `densityAt(r)`
 * is `moatFloor + ringBump(r) + mistTail(r)`: a small constant floor (the
 * separation is a genuine density MINIMUM, never literal zero — a real can
 * always deposits a FEW stray particles there), a gaussian bump centered
 * on the ring's own radius, and a one-sided exponential tail starting at
 * the ring's outer edge that decays continuously outward with no radius
 * where it just stops. This is ONE continuous model, reused unchanged for
 * close/medium/far — the only thing that varies between distances is
 * `outer.ringRadius`/`outer.mistRadius`/`outer.ringOpacity`/
 * `outer.mistOpacity`, already resolved by `resolvePinkDotDualPlume` from
 * `sprayDistance` alone (dwell/time never reaches this function at all,
 * structurally — see `renderPinkDotStochasticOuterField`, which is the
 * only caller and applies dwell as a density multiplier outside this pure
 * curve, the same discipline `resolvePinkDotOuterFieldZones` already
 * uses).
 *
 * `moatRadius`/`moatDensity` are read directly off this curve (a numeric
 * search for its own local minimum between the core's edge and the ring's
 * peak) rather than independently chosen, so a retune of the ring/mist
 * bump shapes below can never silently desync the reported moat from what
 * actually renders.
 */
export interface PinkDotStationaryProfile {
  coreRadius: number;
  coreDensity: number;
  moatRadius: number;
  moatDensity: number;
  ringRadius: number;
  ringDensity: number;
  mistRadius: number;
  mistDensity: number;
  /** The full continuous radial density curve — the SAME function driving both the numeric readout above and where `renderPinkDotStochasticOuterField` places its particles. */
  densityAt: (r: number) => number;
}

/** Baseline density inside the separation gap, as a fraction of the ring's own peak — small but structurally nonzero. */
const PINK_DOT_STATIONARY_MOAT_FLOOR_RATIO = 0.05;
/** The ring bump's gaussian sigma, as a fraction of its own radius — wide enough to read as a band, narrow enough to stay a distinct peak from the core. */
const PINK_DOT_STATIONARY_RING_WIDTH_RATIO = 0.22;
/** The mist tail's exponential decay length, as a fraction of the gap between the ring and mist radii already resolved by `resolvePinkDotDualPlume`. */
const PINK_DOT_STATIONARY_MIST_DECAY_RATIO = 0.6;

/**
 * How closely `renderPinkDotStochasticOuterField` sub-samples a moving
 * segment, as a fraction of the footprint's own core DIAMETER — the
 * brief's own "spacing <= small_fraction_of(coreDiameter)". Small enough
 * that consecutive exposures overlap heavily and merge into one continuous
 * field at any realistic drag speed; derived from the footprint itself
 * (which shrinks and grows with distance) rather than a fixed pixel value,
 * so a tiny close-up dot and a huge far-away one both stay seamless.
 */
const PINK_DOT_STOCHASTIC_SPACING_RATIO = 0.18;

export function resolvePinkDotStationaryProfile(inner: PinkDotInnerState, outer: PinkDotOuterState): PinkDotStationaryProfile | null {
  if (outer.ringRadius <= 0 || outer.ringOpacity <= 0 || outer.mistRadius <= outer.ringRadius) return null;
  const ringWidth = Math.max(1, outer.ringRadius * PINK_DOT_STATIONARY_RING_WIDTH_RATIO);
  const ringOuterEdge = outer.ringRadius + ringWidth;
  const mistDecay = Math.max(1, (outer.mistRadius - outer.ringRadius) * PINK_DOT_STATIONARY_MIST_DECAY_RATIO);
  const moatFloor = outer.ringOpacity * PINK_DOT_STATIONARY_MOAT_FLOOR_RATIO;

  const densityAt = (r: number): number => {
    const fromRing = r - outer.ringRadius;
    const ringBump = outer.ringOpacity * Math.exp(-(fromRing * fromRing) / (2 * ringWidth * ringWidth));
    const beyondRing = r - ringOuterEdge;
    // A smooth sigmoid gate (not a hard `beyondRing > 0` step) blends the
    // mist term in continuously around the ring's own outer edge — a hard
    // step would jump the curve from 0 straight to `mistOpacity` at one
    // exact radius, which is itself the kind of "ends at a hard radius"
    // discontinuity this field is meant to avoid.
    const gate = 1 / (1 + Math.exp((-4 * beyondRing) / ringWidth));
    const mistTail = outer.mistOpacity * Math.exp(-Math.max(0, beyondRing) / mistDecay) * gate;
    return moatFloor + ringBump + mistTail;
  };

  // Numeric search, not a closed form — stays correct however the bump
  // shapes above get retuned, same reasoning `resolvePinkDotOuterFieldZones`
  // documents for the moving-rail system's own (differently-built) moat.
  let moatRadius = inner.radius;
  let moatDensity = densityAt(inner.radius);
  const steps = 48;
  for (let i = 1; i <= steps; i += 1) {
    const r = inner.radius + ((outer.ringRadius - inner.radius) * i) / steps;
    const d = densityAt(r);
    if (d < moatDensity) { moatDensity = d; moatRadius = r; }
  }

  const mistRadius = ringOuterEdge + mistDecay; // one decay-length beyond the ring's own outer edge
  return {
    coreRadius: inner.radius,
    coreDensity: inner.opacity,
    moatRadius,
    moatDensity,
    ringRadius: outer.ringRadius,
    ringDensity: densityAt(outer.ringRadius),
    mistRadius,
    mistDensity: densityAt(mistRadius),
    densityAt,
  };
}

/**
 * How strongly Pink Dot's own resolved `width` AND `velocity` each lag
 * their raw per-point values (see `SprayBrushEngine.pinkDotSmoothedWidth`
 * / `pinkDotSmoothedVelocity`) — the fraction of the gap to the new raw
 * value closed on each segment. 1 would mean no smoothing at all; smaller
 * values suppress more frame-to-frame jitter but take longer to track a
 * genuine, deliberate distance/speed ramp. Chosen to average out normal
 * per-point noise within a couple of segments while still following a
 * real ramp within a handful of them — segments are short relative to the
 * cap's own radius, so a few segments' lag is imperceptible against a
 * deliberate change.
 */
export const PINK_DOT_WIDTH_SMOOTHING = 0.05;

/**
 * A Pink Dot segment counts as "dwelling in place" when it travels less
 * than this fraction of the resolved radius AND its velocity is at or
 * below the stationary threshold — distance alone is not enough, because
 * real curve-smoothing can subdivide genuine, deliberate slow movement
 * into many segments individually shorter than this ratio without the
 * pointer having paused at all; velocity (the pipeline's own smoothed
 * speed estimate) is immune to that per-segment sampling noise. This gate
 * controls ONLY how much real elapsed time counts toward
 * `resolvePinkDotDwellScale`'s OPACITY ramp below — it never changes which
 * geometry gets drawn or how large it is. Geometry is a pure function of
 * `sprayDistance` (see `resolvePinkDotDualPlume`); dwell/time affects
 * density only, never radius.
 */
const PLUME_DWELL_DISTANCE_RATIO = 0.15;
/**
 * Real elapsed stationary time (ms) a Pink Dot dwell point needs to reach
 * full, un-scaled OPACITY. Chosen so buildup stays visibly progressive
 * across the 0.2s/0.5s/1s/2s live-test points rather than saturating almost
 * immediately.
 */
export const PLUME_DWELL_FULL_MS = 900;
/**
 * A brand-new dwell point — zero accumulated stationary time, whether from
 * a bare click or the instant real movement stops — never draws at literal
 * zero opacity; this floor keeps it faintly visible rather than invisible.
 */
const PLUME_DWELL_MIN_SCALE = 0.22;

/**
 * How strongly a Pink Dot dwell point should paint right now, given how
 * long it has genuinely been stationary at the SAME `sprayDistance` — an
 * OPACITY multiplier only, never a size one: 0ms (a fresh pointerdown, or
 * the instant after real movement stops) returns the floor scale — faint,
 * not a full bulb; ramps linearly to 1 (full density) by
 * `PLUME_DWELL_FULL_MS`. A 1s dwell and a 2s dwell both resolve to 1 here
 * (density then keeps building only through ordinary repeated-draw
 * compositing, exactly like any other cap's dwell) — the FOOTPRINT itself
 * never grows. Pure function of elapsed time only, directly testable
 * without engine state; a moving segment never calls this at all.
 */
export function resolvePinkDotDwellScale(dwellMs: number): number {
  const ramped = Math.max(0, Math.min(1, dwellMs / PLUME_DWELL_FULL_MS));
  return PLUME_DWELL_MIN_SCALE + (1 - PLUME_DWELL_MIN_SCALE) * ramped;
}

export class SprayBrushEngine {
  private activeDrips: ActiveDrip[] = [];
  /**
   * Uncapped virtual saturation [0,1] a given map cell would reach with
   * standard compositing, tracked only while fillMode is active and keyed by
   * a coarse grid cell so saturation is LOCAL to painted space, not global to
   * the whole gesture — a cell a stroke has never visited starts at 0 even
   * deep into a long continuous sweep, and revisiting the same cell (a
   * back-and-forth pass with no pointer release) keeps accumulating there
   * specifically. Reset at the start of every stroke (live or replayed), so
   * a new stroke always starts every cell fresh and composites normally on
   * top of whatever a prior stroke already deposited.
   */
  private fillLocalSaturation = new Map<string, number>();
  /**
   * Cumulative travel distance (world units) since the last drawn halo dab,
   * for caps with `haloDabSpacing > 0` — currently no built-in cap (Pink Dot
   * Fat used this mechanism prior to its dual-plume rework; the generic halo
   * mechanism remains dormant, preserved infrastructure — see `renderHalo`).
   * A single running scalar, not a spatial map like `fillLocalSaturation`:
   * dab spacing is a 1D "how far along THIS path since the last dab" concept,
   * not a per-location saturation one. Reset at the start of every stroke so
   * a new stroke's first dab always draws.
   */
  private haloTravelSinceLastDab = 0;
  /**
   * Real elapsed stationary time (ms) Pink Dot's dual-plume has spent
   * "dwelling in place" — see `resolvePinkDotDwellScale` and the
   * distance-based dwell gate in `renderSegment`. Accumulates only while
   * consecutive segments stay near-zero-distance; any real movement resets
   * it to 0, so a fresh touch/pause always starts from a clean 0 regardless
   * of how the stroke got there. Reset at the start of every stroke.
   */
  private pinkDotDwellMs = 0;
  /**
   * Exponentially-lagged `point.width` fed into Pink Dot's plume resolver
   * (see `PINK_DOT_WIDTH_SMOOTHING`) — suppresses the frame-to-frame width
   * jitter CanonicalStrokeManager deliberately applies (linking width to
   * instantaneous velocity) so the outer field's moat, a genuine geometric
   * hole, stays consistent across consecutive segments instead of a
   * handful of lower-jitter segments silently painting into a gap their
   * higher-jitter neighbors intended to leave empty. -1 means "not yet
   * initialized this stroke" — the very first segment adopts the raw width
   * outright rather than lagging from a stale value.
   */
  private pinkDotSmoothedWidth = -1;
  /** Same lag as `pinkDotSmoothedWidth`, for `point.velocity` — see its doc and the flare-anisotropy jitter it otherwise causes in the outer field's geometry. -1 means "not yet initialized this stroke." */
  private pinkDotSmoothedVelocity = -1;

  public resize(_width: number, _height: number): void {
    // The brush deposits directly into the persistent paint canvas.
  }

  public clear(): void {
    this.activeDrips = [];
  }

  public beginStroke(): void {
    this.fillLocalSaturation.clear();
    this.haloTravelSinceLastDab = 0;
    this.pinkDotDwellMs = 0;
    this.pinkDotSmoothedWidth = -1;
    this.pinkDotSmoothedVelocity = -1;
  }

  private fillCellKey(x: number, y: number, cellSize: number): string {
    return `${Math.round(x / cellSize)},${Math.round(y / cellSize)}`;
  }

  public renderSegment(
    ctx: CanvasRenderingContext2D,
    previous: StrokePoint | null,
    point: StrokePoint,
    colorHex: string,
    cap: SprayCapPreset,
    random: () => number = Math.random,
    coverage: number = 1,
    fillMode: boolean = false,
    sprayAngleDegrees: number = 0,
  ): void {
    const dynamics = resolveSprayDynamics(cap, point.velocity, point.width);
    const coverageFactor = Math.max(0, Math.min(1, coverage));
    const start = previous ?? point;
    const dx = point.x - start.x;
    const dy = point.y - start.y;
    const distance = Math.hypot(dx, dy);
    const angle = distance > 0 ? Math.atan2(dy, dx) : 0;
    const passOpacity = (dynamics.coreOpacity * point.opacity * coverageFactor) / Math.sqrt(dynamics.corePasses);
    // A directional/"fixed-transversal" cap (anisotropy < 1, currently only
    // Calligraphy) should read wide or thin depending on travel direction
    // relative to its fixed physical axis — not just uniformly thinner in
    // every direction, which is all the raw anisotropy factor alone gives.
    const directionalBroadening = Math.abs(Math.sin(angle - TRANSVERSAL_AXIS_ANGLE));
    const directionalAnisotropy = dynamics.anisotropy < 1
      ? dynamics.anisotropy + (1 - dynamics.anisotropy) * directionalBroadening
      : dynamics.anisotropy;

    // Wiggly Needle's bounded deterministic wander: a smooth lateral offset
    // driven by each point's own recorded timestamp (not Math.random), so it
    // reproduces identically on replay. Perpendicular to true travel — the
    // dynamics/velocity math above still uses the real path, only the drawn
    // ink wanders. Every other cap has wiggleAmplitude 0 and is unaffected.
    const wiggleAmplitude = dynamics.radius * cap.wiggleAmplitude;
    const drawStart: StrokePoint = { ...start };
    const drawPoint: StrokePoint = { ...point };
    if (wiggleAmplitude > 0) {
      const perpAngle = angle + Math.PI / 2;
      const perpX = Math.cos(perpAngle);
      const perpY = Math.sin(perpAngle);
      const startOffset = Math.sin(start.timestamp * cap.wiggleFrequency) * wiggleAmplitude;
      const pointOffset = Math.sin(point.timestamp * cap.wiggleFrequency) * wiggleAmplitude;
      drawStart.x += perpX * startOffset;
      drawStart.y += perpY * startOffset;
      drawPoint.x += perpX * pointOffset;
      drawPoint.y += perpY * pointOffset;
    }

    // Pink Dot Fat's dual-plume replaces the generic halo entirely (see
    // renderPinkDotDualPlume below) — the generic halo mechanism stays
    // dormant for it (haloRadius is 0), so this call already no-ops, but
    // skipping it explicitly documents that the two mechanisms are mutually
    // exclusive.
    if (cap.depositionShape !== "plume") {
      this.renderHalo(ctx, drawStart, drawPoint, colorHex, cap, dynamics, coverageFactor, angle, distance);
    }

    ctx.save();
    ctx.lineCap = cap.endpointBehavior === "raw" ? "butt" : "round";
    ctx.lineJoin = "round";

    // Fill mode's saturation ceiling must be LOCAL to where paint is actually
    // landing, not global to the whole gesture — otherwise a long sweep fades
    // to nothing by its own end, and a fresh area painted later in the same
    // continuous stroke wrongly inherits an already-spent budget from
    // wherever the stroke has been before. Segments are short relative to a
    // cap's own radius, so the segment's midpoint is a good stand-in for the
    // whole segment; the cell size scales with cap radius so thin and fat
    // caps both get sensible granularity.
    const cellSize = Math.max(1, dynamics.radius * FILL_MODE_CELL_SIZE_RATIO);
    const cellKey = fillMode
      ? this.fillCellKey((drawStart.x + drawPoint.x) / 2, (drawStart.y + drawPoint.y) / 2, cellSize)
      : null;

    // Populated only for a "plume" cap — reused below to keep overspray's
    // own flare coherent with the plume's atmosphere instead of using the
    // generic (fixed-transversal) squash-angle logic, which doesn't apply
    // to this cap's travel-following flare at all.
    let dualPlumeState: PinkDotDualPlumeState | null = null;

    if (cap.depositionShape === "plume") {
      // Pink Dot Fat replaces the concentric-pass LINE core (and the
      // generic halo, skipped above) with TWO coordinated CONTINUOUS layers
      // — see renderPinkDotDualPlume below. Both drawn every segment, no
      // distance-based gating, so the line body and its atmosphere stay
      // connected through corners, reversals, and loops.
      //
      // The outer field's moat is a genuine geometric hole (see
      // renderPinkDotOuterField), which makes it uniquely sensitive to
      // frame-to-frame noise in whatever drives its geometry — invisible
      // for every other cap's solid stroke, but enough for a handful of
      // segments along a long line to land on a slightly different radius
      // than their neighbors and silently paint into (or squash the shape
      // of) the gap the rest leave empty. Two PRE-EXISTING, app-wide
      // sources of that noise both feed Pink Dot's geometry and both get
      // smoothed (a short exponential lag, reset each stroke) before use:
      // CanonicalStrokeManager deliberately links each point's resolved
      // `width` to its instantaneous velocity ("restrained so starts/stops
      // do not form oversized bulbs"), and velocity itself (real mouse
      // movement is never perfectly even) drives the flare anisotropy that
      // squashes the whole band shape. Smoothing both still tracks a
      // genuine, deliberate sprayDistance/speed change within a handful of
      // segments — short relative to the cap's own radius.
      this.pinkDotSmoothedWidth = this.pinkDotSmoothedWidth < 0
        ? point.width
        : this.pinkDotSmoothedWidth + (point.width - this.pinkDotSmoothedWidth) * PINK_DOT_WIDTH_SMOOTHING;
      this.pinkDotSmoothedVelocity = this.pinkDotSmoothedVelocity < 0
        ? point.velocity
        : this.pinkDotSmoothedVelocity + (point.velocity - this.pinkDotSmoothedVelocity) * PINK_DOT_WIDTH_SMOOTHING;
      const plumeDynamics = resolveSprayDynamics(cap, this.pinkDotSmoothedVelocity, this.pinkDotSmoothedWidth);
      const input = resolveMouseSprayInput(point, cap, coverageFactor, sprayAngleDegrees);
      dualPlumeState = resolvePinkDotDualPlume(cap, input, this.pinkDotSmoothedVelocity, plumeDynamics);

      // Dwell-driven OPACITY (see resolvePinkDotDwellScale) — NEVER radius.
      // A segment counts as "dwelling in place" only when it barely
      // traveled AND its velocity is at or below the stationary threshold
      // (both together — see PLUME_DWELL_DISTANCE_RATIO's own doc for why
      // distance alone misclassifies genuine slow continuous movement).
      // Real elapsed time accumulates while consecutive segments stay
      // dwell-type and resets the instant real movement occurs, so a bare
      // click or an immediate release never paints at full strength, while
      // a genuine hold (or a mid-stroke pause) progressively strengthens —
      // the footprint's SIZE is set below by resolvePinkDotDualPlume from
      // sprayDistance alone and never touched here.
      const isDwellPoint = distance <= dynamics.radius * PLUME_DWELL_DISTANCE_RATIO
        && point.velocity <= PLUME_VELOCITY_FLARE_THRESHOLD;
      if (isDwellPoint) {
        this.pinkDotDwellMs += previous ? Math.max(0, point.timestamp - previous.timestamp) : 0;
      } else {
        this.pinkDotDwellMs = 0;
      }
      const dwellOpacityScale = isDwellPoint ? resolvePinkDotDwellScale(this.pinkDotDwellMs) : 1;

      this.renderPinkDotDualPlume(ctx, drawStart, drawPoint, colorHex, cap, dualPlumeState, angle, dwellOpacityScale, random, fillMode, cellKey);
    } else if (cap.depositionShape === "streak") {
      // Dry/Streak replaces the concentric-pass core entirely with
      // deterministic parallel lanes — see renderStreakCore below.
      this.renderStreakCore(ctx, drawStart, drawPoint, colorHex, cap, dynamics, angle, passOpacity, fillMode, cellKey);
    } else {
      for (let pass = dynamics.corePasses - 1; pass >= 0; pass -= 1) {
        const passRatio = dynamics.corePasses === 1 ? 0 : pass / (dynamics.corePasses - 1);
        const edgeExpansion = 1 + passRatio * (1 - cap.edgeFalloff) * 0.72;
        const jitterX = (random() - 0.5) * dynamics.jitter;
        const jitterY = (random() - 0.5) * dynamics.jitter;
        const endpointScale = previous ? 1 : cap.endpointBehavior === "punchy" ? 0.82 : 0.68;
        const nominalPassAlpha = passOpacity * (1 - passRatio * 0.48);
        // Cap this LOCATION's own cumulative core opacity, without touching how
        // a physically separate stroke composites on top of it. Tracked per
        // actual draw call (every corePasses sub-layer counts, not just once
        // per segment) so the true composited result — corePasses stack on
        // each other too — asymptotes to the ceiling, not just the segment-
        // level estimate. Track what this draw's coverage would be under
        // ordinary compositing (`nextVirtual`), remap into the ceiling band,
        // then solve for the alpha this draw must actually use so the canvas
        // moves from the previous remapped coverage to the next one exactly —
        // the definition of standard "source-over" compositing, just aimed at
        // a lower asymptote.
        let drawnAlpha = nominalPassAlpha;
        if (fillMode && cellKey !== null) {
          const priorVirtual = this.fillLocalSaturation.get(cellKey) ?? 0;
          const nextVirtual = 1 - (1 - priorVirtual) * (1 - nominalPassAlpha);
          const priorVisible = FILL_MODE_CORE_CEILING * priorVirtual;
          const nextVisible = FILL_MODE_CORE_CEILING * nextVirtual;
          drawnAlpha = priorVisible >= 1 ? 0 : (nextVisible - priorVisible) / (1 - priorVisible);
          this.fillLocalSaturation.set(cellKey, nextVirtual);
        }
        const scale = dynamics.radius * edgeExpansion * endpointScale;
        const ringProfile = cap.depositionShape === "ring" ? resolveRingProfile(cap, scale, drawnAlpha) : null;
        const stampGeometry = resolveShapedStampGeometry(cap.depositionShape, scale);
        if (ringProfile) {
          // A genuine annular gradient — hollow center, raised ring band, soft
          // outer bloom — stamped at both endpoints like renderHalo, so a
          // moving stroke reads as a ringed plume rather than a solid line.
          this.drawRingStamp(ctx, drawStart.x + jitterX, drawStart.y + jitterY, ringProfile, colorHex);
          if (drawStart.x !== drawPoint.x || drawStart.y !== drawPoint.y) {
            this.drawRingStamp(ctx, drawPoint.x + jitterX, drawPoint.y + jitterY, ringProfile, colorHex);
          }
        } else if (stampGeometry) {
          // A genuinely elongated, fixed-orientation stamp — not a width trick.
          // Stamped at both segment endpoints (like renderHalo above) so fine
          // interpolation spacing tiles into a continuous swept band; the
          // wide/narrow response is a pure consequence of this fixed shape's
          // own geometry as it's swept through different travel directions.
          const fillStyle = this.hexToRgba(colorHex, drawnAlpha);
          this.drawShapedStamp(ctx, drawStart.x + jitterX, drawStart.y + jitterY, stampGeometry, fillStyle);
          if (drawStart.x !== drawPoint.x || drawStart.y !== drawPoint.y) {
            this.drawShapedStamp(ctx, drawPoint.x + jitterX, drawPoint.y + jitterY, stampGeometry, fillStyle);
          }
        } else {
          ctx.strokeStyle = this.hexToRgba(colorHex, drawnAlpha);
          ctx.lineWidth = Math.max(0.7, dynamics.radius * 2 * directionalAnisotropy * edgeExpansion * endpointScale);
          ctx.beginPath();
          ctx.moveTo(drawStart.x + jitterX, drawStart.y + jitterY);
          ctx.lineTo(drawPoint.x + jitterX, drawPoint.y + jitterY);
          ctx.stroke();
        }
      }
    }

    ctx.restore();
    // Pink Dot's overspray follows travel direction and flares with the
    // SAME outer anisotropy as the atmosphere bands, for one coherent
    // "whole plume flares together" read — resolveOverspraySquashAngle's
    // fixed-transversal-axis branch is for a genuinely fixed-orientation cap
    // (Calligraphy) and does not apply to Pink Dot's travel-following flare.
    const oversprayAngle = dualPlumeState ? angle : resolveOverspraySquashAngle(dynamics.anisotropy, angle);
    const oversprayDynamics = dualPlumeState ? { ...dynamics, anisotropy: dualPlumeState.outer.anisotropy } : dynamics;
    // Pink Dot's own moat must stay clear of overspray speckle too — a
    // structured gap the eye can register as empty, not one the core/ring
    // bands leave alone only for stray particles to quietly refill.
    const oversprayMinSpread = dualPlumeState ? dualPlumeState.outer.mistRadius * RADIAL_MOAT_END_T : 0;
    this.renderOverspray(ctx, drawStart, drawPoint, colorHex, oversprayDynamics, oversprayAngle, distance, random, coverageFactor, oversprayMinSpread);
  }

  /**
   * Soft outer "halo" ring beneath the core — a continuous radial field
   * (not speckled particles like overspray), so a "loaded dot" cap reads as
   * a recognizable dense-center/soft-ring bloom rather than a blurred fat
   * dot. Drawn at both segment endpoints so a moving stroke gets a continuous
   * halo tube, and a stationary dwell (repeated near-zero-distance segments
   * at the same point) naturally strengthens the center through ordinary
   * source-over compositing — no separate dwell/time tracking needed.
   *
   * Pink Dot Fat's correction fields layer on top of that same base
   * mechanism, each independently a no-op at 0 (see their field docs in
   * `SprayCapPresets.ts`): `haloDistanceGain` scales radius/opacity by the
   * live resolved size; `haloDabSpacing` gates draws by travel distance
   * (never gating a true zero-distance dwell, so dwell strengthening is
   * untouched); `haloFlareAnisotropy` elongates the gradient into an ellipse
   * along the travel angle at higher velocity; `haloRingBias` reshapes the
   * gradient stops into a moat-then-peak profile.
   */
  private renderHalo(
    ctx: CanvasRenderingContext2D,
    start: StrokePoint,
    point: StrokePoint,
    colorHex: string,
    cap: SprayCapPreset,
    dynamics: ReturnType<typeof resolveSprayDynamics>,
    coverageFactor: number,
    angle: number,
    distance: number,
  ): void {
    if (cap.haloRadius <= 0 || cap.haloOpacity <= 0) return;
    const distanceGain = resolveHaloDistanceGain(cap, dynamics.radius);
    const haloRadius = dynamics.radius * cap.haloRadius * distanceGain;
    if (haloRadius <= 0) return;
    const alpha = Math.min(1, cap.haloOpacity * coverageFactor * distanceGain);
    if (alpha <= 0) return;

    // Dab spacing: while this segment has real travel distance, gate draws
    // until enough distance has accumulated since the last dab — a moving
    // stroke deposits discrete overlapping dabs instead of a continuous
    // smeared bar. A true dwell (distance === 0) is NEVER gated here.
    if (cap.haloDabSpacing > 0 && distance > 0) {
      this.haloTravelSinceLastDab += distance;
      if (this.haloTravelSinceLastDab < haloRadius * cap.haloDabSpacing) return;
      this.haloTravelSinceLastDab = 0;
    }

    const flareRatio = resolveHaloFlareRatio(cap, point.velocity);
    const stops = resolveHaloGradientStops(cap, alpha);
    const drawHaloAt = (x: number, y: number) => {
      ctx.save();
      ctx.translate(x, y);
      if (flareRatio < 1) {
        ctx.rotate(angle);
        ctx.scale(1, flareRatio);
      }
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, haloRadius);
      for (const stop of stops) gradient.addColorStop(stop.offset, this.hexToRgba(colorHex, stop.alpha));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, haloRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    drawHaloAt(start.x, start.y);
    if (start.x !== point.x || start.y !== point.y) drawHaloAt(point.x, point.y);
  }

  /**
   * Pink Dot Fat's dual-plume — TWO coordinated CONTINUOUS layers drawn
   * every segment (no distance-based gating anywhere in this method, and
   * no branching on velocity or dwell state either), so the line body and
   * its atmosphere stay connected through corners, reversals, and loops,
   * and a stationary point renders through the exact same call path as a
   * moving one. `dwellOpacityScale` (see `resolvePinkDotDwellScale`) scales
   * BOTH layers' DENSITY together for a genuinely fresh dwell point — never
   * their geometry, which is fixed by `sprayDistance` alone.
   *
   * A cap with `plumeStochasticStationary` set (Pink Dot Fat, not its
   * temporary `track-marks` twin) renders its OUTER field through the
   * organic aerosol deposition field (`renderPinkDotStochasticOuterField`)
   * for EVERY segment, moving or stationary alike — there is no separate
   * "moving" technique to switch to once velocity becomes nonzero. A
   * `track-marks` segment always takes the untouched swept-rail
   * `renderPinkDotOuterField` path instead, preserving that cap's own
   * identity unchanged.
   */
  private renderPinkDotDualPlume(
    ctx: CanvasRenderingContext2D,
    start: StrokePoint,
    point: StrokePoint,
    colorHex: string,
    cap: SprayCapPreset,
    state: PinkDotDualPlumeState,
    angle: number,
    dwellOpacityScale: number,
    random: () => number,
    fillMode: boolean,
    cellKey: string | null,
  ): void {
    if (cap.plumeStochasticStationary) {
      this.renderPinkDotStochasticOuterField(ctx, start, point, colorHex, cap, state.inner, state.outer, dwellOpacityScale, random);
    } else {
      this.renderPinkDotOuterField(ctx, start, point, colorHex, state.outer, angle, dwellOpacityScale);
    }
    this.renderPinkDotInnerCore(ctx, start, point, colorHex, cap, state.inner, angle, dwellOpacityScale, random, fillMode, cellKey);
  }

  /**
   * Pink Dot's aerosol deposition field — ONE continuous field, sampled the
   * same way whether `start === point` (a true stationary dwell) or they're
   * far apart (a fast, coarsely-sampled drag). There is no separate line
   * primitive: a moving segment is the SAME instantaneous radial density
   * curve (`resolvePinkDotStationaryProfile`, unchanged from a stationary
   * dwell's own) swept along `start`->`point` by depositing it at closely-
   * spaced sub-samples, not by drawing rails, bands, or capsule geometry.
   *
   * Sub-sample SPACING derives from the footprint's own core diameter (a
   * small fraction of it — see `PINK_DOT_STOCHASTIC_SPACING_RATIO`), never
   * from how far apart real pointer events happen to land, so a fast drag
   * (few, widely-spaced `renderSegment` calls) still deposits a visually
   * continuous field instead of revealing individual exposures — the
   * critical "sampling density relative to footprint size" requirement.
   *
   * Each call's particle budget (`totalCandidates`, the SAME figure a
   * single stationary dwell's one exposure already used) is split across
   * however many sub-samples that spacing requires, not multiplied by it —
   * covering a given distance in MORE, smaller `renderSegment` calls (a
   * slower drag) naturally deposits more total exposure over that distance
   * than covering it in FEWER, larger ones (a faster drag) would, which is
   * exactly "dwell/time accumulates density" at the level of a whole moving
   * stroke, not just a literal stationary point. A true dwell (repeated
   * zero-distance points) still layers additional full-budget exposures on
   * top via `dwellOpacityScale`, same as before.
   *
   * Each accepted particle gets its own angular AND radial jitter, so the
   * ring reads as a real aerosol edge breaking up around its own
   * circumference — never a perfect vector circle or rail. Flare
   * (angle-driven anisotropy) remains out of scope — this field is always
   * circularly symmetric at every sub-sample.
   */
  private renderPinkDotStochasticOuterField(
    ctx: CanvasRenderingContext2D,
    start: StrokePoint,
    point: StrokePoint,
    colorHex: string,
    cap: SprayCapPreset,
    inner: PinkDotInnerState,
    outer: PinkDotOuterState,
    dwellOpacityScale: number,
    random: () => number,
  ): void {
    const profile = resolvePinkDotStationaryProfile(inner, outer);
    if (!profile) return;
    const peakDensity = Math.max(profile.ringDensity, profile.moatDensity, profile.mistDensity, 1e-6);
    const innerBound = Math.max(0, profile.coreRadius * 0.85);
    const outerBound = profile.mistRadius + (profile.mistRadius - profile.ringRadius) * 1.5;
    if (outerBound <= innerBound) return;

    const dx = point.x - start.x;
    const dy = point.y - start.y;
    const segmentLength = Math.hypot(dx, dy);
    const spacing = Math.max(1, profile.coreRadius * 2 * PINK_DOT_STOCHASTIC_SPACING_RATIO);
    const steps = Math.max(1, Math.ceil(segmentLength / spacing));

    // Scaled off the cap's own particleCount so a sparser/denser cap's
    // overspray character carries over into this field's own texture,
    // rather than a fixed magic number every plume cap would share.
    const totalCandidates = Math.round(180 * (cap.particleCount / 26));
    const perStepCandidates = Math.max(3, Math.round(totalCandidates / steps));
    const baseAlpha = Math.min(0.5, 0.17 * dwellOpacityScale);

    for (let s = 0; s < steps; s += 1) {
      // t excludes 0 (already deposited as the PREVIOUS segment's own
      // endpoint) and always includes 1 (this segment's own new tip) — so
      // consecutive renderSegment calls along one stroke neither skip nor
      // double-deposit their shared joint point. For a true stationary
      // point (steps === 1, start === point), t === 1 lands exactly on it.
      const t = (s + 1) / steps;
      const cx = start.x + dx * t;
      const cy = start.y + dy * t;
      for (let i = 0; i < perStepCandidates; i += 1) {
        const r = innerBound + random() * (outerBound - innerBound);
        const density = profile.densityAt(r);
        if (random() * peakDensity > density) continue; // denser radii accept more often
        const theta = random() * Math.PI * 2;
        const radialJitter = (random() - 0.5) * Math.max(2, profile.ringRadius * 0.12);
        const rr = Math.max(0, r + radialJitter);
        const x = cx + Math.cos(theta) * rr;
        const y = cy + Math.sin(theta) * rr;
        const dabAlpha = Math.max(0, Math.min(1, baseAlpha * (0.5 + random() * 0.9) * (0.15 + density / peakDensity)));
        const dabSize = Math.max(0.5, cap.particleSize * (1.5 + random() * 1.6));
        ctx.fillStyle = this.hexToRgba(colorHex, dabAlpha);
        ctx.beginPath();
        ctx.arc(x, y, dabSize, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /**
   * The outer/atmosphere layer — a TRUE four-zone radial cross-section:
   * core-edge -> a genuine low-density (literally unpainted) moat -> a
   * raised ring band -> a fading mist. Each band is drawn as a STROKE, not
   * a filled-and-holed shape (see `strokePinkDotOuterFieldBand`) — the same
   * "many short segments, round joins" technique the inner core already
   * uses successfully, applied to a pair of rails offset to either side of
   * the centerline instead of the centerline itself. The moat is simply
   * the radius nothing is offset into — a real gap by omission, not a cut.
   */
  private renderPinkDotOuterField(
    ctx: CanvasRenderingContext2D,
    start: StrokePoint,
    point: StrokePoint,
    colorHex: string,
    outer: PinkDotOuterState,
    angle: number,
    dwellOpacityScale: number,
  ): void {
    const zones = resolvePinkDotOuterFieldZones(outer);
    if (!zones) return;
    // Mist first (drawn under), ring on top — same layering convention as
    // every other Pink Dot layer in this file.
    this.strokePinkDotOuterFieldBand(
      ctx, start, point, colorHex, zones.ringOuterRadius, zones.mistOuterRadius,
      zones.mistAlpha * dwellOpacityScale, angle, outer.anisotropy,
    );
    this.strokePinkDotOuterFieldBand(
      ctx, start, point, colorHex, zones.moatRadius, zones.ringOuterRadius,
      zones.ringAlpha * dwellOpacityScale, angle, outer.anisotropy,
    );
  }

  /**
   * One annular band (ring or mist) of the outer field, swept continuously
   * along `start`->`point` — as a STROKE, never a filled-and-holed shape.
   *
   * The previous construction filled the region between an outer and inner
   * boundary capsule via `evenodd`, one independent fill per short segment.
   * That is exactly the "repeated stamps" failure the brief rejects: each
   * segment's own cap (round OR flat) is a hard edge whose geometry is
   * decided in isolation from its neighbors, so on anything but a perfectly
   * straight line adjacent segments' caps either gap or overlap at the
   * joint — round caps bulge a full band-radius past their own segment
   * (bridging a neighbor's moat, the original bug); flat caps instead leave
   * angular notches wherever the path bends even slightly (the "hairy/
   * spiky" artifact on curves, and — because those notches accumulate
   * differently near the true stroke ends than along a long interior run —
   * the ring reading fine at endpoints but corrupted at the midpoint).
   *
   * A stroked line's join is not decided per-segment at all: `lineJoin:
   * "round"` is native canvas geometry connecting THIS segment's stroke
   * outline directly to the NEXT one, continuously, for any path built from
   * many short `lineTo`s — exactly how `renderPinkDotInnerCore`'s solid
   * line already sweeps corners and curves with no visible joints. This
   * band reuses that same primitive: instead of filling a region between
   * two capsules, it strokes TWO offset "rails" (one on each side of the
   * centerline, at the band's own mid-radius) with `lineWidth` equal to the
   * band's thickness. Nothing is ever drawn inside the mid-radius minus
   * half the band width, so the moat stays a real, continuous gap — by
   * omission, not by cutting a hole out of a bigger shape.
   *
   * A true stationary dwell (`start === point`) has no travel direction to
   * offset a rail from, so it draws the band as one full circular
   * arc-stroke at the band's mid-radius instead — the same "ring/donut"
   * shape as before, and the exact zero-length-path limit of the swept
   * rail construction. Flare (anisotropy < 1) squashes the whole band via
   * the same translate/rotate/scale technique the inner core uses, so both
   * the rail offset and the stroke width shrink together consistently.
   */
  private strokePinkDotOuterFieldBand(
    ctx: CanvasRenderingContext2D,
    start: StrokePoint,
    point: StrokePoint,
    colorHex: string,
    innerRadius: number,
    outerRadius: number,
    alpha: number,
    angle: number,
    anisotropy: number,
  ): void {
    if (alpha <= 0 || outerRadius <= innerRadius) return;
    const midRadius = (innerRadius + outerRadius) / 2;
    const bandWidth = outerRadius - innerRadius;
    const halfLength = Math.hypot(point.x - start.x, point.y - start.y) / 2;
    ctx.save();
    ctx.strokeStyle = this.hexToRgba(colorHex, alpha);
    ctx.lineWidth = bandWidth;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const midX = (start.x + point.x) / 2;
    const midY = (start.y + point.y) / 2;
    ctx.translate(midX, midY);
    ctx.rotate(angle);
    ctx.scale(1, anisotropy);
    if (halfLength < 1e-6) {
      ctx.beginPath();
      ctx.arc(0, 0, midRadius, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(-halfLength, midRadius);
      ctx.lineTo(halfLength, midRadius);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-halfLength, -midRadius);
      ctx.lineTo(halfLength, -midRadius);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * The inner/core layer — a normal continuous multi-pass stroked line
   * every segment, same edgeExpansion/Fill-ceiling technique every other
   * line cap already uses (see the generic core loop in `renderSegment`),
   * just parameterized by the resolved `inner` state and carrying its own
   * (moderate) flare anisotropy. This is what guarantees clean connected
   * line continuity through straight segments, curves, sharp corners,
   * reversals, and loops — it is never gated or stamped. `dwellOpacityScale`
   * (see `resolvePinkDotDwellScale`) scales the drawn ALPHA only for a
   * genuinely fresh dwell point — never the line's width/radius, which is
   * fixed by `sprayDistance` alone; a real moving segment always passes 1.
   */
  private renderPinkDotInnerCore(
    ctx: CanvasRenderingContext2D,
    start: StrokePoint,
    point: StrokePoint,
    colorHex: string,
    cap: SprayCapPreset,
    inner: PinkDotInnerState,
    angle: number,
    dwellOpacityScale: number,
    random: () => number,
    fillMode: boolean,
    cellKey: string | null,
  ): void {
    if (inner.radius <= 0 || inner.density <= 0) return;
    for (let pass = inner.density - 1; pass >= 0; pass -= 1) {
      const passRatio = inner.density <= 1 ? 0 : pass / (inner.density - 1);
      const edgeExpansion = 1 + passRatio * (1 - inner.falloff) * 0.72;
      const nominalPassAlpha = (inner.opacity * (1 - passRatio * 0.48) * dwellOpacityScale) / Math.sqrt(inner.density);
      let drawnAlpha = nominalPassAlpha;
      if (fillMode && cellKey !== null) {
        const priorVirtual = this.fillLocalSaturation.get(cellKey) ?? 0;
        const nextVirtual = 1 - (1 - priorVirtual) * (1 - nominalPassAlpha);
        const priorVisible = FILL_MODE_CORE_CEILING * priorVirtual;
        const nextVisible = FILL_MODE_CORE_CEILING * nextVirtual;
        drawnAlpha = priorVisible >= 1 ? 0 : (nextVisible - priorVisible) / (1 - priorVisible);
        this.fillLocalSaturation.set(cellKey, nextVirtual);
      }
      const jitterX = (random() - 0.5) * cap.jitter * inner.radius;
      const jitterY = (random() - 0.5) * cap.jitter * inner.radius;
      const diameter = Math.max(0.7, inner.radius * 2 * edgeExpansion);

      ctx.save();
      ctx.strokeStyle = this.hexToRgba(colorHex, drawnAlpha);
      ctx.lineWidth = diameter;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.beginPath();
      const jStart = { x: start.x + jitterX, y: start.y + jitterY };
      const jPoint = { x: point.x + jitterX, y: point.y + jitterY };
      if (inner.anisotropy < 1) {
        const midX = (jStart.x + jPoint.x) / 2;
        const midY = (jStart.y + jPoint.y) / 2;
        const halfLength = Math.hypot(jPoint.x - jStart.x, jPoint.y - jStart.y) / 2;
        ctx.translate(midX, midY);
        ctx.rotate(angle);
        ctx.scale(1, inner.anisotropy);
        ctx.moveTo(-halfLength, 0);
        ctx.lineTo(halfLength, 0);
      } else {
        ctx.moveTo(jStart.x, jStart.y);
        ctx.lineTo(jPoint.x, jPoint.y);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  /**
   * Draws one fixed-orientation shaped core stamp (oval or rounded slot),
   * centered at (cx, cy). This is the actual "genuinely elongated deposition"
   * mechanism — an ellipse or rotated rounded-rectangle path, not a stroked
   * line with a width trick. See `resolveShapedStampGeometry` for why the
   * fixed rotation alone (no travel-direction input) is what keeps this from
   * rotating with the stroke tangent.
   */
  private drawShapedStamp(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    geometry: ShapedStampGeometry,
    fillStyle: string,
  ): void {
    ctx.fillStyle = fillStyle;
    if (geometry.shape === "oval") {
      ctx.beginPath();
      ctx.ellipse(cx, cy, geometry.halfLength, geometry.halfWidth, geometry.rotation, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const { halfLength: hl, halfWidth: hw, rotation, cornerRadius } = geometry;
    const r = Math.max(0, Math.min(cornerRadius, hl, hw));
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.beginPath();
    ctx.moveTo(-hl + r, -hw);
    ctx.lineTo(hl - r, -hw);
    ctx.arcTo(hl, -hw, hl, -hw + r, r);
    ctx.lineTo(hl, hw - r);
    ctx.arcTo(hl, hw, hl - r, hw, r);
    ctx.lineTo(-hl + r, hw);
    ctx.arcTo(-hl, hw, -hl, hw - r, r);
    ctx.lineTo(-hl, -hw + r);
    ctx.arcTo(-hl, -hw, -hl + r, -hw, r);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /**
   * Draws one Ring/Donut annular gradient stamp centered at (cx, cy) from a
   * pre-resolved `RingProfile` (see `resolveRingProfile`) — a real multi-stop
   * radial gradient with a hollow center and a raised ring band, not a single
   * center-to-edge fade like `renderHalo`.
   */
  private drawRingStamp(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    profile: RingProfile,
    colorHex: string,
  ): void {
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, profile.outerRadius);
    for (const stop of profile.stops) gradient.addColorStop(stop.offset, this.hexToRgba(colorHex, stop.alpha));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(cx, cy, profile.outerRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Dry/Streak's core: `cap.streakLanes` parallel deterministic lanes spread
   * across the stroke's width, each gated on/off via `resolveStreakGate` —
   * directional broken coverage with internal ribbing, replacing the normal
   * concentric-pass core entirely (not layered on top of a solid line).
   * Reuses the exact same Fill-mode ceiling math as the normal core loop,
   * called once per lane instead of once per pass, so "spatial-local Fill
   * correctness" and "repeated sweeps accumulate" both hold unchanged.
   */
  private renderStreakCore(
    ctx: CanvasRenderingContext2D,
    start: StrokePoint,
    point: StrokePoint,
    colorHex: string,
    cap: SprayCapPreset,
    dynamics: ReturnType<typeof resolveSprayDynamics>,
    angle: number,
    passOpacity: number,
    fillMode: boolean,
    cellKey: string | null,
  ): void {
    const laneCount = Math.max(1, cap.streakLanes);
    const laneSpread = dynamics.radius * 1.6;
    const perpAngle = angle + Math.PI / 2;
    const perpX = Math.cos(perpAngle);
    const perpY = Math.sin(perpAngle);
    const midX = (start.x + point.x) / 2;
    const midY = (start.y + point.y) / 2;
    const alongTravel = midX * Math.cos(angle) + midY * Math.sin(angle);

    for (let lane = 0; lane < laneCount; lane += 1) {
      const laneOffset = laneCount > 1 ? ((lane / (laneCount - 1)) - 0.5) * laneSpread : 0;
      const offsetX = perpX * laneOffset;
      const offsetY = perpY * laneOffset;
      const gate = resolveStreakGate(dynamics.radius, lane, alongTravel);
      const nominalLaneAlpha = passOpacity * gate;

      let drawnAlpha = nominalLaneAlpha;
      if (fillMode && cellKey !== null) {
        const priorVirtual = this.fillLocalSaturation.get(cellKey) ?? 0;
        const nextVirtual = 1 - (1 - priorVirtual) * (1 - nominalLaneAlpha);
        const priorVisible = FILL_MODE_CORE_CEILING * priorVirtual;
        const nextVisible = FILL_MODE_CORE_CEILING * nextVirtual;
        drawnAlpha = priorVisible >= 1 ? 0 : (nextVisible - priorVisible) / (1 - priorVisible);
        this.fillLocalSaturation.set(cellKey, nextVirtual);
      }
      if (drawnAlpha < 0.01) continue;

      ctx.strokeStyle = this.hexToRgba(colorHex, drawnAlpha);
      ctx.lineWidth = Math.max(0.7, (dynamics.radius * 1.7) / laneCount);
      ctx.beginPath();
      ctx.moveTo(start.x + offsetX, start.y + offsetY);
      ctx.lineTo(point.x + offsetX, point.y + offsetY);
      ctx.stroke();
    }
  }

  public startDrip(seed: DripSeed, color: string, now = performance.now()): void {
    this.activeDrips.push({
      ...seed,
      color,
      startedAt: now,
      lastProgress: 0,
      bend: seed.bend ?? (Math.random() - 0.5) * seed.length * 0.12,
      durationMs: seed.durationMs ?? 1200,
      poolRendered: false,
    });
  }

  public advanceDrips(ctx: CanvasRenderingContext2D, now = performance.now()): void {
    this.activeDrips = this.activeDrips.filter((drip) => {
      const progress = Math.min(1, Math.max(0, (now - drip.startedAt) / drip.durationMs));
      if (progress <= drip.lastProgress) return progress < 1;

      const easedPrevious = drip.lastProgress * drip.lastProgress;
      const easedCurrent = progress * progress;
      const startX = drip.x + drip.bend * easedPrevious;
      const startY = drip.y + drip.length * easedPrevious;
      const endX = drip.x + drip.bend * easedCurrent;
      const endY = drip.y + drip.length * easedCurrent;

      ctx.save();
      ctx.lineCap = "round";
      if (!drip.poolRendered && drip.originPoolRadius) {
        ctx.fillStyle = this.hexToRgba(drip.color, Math.min(0.94, drip.opacity));
        ctx.beginPath();
        ctx.arc(drip.x, drip.y, drip.originPoolRadius, 0, Math.PI * 2);
        ctx.fill();
        drip.poolRendered = true;
      }
      if (drip.tipWidthRatio !== undefined) {
        // A stable alpha prevents visible bands where progressive wet-strip
        // sections meet on the persistent paint layer.
        ctx.fillStyle = this.hexToRgba(drip.color, drip.opacity * 0.82);
        this.fillDripStrip(ctx, [
          resolveDripStripSection(drip, drip.lastProgress),
          resolveDripStripSection(drip, progress),
        ]);
        if (progress === 1 && drip.terminalBulbRatio) {
          ctx.beginPath();
          ctx.arc(endX, endY, Math.max(0.7, drip.width * drip.terminalBulbRatio * 0.5), 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.strokeStyle = this.hexToRgba(drip.color, drip.opacity * (1 - progress * 0.24));
        ctx.lineWidth = Math.max(0.8, drip.width * (1 - progress * 0.42));
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
      }
      ctx.restore();

      drip.lastProgress = progress;
      return progress < 1;
    });
  }

  public renderCompletedDrip(
    ctx: CanvasRenderingContext2D,
    drip: DripSeed,
    color: string,
  ): void {
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = this.hexToRgba(color, drip.opacity * 0.76);
    if (drip.originPoolRadius) {
      ctx.fillStyle = this.hexToRgba(color, Math.min(0.94, drip.opacity));
      ctx.beginPath();
      ctx.arc(drip.x, drip.y, drip.originPoolRadius, 0, Math.PI * 2);
      ctx.fill();
    }
    if (drip.tipWidthRatio !== undefined) {
      ctx.fillStyle = this.hexToRgba(color, drip.opacity * 0.82);
      const strip = buildContinuousDripStrip(drip);
      this.fillDripStrip(ctx, strip);
      if (drip.terminalBulbRatio) {
        const tip = strip[strip.length - 1];
        ctx.beginPath();
        ctx.arc(
          tip.center.x,
          tip.center.y,
          Math.max(0.7, drip.width * drip.terminalBulbRatio * 0.5),
          0,
          Math.PI * 2,
        );
        ctx.fill();
      }
    } else {
      ctx.lineWidth = Math.max(0.8, drip.width * 0.72);
      ctx.beginPath();
      ctx.moveTo(drip.x, drip.y);
      ctx.lineTo(drip.x + (drip.bend ?? 0), drip.y + drip.length);
      ctx.stroke();
    }
    ctx.restore();
  }

  private fillDripStrip(
    ctx: CanvasRenderingContext2D,
    sections: readonly DripStripSection[],
  ): void {
    if (sections.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(sections[0].left.x, sections[0].left.y);
    for (const section of sections.slice(1)) ctx.lineTo(section.left.x, section.left.y);
    for (const section of [...sections].reverse()) ctx.lineTo(section.right.x, section.right.y);
    ctx.closePath();
    ctx.fill();
  }

  private renderOverspray(
    ctx: CanvasRenderingContext2D,
    start: StrokePoint,
    point: StrokePoint,
    color: string,
    dynamics: ReturnType<typeof resolveSprayDynamics>,
    angle: number,
    distance: number,
    random: () => number,
    coverageFactor: number = 1,
    minSpreadRadius: number = 0,
  ): void {
    const segmentFactor = Math.max(0.3, Math.min(1.6, distance / Math.max(1, dynamics.radius) + 0.32));
    const count = Math.round(dynamics.particleCount * segmentFactor);
    ctx.fillStyle = this.hexToRgba(color, dynamics.particleOpacity * point.opacity * coverageFactor);

    for (let index = 0; index < count; index += 1) {
      const along = random();
      const centerX = start.x + (point.x - start.x) * along;
      const centerY = start.y + (point.y - start.y) * along;
      // directionalX/Y are in a LOCAL frame (X along the travel direction, Y
      // perpendicular) that gets rotated into world space just below — see
      // anisotropicX/Y. Every other cap (minSpreadRadius 0) keeps the
      // original radially-symmetric speckle cloud untouched. Pink Dot's own
      // moat needs a genuine PERPENDICULAR-distance floor instead of a
      // simple radius floor around each sample point: a radius floor alone
      // still lets a particle land back on the centerline by escaping along
      // the travel direction, and with particles sampled continuously along
      // the whole path, neighboring segments' particles would silently
      // refill the moat corridor even though no single particle violated
      // its own local exclusion circle.
      let directionalX: number;
      let directionalY: number;
      if (minSpreadRadius > 0) {
        directionalX = (random() - 0.5) * dynamics.particleSpread * 1.4;
        const perpSign = random() < 0.5 ? -1 : 1;
        const perpSpread = minSpreadRadius + Math.pow(random(), 1.55) * Math.max(0, dynamics.particleSpread - minSpreadRadius);
        directionalY = perpSign * perpSpread;
      } else {
        const spreadAngle = random() * Math.PI * 2;
        const spread = Math.pow(random(), 1.55) * dynamics.particleSpread;
        directionalX = Math.cos(spreadAngle) * spread;
        directionalY = Math.sin(spreadAngle) * spread;
      }
      const anisotropicX = directionalX * Math.cos(angle) - directionalY * dynamics.anisotropy * Math.sin(angle);
      const anisotropicY = directionalX * Math.sin(angle) + directionalY * dynamics.anisotropy * Math.cos(angle);
      const splatter = random() < dynamics.splatterProbability ? 1.8 + random() * 1.8 : 1;
      const particleSize = Math.max(0.18, dynamics.particleSize * splatter * (0.45 + random() * 0.9));

      ctx.beginPath();
      ctx.arc(centerX + anisotropicX, centerY + anisotropicY, particleSize, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private hexToRgba(hex: string, alpha: number): string {
    let value = hex.replace("#", "");
    if (value.length === 3) value = value.split("").map((channel) => channel + channel).join("");
    const numeric = Number.parseInt(value, 16);
    const red = (numeric >> 16) & 255;
    const green = (numeric >> 8) & 255;
    const blue = numeric & 255;
    return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
  }
}
