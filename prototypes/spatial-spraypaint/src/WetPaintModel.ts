import { type DripSeed } from "./DripLogic";
import { type MarkerVariantId } from "./DrawingTool";
import { type StrokePoint } from "./types";

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

interface WetVariantProfile {
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
  },
  "drip-mop": {
    initialLoad: 0.68,
    slowGainPerSecond: 0.36,
    dwellGainPerSecond: 0.58,
    speedDrain: 0.08,
    dripLoadThreshold: 0.7,
    dwellThresholdMs: 480,
    travelThreshold: 1.8,
    cooldownMs: 620,
    lengthMin: 1.8,
    lengthRange: 3.5,
  },
};

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

  public beginStroke(strokeId: number, variant: WetMarkerVariantId): void {
    this.variant = variant;
    this.state = resetWetPaintState(WET_VARIANT_PROFILES[variant].initialLoad);
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
      profile.slowGainPerSecond * slowFactor
      + (stationary ? profile.dwellGainPerSecond : 0)
    );
    const drain = Math.min(0.2, speed * profile.speedDrain * elapsedSeconds);
    const paintLoad = clamp(this.state.paintLoad + gain - drain, 0.22, 1);
    const dwellMs = stationary ? this.state.dwellMs + elapsed : Math.max(0, this.state.dwellMs - elapsed * 1.8);
    const distanceSinceDrip = this.state.distanceSinceDrip + distance;
    const timeSinceDrip = point.timestamp - this.state.lastDripTimestamp;
    const dwellReady = dwellMs >= profile.dwellThresholdMs;
    const travelReady = distanceSinceDrip >= size * profile.travelThreshold && slowFactor >= 0.7;
    const canDrip = dripsEnabled
      && paintLoad >= profile.dripLoadThreshold
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
    const count = this.variant === "drip-mop" && paintLoad > 0.88 && firstRandom > 0.56 ? 2 : 1;
    const drips: DripSeed[] = [];
    for (let index = 0; index < count; index += 1) {
      const offset = (this.random() - 0.5) * size * 0.92;
      const dramatic = this.variant === "drip-mop" && this.random() > 0.82;
      const length = size * (
        profile.lengthMin
        + this.random() * profile.lengthRange
        + (dramatic ? 2.1 : 0)
      );
      drips.push({
        x: point.x + offset,
        y: point.y + size * 0.38,
        width: Math.max(1.4, size * (0.045 + paintLoad * 0.035) * (0.82 + this.random() * 0.38)),
        length,
        opacity: clamp(0.58 + paintLoad * 0.28, 0, 0.92),
        bend: (this.random() - 0.5) * length * 0.13,
        durationMs: 850 + (1 - paintLoad) * 520 + this.random() * 780,
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
