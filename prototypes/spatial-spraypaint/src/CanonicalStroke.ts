import { StrokePoint } from "./types";

export class CanonicalStrokeManager {
  private lastPoint: StrokePoint | null = null;

  public createPoint(
    x: number,
    y: number,
    baseRadius: number,
    z: number = 0
  ): { point: StrokePoint; interpolated: StrokePoint[] } {
    const now = performance.now();
    let velocity = 0;

    if (this.lastPoint) {
      const dt = Math.max(1, now - this.lastPoint.timestamp);
      const dx = x - this.lastPoint.x;
      const dy = y - this.lastPoint.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      velocity = dist / dt; // pixels per ms
    }

    // Velocity-based dynamic width adjustment (slower -> denser/slightly wider, faster -> thinner)
    const velocityFactor = Math.max(0.5, Math.min(1.4, 1 - velocity * 0.15));
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
      const stepSize = Math.max(2, baseRadius * 0.25);

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
    return { point: currentPoint, interpolated: interpolatedPoints };
  }

  public reset() {
    this.lastPoint = null;
  }
}
