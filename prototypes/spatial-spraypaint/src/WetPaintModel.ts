import { type DripSeed } from "./DripLogic";
import { type MarkerVariantId } from "./DrawingTool";
import { type StrokePoint } from "./types";
import {
  INITIAL_WET_PAINT_CONTROLS,
  resolveWetPaintControlModifiers,
  type WetPaintControlModifiers,
  type WetPaintControlState,
} from "./WetPaintControls";

export type WetMarkerVariantId = Extract<MarkerVariantId, "mop" | "drip-mop">;

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
    lengthMin: 1.15,
    lengthRange: 1.7,
    stemWidthBaseRatio: 0.055,
    stemWidthLoadRatio: 0.05,
    tipWidthRatio: 0.5,
    originPoolRatio: 0.95,
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
    lengthMin: 5.2,
    lengthRange: 7.4,
    stemWidthBaseRatio: 0.16,
    stemWidthLoadRatio: 0.12,
    tipWidthRatio: 0.62,
    originPoolRatio: 0.78,
    durationMinMs: 1450,
    durationRangeMs: 1650,
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
  return value === "mop" || value === "drip-mop";
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
    const drips = canDrip ? this.createDrips(point, size, paintLoad) : [];

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

  private createDrips(point: StrokePoint, size: number, paintLoad: number): DripSeed[] {
    const profile = WET_VARIANT_PROFILES[this.variant];
    const firstRandom = this.random();
    const additionalDrip = this.variant === "drip-mop" && paintLoad > 0.84 && firstRandom > 0.58 ? 1 : 0;
    const count = 1 + additionalDrip;
    const drips: DripSeed[] = [];
    for (let index = 0; index < count; index += 1) {
      const offset = (this.random() - 0.5) * size * 0.92;
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
      drips.push({
        x: point.x + offset,
        y: point.y + size * 0.38,
        width,
        length,
        opacity: clamp(0.58 + paintLoad * 0.28, 0, 0.92),
        bend: (this.random() - 0.5) * length * (this.variant === "drip-mop" ? 0.055 : 0.1),
        durationMs: (
          profile.durationMinMs
          + (1 - paintLoad) * 420
          + this.random() * profile.durationRangeMs
        ) * this.modifiers.gravityDuration,
        tipWidthRatio: profile.tipWidthRatio,
        originPoolRadius: width * profile.originPoolRatio,
        terminalBulbRatio: this.variant === "drip-mop" ? 0.58 : 0.48,
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
