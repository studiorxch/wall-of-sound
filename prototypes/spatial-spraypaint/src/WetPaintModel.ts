import { type DripSeed } from "./DripLogic";
import { type MarkerVariantId } from "./DrawingTool";
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
  dwellThresholdMs: number;
  travelThreshold: number;
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
}

const WET_VARIANT_PROFILES: Record<WetMarkerVariantId, WetVariantProfile> = {
  mop: {
    initialLoad: 0.54,
    slowGainPerSecond: 0.22,
    dwellGainPerSecond: 0.34,
    speedDrain: 0.13,
    dripLoadThreshold: 0.82,
    dwellThresholdMs: 880,
    travelThreshold: 3.2,
    cooldownMs: 1150,
    lengthMin: 1.35,
    lengthRange: 2.05,
    stemWidthBaseRatio: 0.055,
    stemWidthLoadRatio: 0.05,
    tipWidthRatio: 0.5,
    originPoolRatio: 1.05,
    originOffsetRatio: 0.56,
    originSpanRatio: 0.54,
    durationMinMs: 1050,
    durationRangeMs: 850,
  },
  "drip-mop": {
    initialLoad: 0.68,
    slowGainPerSecond: 0.36,
    dwellGainPerSecond: 0.58,
    speedDrain: 0.08,
    dripLoadThreshold: 0.66,
    dwellThresholdMs: 380,
    travelThreshold: 1.8,
    cooldownMs: 680,
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
  },
  "drippy-chisel": {
    initialLoad: 0.58,
    slowGainPerSecond: 0.28,
    dwellGainPerSecond: 0.44,
    speedDrain: 0.11,
    dripLoadThreshold: 0.76,
    dwellThresholdMs: 620,
    travelThreshold: 2.6,
    cooldownMs: 860,
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

export function resolveMopDripAttachment(
  variant: Extract<WetMarkerVariantId, "mop" | "drip-mop">,
  previous: Pick<StrokePoint, "x" | "y"> | null,
  point: Pick<StrokePoint, "x" | "y">,
  size: number,
  horizontalOffset: number,
): MopDripAttachment {
  const start = previous ?? point;
  const renderedWidth = size * (variant === "drip-mop" ? 1.32 : 1.18);
  const radius = renderedWidth * 0.5;
  const overlap = Math.max(1, radius * 0.05);
  const x = point.x + clamp(horizontalOffset, -radius * 0.72, radius * 0.72);
  const boundaryY = resolveCapsuleLowerBoundaryY(start, point, radius, x);
  return {
    origin: { x, y: boundaryY - overlap },
    boundaryY,
    radius,
    overlap,
  };
}

function resolveCapsuleLowerBoundaryY(
  start: Pick<StrokePoint, "x" | "y">,
  end: Pick<StrokePoint, "x" | "y">,
  radius: number,
  x: number,
): number {
  const candidates: number[] = [];
  for (const endpoint of [start, end]) {
    const horizontalDistance = x - endpoint.x;
    if (Math.abs(horizontalDistance) <= radius) {
      candidates.push(endpoint.y + Math.sqrt(Math.max(0, radius ** 2 - horizontalDistance ** 2)));
    }
  }

  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const length = Math.hypot(deltaX, deltaY);
  if (length > 0.0001) {
    const tangent = { x: deltaX / length, y: deltaY / length };
    const normal = { x: -tangent.y, y: tangent.x };
    if (Math.abs(tangent.x) > 0.0001) {
      for (const side of [-1, 1]) {
        const sideStart = {
          x: start.x + normal.x * radius * side,
          y: start.y + normal.y * radius * side,
        };
        const distanceAlong = (x - sideStart.x) / tangent.x;
        if (distanceAlong >= 0 && distanceAlong <= length) {
          candidates.push(sideStart.y + tangent.y * distanceAlong);
        }
      }
    }
  }

  return Math.max(...candidates);
}

export class WetPaintAccumulator {
  private state = resetWetPaintState();
  private variant: WetMarkerVariantId = "mop";
  private random = createDeterministicRandom(1);
  private controls: WetPaintControlState = { ...INITIAL_WET_PAINT_CONTROLS };
  private modifiers: WetPaintControlModifiers = resolveWetPaintControlModifiers(this.controls);

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
  }

  public observe(point: StrokePoint, size: number, dripsEnabled: boolean): WetPaintObservationResult {
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
    const dwellReady = dwellMs >= profile.dwellThresholdMs;
    const travelReady = distanceSinceDrip >= size * profile.travelThreshold && slowFactor >= 0.7;
    const canDrip = dripsEnabled
      && paintLoad >= Math.min(0.98, profile.dripLoadThreshold * this.modifiers.threshold)
      && timeSinceDrip >= profile.cooldownMs
      && (dwellReady || travelReady);
    const drips = canDrip ? this.createDrips(previous, point, size, paintLoad) : [];

    this.state = {
      paintLoad: clamp(paintLoad - drips.length * (this.variant === "drip-mop" ? 0.13 : 0.2), 0.22, 1),
      dwellMs: drips.length > 0 ? dwellMs * 0.28 : dwellMs,
      distanceSinceDrip: drips.length > 0 ? 0 : distanceSinceDrip,
      lastPoint: { ...point, paintLoad },
      lastDripTimestamp: drips.length > 0 ? point.timestamp : this.state.lastDripTimestamp,
    };
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
  }

  private createDrips(
    previous: Pick<StrokePoint, "x" | "y"> | null,
    point: StrokePoint,
    size: number,
    paintLoad: number,
  ): DripSeed[] {
    const profile = WET_VARIANT_PROFILES[this.variant];
    const firstRandom = this.random();
    const additionalDrip = this.variant === "drip-mop" && paintLoad > 0.84 && firstRandom > 0.58 ? 1 : 0;
    const count = 1 + additionalDrip;
    const drips: DripSeed[] = [];
    for (let index = 0; index < count; index += 1) {
      const offset = (this.random() - 0.5) * size * profile.originSpanRatio;
      const dramatic = this.variant === "drip-mop" && this.random() > 0.8;
      const length = size * (
        profile.lengthMin
        + this.random() * profile.lengthRange
        + (dramatic ? 5.2 : 0)
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
        ? resolveMopDripAttachment(this.variant, previous, point, size, offset).origin
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
