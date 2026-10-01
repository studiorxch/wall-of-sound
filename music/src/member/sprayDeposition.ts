/**
 * V4: the smallest reusable aerosol engine, and ONE cap response profile
 * (the StudioRich Stock Cap) that configures it. Deliberately NOT the
 * ~1700-line multi-cap Spatial Spraypaint engine elsewhere in this repo
 * (SprayBrushEngine.ts/SprayCapProfile.ts/SprayCapPresets.ts) -- that
 * system's halo/flare/anisotropy/annular-ring machinery exists to support
 * ~19 named physical/effect caps with distance and velocity calibration,
 * which this pass explicitly does not need. This module borrows exactly
 * one proven idea from it (a tiny seeded PRNG so particle scatter replays
 * deterministically, `createStrokeRandom` in SprayBrushEngine.ts) and
 * nothing else.
 *
 * Architecture (see Art Supplies V4 brief §6-7):
 *
 *   Spray Mark's authored points
 *     -> resolveSprayEmissionPoints  (continuity: fills gaps on fast drags,
 *        and derives a local density factor from how closely the ORIGINAL
 *        points were recorded -- the same speed proxy Mop V3 uses)
 *     -> resolveSprayParticlePlan    (the aerosol engine: turns emission
 *        points + a SprayCapProfile into a bounded, deterministic list of
 *        small particles)
 *
 * A `SprayCapProfile` is data, not code -- the engine (`resolveSprayParticlePlan`)
 * never hardcodes Stock-Cap-specific numbers; it only reads whatever
 * profile it's given. A future cap is a new profile object passed to the
 * same function, not a new renderer.
 *
 * The authored Mark itself only ever stores the same `{x, y}` points every
 * other stroke Mark stores -- never a persisted particle list. All particle
 * generation happens at render time, deterministically, from those points
 * plus the Mark's own stable id (used as the PRNG seed) and the active cap
 * profile (currently always the Stock Cap -- no per-Mark cap field yet).
 */


import { SPRAY_DRIP_TUNING, resolveMaterialDripPlans, type DripPlan } from "./dripDeposition";

export interface SprayPoint {
  readonly x: number;
  readonly y: number;
  /** BLACKBOOK Spray Physicality V1 -- elapsed ms since the gesture's own first point (never wall-clock). Absent on legacy Marks -- see this module's velocity-vs-spacing doc below. */
  readonly tMs?: number;
  /** Raw `PointerEvent.pressure` (0-1) at this point, when the input device reported one. Absent on legacy Marks or devices with no real pressure signal. */
  readonly pressure?: number;
}

export interface SprayEmissionPoint extends SprayPoint {
  /** >1 in slow/dwelled sections, <1 in fast sections -- from real captured velocity when available (see `densityFactorForSegment`), else the legacy point-spacing proxy (resolveMopDabPlan's identical fallback in mopDeposition.ts). */
  readonly densityFactor: number;
  /** BLACKBOOK Spray Physicality V1 -- bounded pressure-derived flow multiplier (1 = neutral/no signal). See `pressureFlowFactor`'s own doc. */
  readonly flowFactor: number;
}

export interface SprayParticle extends SprayPoint {
  readonly radius: number;
  readonly alpha: number;
}

/** Calibration V1: how far a particle's radius can be scaled down from `particleRadiusRatio`'s own value -- pure per-particle size jitter (deterministic, from the same seeded random already used for angle/radius) so a field of particles doesn't read as a uniform-diameter dot grid. 1 = no jitter. */
const PARTICLE_RADIUS_JITTER_FLOOR = 0.55;

export interface SprayCapProfile {
  readonly id: string;
  readonly name: string;
  /**
   * BLACKBOOK Spray Physicality V1 -- Cap Personality. Multiplies the
   * artist's own authored Width (already `baseRadius = width * 0.5`)
   * into this cap's ACTUAL physical footprint -- 1 = no change from the
   * Stock Cap's existing calibrated behavior. A wider cap (e.g. Fat)
   * genuinely covers more area than the same Width slider value on the
   * Stock Cap, the same way a real fat cap's wider orifice sprays a
   * broader pattern at the same distance/hand speed -- this is cap
   * PERSONALITY, not a duplicate of the Width control.
   */
  readonly footprintRadiusScale: number;
  /** Particles emitted per emission point at densityFactor 1 -- scaled by that point's own densityFactor and rounded, then bounded by maxParticlesPerEmission. */
  readonly baseParticlesPerEmission: number;
  readonly maxParticlesPerEmission: number;
  /** Hard ceiling on emission points sampled from one Mark, regardless of path length -- the bound that keeps total particle count (and therefore render cost and any future persisted-plan size) independent of how long or slow a stroke was. */
  readonly maxEmissionPoints: number;
  /** Exponent applied to a uniform-disk radius sample (`sqrt(random)`) -- 1 = uniform disk, >1 pulls particles toward the center (denser core, the usual aerosol look), <1 pushes them toward the rim. Applied WITHIN the [`particleMinRadiusRatio`, 1] band, not from dead-center -- see that field. */
  readonly centerBias: number;
  /** Revision 5: the multi-pass CORE (`resolveSprayCorePlan`) already fully covers the footprint's own center -- particles piling up there too (the old default let `centerBias` push them all the way to offset 0) duplicated that coverage and read as a visibly darker "inner track" through the middle of the core, separable from the core's own softer edge (the user's "outer line + inner line" report). Particles are now excluded from the innermost `particleMinRadiusRatio` fraction of the footprint radius entirely -- that zone is the core's job -- so the particle field is purely the mid-to-edge OVERSPRAY layer it was always meant to be. */
  readonly particleMinRadiusRatio: number;
  /** Exponent applied to (1 - normalizedRadius) for each particle's edge falloff -- higher = softer/more gradual fade toward the footprint's edge. */
  readonly edgeSoftness: number;
  /** Per-particle alpha at the footprint's center before edge falloff, density, and the Mark's own opacity are applied. Individually translucent so overlapping particles (within one stroke, or across repeated Spray passes) visibly accumulate. */
  readonly baseParticleAlpha: number;
  /** Particle radius as a fraction of the footprint's own base radius -- small, so a Spray Mark reads as many small deposited dots (a coverage field) rather than a few large translucent blobs like Mop. */
  readonly particleRadiusRatio: number;
  /** Revision 3: number of low-alpha line passes drawn per emission segment for the CORE (center coverage) pass -- see `resolveSprayCorePlan`. Multiple overlapping semi-transparent passes, each with its own small jitter, is the technique the Spatial Spraypaint prototype's `renderSegment` proves out (see sprayDeposition.ts's module doc) for a continuous-but-textured body, replacing Revision 2's single `ctx.filter = blur(...)` stroke (which read as airbrush/glow, not paint). */
  readonly corePasses: number;
  /** Each pass's alpha budget BEFORE dividing by sqrt(corePasses) and applying the Mark's own opacity -- the passes' accumulated alpha (via ordinary source-over) is what gives the core its coverage, not any single pass's own opacity. */
  readonly coreAlpha: number;
  /** Core line width as a fraction of the full footprint diameter (`baseRadius * 2`). Narrower than the full footprint so the core reads as the stroke's dense CENTER, with the particle field supplying the field's edge beyond it. */
  readonly coreWidthRatio: number;
  /** Per-pass position jitter, as a fraction of baseRadius -- deterministic (same seeded PRNG as everything else), gives the core body a slightly irregular, hand-applied edge instead of one perfectly clean vector line. */
  readonly coreJitterRatio: number;
  /** Per-pass width variation, as a fraction of the pass's own nominal width (e.g. 0.25 = ±25%) -- deterministic, avoids every pass reading as identical stacked outlines. */
  readonly coreWidthJitterRatio: number;
}

/**
 * StudioRich's own default aerosol instrument -- not a claim about any
 * specific physical cap. Round, immediately usable, and tuned to read
 * clearly as aerosol coverage from a light tag pass through to denser fill
 * within V1's Width/Opacity range. See Art Supplies V4 brief §6.
 */
/**
 * Calibration V1 Revision 3: the particle field is now explicitly the
 * EDGE TEXTURE / OVERSPRAY layer, not the primary stroke -- continuity and
 * center coverage are the CORE pass's job (`resolveSprayCorePlan`, drawn
 * first). Pulled back from Revision 1's density (which was tuned to try to
 * carry the whole stroke alone) now that the core carries center coverage:
 * fewer, still-small particles read as fine aerosol grain around the core
 * rather than competing with it for perceptual weight. `maxEmissionPoints`
 * and `maxParticlesPerEmission` still bound total particle count.
 */
/**
 * Spray Material Calibration V1: live inspection of the pre-calibration
 * profile (still visible in git history) showed the STOCK CAP reading as a
 * flat, hard-edged, uniformly-colored capsule -- indistinguishable from a
 * plain rounded-line digital brush -- at ordinary authored widths, not
 * aerosol at all. Root cause, confirmed by isolating each layer: the THREE
 * core passes (`coreWidthRatio: 0.55` -> each pass ~1.1x baseRadius wide)
 * jittered by only `coreJitterRatio * baseRadius` (~0.16x baseRadius, well
 * under 2px at an ordinary authored width) landed almost perfectly on top
 * of each other, so three passes composited into what looked like ONE
 * solid stroke -- while the particle field (`particleRadiusRatio: 0.09`,
 * `baseParticleAlpha: 0.16`) was simultaneously too small and too faint to
 * read as texture at normal viewing zoom, leaving nothing visible outside
 * that solid core at all.
 *
 * Recalibration, same two-layer architecture (core for continuity, particle
 * field for edge texture/falloff -- never reintroducing Revision 2's
 * rejected `ctx.filter = blur(...)` "airbrush/glow" look, and never
 * reverting to Revision 3's rejected per-segment-stroke "dotted pattern"),
 * tuned against live Blackbook screenshots at normal AND close zoom:
 * - `coreWidthRatio` narrowed (0.55 -> 0.34) and `coreJitterRatio`/
 *   `coreWidthJitterRatio` roughly 2.5x -- the core alone now visibly
 *   breathes pass-to-pass instead of stacking into one flat rectangle, and
 *   leaves real room for the particle band around it. `coreAlpha` eased
 *   slightly (0.55 -> 0.42) to match the narrower, less dominant core.
 * - `particleMinRadiusRatio` lowered (0.4 -> 0.2) so the particle field
 *   starts closer to center and overlaps the core's own edge, removing the
 *   visible seam between "core zone" and "particle zone" the old gap
 *   between 0.55x (core edge) and 0.4x (particle start) risked.
 * - `particleRadiusRatio` (0.09 -> 0.2), `baseParticleAlpha` (0.16 -> 0.36),
 *   `baseParticlesPerEmission` (5 -> 9) and `maxParticlesPerEmission`
 *   (8 -> 15) all raised so the particle field is actually visible at
 *   normal zoom (this build's whole complaint) while staying individually
 *   translucent -- overlapping particles still visibly accumulate rather
 *   than each one reading as decorative confetti.
 * - The particle radius's absolute floor (`resolveSprayParticlePlan`,
 *   below) was separately raised 0.4px -> 1.1px: at Spray's own narrow
 *   authored width (`DRAWING_WIDTH_RANGES.spray.min = 8`, baseRadius = 4),
 *   even the recalibrated `particleRadiusRatio` above rounded particles
 *   down to a near-invisible sub-pixel dot, so narrow Spray still read as
 *   a plain crisp line (Pen-like) with no aerosol texture -- exactly the
 *   "narrow must remain aerosol, not become Pen" requirement this build
 *   is held to. This floor is deliberately in `resolveSprayParticlePlan`,
 *   not this profile, since it protects every current and future cap's
 *   narrow end, not just the Stock Cap's own tuning.
 * - `edgeSoftness` raised (1.6 -> 2.0) for a more gradual outer falloff.
 * `maxEmissionPoints`/`maxParticlesPerEmission` remain the two bounds that
 * keep total work independent of stroke length -- see this module's
 * Performance doc further down.
 */
export const STUDIORICH_STOCK_CAP: SprayCapProfile = Object.freeze({
  id: "studiorich-stock",
  name: "StudioRich Stock Cap",
  footprintRadiusScale: 1,
  baseParticlesPerEmission: 9,
  maxParticlesPerEmission: 15,
  maxEmissionPoints: 3000,
  centerBias: 1,
  edgeSoftness: 2,
  baseParticleAlpha: 0.36,
  particleRadiusRatio: 0.2,
  particleMinRadiusRatio: 0.2,
  corePasses: 3,
  coreAlpha: 0.42,
  coreWidthRatio: 0.34,
  coreJitterRatio: 0.4,
  coreWidthJitterRatio: 0.5,
});

/**
 * BLACKBOOK Spray Physicality V1 -- Cap Personality. A "fat cap" in real
 * aerosol art is a wide-orifice nozzle: a broader, softer, wash-like
 * pattern with less defined center and more overspray, at the cost of
 * control -- the opposite trade-off from a skinny/stock cap's tight,
 * confident line. Modeled here as: a wider physical footprint
 * (`footprintRadiusScale`), a proportionally NARROWER core relative to
 * that bigger footprint (`coreWidthRatio` lower than Stock's, so the
 * core reads as a soft center rather than dominating the wider field),
 * more particles at a lower per-particle alpha (a diffuse wash builds up
 * through accumulation rather than a few dense dots), and softer edge
 * falloff (`edgeSoftness` higher = more gradual). This is deliberately
 * NOT just "STUDIORICH_STOCK_CAP with a bigger radius" -- every
 * differentiating field the module's own SprayCapProfile doc describes
 * is touched, per this batch's own "not merely different brush widths"
 * requirement.
 */
export const STUDIORICH_FAT_CAP: SprayCapProfile = Object.freeze({
  id: "studiorich-fat",
  name: "StudioRich Fat Cap",
  footprintRadiusScale: 1.65,
  baseParticlesPerEmission: 13,
  maxParticlesPerEmission: 20,
  maxEmissionPoints: 3000,
  centerBias: 0.8,
  edgeSoftness: 2.6,
  baseParticleAlpha: 0.26,
  particleRadiusRatio: 0.22,
  particleMinRadiusRatio: 0.28,
  corePasses: 3,
  coreAlpha: 0.3,
  coreWidthRatio: 0.22,
  coreJitterRatio: 0.55,
  coreWidthJitterRatio: 0.6,
});

/** Data-driven cap registry -- a future StudioRich cap is a new profile object added here, never a new rendering branch. `DEFAULT_SPRAY_CAP_ID` resolves every legacy Spray Mark (authored before caps existed) to the Stock Cap, preserving its exact existing calibrated look. */
export const SPRAY_CAP_PROFILES: Readonly<Record<string, SprayCapProfile>> = Object.freeze({
  [STUDIORICH_STOCK_CAP.id]: STUDIORICH_STOCK_CAP,
  [STUDIORICH_FAT_CAP.id]: STUDIORICH_FAT_CAP,
});
export const DEFAULT_SPRAY_CAP_ID = STUDIORICH_STOCK_CAP.id;

export function resolveSprayCapProfile(capId: string | undefined): SprayCapProfile {
  return (capId !== undefined && SPRAY_CAP_PROFILES[capId]) || STUDIORICH_STOCK_CAP;
}

// Calibration V1: tightened from 0.35 -- denser emission-point spacing so a
// fast drag reads as one continuous sprayed field rather than a line of
// separated islands. Still purely a function of baseRadius (never camera or
// time), so determinism/replay is unaffected.
const MIN_STEP_RATIO = 0.22;
const NEUTRAL_SPACING_RATIO = 0.6;
const MIN_DENSITY_FACTOR = 0.55;
const MAX_DENSITY_FACTOR = 1.6;
const DENSITY_RESPONSE = 0.5;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * BLACKBOOK Spray Physicality V1 -- Movement. `tMs` is present (and
 * strictly increasing) on every point of a NEW Spray Mark; entirely absent
 * on a legacy Mark authored before this field existed. A stroke is either
 * fully timed or fully untimed (both endpoints of every segment come from
 * the same authoring session) -- this checks the two endpoints of ONE
 * segment, which is all `densityFactorForSegment` below ever needs.
 */
function hasVelocitySignal(a: SprayPoint, b: SprayPoint): boolean {
  return a.tMs !== undefined && b.tMs !== undefined && b.tMs > a.tMs;
}

/**
 * Real movement speed, in authored-units per ms (same coordinate space as
 * `baseRadius` -- document-space units, already resolution-independent).
 * `neutralSpeed` is calibrated so an ordinary, unhurried tag-speed gesture
 * (roughly one `baseRadius` of travel every ~40ms, a plausible hand-speed
 * order of magnitude at typical Blackbook zoom) lands near densityFactor 1,
 * the same anchor point the legacy spacing proxy uses.
 */
const NEUTRAL_SPEED_RATIO_PER_MS = NEUTRAL_SPACING_RATIO / 40;
const VELOCITY_DENSITY_RESPONSE = 0.6;

function densityFactorForSegment(start: SprayPoint, end: SprayPoint, baseRadius: number): number {
  const segmentLength = Math.hypot(end.x - start.x, end.y - start.y);
  if (hasVelocitySignal(start, end)) {
    const dt = (end.tMs as number) - (start.tMs as number);
    const speed = segmentLength / dt; // authored-units / ms
    const neutralSpeed = Math.max(1e-6, baseRadius * NEUTRAL_SPEED_RATIO_PER_MS);
    // Slower than neutral -> factor > 1 (more deposit, dwelling); faster -> factor < 1 (lighter, dispersed).
    return clamp(1 + (1 - speed / neutralSpeed) * VELOCITY_DENSITY_RESPONSE, MIN_DENSITY_FACTOR, MAX_DENSITY_FACTOR);
  }
  // Legacy fallback: the original point-spacing proxy, byte-identical to
  // the pre-Physicality-pass behavior for any Mark with no `tMs`.
  const neutralSpacing = Math.max(1e-6, baseRadius * NEUTRAL_SPACING_RATIO);
  return clamp(1 + (1 - segmentLength / neutralSpacing) * DENSITY_RESPONSE, MIN_DENSITY_FACTOR, MAX_DENSITY_FACTOR);
}

/**
 * BLACKBOOK Spray Physicality V1 -- Pressure. Used CONSERVATIVELY (bounded
 * ~±18%) and only when the whole stroke actually carries a real pressure
 * SIGNAL, not merely a value -- a mouse (and most touch input) reports a
 * constant `pressure` (typically 0.5) for the whole gesture per the
 * PointerEvent spec, which is not a physical pressure reading. Determinism
 * comes from `points` alone (no device-type flag persisted): the variance
 * across a stroke's own recorded pressures is a bounded, deterministic
 * property of the same points every other part of this engine already
 * reads. A near-constant series (mouse, most touch) yields a near-zero
 * variance and falls back to `neutral = 1`, exactly like an absent value.
 */
const PRESSURE_VARIANCE_SIGNAL_THRESHOLD = 0.0025; // ~5% stddev-equivalent
const PRESSURE_FLOW_RESPONSE = 0.36; // bounded factor range: [1-0.18, 1+0.18]

function hasMeaningfulPressureSignal(points: readonly SprayPoint[]): boolean {
  const values = points.map((p) => p.pressure).filter((p): p is number => p !== undefined);
  if (values.length < 2) return false;
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return variance > PRESSURE_VARIANCE_SIGNAL_THRESHOLD;
}

/** 0 (light touch) -> ~0.82x flow; 1 (full pressure) -> ~1.18x flow. Never a 0..1-mapped-to-full-opacity slider -- see this module's own doc. */
function pressureFlowFactor(pressure: number | undefined, signalPresent: boolean): number {
  if (!signalPresent || pressure === undefined) return 1;
  return clamp(1 + (pressure - 0.5) * PRESSURE_FLOW_RESPONSE, 1 - PRESSURE_FLOW_RESPONSE / 2, 1 + PRESSURE_FLOW_RESPONSE / 2);
}
/** A much smaller, bounded radius nudge (max ±6%) -- pressure primarily affects FLOW/density (paint volume), only a subtle secondary effect on footprint size, per this batch's own "flow/density primarily" instruction. */
function pressureRadiusFactor(pressure: number | undefined, signalPresent: boolean): number {
  if (!signalPresent || pressure === undefined) return 1;
  return clamp(1 + (pressure - 0.5) * 0.12, 0.94, 1.06);
}

/**
 * 32-bit FNV-1a -- a small, well-known, dependency-free string hash. Used
 * only to turn a Mark's own (stable, already-persisted) id into a numeric
 * PRNG seed; never used for anything security-sensitive.
 */
export function hashSeed(source: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * A tiny deterministic PRNG (mulberry32-family, the same shape used by
 * `createStrokeRandom` in the Spatial Spraypaint prototype's
 * SprayBrushEngine.ts) -- same seed always produces the same sequence, so
 * replay is pixel-identical from persisted points alone. Never
 * `Math.random`.
 */
export function createSeededRandom(seed: number): () => number {
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
 * Resamples the authored path into a bounded, evenly-covered list of
 * emission points -- the seam that keeps fast drags from leaving gaps
 * (`maxStep` caps how far apart any two consecutive emission points can
 * be, independent of how sparse the original recorded points were) while
 * still deriving a local density factor from the ORIGINAL point spacing
 * (dense original points -- slow movement/dwelling -- read as a higher
 * densityFactor at the emission points sampled near them).
 *
 * A single point (or a very short/near-stationary path, the tap/dot case)
 * still produces at least one emission point, so a short click plausibly
 * sprays a dot rather than nothing.
 *
 * Revision 4 fix: a real gesture (a normal-speed "SPRAY" tag, or any stroke
 * with pointer coalescing capturing many raw samples) easily has enough
 * total path length that the OLD fixed `maxStep` would need more than
 * `cap.maxEmissionPoints` steps to cover it -- and the old loop's
 * `if (emissions.length >= cap.maxEmissionPoints) return emissions` simply
 * STOPPED and returned early, silently dropping the rest of the authored
 * path from rendering (never from the persisted Mark, only from what got
 * drawn -- but the visible symptom is "Spray stops depositing before the
 * gesture finishes"). The bound must produce a coarser-but-complete
 * representation of a long path, never a truncated one: this function now
 * measures the path's total length FIRST and widens the step size (never
 * narrower than the nominal `MIN_STEP_RATIO` step) just enough that the
 * whole path fits within `cap.maxEmissionPoints`, so the final authored
 * point is always included. Short/ordinary strokes are completely
 * unaffected (the adaptive step never goes below the nominal one).
 */
export function resolveSprayEmissionPoints(
  points: readonly SprayPoint[],
  baseRadius: number,
  cap: SprayCapProfile = STUDIORICH_STOCK_CAP,
): readonly SprayEmissionPoint[] {
  if (points.length === 0 || baseRadius <= 0) return [];
  // BLACKBOOK Spray Physicality V1 -- Cap Personality: the cap's own
  // footprint scale is applied ONCE, here, so every downstream computation
  // (step sizing, velocity-neutral calibration, and resolveSprayParticlePlan's
  // own particle offsets/radii) consistently uses the cap's REAL physical
  // footprint, not the artist's raw Width value.
  const effectiveRadius = baseRadius * cap.footprintRadiusScale;
  const pressureSignal = hasMeaningfulPressureSignal(points);
  // LIVE STROKE STABILITY V2 -- root cause of the REMAINING rearrangement
  // (reported specifically at a direction change, on a long gesture):
  // Revision 8's own safety nets -- pre-simplifying the RAW points via
  // Douglas-Peucker once `points.length - 1 > budget`, and post-hoc
  // simplifying the built `emissions` list once it exceeded
  // `cap.maxEmissionPoints` -- are each a GLOBAL recompute over the WHOLE
  // current array. `simplifyPathToBudget`'s bucket boundaries are a
  // function of the CURRENT total point count, so the exact instant a
  // live, still-growing gesture crossed either threshold, EVERY earlier
  // segment's representative points could be reselected differently --
  // this is a full reflow, not merely a step-size change (V1's fix), and
  // raising the threshold (V1's own change) only delayed it, never
  // removed it, exactly as flagged in this batch's own brief. A direction
  // change is not itself the cause -- it's simply attention-grabbing when
  // it happens to coincide with the threshold crossing on a long gesture
  // that also happens to still be moving.
  //
  // Fixed by removing BOTH global resamples entirely: segments are walked
  // in original order, one at a time, using ONLY that segment's own two
  // endpoints (never any other point, never the array's current total
  // length or count) -- so an earlier segment's emissions are, by
  // construction, permanently fixed the instant they're computed, for the
  // lifetime of the array. The `cap.maxEmissionPoints` ceiling is now
  // enforced by simply STOPPING once it's reached (a hard append cutoff,
  // never a re-selection of what's already been emitted) -- per this
  // batch's own explicit instruction: "design it to preserve append/prefix
  // stability rather than globally resampling the complete growing
  // stroke." The trade-off is real and intentional: an extremely long
  // gesture may stop gaining NEW spray coverage past the cap, but nothing
  // already deposited can ever be altered by continuing to draw --
  // stability is prioritized over completeness. `maxEmissionPoints` is
  // sized generously (see both cap profiles' own values) to cover any
  // realistic single gesture with margin.
  const maxStep = Math.max(1e-6, effectiveRadius * MIN_STEP_RATIO);

  const emissions: SprayEmissionPoint[] = [{
    ...points[0],
    densityFactor: densityFactorForSegment(points[0], points[0], effectiveRadius),
    flowFactor: pressureFlowFactor(points[0].pressure, pressureSignal),
  }];
  segmentLoop:
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const density = densityFactorForSegment(start, end, effectiveRadius);
    // Flow uses the SEGMENT's average pressure -- both endpoints, same
    // "meaningful signal" gate as density's velocity check, deterministic
    // from the two already-authored points.
    const segmentPressure = start.pressure !== undefined && end.pressure !== undefined
      ? (start.pressure + end.pressure) / 2
      : start.pressure ?? end.pressure;
    const flow = pressureFlowFactor(segmentPressure, pressureSignal);
    const segmentLength = Math.hypot(end.x - start.x, end.y - start.y);
    const steps = Math.max(1, Math.ceil(segmentLength / maxStep));
    for (let step = 1; step <= steps; step += 1) {
      if (emissions.length >= cap.maxEmissionPoints) break segmentLoop;
      const t = step / steps;
      emissions.push({ x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t, densityFactor: density, flowFactor: flow });
    }
  }
  return emissions;
}

/**
 * The aerosol engine itself: emission points + a cap profile -> a bounded,
 * deterministic list of small particles. `seed` should be a stable,
 * authored identifier (the Mark's own id) -- the same points + baseRadius
 * + seed + cap always produce the exact same particle list, live or on
 * replay from Firestore-persisted points.
 */
export function resolveSprayParticlePlan(
  points: readonly SprayPoint[],
  baseRadius: number,
  seed: number,
  cap: SprayCapProfile = STUDIORICH_STOCK_CAP,
): readonly SprayParticle[] {
  if (baseRadius <= 0) return [];
  const effectiveRadius = baseRadius * cap.footprintRadiusScale;
  const emissions = resolveSprayEmissionPoints(points, baseRadius, cap);
  const random = createSeededRandom(seed);
  const particles: SprayParticle[] = [];
  for (const emission of emissions) {
    // BLACKBOOK Spray Physicality V1 -- Pressure: flow (density/volume)
    // scales particle COUNT here, folded in alongside the existing
    // velocity/spacing densityFactor -- both are bounded, both come from
    // already-authored, replayable data.
    const particleCount = Math.min(
      cap.maxParticlesPerEmission,
      Math.max(1, Math.round(cap.baseParticlesPerEmission * emission.densityFactor * emission.flowFactor)),
    );
    for (let index = 0; index < particleCount; index += 1) {
      const angle = random() * Math.PI * 2;
      const normalizedRadius = random() ** cap.centerBias;
      // Revision 5: exclude the innermost band entirely -- that's the
      // core's job (see `particleMinRadiusRatio`'s doc). Remaps [0,1] into
      // [particleMinRadiusRatio, 1] instead of [0,1].
      const bandedRadius = cap.particleMinRadiusRatio + normalizedRadius * (1 - cap.particleMinRadiusRatio);
      const offsetRadius = bandedRadius * effectiveRadius;
      const edgeFalloff = (1 - normalizedRadius) ** cap.edgeSoftness;
      const radiusJitter = PARTICLE_RADIUS_JITTER_FLOOR + random() * (1 - PARTICLE_RADIUS_JITTER_FLOOR);
      // BLACKBOOK Spray Physicality V1 -- Pressure's secondary, much
      // smaller (±6%) effect on particle radius (footprint), alongside its
      // primary flow/density effect above.
      const pressureRadius = pressureRadiusFactor(emission.pressure, emission.flowFactor !== 1);
      particles.push({
        x: emission.x + Math.cos(angle) * offsetRadius,
        y: emission.y + Math.sin(angle) * offsetRadius,
        // Spray Material Calibration V1: raised from 0.4 -- at Spray's own
        // narrow-end authored width (DRAWING_WIDTH_RANGES.spray.min = 8,
        // baseRadius = 4), the OLD floor let particles round down to a
        // near-invisible sub-pixel dot, so narrow Spray read as a plain
        // crisp thin line (Pen-like) with no aerosol texture at all --
        // exactly the "must remain aerosol, not become Pen" defect this
        // build exists to fix. A slightly higher absolute floor keeps
        // narrow Spray's overspray genuinely visible without meaningfully
        // changing the already-large broad-end particle sizes.
        radius: Math.max(1.1, effectiveRadius * cap.particleRadiusRatio * radiusJitter * pressureRadius),
        alpha: cap.baseParticleAlpha * edgeFalloff * clamp(emission.densityFactor, 0.4, 1.4),
      });
    }
  }
  return particles;
}

export interface SprayCorePoint extends SprayPoint {
  readonly densityFactor: number;
  /** BLACKBOOK Spray Physicality V1 -- see SprayEmissionPoint.flowFactor's identical doc. */
  readonly flowFactor: number;
}

export interface SprayCorePass {
  /** Continuous path for this pass -- ALWAYS drawn as ONE moveTo + lineTo chain + a single stroke() call, never as separate per-segment strokes (that per-segment approach was Revision 3's dotted-pattern bug). */
  readonly points: readonly SprayCorePoint[];
  readonly width: number;
  /** This pass's alpha (before the Mark's own opacity), constant along the whole pass -- deliberately simpler than per-point density response; continuity is this layer's only job, speed-response character already lives in the particle field and (for Mop) resolveMopDabPlan. */
  readonly alpha: number;
}

/**
 * Revision 4 fix (dotted-pattern root cause): Revision 3's core reused the
 * PARTICLE field's very fine emission spacing (`baseRadius * MIN_STEP_RATIO`,
 * ~0.22 * baseRadius) and stroked each tiny sub-segment SEPARATELY. Because
 * that segment length was far shorter than the core's own line width
 * (`baseRadius * 2 * coreWidthRatio`, ~1.1 * baseRadius), each "segment"
 * rendered as a short, fat, round-capped blob -- effectively a near-circle,
 * not a line contribution -- repeating at regular fine spacing along the
 * path. That regular repetition of near-circular blobs WAS the visible
 * "dotted/stamped pattern" the user reported (confirmed by isolating the
 * core from the particle field: the core alone already showed the
 * repeated-node artifact).
 *
 * Fix: the core now samples its own, much coarser set of points (step size
 * comparable to the core's own width, not the particle field's fine
 * spacing -- see `CORE_STEP_RATIO`) and strokes each pass as ONE continuous
 * polyline (one `moveTo`/`lineTo` chain, one `stroke()` call), exactly like
 * Mop's and every clean-line supply's own continuous background pass. A
 * continuous stroke has no regularly-spaced node artifact regardless of how
 * many points it passes through. `cap.corePasses` such continuous strokes,
 * each independently jittered (deterministic, per-pass) in position and
 * width, still accumulate via ordinary source-over into the same
 * continuous-but-textured body Revision 3 was aiming for -- this fixes the
 * dotted pattern without losing that legibility gain.
 *
 * Uses the same adaptive/bounded resampling principle as
 * `resolveSprayEmissionPoints` (never truncates a long gesture), and its
 * OWN seeded PRNG stream (independent of `resolveSprayParticlePlan`'s), so
 * replay is pixel-identical.
 */
const CORE_STEP_RATIO = 0.9;
// LIVE STROKE STABILITY V2: 220 -> 660 -> 3000 (matching maxEmissionPoints'
// own raise). Now that this cap is enforced as a hard APPEND CUTOFF rather
// than a trigger for a global resample (see resolveSprayCoreSamplePoints'
// own doc), a generous value is the right trade-off: any realistic single
// gesture stays comfortably under it, and even a genuinely pathological
// gesture that DOES hit it simply stops gaining new core coverage rather
// than reflowing anything already drawn.
const CORE_MAX_SAMPLE_POINTS = 3000;

export function resolveSprayCoreSamplePoints(
  points: readonly SprayPoint[],
  baseRadius: number,
  cap: SprayCapProfile = STUDIORICH_STOCK_CAP,
): readonly SprayCorePoint[] {
  if (points.length === 0 || baseRadius <= 0) return [];
  const effectiveRadius = baseRadius * cap.footprintRadiusScale;
  const pressureSignal = hasMeaningfulPressureSignal(points);
  const nominalStep = Math.max(1e-6, effectiveRadius * CORE_STEP_RATIO);

  if (points.length === 1) {
    return [{ ...points[0], densityFactor: densityFactorForSegment(points[0], points[0], effectiveRadius), flowFactor: pressureFlowFactor(points[0].pressure, pressureSignal) }];
  }

  // LIVE STROKE STABILITY V2 -- see resolveSprayEmissionPoints' identical,
  // fully-documented fix. No pre- or post-hoc `simplifyPathToBudget` global
  // resample -- segments are walked in order using only their own two
  // endpoints, and the cap is enforced as a hard append cutoff (`break`),
  // never a re-selection of already-emitted samples.
  const step = nominalStep;

  const samples: SprayCorePoint[] = [{
    ...points[0],
    densityFactor: densityFactorForSegment(points[0], points[0], effectiveRadius),
    flowFactor: pressureFlowFactor(points[0].pressure, pressureSignal),
  }];
  segmentLoop:
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const density = densityFactorForSegment(start, end, effectiveRadius);
    const segmentPressure = start.pressure !== undefined && end.pressure !== undefined
      ? (start.pressure + end.pressure) / 2
      : start.pressure ?? end.pressure;
    const flow = pressureFlowFactor(segmentPressure, pressureSignal);
    const segmentLength = Math.hypot(end.x - start.x, end.y - start.y);
    const steps = Math.max(1, Math.ceil(segmentLength / step));
    for (let s = 1; s <= steps; s += 1) {
      if (samples.length >= CORE_MAX_SAMPLE_POINTS) break segmentLoop;
      const t = s / steps;
      samples.push({ x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t, densityFactor: density, flowFactor: flow });
    }
  }
  return samples;
}

export function resolveSprayCorePlan(
  points: readonly SprayPoint[],
  baseRadius: number,
  seed: number,
  cap: SprayCapProfile = STUDIORICH_STOCK_CAP,
): readonly SprayCorePass[] {
  if (baseRadius <= 0 || points.length === 0) return [];
  const effectiveRadius = baseRadius * cap.footprintRadiusScale;
  const samples = resolveSprayCoreSamplePoints(points, baseRadius, cap);
  if (samples.length === 0) return [];
  const random = createSeededRandom(seed);
  const passes = Math.max(1, cap.corePasses);
  const nominalWidth = Math.max(0.6, effectiveRadius * 2 * cap.coreWidthRatio);
  const passAlphaBudget = cap.coreAlpha / Math.sqrt(passes);
  // BLACKBOOK Spray Physicality V1 -- Pressure/Movement: the core's own
  // flow/density character, averaged across the whole stroke (the core is
  // ONE continuous pass per cap.corePasses, not per-segment, so it uses a
  // single stroke-level scalar rather than the particle field's per-emission
  // resolution -- consistent with this pass's own "continuity is this
  // layer's only job" doc above).
  const meanDensity = samples.reduce((sum, s) => sum + s.densityFactor, 0) / samples.length;
  const meanFlow = samples.reduce((sum, s) => sum + s.flowFactor, 0) / samples.length;

  const passesOut: SprayCorePass[] = [];
  for (let pass = 0; pass < passes; pass += 1) {
    const passRatio = passes <= 1 ? 0 : pass / (passes - 1);
    // One jitter offset per pass (not per point) -- keeps each pass a
    // genuinely CONTINUOUS path (a per-point jitter would reintroduce
    // small zig-zags at fine spacing); the passes still differ from each
    // other, and from one Mark to the next, deterministically.
    const jitterX = (random() - 0.5) * effectiveRadius * cap.coreJitterRatio;
    const jitterY = (random() - 0.5) * effectiveRadius * cap.coreJitterRatio;
    const widthJitter = 1 + (random() - 0.5) * cap.coreWidthJitterRatio;
    const jittered: SprayCorePoint[] = samples.length === 1
      ? [samples[0], samples[0]].map((p) => ({ x: p.x + jitterX, y: p.y + jitterY, densityFactor: p.densityFactor, flowFactor: p.flowFactor }))
      : samples.map((p) => ({ x: p.x + jitterX, y: p.y + jitterY, densityFactor: p.densityFactor, flowFactor: p.flowFactor }));
    passesOut.push({
      points: jittered,
      width: Math.max(0.6, nominalWidth * widthJitter * clamp(meanDensity, 0.8, 1.2)),
      alpha: passAlphaBudget * (1 - passRatio * 0.3) * meanFlow,
    });
  }
  return passesOut;
}

/**
 * BLACKBOOK Deterministic Drips β0.1 -- Spray's own drip seam, the same
 * shared engine (`dripDeposition.ts`) Mop's `resolveMopDripPlans` uses, fed
 * from Spray's own already-resolved emission points (their existing
 * `densityFactor` -- real captured velocity when available, else the
 * legacy point-spacing proxy) rather than a second local-load derivation.
 * `SPRAY_DRIP_TUNING` deliberately requires materially more accumulation
 * than Mop's own `MOP_DRIP_TUNING` before a drip spawns at all -- an
 * aerosol coverage field drips less readily than a pooled wet applicator at
 * the same dwell. Uses the cap's own `footprintRadiusScale`d radius, the
 * same effective radius every other Spray computation in this module keys
 * off, so a Fat Cap's wider footprint also widens its own drip gravity/
 * wobble consistently with its wider deposition.
 */
export function resolveSprayDripPlans(
  points: readonly SprayPoint[],
  baseRadius: number,
  seed: number,
  cap: SprayCapProfile = STUDIORICH_STOCK_CAP,
): readonly DripPlan[] {
  if (points.length === 0 || baseRadius <= 0) return [];
  const effectiveRadius = baseRadius * cap.footprintRadiusScale;
  const emissions = resolveSprayEmissionPoints(points, baseRadius, cap);
  return resolveMaterialDripPlans(emissions, effectiveRadius, seed, SPRAY_DRIP_TUNING);
}
