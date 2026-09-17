import { type DripSeed } from "./DripLogic";
import { type MarkerVariantId } from "./DrawingTool";
import {
  buildSweptRibbonSegment,
  resolveWetContactBulgeScale,
} from "./PaintMarkerEngine";
import { type StrokePoint } from "./types";
import {
  INITIAL_WET_PAINT_CONTROLS,
  resolveWetPaintControlModifiers,
  type WetPaintControlModifiers,
  type WetPaintControlState,
} from "./WetPaintControls";

export type WetMarkerVariantId = Extract<MarkerVariantId, "drippy-chisel" | "mop" | "drip-mop">;

export interface WetPaintState {
  paintLoad: number;
  dwellMs: number;
  distanceSinceDrip: number;
  lastPoint: StrokePoint | null;
  lastDripTimestamp: number;
}

export interface WetPaintObservationResult {
  paintLoad: number;
  drips: DripSeed[];
}

export interface WetVariantProfile {
  initialLoad: number;
  slowGainPerSecond: number;
  dwellGainPerSecond: number;
  speedDrain: number;
  dripLoadThreshold: number;
  /** Minimum spacing between CLUSTER trigger events (not between individual drips -- a single trigger can spawn several at once). Short by design: with the dwell/travel readiness gate removed, the wet load itself is what paces drip formation now, not a stopwatch. */
  cooldownMs: number;
  lengthMin: number;
  lengthRange: number;
  stemWidthBaseRatio: number;
  stemWidthLoadRatio: number;
  tipWidthRatio: number;
  originPoolRatio: number;
  originOffsetRatio: number;
  originSpanRatio: number;
  durationMinMs: number;
  durationRangeMs: number;
  /** How many independent gravity runs one wet-load crossing can spawn at once -- density scales toward this as paintLoad rises further past the threshold, which is what produces "several simultaneous drips across a single wet section" instead of one drip at a time. */
  maxSimultaneousDrips: number;
  /** Chance any one drip in a spawned cluster becomes a dramatic long run -- the "some very long runs" variety, mixed in with ordinary short/medium ones from the same cluster. */
  dramaticChance: number;
  dramaticLengthBonus: number;
  /** Drips spawned once from the stroke's remaining wet load right as the pointer lifts -- a run in progress persists a moment after the hand moves away instead of stopping dead. */
  settleDripCount: number;
  /** Random width multiplier range [low, high] -- wide on purpose so a cluster mixes thin threads with noticeably thicker runs, rather than every drip reading the same gauge. */
  widthVarianceLow: number;
  widthVarianceHigh: number;
  /** Chance a drip gets a primary / secondary lateral kink, each independently placed and each a fraction of `length` in amplitude -- two staggered, restrained corrections read as a wandering gravity path, not a straight stick and not a decorative squiggle. */
  kinkChance: number;
  kink2Chance: number;
  kinkAmplitudeRatio: number;
  /** Max |bend| as a fraction of `length` -- the smooth, one-directional lean every drip gets (on top of, not instead of, the kinks). */
  bendRatio: number;
  /** ± range applied to `tipWidthRatio` per drip, so taper severity itself varies across a cluster instead of every run thinning by the exact same amount. */
  tipWidthJitter: number;
  /** Chance a non-first drip in a cluster snaps in close to the previous one's origin instead of its own evenly-stratified slot -- tight neighboring pairs and near-merging, not perfectly separated runs every time. */
  tightNeighborChance: number;
  /** Mop/Drip Mop only (see `PoolNode`): merge distance between two deposits, as a ratio of `size` -- neighboring deposits within this land in the SAME pool node instead of starting a new one, which is what keeps the number of true origins far below the number of visible runs. */
  poolMergeRatio: number;
  /** Wet load deposited into the pool field per second of normal travel. */
  poolDepositRate: number;
  /** Multiplier on deposit rate while the marker is holding still -- dwelling over one spot floods that pool faster. */
  poolDwellBoost: number;
  /** A pool node must accumulate at least this much load before it is a "sufficiently loaded point" allowed to start a gravity run. */
  poolThreshold: number;
  /** Ceiling on how much load a single pool node can hold. */
  poolMaxLoad: number;
  /** Fraction of a node's current load consumed by each channel it spawns -- later channels drawn from an already-drained node come out narrower and shorter, the literal "runs narrow as the reservoir drains." */
  poolChannelDrain: number;
  /** Minimum time between two channels spawned from the SAME node (channels from DIFFERENT nodes are not paced against each other, which is how several simultaneous runs still happen). */
  poolChannelCooldownMs: number;
  /** How many separate channels one pool node may ever spawn over its lifetime -- "fewer true origins than visible strands" depends on this staying small relative to how many nodes form. */
  poolMaxChannelsPerNode: number;
  /** Load lost per second by a node the marker has moved away from -- an abandoned, never-revisited pool doesn't stay loaded forever. */
  poolDecayPerSecond: number;
}

const WET_VARIANT_PROFILES: Record<WetMarkerVariantId, WetVariantProfile> = {
  mop: {
    initialLoad: 0.54,
    slowGainPerSecond: 0.22,
    dwellGainPerSecond: 0.34,
    speedDrain: 0.13,
    dripLoadThreshold: 0.52,
    cooldownMs: 110,
    lengthMin: 1.1,
    lengthRange: 3.2,
    stemWidthBaseRatio: 0.055,
    stemWidthLoadRatio: 0.05,
    tipWidthRatio: 0.5,
    originPoolRatio: 1.05,
    originOffsetRatio: 0.56,
    originSpanRatio: 0.54,
    durationMinMs: 1050,
    durationRangeMs: 850,
    maxSimultaneousDrips: 6,
    dramaticChance: 0.22,
    dramaticLengthBonus: 3.4,
    settleDripCount: 5,
    widthVarianceLow: 0.55,
    widthVarianceHigh: 1.45,
    // Gravity dominates now -- these are deliberately restrained versus the
    // prior pass (which over-corrected into "decorative curly hair"). Most
    // runs get at most one small kink; a second is the exception, not the
    // rule.
    kinkChance: 0.4,
    kink2Chance: 0.12,
    kinkAmplitudeRatio: 0.04,
    bendRatio: 0.075,
    tipWidthJitter: 0.14,
    tightNeighborChance: 0.32,
    poolMergeRatio: 0.5,
    poolDepositRate: 0.85,
    poolDwellBoost: 2.6,
    poolThreshold: 0.62,
    poolMaxLoad: 3.6,
    poolChannelDrain: 0.26,
    poolChannelCooldownMs: 110,
    poolMaxChannelsPerNode: 8,
    poolDecayPerSecond: 0.35,
  },
  "drip-mop": {
    initialLoad: 0.68,
    slowGainPerSecond: 0.36,
    dwellGainPerSecond: 0.58,
    speedDrain: 0.08,
    dripLoadThreshold: 0.44,
    cooldownMs: 70,
    lengthMin: 5.7,
    lengthRange: 8.6,
    stemWidthBaseRatio: 0.16,
    stemWidthLoadRatio: 0.12,
    tipWidthRatio: 0.62,
    originPoolRatio: 0.9,
    originOffsetRatio: 0.62,
    originSpanRatio: 0.62,
    durationMinMs: 1450,
    durationRangeMs: 1650,
    maxSimultaneousDrips: 8,
    dramaticChance: 0.28,
    dramaticLengthBonus: 4.5,
    settleDripCount: 7,
    widthVarianceLow: 0.75,
    widthVarianceHigh: 1.4,
    kinkChance: 0.45,
    kink2Chance: 0.15,
    kinkAmplitudeRatio: 0.035,
    bendRatio: 0.055,
    tipWidthJitter: 0.1,
    tightNeighborChance: 0.36,
    poolMergeRatio: 0.55,
    poolDepositRate: 1.15,
    poolDwellBoost: 2.8,
    poolThreshold: 0.46,
    poolMaxLoad: 4.4,
    poolChannelDrain: 0.22,
    poolChannelCooldownMs: 75,
    poolMaxChannelsPerNode: 10,
    poolDecayPerSecond: 0.3,
  },
  "drippy-chisel": {
    initialLoad: 0.58,
    slowGainPerSecond: 0.28,
    dwellGainPerSecond: 0.44,
    speedDrain: 0.11,
    dripLoadThreshold: 0.7,
    cooldownMs: 320,
    lengthMin: 2.7,
    lengthRange: 4.35,
    stemWidthBaseRatio: 0.08,
    stemWidthLoadRatio: 0.07,
    tipWidthRatio: 0.54,
    originPoolRatio: 0.86,
    originOffsetRatio: 0.12,
    originSpanRatio: 0.42,
    durationMinMs: 1250,
    durationRangeMs: 1050,
    maxSimultaneousDrips: 3,
    dramaticChance: 0.14,
    dramaticLengthBonus: 2,
    settleDripCount: 2,
    widthVarianceLow: 0.6,
    widthVarianceHigh: 1.35,
    kinkChance: 0.4,
    kink2Chance: 0.1,
    kinkAmplitudeRatio: 0.03,
    bendRatio: 0.06,
    tipWidthJitter: 0.12,
    tightNeighborChance: 0.22,
    // Drippy Chisel keeps the older per-trigger cluster model (see
    // `createDrips`), not the pool/reservoir model -- these fields exist
    // only for type completeness and are unused by that code path.
    poolMergeRatio: 0.4,
    poolDepositRate: 0.3,
    poolDwellBoost: 1.8,
    poolThreshold: 1.1,
    poolMaxLoad: 2,
    poolChannelDrain: 0.5,
    poolChannelCooldownMs: 400,
    poolMaxChannelsPerNode: 2,
    poolDecayPerSecond: 0.4,
  },
};

export function getWetPaintProfile(variant: WetMarkerVariantId): WetVariantProfile {
  return { ...WET_VARIANT_PROFILES[variant] };
}

export function resetWetPaintState(initialLoad = 0): WetPaintState {
  return {
    paintLoad: initialLoad,
    dwellMs: 0,
    distanceSinceDrip: 0,
    lastPoint: null,
    lastDripTimestamp: -Infinity,
  };
}

export function isWetMarkerVariant(value: MarkerVariantId): value is WetMarkerVariantId {
  return value === "drippy-chisel" || value === "mop" || value === "drip-mop";
}

export interface MopDripAttachment {
  origin: { x: number; y: number };
  boundaryY: number;
  radius: number;
  overlap: number;
}

export interface MopDripAttachmentOptions {
  /** The completed-stroke helper includes its final round cap by default. */
  terminalCapRendered?: boolean;
}

type MopFootprintPoint = Pick<StrokePoint, "x" | "y" | "width" | "velocity" | "paintLoad">;

export function resolveMopDripAttachment(
  variant: Extract<WetMarkerVariantId, "mop" | "drip-mop">,
  footprint: readonly MopFootprintPoint[],
  reservoir: MopFootprintPoint,
  horizontalOffset: number,
  options: MopDripAttachmentOptions = {},
): MopDripAttachment {
  if (footprint.length === 0) throw new Error("Mop attachment requires a rendered footprint");
  const radius = resolveMopPointRadius(variant, reservoir);
  const overlap = Math.max(1, radius * 0.05);
  const x = reservoir.x + clamp(horizontalOffset, -radius * 0.72, radius * 0.72);
  const boundaryY = resolveMopFootprintLowerBoundaryY(
    variant,
    footprint,
    x,
    options.terminalCapRendered ?? true,
  );
  return {
    origin: { x, y: boundaryY - overlap },
    boundaryY,
    radius,
    overlap,
  };
}

function resolveMopPointRadius(
  variant: Extract<WetMarkerVariantId, "mop" | "drip-mop">,
  point: Pick<StrokePoint, "width">,
): number {
  return point.width * (variant === "drip-mop" ? 1.32 : 1.18) * 0.5;
}

function resolveMopFootprintLowerBoundaryY(
  variant: Extract<WetMarkerVariantId, "mop" | "drip-mop">,
  footprint: readonly MopFootprintPoint[],
  x: number,
  terminalCapRendered: boolean,
): number {
  const candidates: number[] = [];
  const addCircle = (center: Pick<StrokePoint, "x" | "y">, radius: number) => {
    const horizontalDistance = x - center.x;
    if (Math.abs(horizontalDistance) > radius) return;
    candidates.push(center.y + Math.sqrt(Math.max(0, radius ** 2 - horizontalDistance ** 2)));
  };

  for (let index = 0; index < footprint.length; index += 1) {
    const isInitialDot = footprint.length === 1;
    const isUnrenderedTerminal = index === footprint.length - 1 && !terminalCapRendered;
    if (isUnrenderedTerminal && !isInitialDot) continue;
    const point = footprint[index];
    const joinRadius = resolveMopPointRadius(
      variant,
      footprint[Math.min(index + 1, footprint.length - 1)],
    );
    addCircle(point, joinRadius);
  }

  for (let index = 1; index < footprint.length; index += 1) {
    const start = footprint[index - 1];
    const end = footprint[index];
    const direction = Math.atan2(end.y - start.y, end.x - start.x);
    const ribbon = buildSweptRibbonSegment(
      start,
      end,
      resolveMopPointRadius(variant, start) * 2,
      resolveMopPointRadius(variant, end) * 2,
      direction,
    );
    addPolygonVerticalIntersections([
      ribbon.startLeft,
      ribbon.endLeft,
      ribbon.endRight,
      ribbon.startRight,
    ], x, candidates);
  }

  for (let index = 1; index < footprint.length; index += 1) {
    const prior = footprint[index - 1];
    const point = footprint[index];
    const distance = Math.hypot(point.x - prior.x, point.y - prior.y);
    const radius = resolveMopPointRadius(variant, point);
    if (distance <= Math.max(1.2, radius * 2 * 0.04)) {
      const bulgeScale = resolveWetContactBulgeScale(point.paintLoad ?? 0, point.velocity);
      if (bulgeScale > 1) addCircle(point, radius * bulgeScale);
    }
  }
  for (let index = 2; index < footprint.length; index += 1) {
    const start = footprint[index - 2];
    const corner = footprint[index - 1];
    const end = footprint[index];
    const incoming = Math.atan2(corner.y - start.y, corner.x - start.x);
    const outgoing = Math.atan2(end.y - corner.y, end.x - corner.x);
    if (Math.abs(normalizeAngle(outgoing - incoming)) >= Math.PI * 0.24) {
      const radius = resolveMopPointRadius(variant, end);
      const bulgeScale = resolveWetContactBulgeScale(end.paintLoad ?? 0, 0);
      if (bulgeScale > 1) addCircle(corner, radius * bulgeScale);
    }
  }

  return Math.max(...candidates);
}

function addPolygonVerticalIntersections(
  polygon: readonly { x: number; y: number }[],
  x: number,
  candidates: number[],
): void {
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    const minimumX = Math.min(start.x, end.x);
    const maximumX = Math.max(start.x, end.x);
    if (x < minimumX || x > maximumX) continue;
    const deltaX = end.x - start.x;
    if (Math.abs(deltaX) <= 0.0001) {
      if (Math.abs(x - start.x) <= 0.0001) candidates.push(start.y, end.y);
      continue;
    }
    const progress = (x - start.x) / deltaX;
    candidates.push(start.y + (end.y - start.y) * progress);
  }
}

/**
 * A discrete node in the spatial wet-paint field along the mark's lower
 * boundary (Mop / Drip Mop only). This is the actual "source of truth"
 * this model is built around: deposition accumulates INTO a small number of
 * these (neighboring deposits merge into the same node instead of each
 * starting its own), and only once a node itself is sufficiently loaded
 * does it start a gravity run. A node's own `channelsSpawned` count stays
 * far smaller than the number of runs it can produce over its lifetime, so
 * "true origins" (pool nodes) end up well below "visible strands"
 * (channels) -- the direct fix for one seed per strand reading as hair.
 */
interface PoolNode {
  x: number;
  y: number;
  radius: number;
  load: number;
  channelsSpawned: number;
  lastChannelAt: number;
}

export class WetPaintAccumulator {
  private state = resetWetPaintState();
  private variant: WetMarkerVariantId = "mop";
  private random = createDeterministicRandom(1);
  private controls: WetPaintControlState = { ...INITIAL_WET_PAINT_CONTROLS };
  private modifiers: WetPaintControlModifiers = resolveWetPaintControlModifiers(this.controls);
  private footprint: StrokePoint[] = [];
  private pools: PoolNode[] = [];
  /**
   * A future Squeeze input (`↓` while drawing, not implemented yet) should
   * only need to raise this before deposition -- everything downstream
   * (merging, thresholds, channel width/count) already scales off however
   * much load lands in the pool field, so a bigger multiplier here alone
   * produces a larger reservoir and more/larger gravity channels with no
   * other wiring required.
   */
  private squeezeMultiplier = 1;

  public beginStroke(
    strokeId: number,
    variant: WetMarkerVariantId,
    controls: WetPaintControlState = INITIAL_WET_PAINT_CONTROLS,
  ): void {
    this.variant = variant;
    this.controls = { ...controls };
    this.modifiers = resolveWetPaintControlModifiers(this.controls);
    this.state = resetWetPaintState(clamp(
      WET_VARIANT_PROFILES[variant].initialLoad * this.modifiers.delivery,
      0.22,
      1,
    ));
    this.random = createDeterministicRandom(strokeId * 2654435761);
    this.footprint = [];
    this.pools = [];
  }

  /**
   * A future Squeeze input multiplies deposition, not any individual drip
   * parameter -- see the field's own doc. Unused until that input exists.
   */
  public setSqueezeMultiplier(value: number): void {
    this.squeezeMultiplier = Math.max(0, value);
  }

  public observe(
    point: StrokePoint,
    size: number,
    dripsEnabled: boolean,
    nextPoint: StrokePoint | null = null,
  ): WetPaintObservationResult {
    const profile = WET_VARIANT_PROFILES[this.variant];
    const previous = this.state.lastPoint;
    const elapsed = previous ? Math.max(0, Math.min(120, point.timestamp - previous.timestamp)) : 0;
    const distance = previous ? Math.hypot(point.x - previous.x, point.y - previous.y) : 0;
    const stationary = Boolean(previous) && distance <= Math.max(1.2, size * 0.055);
    const speed = Math.max(0, point.velocity);
    const slowFactor = 1 - Math.min(1, speed / 1.45);
    const elapsedSeconds = elapsed / 1000;
    const gain = elapsedSeconds * (
      profile.slowGainPerSecond * slowFactor * this.modifiers.delivery
      + (stationary ? profile.dwellGainPerSecond * this.modifiers.dwellResponse : 0)
    );
    const drain = Math.min(0.2, speed * profile.speedDrain * elapsedSeconds);
    const paintLoad = clamp(this.state.paintLoad + gain - drain, 0.22, 1);
    const dwellMs = stationary ? this.state.dwellMs + elapsed : Math.max(0, this.state.dwellMs - elapsed * 1.8);
    const distanceSinceDrip = this.state.distanceSinceDrip + distance;
    const renderedPoint = { ...point, paintLoad };
    const footprint = [...this.footprint, renderedPoint, ...(nextPoint ? [nextPoint] : [])];

    let drips: DripSeed[];
    if (this.variant === "mop" || this.variant === "drip-mop") {
      // The actual pooling model: deposition accumulates into a small
      // spatial field of nodes along the mark's lower boundary, neighboring
      // deposits merge into the SAME node, and only a sufficiently loaded
      // node starts a gravity run -- see `depositIntoPool`/`spawnPoolChannel`.
      drips = dripsEnabled
        ? this.depositIntoPool(footprint, renderedPoint, size, paintLoad, elapsedSeconds, stationary)
        : [];
    } else {
      // Drippy Chisel (not exposed in the shipped UI) keeps the older,
      // simpler per-trigger cluster model -- see `createDrips`.
      const timeSinceDrip = point.timestamp - this.state.lastDripTimestamp;
      const canDrip = dripsEnabled
        && paintLoad >= Math.min(0.98, profile.dripLoadThreshold * this.modifiers.threshold)
        && timeSinceDrip >= profile.cooldownMs;
      drips = canDrip ? this.createDrips(footprint, renderedPoint, size, paintLoad) : [];
    }
    const drainPerDrip = this.variant === "drip-mop" ? 0.05 : this.variant === "mop" ? 0.06 : 0.16;

    this.state = {
      paintLoad: clamp(paintLoad - drips.length * drainPerDrip, 0.22, 1),
      dwellMs: drips.length > 0 ? dwellMs * 0.28 : dwellMs,
      distanceSinceDrip: drips.length > 0 ? 0 : distanceSinceDrip,
      lastPoint: { ...point, paintLoad },
      lastDripTimestamp: drips.length > 0 ? point.timestamp : this.state.lastDripTimestamp,
    };
    this.footprint = [...this.footprint, renderedPoint].slice(-2);
    return { paintLoad, drips };
  }

  public snapshot(): WetPaintState {
    return {
      ...this.state,
      lastPoint: this.state.lastPoint ? { ...this.state.lastPoint } : null,
    };
  }

  public reset(): void {
    this.state = resetWetPaintState();
    this.random = createDeterministicRandom(1);
    this.footprint = [];
    this.pools = [];
  }

  /**
   * A run in progress does not vanish the instant the pointer lifts. Any
   * pool node still carrying enough load spawns one final channel from it
   * (bypassing the node's own per-channel cooldown, since drawing has
   * already stopped) so the accumulated reservoir keeps dripping for a
   * moment after the hand moves away, the way it would physically settle
   * under gravity.
   */
  public settle(dripsEnabled: boolean): DripSeed[] {
    const last = this.state.lastPoint;
    if (!dripsEnabled || !last) return [];
    const profile = WET_VARIANT_PROFILES[this.variant];
    if (this.variant === "mop" || this.variant === "drip-mop") {
      const settleThreshold = profile.poolThreshold * 0.5;
      const drips: DripSeed[] = [];
      for (const node of this.pools) {
        if (node.load < settleThreshold || node.channelsSpawned >= profile.poolMaxChannelsPerNode) continue;
        drips.push(this.spawnPoolChannel(node, last.width, this.state.paintLoad));
        node.channelsSpawned += 1;
      }
      return drips;
    }
    const effectiveThreshold = Math.min(0.98, profile.dripLoadThreshold * this.modifiers.threshold);
    if (this.state.paintLoad < effectiveThreshold * 0.55) return [];
    const footprint = [...this.footprint, last];
    return this.createDrips(footprint, last, last.width, this.state.paintLoad, profile.settleDripCount);
  }

  /**
   * Steps 1-3 of the pooling model: deposit wet load at the current point,
   * merging into whichever existing pool node is close enough (the
   * "neighboring deposits overlap and accumulate" / "connected reservoir"
   * behavior) rather than always starting a new one. Then steps 4-5: any
   * node that is now sufficiently loaded (a "downward extremum" of the
   * discretized boundary) starts a gravity run, paced per-node so a single
   * node can go on to spawn a FEW MORE channels later as it keeps getting
   * fed, rather than exhausting itself in one trigger.
   */
  private depositIntoPool(
    footprint: readonly MopFootprintPoint[],
    point: StrokePoint,
    size: number,
    paintLoad: number,
    elapsedSeconds: number,
    stationary: boolean,
  ): DripSeed[] {
    const profile = WET_VARIANT_PROFILES[this.variant];
    const mergeDistance = size * profile.poolMergeRatio;
    const depositAmount = elapsedSeconds
      * profile.poolDepositRate
      * (stationary ? profile.poolDwellBoost : 1)
      * this.modifiers.delivery
      * this.squeezeMultiplier
      * (0.4 + paintLoad * 0.6);

    let touchedNode: PoolNode | null = null;
    if (depositAmount > 0 && this.variant !== "drippy-chisel") {
      const attachment = resolveMopDripAttachment(
        this.variant,
        footprint,
        point,
        0,
        { terminalCapRendered: false },
      );
      let nearest: PoolNode | null = null;
      let nearestDistance = Infinity;
      for (const node of this.pools) {
        const nodeDistance = Math.abs(node.x - point.x);
        if (nodeDistance < mergeDistance && nodeDistance < nearestDistance) {
          nearest = node;
          nearestDistance = nodeDistance;
        }
      }
      if (nearest) {
        // Weighted merge: the node drifts toward wherever paint keeps
        // landing and its recorded boundary/radius track the freshest
        // deposit, exactly the "neighboring wet regions merge" step.
        const totalLoad = nearest.load + depositAmount;
        nearest.x = (nearest.x * nearest.load + point.x * depositAmount) / totalLoad;
        nearest.y = attachment.origin.y;
        nearest.radius = attachment.radius;
        nearest.load = Math.min(profile.poolMaxLoad, totalLoad);
        touchedNode = nearest;
      } else {
        touchedNode = {
          x: point.x,
          y: attachment.origin.y,
          radius: attachment.radius,
          load: depositAmount,
          channelsSpawned: 0,
          lastChannelAt: -Infinity,
        };
        this.pools.push(touchedNode);
      }
    }

    // A pool the marker has moved away from and never revisited slowly
    // drains rather than staying loaded forever.
    for (const node of this.pools) {
      if (node !== touchedNode && Math.abs(node.x - point.x) >= mergeDistance) {
        node.load = Math.max(0, node.load - profile.poolDecayPerSecond * elapsedSeconds);
      }
    }
    this.pools = this.pools.filter((node) => node.load > 0.01 || node.channelsSpawned > 0);

    // Only the node just touched by THIS deposit is eligible to spawn --
    // its recorded (x, y, radius) come from the footprint passed in on this
    // very call, so a spawned channel is always anchored to the body as
    // rendered THIS frame. An idle node elsewhere in the field (the marker
    // has since moved on) keeps its accumulated load and history, and can
    // still spawn once the marker comes back within merge distance of it,
    // but never from a stale position the body has already left behind.
    if (
      !touchedNode
      || touchedNode.load < profile.poolThreshold
      || touchedNode.channelsSpawned >= profile.poolMaxChannelsPerNode
      || point.timestamp - touchedNode.lastChannelAt < profile.poolChannelCooldownMs
    ) return [];
    const drip = this.spawnPoolChannel(touchedNode, size, paintLoad);
    // Steps 7-8: width/length come out of the node's own flux budget, so
    // draining it narrows and shortens whatever channel comes next from the
    // same pool -- "runs narrow as the reservoir drains."
    touchedNode.load = Math.max(0, touchedNode.load - touchedNode.load * profile.poolChannelDrain);
    touchedNode.channelsSpawned += 1;
    touchedNode.lastChannelAt = point.timestamp;
    return [drip];
  }

  /**
   * One gravity run breaking free from a loaded pool node (step 5-9). Width
   * and length both scale with the flux actually available at this node
   * right now, divided down as more channels already draw from it -- a
   * node's SECOND or THIRD channel is narrower/shorter than its first,
   * without needing any separate "later channels are weaker" rule.
   */
  private spawnPoolChannel(node: PoolNode, size: number, paintLoad: number): DripSeed {
    const profile = WET_VARIANT_PROFILES[this.variant];
    const fluxShare = node.load / Math.sqrt(node.channelsSpawned + 1);
    // Channels from the SAME node stay close together, near its own pooled
    // radius -- coalescing at a shared root rather than spreading across
    // the whole stroke the way independent seeds did before.
    const offset = node.channelsSpawned === 0 ? 0 : (this.random() - 0.5) * node.radius * 0.6;
    const dramatic = this.random() < profile.dramaticChance;
    const loadFactor = Math.min(1, fluxShare / profile.poolThreshold);
    const length = size * (
      profile.lengthMin
      + this.random() * profile.lengthRange * (0.4 + loadFactor * 0.6)
      + (dramatic ? profile.dramaticLengthBonus : 0)
    ) * this.modifiers.length;
    const widthMultiplier = profile.widthVarianceLow
      + Math.pow(this.random(), 1.4) * (profile.widthVarianceHigh - profile.widthVarianceLow);
    const width = Math.max(
      1.4,
      size
        * (profile.stemWidthBaseRatio + loadFactor * profile.stemWidthLoadRatio)
        * widthMultiplier
        * this.modifiers.width,
    );
    const kink = this.random() < profile.kinkChance
      ? (this.random() - 0.5) * length * profile.kinkAmplitudeRatio
      : 0;
    const kink2 = this.random() < profile.kink2Chance
      ? (this.random() - 0.5) * length * profile.kinkAmplitudeRatio * 0.7
      : 0;
    return {
      x: node.x + offset,
      y: node.y,
      width,
      length,
      opacity: clamp(0.6 + paintLoad * 0.26, 0, 0.92),
      bend: (this.random() - 0.5) * length * profile.bendRatio,
      kink,
      kinkAt: kink === 0 ? undefined : 0.3 + this.random() * 0.25,
      kink2,
      kinkAt2: kink2 === 0 ? undefined : 0.65 + this.random() * 0.25,
      durationMs: (
        profile.durationMinMs
        + this.random() * profile.durationRangeMs
      ) * this.modifiers.gravityDuration,
      tipWidthRatio: clamp(
        profile.tipWidthRatio + (this.random() - 0.5) * profile.tipWidthJitter,
        0.16,
        0.68,
      ),
      originPoolRadius: node.radius * profile.originPoolRatio,
      terminalBulbRatio: this.variant === "drip-mop" ? 0.58 : 0.48,
      renderAsOverlay: true,
      attachmentUnderlap: size * 0.28,
    };
  }

  private createDrips(
    footprint: readonly MopFootprintPoint[],
    point: StrokePoint,
    size: number,
    paintLoad: number,
    forceCount?: number,
  ): DripSeed[] {
    const profile = WET_VARIANT_PROFILES[this.variant];
    const effectiveThreshold = Math.min(0.98, profile.dripLoadThreshold * this.modifiers.threshold);
    // How far the load exceeds threshold drives how many independent runs
    // break free AT ONCE -- this is the direct fix for "only one drip per
    // trigger": a heavily loaded pass can spawn several simultaneous drips
    // in the same cluster, up to the variant's own ceiling.
    const overload = clamp((paintLoad - effectiveThreshold) / Math.max(0.01, 1 - effectiveThreshold), 0, 1);
    let count = forceCount ?? 1;
    if (forceCount === undefined) {
      for (let index = 0; index < profile.maxSimultaneousDrips - 1; index += 1) {
        if (this.random() < 0.5 + overload * 0.65) count += 1;
      }
    }
    const drips: DripSeed[] = [];
    const span = size * profile.originSpanRatio;
    let previousOffset: number | null = null;
    for (let index = 0; index < count; index += 1) {
      // Stratified offsets across the wet contact width by default --
      // distinct, neighboring origins rather than stacking on one pixel or
      // reading as evenly-spaced stamps. But real wet paint doesn't space
      // itself out politely: some runs break free right beside a run that
      // just formed, so a fraction of the time a later drip in the cluster
      // snaps in tight to the PREVIOUS one instead of its own slot --
      // close/overlapping neighbors and occasional near-merging.
      const slot = count === 1 ? 0 : index / (count - 1) - 0.5;
      const jitter = (this.random() - 0.5) * (span / Math.max(1, count));
      const stratifiedOffset = clamp(slot * span + jitter, -span / 2, span / 2);
      const offset: number = previousOffset !== null && this.random() < profile.tightNeighborChance
        ? clamp(previousOffset + (this.random() - 0.5) * size * 0.16, -span / 2, span / 2)
        : stratifiedOffset;
      previousOffset = offset;
      const dramatic = this.random() < profile.dramaticChance;
      const length = size * (
        profile.lengthMin
        + this.random() * profile.lengthRange
        + (dramatic ? profile.dramaticLengthBonus : 0)
      ) * this.modifiers.length;
      // A power curve biases the multiplier toward the thin end with
      // occasional noticeably thick outliers, instead of every drip in a
      // cluster reading as roughly the same gauge.
      const widthMultiplier = profile.widthVarianceLow
        + Math.pow(this.random(), 1.6) * (profile.widthVarianceHigh - profile.widthVarianceLow);
      const width = Math.max(
        1.4,
        size
          * (profile.stemWidthBaseRatio + paintLoad * profile.stemWidthLoadRatio)
          * widthMultiplier
          * this.modifiers.width,
      );
      // Two independent, staggered kinks (early-run and late-run) plus a
      // smooth one-directional bend -- a restrained wandering path under
      // gravity, not a straight stick and not a decorative noodle.
      const kink = this.random() < profile.kinkChance
        ? (this.random() - 0.5) * length * profile.kinkAmplitudeRatio
        : 0;
      const kink2 = this.random() < profile.kink2Chance
        ? (this.random() - 0.5) * length * profile.kinkAmplitudeRatio * 0.8
        : 0;
      const origin = this.variant === "mop" || this.variant === "drip-mop"
        ? resolveMopDripAttachment(
          this.variant,
          footprint,
          point,
          offset,
          { terminalCapRendered: false },
        ).origin
        : { x: point.x + offset, y: point.y + size * profile.originOffsetRatio };
      drips.push({
        x: origin.x,
        y: origin.y,
        width,
        length,
        opacity: clamp(0.58 + paintLoad * 0.28, 0, 0.92),
        bend: (this.random() - 0.5) * length * profile.bendRatio,
        kink,
        kinkAt: kink === 0 ? undefined : 0.22 + this.random() * 0.24,
        kink2,
        kinkAt2: kink2 === 0 ? undefined : 0.62 + this.random() * 0.28,
        durationMs: (
          profile.durationMinMs
          + (1 - paintLoad) * 420
          + this.random() * profile.durationRangeMs
        ) * this.modifiers.gravityDuration,
        tipWidthRatio: clamp(
          profile.tipWidthRatio + (this.random() - 0.5) * profile.tipWidthJitter,
          0.16,
          0.68,
        ),
        originPoolRadius: width * profile.originPoolRatio,
        terminalBulbRatio: this.variant === "drip-mop" ? 0.58 : 0.48,
        renderAsOverlay: this.variant === "mop" || this.variant === "drip-mop",
        attachmentUnderlap: this.variant === "mop" || this.variant === "drip-mop"
          ? size * 0.28
          : undefined,
      });
    }
    return drips;
  }
}

function createDeterministicRandom(seed: number): () => number {
  let state = (seed || 1) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeAngle(value: number): number {
  let normalized = value;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  while (normalized < -Math.PI) normalized += Math.PI * 2;
  return normalized;
}
