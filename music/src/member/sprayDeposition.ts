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

export interface SprayCapProfile {
  readonly id: string;
  readonly name: string;
  /** Particles emitted per emission point at densityFactor 1 -- scaled by that point's own densityFactor and rounded, then bounded by maxParticlesPerEmission. */
  readonly baseParticlesPerEmission: number;
  readonly maxParticlesPerEmission: number;
  /** Hard ceiling on emission points sampled from one Mark, regardless of path length -- the bound that keeps total particle count (and therefore render cost and any future persisted-plan size) independent of how long or slow a stroke was. */
  readonly maxEmissionPoints: number;
  /** Exponent applied to a uniform-disk radius sample (`sqrt(random)`) -- 1 = uniform disk, >1 pulls particles toward the center (denser core, the usual aerosol look), <1 pushes them toward the rim. */
  readonly centerBias: number;
  /** Exponent applied to (1 - normalizedRadius) for each particle's edge falloff -- higher = softer/more gradual fade toward the footprint's edge. */
  readonly edgeSoftness: number;
  /** Per-particle alpha at the footprint's center before edge falloff, density, and the Mark's own opacity are applied. Individually translucent so overlapping particles (within one stroke, or across repeated Spray passes) visibly accumulate. */
  readonly baseParticleAlpha: number;
  /** Particle radius as a fraction of the footprint's own base radius -- small, so a Spray Mark reads as many small deposited dots (a coverage field) rather than a few large translucent blobs like Mop. */
  readonly particleRadiusRatio: number;
}

/**
 * StudioRich's own default aerosol instrument -- not a claim about any
 * specific physical cap. Round, immediately usable, and tuned to read
 * clearly as aerosol coverage from a light tag pass through to denser fill
 * within V1's Width/Opacity range. See Art Supplies V4 brief §6.
 */
export const STUDIORICH_STOCK_CAP: SprayCapProfile = Object.freeze({
  id: "studiorich-stock",
  name: "StudioRich Stock Cap",
  baseParticlesPerEmission: 4,
  maxParticlesPerEmission: 7,
  maxEmissionPoints: 220,
  centerBias: 1.5,
  edgeSoftness: 1.3,
  baseParticleAlpha: 0.22,
  particleRadiusRatio: 0.16,
});

const MIN_STEP_RATIO = 0.35;
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
 */
export function resolveSprayEmissionPoints(
  points: readonly SprayPoint[],
  baseRadius: number,
  cap: SprayCapProfile = STUDIORICH_STOCK_CAP,
): readonly SprayEmissionPoint[] {
  if (points.length === 0 || baseRadius <= 0) return [];
  const maxStep = Math.max(1e-6, baseRadius * MIN_STEP_RATIO);
  const neutralSpacing = Math.max(1e-6, baseRadius * NEUTRAL_SPACING_RATIO);
  const densityAt = (spacing: number): number =>
    clamp(1 + (1 - spacing / neutralSpacing) * DENSITY_RESPONSE, MIN_DENSITY_FACTOR, MAX_DENSITY_FACTOR);

  const emissions: SprayEmissionPoint[] = [{ ...points[0], densityFactor: densityAt(0) }];
  for (let index = 1; index < points.length; index += 1) {
    const start = points[index - 1];
    const end = points[index];
    const segmentLength = Math.hypot(end.x - start.x, end.y - start.y);
    const density = densityAt(segmentLength);
    const steps = Math.max(1, Math.ceil(segmentLength / maxStep));
    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      emissions.push({ x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t, densityFactor: density });
      if (emissions.length >= cap.maxEmissionPoints) return emissions;
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
      const offsetRadius = normalizedRadius * baseRadius;
      const edgeFalloff = (1 - normalizedRadius) ** cap.edgeSoftness;
      particles.push({
        x: emission.x + Math.cos(angle) * offsetRadius,
        y: emission.y + Math.sin(angle) * offsetRadius,
        radius: Math.max(0.4, baseRadius * cap.particleRadiusRatio),
        alpha: cap.baseParticleAlpha * edgeFalloff * clamp(emission.densityFactor, 0.4, 1.4),
      });
    }
  }
  return particles;
}
