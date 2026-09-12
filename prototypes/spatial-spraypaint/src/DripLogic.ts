export interface DripObservation {
  x: number;
  y: number;
  radius: number;
  timestamp: number;
  dripTendency: number;
  enabled: boolean;
}

export interface DripSeed {
  x: number;
  y: number;
  width: number;
  length: number;
  opacity: number;
  bend?: number;
  durationMs?: number;
  tipWidthRatio?: number;
  originPoolRadius?: number;
  terminalBulbRatio?: number;
}

export interface DripStripSection {
  progress: number;
  center: { x: number; y: number };
  left: { x: number; y: number };
  right: { x: number; y: number };
  width: number;
}

export function resolveDripStripSection(
  drip: DripSeed,
  progress: number,
): DripStripSection {
  const safeProgress = Math.min(1, Math.max(0, progress));
  const eased = safeProgress * safeProgress;
  const bend = drip.bend ?? 0;
  const center = {
    x: drip.x + bend * eased,
    y: drip.y + drip.length * eased,
  };
  const tangentX = Math.abs(safeProgress) > 0.0001 ? 2 * bend * safeProgress : bend;
  const tangentY = Math.abs(safeProgress) > 0.0001 ? 2 * drip.length * safeProgress : drip.length;
  const tangentLength = Math.max(0.0001, Math.hypot(tangentX, tangentY));
  const normal = { x: -tangentY / tangentLength, y: tangentX / tangentLength };
  const tipWidthRatio = drip.tipWidthRatio ?? 0.58;
  const width = Math.max(0.8, drip.width * (1 - (1 - tipWidthRatio) * safeProgress));
  return {
    progress: safeProgress,
    center,
    left: { x: center.x + normal.x * width * 0.5, y: center.y + normal.y * width * 0.5 },
    right: { x: center.x - normal.x * width * 0.5, y: center.y - normal.y * width * 0.5 },
    width,
  };
}

export function buildContinuousDripStrip(
  drip: DripSeed,
  segmentCount = 12,
): DripStripSection[] {
  const count = Math.max(2, Math.floor(segmentCount));
  return Array.from({ length: count + 1 }, (_, index) =>
    resolveDripStripSection(drip, index / count));
}

export class DripAccumulator {
  private anchor: { x: number; y: number } | null = null;
  private lastTimestamp = 0;
  private dwellMilliseconds = 0;
  private lastDripTimestamp = -Infinity;

  public observe(observation: DripObservation): DripSeed | null {
    if (!observation.enabled || observation.dripTendency <= 0) {
      this.reset();
      return null;
    }

    const now = observation.timestamp;
    const dwellRadius = Math.max(5, observation.radius * 0.22);
    if (!this.anchor) {
      this.anchor = { x: observation.x, y: observation.y };
      this.lastTimestamp = now;
      return null;
    }

    const delta = Math.max(0, Math.min(100, now - this.lastTimestamp));
    const distance = Math.hypot(observation.x - this.anchor.x, observation.y - this.anchor.y);
    this.lastTimestamp = now;

    if (distance > dwellRadius) {
      this.anchor = { x: observation.x, y: observation.y };
      this.dwellMilliseconds = 0;
      return null;
    }

    this.dwellMilliseconds += delta;
    const tendency = Math.min(1, observation.dripTendency);
    const threshold = 1050 - tendency * 520;
    if (
      this.dwellMilliseconds < threshold ||
      now - this.lastDripTimestamp < 1250
    ) {
      return null;
    }

    this.lastDripTimestamp = now;
    this.dwellMilliseconds = threshold * 0.28;
    return {
      x: this.anchor.x,
      y: this.anchor.y + observation.radius * 0.35,
      width: Math.max(1.2, observation.radius * (0.045 + tendency * 0.035)),
      length: observation.radius * (0.9 + tendency * 2.2),
      opacity: 0.48 + tendency * 0.3,
    };
  }

  public reset(): void {
    this.anchor = null;
    this.lastTimestamp = 0;
    this.dwellMilliseconds = 0;
  }
}
