import { StrokePoint } from "./types";

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
      velocity = dist / dt; // pixels per ms
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

    // Interpolate points if moving quickly to eliminate disconnected dot artifacts
    if (this.lastPoint) {
      const dx = x - this.lastPoint.x;
      const dy = y - this.lastPoint.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const stepSize = Math.max(1.25, Math.min(4, baseRadius * 0.1));

      if (dist > stepSize) {
        const steps = Math.floor(dist / stepSize);
        for (let i = 1; i < steps; i++) {
          const t = i / steps;
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
