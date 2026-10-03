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
 *
 * SPRAY INSTRUMENT EXPRESSION PASS -- input classification. Everything this
 * engine (or `resolveSpraySoundState` below) reads falls into exactly one
 * of three buckets; code in this module is commented against these names so
 * a future spatial-input pass has an honest seam to extend rather than a
 * pile of ad-hoc heuristics to reverse-engineer:
 *
 *   1. MEASURED  -- taken directly off a real input event, never computed:
 *      `x`/`y` (every point), `tMs` (Spray only, elapsed ms since the
 *      gesture's own first point), `pressure` (Spray only, raw
 *      `PointerEvent.pressure`, used only once a real per-stroke VARIANCE
 *      is confirmed -- see `hasMeaningfulPressureSignal`).
 *   2. DERIVED   -- a bounded, deterministic function of MEASURED data from
 *      THIS gesture alone, computed fresh every time, never persisted:
 *      `densityFactor` (speed/dwell proxy), `flowFactor` (pressure->flow),
 *      per-segment speed/acceleration (`motionFactorForSegment` below --
 *      new this pass), local "instability" (direction-change rate, used for
 *      sputter/dust character -- new this pass), and `dripDeposition.ts`'s
 *      own local-load accumulation (reused, not re-derived here).
 *   3. FUTURE SPATIAL (NOT IMPLEMENTED) -- can X/Y/Z, wall distance/depth,
 *      pitch/yaw/roll, angular velocity/acceleration of the CAN (not of the
 *      2D gesture). Today's pointer/Pencil input supplies none of this.
 *      Nothing in this module fabricates a value for it; `resolveSpraySoundState`
 *      explicitly reports it absent rather than inventing a placeholder.
 */


import { SPRAY_DRIP_TUNING, resolveMaterialDripPlans, resolveDripOrigins, type DripPlan } from "./dripDeposition";

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
  /**
   * SPRAY INSTRUMENT EXPRESSION PASS -- how far the core's own motion-driven
   * width clamp can swing from 1 in either direction (replaces the previous
   * hardcoded `clamp(meanDensity, 0.8, 1.2)`, i.e. a range of 0.2). A FAT
   * cap gets a wide range (dramatic flare response to a slow/dwelled vs.
   * fast/released gesture); a PRECISION cap gets a near-zero range (stays
   * thin regardless of how the gesture moves -- "should NOT become a fat
   * cap through gesture").
   */
  readonly motionFootprintRange: number;
  /**
   * How strongly a DECELERATING release at the gesture's own tail (derived,
   * local, backward-looking only -- see `tailFlareFactor`) spawns extra,
   * wider-flung particles there. 0 = no flare at all (Precision). A FAT cap
   * is tuned to respond "much more dramatically" than a Skinny/Precision
   * cap, per this pass's own cap-philosophy brief.
   */
  readonly flareResponse: number;
  /**
   * How strongly a FAST/dispersed emission spawns a few extra, faint,
   * far-flung "dust" particles beyond the normal footprint -- the aerosol
   * reading this pass's own brief asks for (DUST should "emerge...from
   * aerosol/deposition behavior rather than...arbitrary brush stamps").
   * 0 = no dust layer.
   */
  readonly dustResponse: number;
  /**
   * How strongly a DWELLED emission (high local load, short of the actual
   * drip threshold in `dripDeposition.ts`) spawns a few extra, larger,
   * denser "speckle" droplets mixed into the fine particle field -- the
   * coarse-droplet layer distinct from ordinary aerosol grain. 0 = none.
   */
  readonly speckleResponse: number;
  /**
   * How strongly local direction-change "instability" (rapid, erratic
   * travel-direction changes -- the nearest 2D proxy for a wet/unstable
   * can) roughens particle radius/alpha variance -- the WET SPUTTER visual
   * character. 0 = perfectly smooth aerosol regardless of how erratic the
   * gesture is.
   */
  readonly instabilityResponse: number;
  /**
   * CALLIGRAPHY cap support -- how strongly this cap's CORE width responds
   * to the gesture's own dominant travel direction relative to `nibAngleDeg`
   * (a fixed chisel-nib axis). 0 for every non-directional cap (Stock, Fat,
   * Precision) -- their core width never depends on travel direction at
   * all, preserving their exact prior behavior. Computed once per gesture
   * from that gesture's own average direction (never oscillated mid-stroke
   * by this engine -- "technique... causes the variation", per this pass's
   * own brief -- a different stroke drawn in a different direction reads
   * thick/thin differently; the SAME stroke never auto-oscillates along its
   * own length).
   */
  readonly directionalResponse: number;
  /** The chisel nib's own fixed axis, in degrees (0 = pointing along +x). Only meaningful when `directionalResponse > 0`. */
  readonly nibAngleDeg: number;
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
  // SPRAY INSTRUMENT EXPRESSION PASS: 0.2 reproduces the prior hardcoded
  // clamp(meanDensity, 0.8, 1.2) exactly -- zero behavior change for any
  // existing Stock Cap Mark. Moderate flare/dust/speckle/instability so the
  // general-purpose cap genuinely reads as an instrument, not a plain
  // variable-width brush, without becoming either specialist cap.
  motionFootprintRange: 0.2,
  flareResponse: 0.5,
  dustResponse: 0.4,
  speckleResponse: 0.4,
  instabilityResponse: 0.45,
  directionalResponse: 0,
  nibAngleDeg: 0,
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
  // SPRAY INSTRUMENT EXPRESSION PASS: a FAT cap is the one explicitly asked
  // to "respond much more dramatically" to motion than a Skinny/Precision
  // cap -- wide motion-footprint swing, strong flare/dust (a working bomber
  // stroke genuinely dumps a dramatic flare on a fast release), and the
  // most sputter-prone of the three non-directional caps (a wide-orifice
  // cap is the one most prone to visible wet instability).
  motionFootprintRange: 0.45,
  flareResponse: 1,
  dustResponse: 0.7,
  speckleResponse: 0.6,
  instabilityResponse: 0.65,
  directionalResponse: 0,
  nibAngleDeg: 0,
});

/**
 * SPRAY INSTRUMENT EXPRESSION PASS -- SKINNY/PRECISION CAP. The opposite
 * trade-off from Fat: a tight, confident, sustained hairline for detail
 * work (hair/eyelashes/shines/fine linework per this pass's own cap-
 * philosophy brief), narrow footprint, and -- per that brief's explicit
 * "should NOT become a fat cap through gesture" constraint -- almost no
 * motion-driven footprint swing and no flare/dust/speckle response at all.
 * Fast movement on this cap simply deposits a thinner, lighter line (via
 * the existing densityFactor/flowFactor particle-count response, unchanged
 * and shared by every cap); it never widens into a different instrument.
 */
export const STUDIORICH_PRECISION_CAP: SprayCapProfile = Object.freeze({
  id: "studiorich-precision",
  name: "StudioRich Precision Cap",
  footprintRadiusScale: 0.55,
  baseParticlesPerEmission: 5,
  maxParticlesPerEmission: 8,
  maxEmissionPoints: 3000,
  centerBias: 1.3,
  edgeSoftness: 2.4,
  baseParticleAlpha: 0.4,
  particleRadiusRatio: 0.16,
  particleMinRadiusRatio: 0.16,
  corePasses: 3,
  coreAlpha: 0.52,
  coreWidthRatio: 0.3,
  coreJitterRatio: 0.18,
  coreWidthJitterRatio: 0.2,
  motionFootprintRange: 0.06,
  flareResponse: 0,
  dustResponse: 0.1,
  speckleResponse: 0,
  instabilityResponse: 0.1,
  directionalResponse: 0,
  nibAngleDeg: 0,
});

/**
 * SPRAY INSTRUMENT EXPRESSION PASS -- CALLIGRAPHY CAP. The one cap whose
 * CORE width genuinely depends on the gesture's own dominant travel
 * direction relative to a fixed chisel-nib axis (`nibAngleDeg`), via
 * `resolveSprayCorePlan`'s own directional-width step below -- every other
 * cap has `directionalResponse: 0` and is completely unaffected by that
 * step. Deliberately NOT given a dramatic flare/dust response of its own
 * (`flareResponse`/`dustResponse` modest) -- its own distinct working
 * envelope is DIRECTION, not speed/release, per this pass's own brief
 * ("should not automatically oscillate thick/thin; artist technique causes
 * the variation" -- here, which direction the artist drags the can in).
 */
export const STUDIORICH_CALLIGRAPHY_CAP: SprayCapProfile = Object.freeze({
  id: "studiorich-calligraphy",
  name: "StudioRich Calligraphy Cap",
  footprintRadiusScale: 1.1,
  baseParticlesPerEmission: 7,
  maxParticlesPerEmission: 12,
  maxEmissionPoints: 3000,
  centerBias: 1.1,
  edgeSoftness: 2.1,
  baseParticleAlpha: 0.32,
  particleRadiusRatio: 0.18,
  particleMinRadiusRatio: 0.22,
  corePasses: 3,
  coreAlpha: 0.46,
  coreWidthRatio: 0.3,
  coreJitterRatio: 0.3,
  coreWidthJitterRatio: 0.3,
  motionFootprintRange: 0.25,
  flareResponse: 0.25,
  dustResponse: 0.2,
  speckleResponse: 0.15,
  instabilityResponse: 0.2,
  directionalResponse: 0.8,
  nibAngleDeg: 45,
});

/** Data-driven cap registry -- a future StudioRich cap is a new profile object added here, never a new rendering branch. `DEFAULT_SPRAY_CAP_ID` resolves every legacy Spray Mark (authored before caps existed) to the Stock Cap, preserving its exact existing calibrated look. */
export const SPRAY_CAP_PROFILES: Readonly<Record<string, SprayCapProfile>> = Object.freeze({
  [STUDIORICH_STOCK_CAP.id]: STUDIORICH_STOCK_CAP,
  [STUDIORICH_FAT_CAP.id]: STUDIORICH_FAT_CAP,
  [STUDIORICH_PRECISION_CAP.id]: STUDIORICH_PRECISION_CAP,
  [STUDIORICH_CALLIGRAPHY_CAP.id]: STUDIORICH_CALLIGRAPHY_CAP,
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
 * SPRAY INSTRUMENT EXPRESSION PASS -- DERIVED: local, backward-looking
 * motion signal for the LAST few points of an emission list. Deliberately
 * mirrors `densityFactorForSegment`'s own existing shape (bounded, local,
 * tMs-gated with a legacy point-spacing fallback) but reports a RATIO of
 * the final segment's own speed to the segment immediately before it --
 * that ratio is what distinguishes "decelerating into a release" (ratio <
 * 1, the tail is slowing down) from "still accelerating" or "constant
 * speed" (ratio >= 1). Looking only at the LAST two segments (never the
 * whole gesture, never a global max/mean) keeps this exactly as
 * append/prefix-stable as every other derived signal in this module: a
 * live-growing gesture's EARLIER emissions are never touched by this
 * function, since it is only ever evaluated against the CURRENT final
 * points, not retroactively against older ones.
 */
function tailFlareFactor(emissions: readonly SprayEmissionPoint[]): number {
  if (emissions.length < 3) return 0;
  const a = emissions[emissions.length - 3];
  const b = emissions[emissions.length - 2];
  const c = emissions[emissions.length - 1];
  const speedAB = Math.hypot(b.x - a.x, b.y - a.y);
  const speedBC = Math.hypot(c.x - b.x, c.y - b.y);
  if (speedAB <= 1e-6) return 0;
  const decelerationRatio = 1 - speedBC / speedAB; // >0 only when genuinely slowing down
  return clamp(decelerationRatio, 0, 1);
}

/**
 * SPRAY INSTRUMENT EXPRESSION PASS -- DERIVED: local "instability", the
 * nearest honest 2D proxy for a wet/unstable can (real angular
 * velocity/acceleration of the CAN itself is FUTURE SPATIAL input, not
 * available here -- see this module's own classification doc). Computed
 * purely from how sharply the travel DIRECTION changes between two
 * consecutive short segments ENDING at this emission point -- a straight
 * or gently-curving gesture scores near 0; a jittery, erratic one scores
 * higher. Deliberately BACKWARD-LOOKING ONLY (never a "next" point) so an
 * earlier emission's own instability can never change once a live,
 * growing gesture appends more points after it -- the same append/prefix-
 * stability shape as `tailFlareFactor` and every other derived signal in
 * this module.
 */
function instabilityAt(emissions: readonly SprayEmissionPoint[], index: number): number {
  if (index < 2) return 0;
  const prev = emissions[index - 2];
  const current = emissions[index - 1];
  const next = emissions[index];
  const v1x = current.x - prev.x;
  const v1y = current.y - prev.y;
  const v2x = next.x - current.x;
  const v2y = next.y - current.y;
  const len1 = Math.hypot(v1x, v1y);
  const len2 = Math.hypot(v2x, v2y);
  if (len1 <= 1e-6 || len2 <= 1e-6) return 0;
  const cos = clamp((v1x * v2x + v1y * v2y) / (len1 * len2), -1, 1);
  const angleChange = Math.acos(cos); // 0 = straight, PI = full reversal
  return clamp(angleChange / Math.PI, 0, 1);
}

/**
 * CALLIGRAPHY cap support -- the gesture's own dominant travel direction,
 * as a single angle (radians), from first authored point to last. A
 * whole-gesture average, deliberately NOT a per-segment value: computed
 * once the gesture is otherwise complete (render time), so it never
 * oscillates mid-stroke -- only a genuinely different stroke, dragged in a
 * genuinely different direction, reads with a different core width. Falls
 * back to 0 (no rotation) for a degenerate (near-stationary) gesture.
 */
function dominantTravelAngle(points: readonly SprayPoint[]): number {
  if (points.length < 2) return 0;
  const first = points[0];
  const last = points[points.length - 1];
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  if (Math.hypot(dx, dy) <= 1e-6) return 0;
  return Math.atan2(dy, dx);
}

/**
 * CALLIGRAPHY cap support -- a chisel nib is widest when dragged PERPENDICULAR
 * to its own edge and narrowest when dragged ALONG it, exactly like a real
 * flat nib/felt-tip. `directionalResponse` of 0 returns exactly 1 (no
 * change at all) for every non-directional cap.
 */
function directionalWidthFactor(travelAngleRad: number, cap: SprayCapProfile): number {
  if (cap.directionalResponse <= 0) return 1;
  const nibRad = (cap.nibAngleDeg * Math.PI) / 180;
  const perpendicularness = Math.abs(Math.sin(travelAngleRad - nibRad)); // 1 = perpendicular (thick), 0 = aligned (thin)
  return 1 + (perpendicularness - 0.5) * 2 * cap.directionalResponse;
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
  return createSeededRandomStream(seed).next;
}

/**
 * SPRAY POINTER-UP RECONCILIATION V1 -- the same mulberry32-family
 * generator as `createSeededRandom`, but exposing its own internal `state`
 * so a caller can snapshot it after N draws and later resume the EXACT same
 * sequence from a fresh call -- the one thing `createSeededRandom`'s plain
 * closure-returning shape couldn't support. This is what lets
 * `advanceSprayParticles`/`finalizeSprayParticles` (below) treat a live,
 * incrementally-growing gesture's particle stream as ONE continuous PRNG
 * sequence across many calls (one per animation frame) instead of each call
 * restarting its own independent stream from `seed` -- recon found exactly
 * that restart-per-window behavior was the source of the live-vs-canonical
 * particle-count divergence (measured ~19.3% on a representative stroke).
 * `resumeState` seeds the internal state directly (bypassing the `seed || 1`
 * fallback `createSeededRandomStream(seed)` applies at genuine construction
 * time) -- 0 is a perfectly valid resumed state, never a signal to fall
 * back to anything.
 */
export interface SeededRandomStream {
  readonly next: () => number;
  readonly state: number;
}

export function createSeededRandomStream(seed: number, resumeState?: number): SeededRandomStream {
  let state = resumeState !== undefined ? resumeState >>> 0 : (seed || 1) >>> 0;
  return {
    next: () => {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    },
    get state() { return state; },
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
/**
 * SPRAY POINTER-UP RECONCILIATION V1 -- the per-segment body factored out
 * of `resolveSprayEmissionPoints`'s own loop, unchanged, so
 * `advanceSprayEmissionPoints` (below) can resume this SAME walk
 * mid-gesture instead of duplicating it. Mutates `emissions` by pushing
 * onto it (never reads past what it's given) -- the hard
 * `cap.maxEmissionPoints` cutoff behavior (STOP, never re-select) is
 * exactly LIVE STROKE STABILITY V2's existing append/prefix-stability
 * guarantee, preserved byte-for-byte.
 */
function emitSprayEmissionSegment(
  emissions: SprayEmissionPoint[],
  start: SprayPoint,
  end: SprayPoint,
  effectiveRadius: number,
  maxStep: number,
  pressureSignal: boolean,
  cap: SprayCapProfile,
): "continue" | "stop" {
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
    if (emissions.length >= cap.maxEmissionPoints) return "stop";
    const t = step / steps;
    emissions.push({ x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t, densityFactor: density, flowFactor: flow });
  }
  return "continue";
}

/**
 * LIVE STROKE STABILITY V2's own append/prefix-stability guarantee (see
 * `emitSprayEmissionSegment`'s doc) is exactly what makes this a one-line
 * delegation to `advanceSprayEmissionPoints(null, ...)` safe: a fresh,
 * from-scratch cursor call is BY CONSTRUCTION byte-identical to this
 * function's own former standalone body (same per-segment math, same
 * single source of truth) -- never a second implementation that could
 * silently drift from the incremental one.
 */
export function resolveSprayEmissionPoints(
  points: readonly SprayPoint[],
  baseRadius: number,
  cap: SprayCapProfile = STUDIORICH_STOCK_CAP,
): readonly SprayEmissionPoint[] {
  return advanceSprayEmissionPoints(null, points, baseRadius, cap).emissions;
}

/**
 * SPRAY POINTER-UP RECONCILIATION V1 -- resumable counterpart to
 * `resolveSprayEmissionPoints`. `cursor` (`null` to start a gesture fresh)
 * holds every emission already resolved plus how many of `points` have
 * already been folded into them; this call appends ONLY the segments
 * implied by points past that mark, using the exact same
 * `emitSprayEmissionSegment` body `resolveSprayEmissionPoints` itself now
 * delegates to -- so an incrementally-advanced cursor's final `emissions`
 * are byte-identical to calling `resolveSprayEmissionPoints` once on the
 * same final `points` (same per-segment math, same append/prefix-stable
 * guarantee, same hard `maxEmissionPoints` cutoff). `pressureSignal` is
 * re-evaluated from the CURRENT, growing `points` on every call (cheap --
 * a single linear variance pass, never the expensive part) rather than
 * frozen at the cursor's first call: this is a STRICT IMPROVEMENT over the
 * live-preview's pre-existing per-window behavior (which evaluated it from
 * only that window's own tiny slice), converging on the same whole-array
 * value `resolveSprayEmissionPoints` computes once the gesture's `points`
 * stop growing. The one disclosed, narrow edge case this doesn't chase: if
 * a stroke's pressure VARIANCE crosses `hasMeaningfulPressureSignal`'s
 * threshold mid-gesture (a real signal only becomes detectable partway
 * through), segments emitted before that point keep the flow factor that
 * was correct when they were resolved rather than retroactively adopting
 * the later value a single whole-array call would apply uniformly -- a
 * bounded, cosmetic divergence in the same disclosed category as this
 * module's other live-preview approximations, not a regression from
 * today's per-window behavior (which had the identical gap, only worse).
 */
export interface SprayEmissionCursor {
  readonly emissions: readonly SprayEmissionPoint[];
  readonly consumedPointCount: number;
}

export function advanceSprayEmissionPoints(
  cursor: SprayEmissionCursor | null,
  points: readonly SprayPoint[],
  baseRadius: number,
  cap: SprayCapProfile = STUDIORICH_STOCK_CAP,
): SprayEmissionCursor {
  if (points.length === 0 || baseRadius <= 0) return cursor ?? { emissions: [], consumedPointCount: 0 };
  const effectiveRadius = baseRadius * cap.footprintRadiusScale;
  const pressureSignal = hasMeaningfulPressureSignal(points);
  const maxStep = Math.max(1e-6, effectiveRadius * MIN_STEP_RATIO);
  const emissions: SprayEmissionPoint[] = cursor ? [...cursor.emissions] : [];
  let consumedPointCount = cursor?.consumedPointCount ?? 0;
  if (!cursor) {
    emissions.push({
      ...points[0],
      densityFactor: densityFactorForSegment(points[0], points[0], effectiveRadius),
      flowFactor: pressureFlowFactor(points[0].pressure, pressureSignal),
    });
    consumedPointCount = 1;
  }
  if (emissions.length < cap.maxEmissionPoints) {
    for (let index = consumedPointCount; index < points.length; index += 1) {
      consumedPointCount = index + 1;
      if (emitSprayEmissionSegment(emissions, points[index - 1], points[index], effectiveRadius, maxStep, pressureSignal, cap) === "stop") break;
    }
  }
  return { emissions, consumedPointCount };
}

/**
 * The aerosol engine itself: emission points + a cap profile -> a bounded,
 * deterministic list of small particles. `seed` should be a stable,
 * authored identifier (the Mark's own id) -- the same points + baseRadius
 * + seed + cap always produce the exact same particle list, live or on
 * replay from Firestore-persisted points.
 */
/**
 * SPRAY POINTER-UP RECONCILIATION V1 -- the per-emission particle body
 * factored out of `resolveSprayParticlePlan`'s own loop (main particles +
 * DUST + SPECKLE), unchanged, so `advanceSprayParticles` (below) can
 * resume the SAME PRNG stream and append to the SAME running `particles`
 * array one emission at a time, instead of each call starting a fresh
 * `createSeededRandom(seed)` from scratch. `instabilityAt` is already
 * documented BACKWARD-LOOKING ONLY (see its own doc) -- it reads
 * `emissions[emissionIndex-2..emissionIndex-1]`, never anything after --
 * so it's exactly as safe to evaluate mid-accumulation as it already was
 * canonically; nothing about this extraction changes what any single
 * emission's own particles depend on.
 */
function emitSprayParticlesForEmission(
  particles: SprayParticle[],
  emissions: readonly SprayEmissionPoint[],
  emissionIndex: number,
  effectiveRadius: number,
  cap: SprayCapProfile,
  random: () => number,
): void {
  const emission = emissions[emissionIndex];
  // SPRAY INSTRUMENT EXPRESSION PASS -- WET SPUTTER character: local
  // direction-change instability roughens this emission's own particle
  // count/radius/alpha variance. 0 for an instabilityResponse: 0 cap (no
  // behavior change at all).
  const instability = cap.instabilityResponse > 0 ? instabilityAt(emissions, emissionIndex) * cap.instabilityResponse : 0;
  // BLACKBOOK Spray Physicality V1 -- Pressure: flow (density/volume)
  // scales particle COUNT here, folded in alongside the existing
  // velocity/spacing densityFactor -- both are bounded, both come from
  // already-authored, replayable data.
  const particleCount = Math.min(
    cap.maxParticlesPerEmission,
    Math.max(1, Math.round(cap.baseParticlesPerEmission * emission.densityFactor * emission.flowFactor * (1 + instability * 0.6))),
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
    const radiusJitter = (PARTICLE_RADIUS_JITTER_FLOOR + random() * (1 - PARTICLE_RADIUS_JITTER_FLOOR)) * (1 + (random() - 0.5) * instability);
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
      alpha: clamp(cap.baseParticleAlpha * edgeFalloff * clamp(emission.densityFactor, 0.4, 1.4) * (1 - instability * 0.25), 0, 1),
    });
  }

  // SPRAY INSTRUMENT EXPRESSION PASS -- DUST: a few extra, faint,
  // far-flung particles on genuinely FAST/dispersed emissions (low
  // densityFactor), emerging from the same aerosol deposition model
  // rather than a separate decorative stamp. 0 for dustResponse: 0.
  if (cap.dustResponse > 0 && emission.densityFactor < 0.85) {
    const dustStrength = (0.85 - emission.densityFactor) * cap.dustResponse;
    const dustCount = Math.round(dustStrength * 6);
    for (let d = 0; d < dustCount; d += 1) {
      const angle = random() * Math.PI * 2;
      const dustOffset = effectiveRadius * (1 + random() * 0.6); // beyond the normal footprint
      particles.push({
        x: emission.x + Math.cos(angle) * dustOffset,
        y: emission.y + Math.sin(angle) * dustOffset,
        radius: Math.max(0.6, effectiveRadius * cap.particleRadiusRatio * 0.45 * (0.6 + random() * 0.4)),
        alpha: clamp(cap.baseParticleAlpha * 0.3 * dustStrength, 0, 1),
      });
    }
  }

  // SPRAY INSTRUMENT EXPRESSION PASS -- SPECKLE: a few extra, larger,
  // denser coarse droplets on a DWELLED emission (high densityFactor,
  // short of this material's own drip threshold) -- distinct from
  // ordinary fine aerosol grain. 0 for speckleResponse: 0.
  if (cap.speckleResponse > 0 && emission.densityFactor > 1.15) {
    const speckleStrength = (emission.densityFactor - 1.15) * cap.speckleResponse;
    const speckleCount = Math.round(speckleStrength * 4);
    for (let s = 0; s < speckleCount; s += 1) {
      const angle = random() * Math.PI * 2;
      const speckleOffset = effectiveRadius * (cap.particleMinRadiusRatio + random() * (1 - cap.particleMinRadiusRatio) * 0.5);
      particles.push({
        x: emission.x + Math.cos(angle) * speckleOffset,
        y: emission.y + Math.sin(angle) * speckleOffset,
        radius: Math.max(1.4, effectiveRadius * cap.particleRadiusRatio * 1.7 * (0.8 + random() * 0.4)),
        alpha: clamp(cap.baseParticleAlpha * 1.2, 0, 1),
      });
    }
  }
}

/**
 * SPRAY POINTER-UP RECONCILIATION V1 -- resumable counterpart to
 * `resolveSprayParticlePlan`'s particle-generation half (emission
 * resolution is `advanceSprayEmissionPoints`'s own job). `cursor` (`null`
 * to start fresh) carries the running `particles` array, how many
 * emissions have already been turned into particles, and the seeded
 * PRNG's own `state` -- so this call resumes the EXACT SAME PRNG sequence
 * a single `resolveSprayParticlePlan` call would use, consuming draws for
 * only the NEW emissions in `emissionCursor` (never re-drawing for ones
 * already processed, never restarting the stream from `seed`). This is
 * the fix for the measured live-preview PRNG-restart divergence: a live
 * preview that calls this once per animation frame, threading the
 * returned cursor through, produces a particle sequence identical to one
 * continuous canonical computation -- not merely a similarly-sized one.
 */
export interface SprayParticleCursor {
  readonly particles: readonly SprayParticle[];
  readonly consumedEmissionCount: number;
  readonly randomState: number;
}

export function advanceSprayParticles(
  cursor: SprayParticleCursor | null,
  seed: number,
  emissionCursor: SprayEmissionCursor,
  baseRadius: number,
  cap: SprayCapProfile = STUDIORICH_STOCK_CAP,
): SprayParticleCursor {
  const effectiveRadius = baseRadius * cap.footprintRadiusScale;
  const particles = cursor ? [...cursor.particles] : [];
  const randomStream = cursor ? createSeededRandomStream(seed, cursor.randomState) : createSeededRandomStream(seed);
  const startIndex = cursor?.consumedEmissionCount ?? 0;
  for (let emissionIndex = startIndex; emissionIndex < emissionCursor.emissions.length; emissionIndex += 1) {
    emitSprayParticlesForEmission(particles, emissionCursor.emissions, emissionIndex, effectiveRadius, cap, randomStream.next);
  }
  return { particles, consumedEmissionCount: emissionCursor.emissions.length, randomState: randomStream.state };
}

/**
 * SPRAY POINTER-UP RECONCILIATION V1 -- the ONE whole-gesture-dependent
 * step this engine has: the tail FLARE (`tailFlareFactor`) can only be
 * evaluated once the gesture's final emissions are actually known, so it
 * is deliberately never part of `advanceSprayParticles`'s own per-frame
 * work -- only this explicit finalize call, made exactly once (at
 * pointer-up, once the complete emission list is final), adds it.
 * Internally catches the cursor up on any not-yet-consumed emissions
 * first (the ordinary resumed-stream path), so a caller doesn't need to
 * call `advanceSprayParticles` one last time itself before finalizing.
 */
export function finalizeSprayParticles(
  cursor: SprayParticleCursor | null,
  seed: number,
  emissionCursor: SprayEmissionCursor,
  baseRadius: number,
  cap: SprayCapProfile = STUDIORICH_STOCK_CAP,
): readonly SprayParticle[] {
  const caughtUp = advanceSprayParticles(cursor, seed, emissionCursor, baseRadius, cap);
  const particles = [...caughtUp.particles];
  const effectiveRadius = baseRadius * cap.footprintRadiusScale;
  const flare = cap.flareResponse > 0 ? tailFlareFactor(emissionCursor.emissions) : 0;
  // SPRAY INSTRUMENT EXPRESSION PASS -- FLARE: a decelerating RELEASE at
  // the gesture's own tail spawns extra, wider-flung particles there, per
  // this pass's own "speed, acceleration, release...can produce a
  // convincing gesture-driven flare" brief. Bounded (never more than
  // maxParticlesPerEmission extra), gated entirely by `flareResponse` so a
  // Precision cap (flareResponse: 0) never flares regardless of release.
  if (flare > 0 && emissionCursor.emissions.length > 0) {
    const randomStream = createSeededRandomStream(seed, caughtUp.randomState);
    const lastEmission = emissionCursor.emissions[emissionCursor.emissions.length - 1];
    const flareCount = Math.min(cap.maxParticlesPerEmission, Math.round(flare * cap.flareResponse * cap.maxParticlesPerEmission));
    for (let index = 0; index < flareCount; index += 1) {
      const angle = randomStream.next() * Math.PI * 2;
      const flareOffset = effectiveRadius * (1 + randomStream.next() * 1.4 * flare * cap.flareResponse);
      particles.push({
        x: lastEmission.x + Math.cos(angle) * flareOffset,
        y: lastEmission.y + Math.sin(angle) * flareOffset,
        radius: Math.max(1, effectiveRadius * cap.particleRadiusRatio * (0.6 + randomStream.next() * 0.6)),
        alpha: clamp(cap.baseParticleAlpha * (0.5 + flare * 0.5), 0, 1),
      });
    }
  }
  return particles;
}

export function resolveSprayParticlePlan(
  points: readonly SprayPoint[],
  baseRadius: number,
  seed: number,
  cap: SprayCapProfile = STUDIORICH_STOCK_CAP,
): readonly SprayParticle[] {
  if (baseRadius <= 0) return [];
  const emissionCursor = advanceSprayEmissionPoints(null, points, baseRadius, cap);
  return finalizeSprayParticles(null, seed, emissionCursor, baseRadius, cap);
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
  // SPRAY INSTRUMENT EXPRESSION PASS: replaces the previous hardcoded
  // clamp(meanDensity, 0.8, 1.2) -- STOCK's own motionFootprintRange (0.2)
  // reproduces that exact prior clamp, zero behavior change for any
  // existing Mark. A FAT cap's wider range is what makes its core
  // genuinely swell on a slow/dwelled pass and thin out on a fast
  // release -- "Fat caps should respond much more dramatically than Skinny
  // caps," per this pass's own cap-philosophy brief; a PRECISION cap's
  // near-zero range is what keeps it thin "regardless of gesture."
  const motionWidthFactor = clamp(meanDensity, 1 - cap.motionFootprintRange, 1 + cap.motionFootprintRange);
  // CALLIGRAPHY cap support -- see `directionalWidthFactor`'s own doc.
  // Exactly 1 (no change) for every cap with directionalResponse: 0.
  const travelAngle = cap.directionalResponse > 0 ? dominantTravelAngle(points) : 0;
  const directionalFactor = directionalWidthFactor(travelAngle, cap);

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
      width: Math.max(0.6, nominalWidth * widthJitter * motionWidthFactor * directionalFactor),
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

/**
 * SPRAY INSTRUMENT EXPRESSION PASS -- "SOUND IS PART OF THE INSTRUMENT."
 * No spatial spray audio exists in BLACKBOOK today (the only spray-sound
 * code in this repository is `prototypes/spatial-spraypaint/src/
 * SprayCanAudio.ts`, which `blackbook.html` explicitly does not import --
 * see docs/architecture/blackbook/README.md§2). Building a full playback
 * engine is explicitly out of this pass's bounded scope; what this function
 * provides instead is the DERIVED sound-CHARACTER state a future playback
 * layer would key off, computed from the exact same gesture/material
 * signals driving the visual deposition above -- "visual deposition and
 * audio should respond to the SAME gesture/material state where
 * practical." Pure, deterministic, no `AudioContext`/no I/O -- fully
 * testable without ever playing a sound.
 *
 * Deliberately keeps the three sound FAMILIES this pass's own brief
 * requires staying distinct (never collapsed into one intensity scalar):
 *   - aerosolIntensity -- 1: pressure/discharge, from flow/density.
 *   - sputterActive    -- 2: wet/unstable delivery, from direction-change
 *     instability + flow, NEVER metallic-rattle-coded.
 *   - rattleActive     -- 3: mechanical mixing-ball rattle, gated on an
 *     explicit whip/snap signal (rapid local deceleration/reversal) so it
 *     has "visible justification in the resulting mark," never active
 *     merely because spray is on.
 * `spatial` (4: environmental response) is reported explicitly absent --
 * no can distance/orientation exists yet; never fabricated.
 */
export interface SpraySoundState {
  /** 1: aerosol/pressure discharge intensity, [0,1] -- from flow/density, the same signal driving particle count/alpha. */
  readonly aerosolIntensity: number;
  /** 2: wet sputter / unstable paint delivery -- true only once local direction-change instability crosses a real threshold for THIS cap. */
  readonly sputterActive: boolean;
  readonly sputterIntensity: number;
  /** 3: mechanical mixing-ball rattle -- true only on a genuine rapid local deceleration/reversal (a "whip/snap"), never merely because spray is active. */
  readonly rattleActive: boolean;
  readonly rattleIntensity: number;
  /** How much local material has accumulated (dwell), normalized against this cap's own drip threshold -- 1.0 means "at the drip threshold." */
  readonly materialLoadNormalized: number;
  /** 4: future spatial/environmental input -- always false/absent today; never fabricated. */
  readonly spatial: { readonly available: false };
}

const SPUTTER_INSTABILITY_THRESHOLD = 0.35;
const RATTLE_DECELERATION_THRESHOLD = 0.6;

export function resolveSpraySoundState(
  points: readonly SprayPoint[],
  baseRadius: number,
  cap: SprayCapProfile = STUDIORICH_STOCK_CAP,
): SpraySoundState {
  if (points.length === 0 || baseRadius <= 0) {
    return { aerosolIntensity: 0, sputterActive: false, sputterIntensity: 0, rattleActive: false, rattleIntensity: 0, materialLoadNormalized: 0, spatial: { available: false } };
  }
  const effectiveRadius = baseRadius * cap.footprintRadiusScale;
  const emissions = resolveSprayEmissionPoints(points, baseRadius, cap);
  const meanDensity = emissions.reduce((sum, e) => sum + e.densityFactor, 0) / emissions.length;
  const meanFlow = emissions.reduce((sum, e) => sum + e.flowFactor, 0) / emissions.length;
  const aerosolIntensity = clamp((meanDensity * meanFlow) / MAX_DENSITY_FACTOR, 0, 1);

  let maxInstability = 0;
  for (let index = 0; index < emissions.length; index += 1) {
    maxInstability = Math.max(maxInstability, instabilityAt(emissions, index));
  }
  const sputterIntensity = cap.instabilityResponse > 0 ? clamp((maxInstability - SPUTTER_INSTABILITY_THRESHOLD) / (1 - SPUTTER_INSTABILITY_THRESHOLD), 0, 1) : 0;

  const flare = cap.flareResponse > 0 ? tailFlareFactor(emissions) : 0;
  const rattleIntensity = flare > RATTLE_DECELERATION_THRESHOLD ? clamp((flare - RATTLE_DECELERATION_THRESHOLD) / (1 - RATTLE_DECELERATION_THRESHOLD), 0, 1) : 0;

  const loads = resolveDripOrigins(emissions, effectiveRadius, SPRAY_DRIP_TUNING).map((o) => o.load);
  const peakLoad = loads.length > 0 ? Math.max(...loads) : Math.max(0, meanDensity - 1);
  const materialLoadNormalized = clamp(peakLoad / SPRAY_DRIP_TUNING.loadThreshold, 0, 2);

  return {
    aerosolIntensity,
    sputterActive: sputterIntensity > 0,
    sputterIntensity,
    rattleActive: rattleIntensity > 0,
    rattleIntensity,
    materialLoadNormalized,
    spatial: { available: false },
  };
}
