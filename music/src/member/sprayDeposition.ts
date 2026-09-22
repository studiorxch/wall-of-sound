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

import { simplifyPathToBudget } from "./pathSimplify";

export interface SprayPoint {
  readonly x: number;
  readonly y: number;
}

export interface SprayEmissionPoint extends SprayPoint {
  /** >1 in slow/dwelled sections, <1 in fast sections -- see resolveMopDabPlan's identical proxy in mopDeposition.ts for the full rationale (point spacing as a free, deterministic stand-in for pointer speed). */
  readonly densityFactor: number;
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
export const STUDIORICH_STOCK_CAP: SprayCapProfile = Object.freeze({
  id: "studiorich-stock",
  name: "StudioRich Stock Cap",
  baseParticlesPerEmission: 5,
  maxParticlesPerEmission: 8,
  maxEmissionPoints: 200,
  centerBias: 1,
  edgeSoftness: 1.6,
  baseParticleAlpha: 0.16,
  particleRadiusRatio: 0.09,
  particleMinRadiusRatio: 0.4,
  // Revision 3 core -- see the field docs above and resolveSprayCorePlan.
  corePasses: 3,
  coreAlpha: 0.55,
  coreWidthRatio: 0.55,
  coreJitterRatio: 0.16,
  coreWidthJitterRatio: 0.22,
});

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
  const nominalStep = Math.max(1e-6, baseRadius * MIN_STEP_RATIO);
  // Budget one fewer than the cap so the loop's own rounding can never push
  // the actual count past it -- correctness (whole-path coverage) over
  // hitting the bound exactly.
  const budget = Math.max(1, cap.maxEmissionPoints - 1);
  // Revision 8: if the RAW point count alone would already exceed the
  // budget (every segment contributes at least one output point below,
  // regardless of step size -- a long zigzag/wavy gesture with many short
  // segments hits this easily), simplify the raw points FIRST via
  // Douglas-Peucker (preserves corners/extrema, unlike an index slice) so
  // the per-segment interpolation below can never overflow. See
  // pathSimplify.ts's module doc for the full bug this fixes.
  const source = points.length - 1 > budget ? simplifyPathToBudget(points, budget + 1) : points;
  let totalLength = 0;
  for (let index = 1; index < source.length; index += 1) {
    totalLength += Math.hypot(source[index].x - source[index - 1].x, source[index].y - source[index - 1].y);
  }
  const maxStep = Math.max(nominalStep, totalLength / budget);
  const neutralSpacing = Math.max(1e-6, baseRadius * NEUTRAL_SPACING_RATIO);
  const densityAt = (spacing: number): number =>
    clamp(1 + (1 - spacing / neutralSpacing) * DENSITY_RESPONSE, MIN_DENSITY_FACTOR, MAX_DENSITY_FACTOR);

  const emissions: SprayEmissionPoint[] = [{ ...source[0], densityFactor: densityAt(0) }];
  for (let index = 1; index < source.length; index += 1) {
    const start = source[index - 1];
    const end = source[index];
    const segmentLength = Math.hypot(end.x - start.x, end.y - start.y);
    const density = densityAt(segmentLength);
    const steps = Math.max(1, Math.ceil(segmentLength / maxStep));
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      emissions.push({ x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t, densityFactor: density });
    }
  }
  // Belt-and-braces hard cap -- the pre-simplified `source` above keeps
  // segment COUNT within budget, but per-segment interpolation can still
  // overflow the total (segment lengths vary around the average the
  // adaptive step assumed). Revision 8: this used to be an index
  // slice + force-jump-the-last-point, which silently reproduced the
  // exact straight-line-collapse bug at this second layer even after the
  // raw points were correctly pre-simplified. Uses the same geometry-aware
  // simplifier as the raw-point pass, not a truncation.
  if (emissions.length > cap.maxEmissionPoints) {
    return simplifyPathToBudget(emissions, cap.maxEmissionPoints);
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
  const emissions = resolveSprayEmissionPoints(points, baseRadius, cap);
  const random = createSeededRandom(seed);
  const particles: SprayParticle[] = [];
  for (const emission of emissions) {
    const particleCount = Math.min(
      cap.maxParticlesPerEmission,
      Math.max(1, Math.round(cap.baseParticlesPerEmission * emission.densityFactor)),
    );
    for (let index = 0; index < particleCount; index += 1) {
      const angle = random() * Math.PI * 2;
      const normalizedRadius = random() ** cap.centerBias;
      // Revision 5: exclude the innermost band entirely -- that's the
      // core's job (see `particleMinRadiusRatio`'s doc). Remaps [0,1] into
      // [particleMinRadiusRatio, 1] instead of [0,1].
      const bandedRadius = cap.particleMinRadiusRatio + normalizedRadius * (1 - cap.particleMinRadiusRatio);
      const offsetRadius = bandedRadius * baseRadius;
      const edgeFalloff = (1 - normalizedRadius) ** cap.edgeSoftness;
      const radiusJitter = PARTICLE_RADIUS_JITTER_FLOOR + random() * (1 - PARTICLE_RADIUS_JITTER_FLOOR);
      particles.push({
        x: emission.x + Math.cos(angle) * offsetRadius,
        y: emission.y + Math.sin(angle) * offsetRadius,
        radius: Math.max(0.4, baseRadius * cap.particleRadiusRatio * radiusJitter),
        alpha: cap.baseParticleAlpha * edgeFalloff * clamp(emission.densityFactor, 0.4, 1.4),
      });
    }
  }
  return particles;
}

export interface SprayCorePoint extends SprayPoint {
  readonly densityFactor: number;
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
const CORE_MAX_SAMPLE_POINTS = 220;

export function resolveSprayCoreSamplePoints(
  points: readonly SprayPoint[],
  baseRadius: number,
): readonly SprayCorePoint[] {
  if (points.length === 0 || baseRadius <= 0) return [];
  const nominalStep = Math.max(1e-6, baseRadius * CORE_STEP_RATIO);
  const neutralSpacing = Math.max(1e-6, baseRadius * NEUTRAL_SPACING_RATIO);
  const densityAt = (spacing: number): number =>
    clamp(1 + (1 - spacing / neutralSpacing) * DENSITY_RESPONSE, MIN_DENSITY_FACTOR, MAX_DENSITY_FACTOR);

  if (points.length === 1) return [{ ...points[0], densityFactor: densityAt(0) }];

  const budget = Math.max(1, CORE_MAX_SAMPLE_POINTS - 1);
  // Revision 8: same fix as resolveSprayEmissionPoints -- simplify first
  // (shape-preserving) if raw point count alone could overflow the budget.
  const source = points.length - 1 > budget ? simplifyPathToBudget(points, budget + 1) : points;
  let totalLength = 0;
  for (let index = 1; index < source.length; index += 1) {
    totalLength += Math.hypot(source[index].x - source[index - 1].x, source[index].y - source[index - 1].y);
  }
  const step = Math.max(nominalStep, totalLength / budget);

  const samples: SprayCorePoint[] = [{ ...source[0], densityFactor: densityAt(0) }];
  for (let index = 1; index < source.length; index += 1) {
    const start = source[index - 1];
    const end = source[index];
    const segmentLength = Math.hypot(end.x - start.x, end.y - start.y);
    const density = densityAt(segmentLength);
    const steps = Math.max(1, Math.ceil(segmentLength / step));
    for (let s = 1; s <= steps; s += 1) {
      const t = s / steps;
      samples.push({ x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t, densityFactor: density });
    }
  }
  // Revision 8: geometry-aware simplification, not an index slice +
  // forced endpoint jump -- see the doc above resolveSprayEmissionPoints'
  // own belt-and-braces cap for why the old version reproduced the
  // straight-line-collapse bug at this layer.
  if (samples.length > CORE_MAX_SAMPLE_POINTS) {
    return simplifyPathToBudget(samples, CORE_MAX_SAMPLE_POINTS);
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
  const samples = resolveSprayCoreSamplePoints(points, baseRadius);
  if (samples.length === 0) return [];
  const random = createSeededRandom(seed);
  const passes = Math.max(1, cap.corePasses);
  const nominalWidth = Math.max(0.6, baseRadius * 2 * cap.coreWidthRatio);
  const passAlphaBudget = cap.coreAlpha / Math.sqrt(passes);

  const passesOut: SprayCorePass[] = [];
  for (let pass = 0; pass < passes; pass += 1) {
    const passRatio = passes <= 1 ? 0 : pass / (passes - 1);
    // One jitter offset per pass (not per point) -- keeps each pass a
    // genuinely CONTINUOUS path (a per-point jitter would reintroduce
    // small zig-zags at fine spacing); the passes still differ from each
    // other, and from one Mark to the next, deterministically.
    const jitterX = (random() - 0.5) * baseRadius * cap.coreJitterRatio;
    const jitterY = (random() - 0.5) * baseRadius * cap.coreJitterRatio;
    const widthJitter = 1 + (random() - 0.5) * cap.coreWidthJitterRatio;
    const jittered: SprayCorePoint[] = samples.length === 1
      ? [samples[0], samples[0]].map((p) => ({ x: p.x + jitterX, y: p.y + jitterY, densityFactor: p.densityFactor }))
      : samples.map((p) => ({ x: p.x + jitterX, y: p.y + jitterY, densityFactor: p.densityFactor }));
    passesOut.push({
      points: jittered,
      width: Math.max(0.6, nominalWidth * widthJitter),
      alpha: passAlphaBudget * (1 - passRatio * 0.3),
    });
  }
  return passesOut;
}
