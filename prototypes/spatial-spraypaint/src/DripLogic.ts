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
