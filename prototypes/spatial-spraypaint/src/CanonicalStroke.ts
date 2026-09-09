import { StrokePoint } from "./types";

export function resolveInterpolationSpacing(baseRadius: number, velocity: number): number {
  const radiusSpacing = Math.max(0.8, Math.min(3.2, baseRadius * 0.08));
  const velocityDensity = Math.max(0.55, Math.min(1, 1 - velocity * 0.12));
  return radiusSpacing * velocityDensity;
}

export class CanonicalStrokeManager {
  private lastPoint: StrokePoint | null = null;

  public createPoint(
    x: number,
    y: number,
    baseRadius: number,
    z: number = 0,
    timestamp: number = performance.now(),
  ): { point: StrokePoint; interpolated: StrokePoint[]; previous: StrokePoint | null } {
    const previous = this.lastPoint;
    const now = timestamp;
    let velocity = 0;

    if (this.lastPoint) {
      const dt = Math.max(1, now - this.lastPoint.timestamp);
      const dx = x - this.lastPoint.x;
      const dy = y - this.lastPoint.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      velocity = dist / dt; // wall units per ms
    }

    // Keep speed expression restrained so starts/stops do not form oversized bulbs.
    const velocityFactor = Math.max(0.82, Math.min(1.06, 1.02 - velocity * 0.11));
    const width = baseRadius * velocityFactor;
    const opacity = Math.max(0.3, Math.min(1.0, 0.8 + velocityFactor * 0.2));

    const currentPoint: StrokePoint = {
      x,
      y,
      z,
      timestamp: now,
      velocity,
      width,
      opacity,
    };

    const interpolatedPoints: StrokePoint[] = [];

    // Bound every wall-space segment, increasing deposition density for fast movement.
    if (this.lastPoint) {
      const dx = x - this.lastPoint.x;
      const dy = y - this.lastPoint.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const stepSize = resolveInterpolationSpacing(baseRadius, velocity);

      if (dist > stepSize) {
        const segments = Math.ceil(dist / stepSize);
        for (let i = 1; i < segments; i++) {
          const t = i / segments;
          interpolatedPoints.push({
            x: this.lastPoint.x + dx * t,
            y: this.lastPoint.y + dy * t,
            z: (this.lastPoint.z || 0) + ((z - (this.lastPoint.z || 0)) * t),
            timestamp: this.lastPoint.timestamp + (now - this.lastPoint.timestamp) * t,
            velocity,
            width: this.lastPoint.width + (width - this.lastPoint.width) * t,
            opacity: this.lastPoint.opacity + (opacity - this.lastPoint.opacity) * t,
          });
        }
      }
    }

    this.lastPoint = currentPoint;
    return { point: currentPoint, interpolated: interpolatedPoints, previous };
  }

  public reset() {
    this.lastPoint = null;
  }
}
