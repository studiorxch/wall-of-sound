export type SmoothingLevel = "off" | "low" | "medium" | "high";

export interface StrokeCoordinate {
  x: number;
  y: number;
}

const BASE_RESPONSE: Record<SmoothingLevel, number> = {
  off: 1,
  low: 0.62,
  medium: 0.42,
  high: 0.26,
};

export class StrokeSmoother {
  private point: StrokeCoordinate | null = null;

  public smooth(raw: StrokeCoordinate, level: SmoothingLevel): StrokeCoordinate {
    if (!this.point || level === "off") {
      this.point = { ...raw };
      return { ...raw };
    }

    const distance = Math.hypot(raw.x - this.point.x, raw.y - this.point.y);
    const adaptiveResponse = Math.min(0.9, BASE_RESPONSE[level] + distance / 180);
    this.point = {
      x: this.point.x + (raw.x - this.point.x) * adaptiveResponse,
      y: this.point.y + (raw.y - this.point.y) * adaptiveResponse,
    };
    return { ...this.point };
  }

  public reset(): void {
    this.point = null;
  }
}
