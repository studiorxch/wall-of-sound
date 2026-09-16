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
 * field — core-edge, a genuine low-density moat, a raised ring band, a
 * fading mist (see `resolvePinkDotOuterFieldStops`) — swept continuously
 * along the path under it every segment (see `renderPinkDotOuterField`),
 * with no distance-based gating. An earlier version stamped the whole
 * plume at gated intervals, which read as lumpy/scalloped on a moving
 * line; continuous sweeping fixed that. See `SprayCapPresets.ts`'s
 * `plume*` field docs for what each input field controls.
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
 * core-edge, then a genuine low-density MOAT, then a raised ring band, then
 * a fading mist — expressed as `createRadialGradient` stops (offsets are
 * fractions of `outer.mistRadius`, the field's own full extent). A radial
 * gradient is evaluated natively per-pixel by the canvas, so the moat is a
 * real mathematical minimum in the density function itself (see the ratio
 * constants below: the moat's alpha is a small fraction of the ring's,
 * independent of the cap's own tuned opacity values) — NOT an appearance
 * faked by blur, and not washed out by any stacking/accumulation the way
 * concentric solid-disk strokes would (a disk of radius R always covers
 * everything from 0 to R, so stacking several of them can never produce a
 * pixel-level dip; a single gradient can). Rendered later (see
 * `renderPinkDotOuterField`) as this same gradient stamped densely along
 * the travel path, not one static circle — so the whole four-zone
 * cross-section sweeps continuously with the stroke.
 */
const RADIAL_CORE_END_T = 0.35;
const RADIAL_MOAT_END_T = 0.55;
const RADIAL_RING_END_T = 0.8;
/** The zone immediately outside the inner core — clearly below the ring peak (so the drop into the moat still reads), but not literally zero either. */
const CORE_EDGE_DENSITY_RATIO = 0.4;
/**
 * How suppressed the moat's minimum is relative to the ring peak. Small
 * enough that density(moat) < density(core-edge) and density(moat) <
 * density(ring) hold structurally for any ring opacity the cap resolves
 * to — AND small enough that the moat's per-draw alpha stays low even
 * under a long stationary dwell, where every zone is redrawn every frame
 * and composites via ordinary source-over: a per-draw alpha much above
 * ~0.05 would asymptote to full opacity within well under a second of
 * real dwell time (1-(1-a)^n -> 1 as draws accumulate), erasing the gap
 * exactly the way blur would. Kept low enough that the moat still reads
 * as a genuine dark channel through a full 1s dwell, not just an instant.
 */
const MOAT_SUPPRESSION_RATIO = 0.045;

export function resolvePinkDotOuterFieldStops(outer: PinkDotOuterState): readonly HaloGradientStop[] {
  if (outer.mistRadius <= 0 || outer.ringOpacity <= 0) return [];
  const ringAlpha = outer.ringOpacity;
  const coreEdgeAlpha = ringAlpha * CORE_EDGE_DENSITY_RATIO;
  const moatAlpha = ringAlpha * MOAT_SUPPRESSION_RATIO;
  // Structurally guaranteed below the ring peak (see resolvePinkDotOuterFieldStops'
  // own doc) regardless of how mistOpacity/ringOpacity happen to be tuned.
  const mistAlpha = Math.min(outer.mistOpacity, ringAlpha * 0.85);
  return [
    { offset: 0, alpha: coreEdgeAlpha },
    { offset: RADIAL_CORE_END_T, alpha: coreEdgeAlpha },
    { offset: RADIAL_MOAT_END_T, alpha: moatAlpha },
    { offset: RADIAL_RING_END_T, alpha: ringAlpha },
    { offset: Math.min(0.999, RADIAL_RING_END_T + (1 - RADIAL_RING_END_T) * 0.5), alpha: mistAlpha },
    { offset: 1, alpha: 0 },
  ];
}

/**
 * Pink Dot's outer atmosphere for a genuinely MOVING segment — the ring and
 * mist zones as two OFFSET PARALLEL bands (a fixed perpendicular distance
 * from the travel path, not a radius from any single point). This is the
 * fix for a real trap: stamping the four-zone radial gradient repeatedly
 * along a path (one circle per sample point) looks correct for a single
 * stationary dot, but the UNION of many overlapping full disks swept along
 * a line inevitably fills its own moat back in — a point in one stamp's
 * moat sits inside a NEIGHBORING stamp's ring, because the moat is a
 * radial (point-centered) concept while a swept cross-section needs a
 * PATH-relative (perpendicular-distance) one. An offset stroke's own
 * Minkowski-sum shape is exactly "constant perpendicular distance from the
 * path," which is what a moving ring/mist band actually is — so it stays a
 * genuine offset band instead of collapsing into a solid tube. The moat
 * itself is simply left unpainted between the inner core and the ring
 * band: reduced deposition, not blur, and not a "hole" punched through
 * whatever else is already on the canvas. See `renderPinkDotOuterField` for
 * how this is stamped as a proper radial gradient instead for a true
 * (near-zero-distance) dwell point, where a circular bullseye is correct.
 */
export interface PinkDotOuterFieldBand {
  /** Perpendicular distance from the path centerline to this band's own centerline, in world units. */
  offset: number;
  /** This band's own stroke thickness, in world units. */
  width: number;
  alpha: number;
}

export function resolvePinkDotOuterFieldBands(outer: PinkDotOuterState): readonly PinkDotOuterFieldBand[] {
  if (outer.mistRadius <= 0 || outer.ringOpacity <= 0) return [];
  const moatRadius = outer.mistRadius * RADIAL_MOAT_END_T;
  const ringOuterRadius = outer.mistRadius * RADIAL_RING_END_T;
  const mistOuterRadius = outer.mistRadius;
  const mistAlpha = Math.min(outer.mistOpacity, outer.ringOpacity * 0.85);
  return [
    // Mist first (drawn under), ring on top — same layering convention as
    // every other Pink Dot layer in this file: widest/faintest first.
    { offset: (ringOuterRadius + mistOuterRadius) / 2, width: Math.max(1, mistOuterRadius - ringOuterRadius), alpha: mistAlpha },
    { offset: (moatRadius + ringOuterRadius) / 2, width: Math.max(1, ringOuterRadius - moatRadius), alpha: outer.ringOpacity },
  ];
}

/**
 * A Pink Dot segment counts as "dwelling in place" (for endpoint-sizing
 * purposes) when it travels less than this fraction of the resolved
 * radius. Distance-based, not velocity-based: the actual failure mode (a
 * near-zero-length stroke's round line-cap degenerating into a full-
 * diameter circle) is a distance phenomenon, not a speed one — a slow but
 * genuinely moving line must NOT be treated as a dwell point.
 */
const PLUME_DWELL_DISTANCE_RATIO = 0.15;
/**
 * Minimum ACCUMULATED real dwell time (ms) before the outer field switches
 * to the stationary radial-gradient bullseye stamp — one of TWO conditions
 * that must both hold (see the gate at its call site, alongside
 * `point.velocity <= PLUME_VELOCITY_FLARE_THRESHOLD`). Real curve-smoothing
 * sub-sampling can subdivide even genuine, deliberate slow movement into
 * many segments individually shorter than `PLUME_DWELL_DISTANCE_RATIO`,
 * without the pointer actually having paused; switching render technique
 * for those would stamp circles all along a moving line, reintroducing the
 * "union of overlapping circles fills in the moat" problem the offset-rail
 * technique exists to avoid. Distance and velocity together (not either
 * alone) tell an actual pause apart from a slow-but-continuous stroke,
 * while a genuine brief pause is still caught almost immediately. The
 * stroke's own very first point (no `previous`) is exempt from both — a
 * bare touch is always a dot, never a rail.
 */
const PLUME_DWELL_STAMP_MIN_MS = 30;
/**
 * Real elapsed stationary time (ms) a Pink Dot dwell point needs to reach
 * full, un-scaled endpoint size. Chosen so growth stays visibly progressive
 * across the 0.2s/0.5s/1s live-test points rather than saturating almost
 * immediately.
 */
export const PLUME_DWELL_FULL_MS = 900;
/**
 * A brand-new dwell point — zero accumulated stationary time, whether from
 * a bare click or the instant real movement stops — never draws at literal
 * zero size; this floor keeps it a small visible dot rather than invisible.
 */
const PLUME_DWELL_MIN_SCALE = 0.22;

/**
 * How large a Pink Dot dwell point should draw right now, given how long it
 * has genuinely been stationary. 0ms (a fresh pointerdown, or the instant
 * after real movement stops) returns the floor scale — a small dot, not a
 * full bulb; ramps linearly to 1 (full size) by `PLUME_DWELL_FULL_MS`. Pure
 * function of elapsed time only, directly testable without engine state —
 * only meaningful for a genuinely stationary point (see `renderSegment`'s
 * distance-based dwell gate); a moving segment never calls this at all.
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
      const input = resolveMouseSprayInput(point, cap, coverageFactor, sprayAngleDegrees);
      dualPlumeState = resolvePinkDotDualPlume(cap, input, point.velocity, dynamics);

      // Dwell-driven endpoint sizing (see resolvePinkDotDwellScale): a
      // segment that barely traveled relative to the cap's own radius
      // counts as "dwelling in place." Real elapsed time accumulates while
      // consecutive segments stay dwell-type and resets the instant real
      // movement occurs, so a bare click or an immediate release never
      // deposits a full-size bulb, while a genuine hold (or a mid-stroke
      // pause) progressively strengthens instead.
      const isDwellPoint = distance <= dynamics.radius * PLUME_DWELL_DISTANCE_RATIO;
      if (isDwellPoint) {
        this.pinkDotDwellMs += previous ? Math.max(0, point.timestamp - previous.timestamp) : 0;
      } else {
        this.pinkDotDwellMs = 0;
      }
      const dwellScale = isDwellPoint ? resolvePinkDotDwellScale(this.pinkDotDwellMs) : 1;

      // Outer-field RENDERING TECHNIQUE gate (see PLUME_DWELL_STAMP_MIN_MS).
      // Deliberately stricter than the size gate above, and on a DIFFERENT
      // axis: real curve-smoothing/reconstruction can subdivide even
      // genuine, deliberate slow movement into many fine sub-segments whose
      // individual distances fall below PLUME_DWELL_DISTANCE_RATIO despite
      // the pointer clearly still moving — a raw per-segment distance check
      // alone cannot tell that apart from an actual pause, and switching to
      // the stamp technique for a whole slow stroke would reintroduce the
      // "overlapping circles fill the moat" problem across its entire
      // length, not just at one spot. `point.velocity` is the pipeline's
      // own smoothed speed estimate, immune to that per-segment noise, so
      // it — not raw distance — decides whether the pointer has actually
      // stopped. The stroke's bare first point is exempt (always a dot).
      const useDwellStamp = previous === null
        || (isDwellPoint && point.velocity <= PLUME_VELOCITY_FLARE_THRESHOLD && this.pinkDotDwellMs >= PLUME_DWELL_STAMP_MIN_MS);

      this.renderPinkDotDualPlume(ctx, drawStart, drawPoint, colorHex, cap, dualPlumeState, angle, dwellScale, useDwellStamp, random, fillMode, cellKey);
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
   * every segment (no distance-based gating anywhere in this method), so
   * the line body and its atmosphere stay connected through corners,
   * reversals, and loops. Draws the outer atmosphere field FIRST, then the
   * inner core on top — the core's own opaque passes cover the field's
   * inner portion, which is how the bullseye/ring read emerges from
   * stacked continuous layers rather than a moat-gradient trick or discrete
   * stamps. `dwellScale` (see `resolvePinkDotDwellScale`) shrinks BOTH
   * layers together for a genuinely fresh dwell point, so a bare click or
   * an immediate release never deposits a full-size bulb.
   */
  private renderPinkDotDualPlume(
    ctx: CanvasRenderingContext2D,
    start: StrokePoint,
    point: StrokePoint,
    colorHex: string,
    cap: SprayCapPreset,
    state: PinkDotDualPlumeState,
    angle: number,
    dwellScale: number,
    useDwellStamp: boolean,
    random: () => number,
    fillMode: boolean,
    cellKey: string | null,
  ): void {
    this.renderPinkDotOuterField(ctx, start, point, colorHex, state.outer, angle, dwellScale, useDwellStamp);
    this.renderPinkDotInnerCore(ctx, start, point, colorHex, cap, state.inner, angle, dwellScale, random, fillMode, cellKey);
  }

  /**
   * The outer/atmosphere layer — a TRUE four-zone radial cross-section:
   * core-edge -> a genuine low-density moat -> a raised ring band -> a
   * fading mist. Two different techniques depending on `useDwellStamp`
   * (see `PLUME_DWELL_STAMP_MIN_MS` — deliberately stricter than the plain
   * per-segment dwell gate, so a single short segment from curve-smoothing
   * sub-sampling amid otherwise-continuous slow movement never switches
   * technique on its own):
   *
   * - A true dwell (the stroke's bare first point, or a few consecutive
   *   frames of genuine real stillness) stamps ONE
   *   `createRadialGradient`-filled circle (`resolvePinkDotOuterFieldStops`)
   *   — the correct shape for a stationary bullseye, an ellipse under flare
   *   since the whole gradient squashes as one transformed unit.
   * - A genuinely moving segment instead sweeps the ring and mist zones as
   *   two OFFSET PARALLEL bands (`resolvePinkDotOuterFieldBands`) at a
   *   fixed perpendicular distance from the path. This is deliberate, not
   *   an inconsistency: stamping the same radial gradient repeatedly along
   *   a moving path would union many overlapping full disks together,
   *   which fills the moat right back in (a point in one stamp's moat
   *   falls inside a neighboring stamp's ring) — the very blur this
   *   profile exists to avoid. An offset stroke's own shape is exactly
   *   "constant perpendicular distance from the path," which is what a
   *   swept ring/mist band actually is.
   */
  private renderPinkDotOuterField(
    ctx: CanvasRenderingContext2D,
    start: StrokePoint,
    point: StrokePoint,
    colorHex: string,
    outer: PinkDotOuterState,
    angle: number,
    dwellScale: number,
    useDwellStamp: boolean,
  ): void {
    if (useDwellStamp) {
      const stops = resolvePinkDotOuterFieldStops(outer);
      if (stops.length === 0) return;
      const radius = outer.mistRadius * dwellScale;
      if (radius <= 0) return;
      this.drawPinkDotOuterFieldStamp(ctx, start.x, start.y, colorHex, stops, radius, angle, outer.anisotropy);
      return;
    }

    const bands = resolvePinkDotOuterFieldBands(outer);
    if (bands.length === 0) return;
    const perpAngle = angle + Math.PI / 2;
    const perpX = Math.cos(perpAngle);
    const perpY = Math.sin(perpAngle);
    for (const band of bands) {
      const offset = band.offset * dwellScale * outer.anisotropy;
      const width = Math.max(1, band.width * dwellScale);
      if (band.alpha <= 0) continue;
      for (const side of [1, -1]) {
        const ox = perpX * offset * side;
        const oy = perpY * offset * side;
        this.drawPinkDotOuterFieldRail(ctx, start.x + ox, start.y + oy, point.x + ox, point.y + oy, colorHex, band.alpha, width);
      }
    }
  }

  /** One four-zone radial-gradient stamp for a true Pink Dot dwell point — see `renderPinkDotOuterField`. */
  private drawPinkDotOuterFieldStamp(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    colorHex: string,
    stops: readonly HaloGradientStop[],
    radius: number,
    angle: number,
    anisotropy: number,
  ): void {
    ctx.save();
    ctx.translate(x, y);
    if (anisotropy < 1) {
      ctx.rotate(angle);
      ctx.scale(1, anisotropy);
    }
    const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
    for (const stop of stops) gradient.addColorStop(stop.offset, this.hexToRgba(colorHex, stop.alpha));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** One offset-parallel band segment (ring or mist) for a moving Pink Dot segment — see `renderPinkDotOuterField`. */
  private drawPinkDotOuterFieldRail(
    ctx: CanvasRenderingContext2D,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    colorHex: string,
    alpha: number,
    width: number,
  ): void {
    if (alpha <= 0 || width <= 0) return;
    ctx.save();
    ctx.strokeStyle = this.hexToRgba(colorHex, alpha);
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * The inner/core layer — a normal continuous multi-pass stroked line
   * every segment, same edgeExpansion/Fill-ceiling technique every other
   * line cap already uses (see the generic core loop in `renderSegment`),
   * just parameterized by the resolved `inner` state and carrying its own
   * (moderate) flare anisotropy. This is what guarantees clean connected
   * line continuity through straight segments, curves, sharp corners,
   * reversals, and loops — it is never gated or stamped. `endpointScale`
   * (see `resolvePinkDotDwellScale`) shrinks the drawn width only for a
   * genuinely fresh dwell point; a real moving segment always passes 1.
   */
  private renderPinkDotInnerCore(
    ctx: CanvasRenderingContext2D,
    start: StrokePoint,
    point: StrokePoint,
    colorHex: string,
    cap: SprayCapPreset,
    inner: PinkDotInnerState,
    angle: number,
    endpointScale: number,
    random: () => number,
    fillMode: boolean,
    cellKey: string | null,
  ): void {
    if (inner.radius <= 0 || inner.density <= 0) return;
    for (let pass = inner.density - 1; pass >= 0; pass -= 1) {
      const passRatio = inner.density <= 1 ? 0 : pass / (inner.density - 1);
      const edgeExpansion = 1 + passRatio * (1 - inner.falloff) * 0.72;
      const nominalPassAlpha = (inner.opacity * (1 - passRatio * 0.48)) / Math.sqrt(inner.density);
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
      const diameter = Math.max(0.7, inner.radius * 2 * edgeExpansion * endpointScale);

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
