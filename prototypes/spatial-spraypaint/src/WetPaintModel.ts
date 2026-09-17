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
}

const WET_VARIANT_PROFILES: Record<WetMarkerVariantId, WetVariantProfile> = {
  mop: {
    initialLoad: 0.54,
    slowGainPerSecond: 0.22,
    dwellGainPerSecond: 0.34,
    speedDrain: 0.13,
    dripLoadThreshold: 0.58,
    cooldownMs: 220,
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
    maxSimultaneousDrips: 3,
    dramaticChance: 0.22,
    dramaticLengthBonus: 3.2,
    settleDripCount: 3,
  },
  "drip-mop": {
    initialLoad: 0.68,
    slowGainPerSecond: 0.36,
    dwellGainPerSecond: 0.58,
    speedDrain: 0.08,
    dripLoadThreshold: 0.5,
    cooldownMs: 140,
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
    maxSimultaneousDrips: 4,
    dramaticChance: 0.3,
    dramaticLengthBonus: 4.5,
    settleDripCount: 5,
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
    maxSimultaneousDrips: 2,
    dramaticChance: 0.12,
    dramaticLengthBonus: 2,
    settleDripCount: 2,
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

export class WetPaintAccumulator {
  private state = resetWetPaintState();
  private variant: WetMarkerVariantId = "mop";
  private random = createDeterministicRandom(1);
  private controls: WetPaintControlState = { ...INITIAL_WET_PAINT_CONTROLS };
  private modifiers: WetPaintControlModifiers = resolveWetPaintControlModifiers(this.controls);
  private footprint: StrokePoint[] = [];

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
    const timeSinceDrip = point.timestamp - this.state.lastDripTimestamp;
    // Deposition -> local wet load -> threshold -> gravity run, with NO
    // separate dwell/travel readiness gate: the old version required ~1s of
    // holding still (or a long travel distance) on top of the load already
    // being high enough, which is what made drips feel rare and decorative
    // rather than a natural consequence of paint saturation. Load crossing
    // the threshold is now sufficient by itself; `cooldownMs` only paces how
    // often a new CLUSTER of drips can break free (see `createDrips`), not
    // how long the marker must sit still first.
    const canDrip = dripsEnabled
      && paintLoad >= Math.min(0.98, profile.dripLoadThreshold * this.modifiers.threshold)
      && timeSinceDrip >= profile.cooldownMs;
    const renderedPoint = { ...point, paintLoad };
    const footprint = [...this.footprint, renderedPoint, ...(nextPoint ? [nextPoint] : [])];
    const drips = canDrip ? this.createDrips(footprint, renderedPoint, size, paintLoad) : [];
    const drainPerDrip = this.variant === "drip-mop" ? 0.09 : this.variant === "mop" ? 0.12 : 0.16;

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
  }

  /**
   * A run in progress does not vanish the instant the pointer lifts. If the
   * stroke ends still carrying real wet load, spawn one final cluster from
   * it (bypassing the cooldown, since drawing has already stopped and there
   * is nothing left to pace against) so the accumulated paint keeps
   * dripping for a moment after the hand moves away, the way it would
   * physically settle under gravity.
   */
  public settle(dripsEnabled: boolean): DripSeed[] {
    const last = this.state.lastPoint;
    if (!dripsEnabled || !last) return [];
    const profile = WET_VARIANT_PROFILES[this.variant];
    const effectiveThreshold = Math.min(0.98, profile.dripLoadThreshold * this.modifiers.threshold);
    if (this.state.paintLoad < effectiveThreshold * 0.75) return [];
    const footprint = [...this.footprint, last];
    return this.createDrips(footprint, last, last.width, this.state.paintLoad, profile.settleDripCount);
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
        if (this.random() < 0.35 + overload * 0.5) count += 1;
      }
    }
    const drips: DripSeed[] = [];
    const span = size * profile.originSpanRatio;
    for (let index = 0; index < count; index += 1) {
      // Stratified offsets across the wet contact width: distinct,
      // neighboring origins rather than either stacking on one pixel or
      // reading as evenly-spaced stamps.
      const slot = count === 1 ? 0 : index / (count - 1) - 0.5;
      const jitter = (this.random() - 0.5) * (span / Math.max(1, count));
      const offset = clamp(slot * span + jitter, -span / 2, span / 2);
      const dramatic = this.random() < profile.dramaticChance;
      const length = size * (
        profile.lengthMin
        + this.random() * profile.lengthRange
        + (dramatic ? profile.dramaticLengthBonus : 0)
      ) * this.modifiers.length;
      const width = Math.max(
        1.4,
        size
          * (profile.stemWidthBaseRatio + paintLoad * profile.stemWidthLoadRatio)
          * (0.84 + this.random() * 0.34)
          * this.modifiers.width,
      );
      const kinkSample = this.random();
      const kink = kinkSample > 0.64
        ? (this.random() - 0.5) * length * (this.variant === "drippy-chisel" ? 0.052 : 0.038)
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
        bend: (this.random() - 0.5) * length * (this.variant === "drip-mop" ? 0.055 : 0.1),
        kink,
        kinkAt: kink === 0 ? undefined : 0.32 + this.random() * 0.36,
        durationMs: (
          profile.durationMinMs
          + (1 - paintLoad) * 420
          + this.random() * profile.durationRangeMs
        ) * this.modifiers.gravityDuration,
        tipWidthRatio: profile.tipWidthRatio,
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
