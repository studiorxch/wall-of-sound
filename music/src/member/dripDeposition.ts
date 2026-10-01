/**
 * BLACKBOOK Deterministic Drips β0.1 -- completes the FUTURE DRIP SEAM
 * mopDeposition.ts previously documented (and the parallel seam Spray's own
 * deterministic deposition engine implies): a bounded, deterministic,
 * author-time-only generator that turns a material's own already-resolved
 * emission points (Mop's `resolveMopEmissionPoints`, Spray's
 * `resolveSprayEmissionPoints` -- both already expose a per-point
 * `densityFactor`, the same dwell/slow-movement signal this module reuses
 * rather than re-deriving) into zero or more drip centerlines.
 *
 * Architecture (see docs/architecture/blackbook/README.md's Drips section):
 *
 *   material's own emission points (with densityFactor)
 *     -> resolveDripOrigins   (bounded, deterministic: where local
 *        accumulation/dwell crosses this material's own threshold)
 *     -> simulateMaterialDrip (bounded, deterministic: one downward,
 *        gravity-pulled centerline per origin)
 *
 * This is NOT a running physics simulation: every drip is computed exactly
 * ONCE, in a fixed, bounded number of steps, from already-authored data
 * plus a stable numeric seed -- there is no requestAnimationFrame loop, no
 * Math.random(), and nothing here is ever re-run against a Mark that was
 * authored and persisted earlier. The caller (blackbookRuntime.ts) persists
 * the returned centerline points directly as a LocalMaterialDripMark's own
 * geometry -- this module is never invoked again at render time; rendering
 * only replays those persisted points (see strokeSmoothing.ts's
 * `strokeMaterialDrip`, which supplies the downward TAPER purely from point
 * index/count, never a second persisted field).
 *
 * Precedent: music/src/graffiti/graffitiMopBrush.ts's own `simulateDrip`
 * (gravity/drag/taper, seeded, bounded step count) -- adapted here for
 * BLACKBOOK's own deposition-engine shape (a shared load scalar derived
 * from each material's own existing densityFactor, rather than graffiti's
 * own separate per-point dwell helper) rather than transplanted wholesale.
 * This module is intentionally standalone (no import of mopDeposition.ts/
 * sprayDeposition.ts, and no shared PRNG import from either) so it can be
 * depended on by both without any import-direction/cycle concern.
 */

export interface DripSourcePoint {
  readonly x: number;
  readonly y: number;
  /** >1 in slow/dwelled sections -- Mop's resolveMopEmissionPoints and Spray's resolveSprayEmissionPoints both already compute this from the same underlying signal (original point spacing, or real captured velocity for Spray). */
  readonly densityFactor: number;
}

export interface DripPoint {
  readonly x: number;
  readonly y: number;
}

export interface DripPlan {
  /** The drip's own downward centerline -- bounded by `tuning.maxDripSteps + 1` points, persisted verbatim as the resulting Mark's own geometry. */
  readonly points: readonly DripPoint[];
}

export interface DripTuning {
  /** Minimum accumulated local load (see `resolveDripOrigins`) before a drip spawns at all -- the knob that keeps an ordinary fast gesture drip-free. */
  readonly loadThreshold: number;
  /** Hard ceiling on how many drips one authored gesture can spawn. */
  readonly maxDripsPerStroke: number;
  /** Hard ceiling on points per drip (bounded geometry -- no runaway length). */
  readonly maxDripSteps: number;
  /** Minimum document-space separation (as a multiple of baseRadius) between two drip origins on the same stroke -- keeps multiple drips from clustering on one locally-overloaded spot. */
  readonly minOriginSpacingRatio: number;
  /** Per-step downward acceleration, as a fraction of baseRadius -- gravity, in this Mark's own local-coordinate units. */
  readonly gravityRatio: number;
  /** Per-step velocity decay (0..1) -- drag; what makes a drip eventually stop rather than run forever. */
  readonly drag: number;
  /** Below this velocity (same units as gravityRatio) the drip stops early -- bounded run length, not merely a step-count ceiling. */
  readonly minVelocityRatio: number;
  /** Lateral wobble per step, as a fraction of baseRadius -- small, deterministic (seeded), never enough to read as a second stroke. */
  readonly lateralWobbleRatio: number;
  /** How strongly accumulated load lengthens/quickens a drip's initial fall -- 0 would make every drip identical regardless of how much material accumulated. */
  readonly loadRunResponse: number;
}

/**
 * Mop runs/accumulates more readily than Spray -- a real wet applicator
 * pools and drips faster than an aerosol coverage field at the same dwell.
 * Lower threshold, more/longer drips than Spray's own tuning below.
 */
export const MOP_DRIP_TUNING: DripTuning = Object.freeze({
  loadThreshold: 1.3,
  maxDripsPerStroke: 3,
  maxDripSteps: 18,
  minOriginSpacingRatio: 2,
  gravityRatio: 0.03,
  drag: 0.9,
  minVelocityRatio: 0.003,
  lateralWobbleRatio: 0.05,
  loadRunResponse: 0.6,
});

/**
 * Spray needs materially more local accumulation before it drips at all --
 * an aerosol coverage field, not a pooled wet body. Higher threshold,
 * fewer/shorter drips than Mop's own tuning above.
 */
export const SPRAY_DRIP_TUNING: DripTuning = Object.freeze({
  loadThreshold: 1.6,
  maxDripsPerStroke: 2,
  maxDripSteps: 12,
  minOriginSpacingRatio: 2.5,
  gravityRatio: 0.022,
  drag: 0.88,
  minVelocityRatio: 0.003,
  lateralWobbleRatio: 0.035,
  loadRunResponse: 0.4,
});

/**
 * A tiny deterministic PRNG (mulberry32-family -- the same shape
 * sprayDeposition.ts's own `createSeededRandom` uses, duplicated here
 * rather than imported so this module stays a standalone leaf with no
 * import-direction constraint on which material module depends on it).
 */
function createSeededRandom(seed: number): () => number {
  let state = (seed || 1) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const LOAD_WINDOW_SIZE = 6;

/**
 * Local accumulation/load -- a bounded trailing-window sum of how far each
 * emission point's own densityFactor sits above the "neutral" value of 1
 * (dwelling/slow movement only; a fast/dispersed section contributes
 * nothing, never negative). The window is a POINT-COUNT window (not a
 * physical distance), matching the resolution each material's own emission
 * points are already sampled at -- deliberately simple, the same bounded,
 * deterministic, no-fabricated-signal principle mopDeposition.ts's own doc
 * already establishes for densityFactor itself.
 */
function computeLocalLoad(points: readonly DripSourcePoint[]): readonly number[] {
  const loads: number[] = [];
  const window: number[] = [];
  let windowSum = 0;
  for (const point of points) {
    const contribution = Math.max(0, point.densityFactor - 1);
    window.push(contribution);
    windowSum += contribution;
    if (window.length > LOAD_WINDOW_SIZE) windowSum -= window.shift() as number;
    loads.push(windowSum);
  }
  return loads;
}

/**
 * Deterministic, bounded selection of where a drip should start: the first
 * `tuning.maxDripsPerStroke` points (in authored order) whose own local load
 * crosses `tuning.loadThreshold`, each at least `minOriginSpacingRatio *
 * baseRadius` away from the previous origin (keeps multiple drips from
 * clustering on one overloaded spot). An ordinary fast/light gesture never
 * crosses the threshold at all -- zero origins, zero drips, satisfying "a
 * drip must NOT appear on every Spray or Mop gesture".
 */
export function resolveDripOrigins(
  points: readonly DripSourcePoint[],
  baseRadius: number,
  tuning: DripTuning,
): readonly { readonly index: number; readonly load: number }[] {
  if (points.length === 0 || baseRadius <= 0) return [];
  const loads = computeLocalLoad(points);
  const minSpacing = baseRadius * tuning.minOriginSpacingRatio;
  const origins: { index: number; load: number }[] = [];
  let lastOrigin: DripSourcePoint | null = null;
  for (let index = 0; index < points.length; index += 1) {
    if (origins.length >= tuning.maxDripsPerStroke) break;
    const load = loads[index];
    if (load < tuning.loadThreshold) continue;
    const point = points[index];
    if (lastOrigin && Math.hypot(point.x - lastOrigin.x, point.y - lastOrigin.y) < minSpacing) continue;
    origins.push({ index, load });
    lastOrigin = point;
  }
  return origins;
}

/**
 * One drip's own downward, gravity-pulled centerline -- computed ONCE in a
 * fixed, bounded number of steps (never re-run). `load` (this origin's own
 * accumulated local load, from `resolveDripOrigins`) lengthens/quickens the
 * initial fall deterministically -- heavier local accumulation produces a
 * longer, faster-starting drip, satisfying "more likely/substantial when
 * paint accumulates" -- while `seed` (a stable numeric hash of the
 * ORIGINATING Mark's own persisted id) is what makes this drip's own
 * lateral wobble/initial-velocity jitter replay identically forever. Stops
 * early once velocity decays below `tuning.minVelocityRatio` -- a short/
 * light drip never pads itself out to `maxDripSteps` just to hit a count.
 */
export function simulateMaterialDrip(
  origin: DripSourcePoint,
  load: number,
  baseRadius: number,
  seed: number,
  tuning: DripTuning,
): readonly DripPoint[] {
  const random = createSeededRandom(seed);
  const boundedLoad = Math.min(3, load);
  const gravity = baseRadius * tuning.gravityRatio;
  const minVelocity = baseRadius * tuning.minVelocityRatio;
  const lateralWobble = baseRadius * tuning.lateralWobbleRatio;
  let velocity = gravity * (1 + boundedLoad * tuning.loadRunResponse) * (0.7 + random() * 0.6);
  let x = origin.x;
  let y = origin.y;
  const points: DripPoint[] = [{ x, y }];
  for (let step = 0; step < tuning.maxDripSteps; step += 1) {
    velocity *= tuning.drag;
    if (velocity < minVelocity) break;
    y += velocity;
    x += (random() - 0.5) * lateralWobble;
    points.push({ x, y });
  }
  return points;
}

/**
 * Combines origin selection + per-origin simulation into the full bounded
 * list of drip plans for one authored gesture. `seed` should be a stable
 * numeric hash of the ORIGIN STROKE'S OWN persisted Mark id (never the
 * drip's own id, never anything camera/time/render-related) -- see
 * mopDeposition.ts's/sprayDeposition.ts's own `resolve*DripPlans` wrappers
 * for where that id comes from. Each origin gets its own, independently
 * seeded stream (`seed` offset by its own rank) so multiple drips on one
 * stroke never repeat the identical shape.
 */
export function resolveMaterialDripPlans(
  points: readonly DripSourcePoint[],
  baseRadius: number,
  seed: number,
  tuning: DripTuning,
): readonly DripPlan[] {
  const origins = resolveDripOrigins(points, baseRadius, tuning);
  const plans: DripPlan[] = [];
  origins.forEach(({ index, load }, rank) => {
    const dripPoints = simulateMaterialDrip(points[index], load, baseRadius, (seed + rank * 104173) >>> 0, tuning);
    if (dripPoints.length >= 2) plans.push({ points: dripPoints });
  });
  return plans;
}
