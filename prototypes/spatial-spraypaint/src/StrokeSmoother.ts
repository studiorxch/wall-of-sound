export type SmoothingLevel = "off" | "low" | "medium" | "high";

export interface StrokeCoordinate {
  x: number;
  y: number;
}

export type StrokeInputKind = "mouse" | "pen" | "touch" | "hand";

const BASE_RESPONSE: Record<SmoothingLevel, number> = {
  off: 1,
  low: 0.62,
  medium: 0.42,
  high: 0.26,
};

export class StrokeSmoother {
  private point: StrokeCoordinate | null = null;
  private previousRaw: StrokeCoordinate | null = null;
  private priorRaw: StrokeCoordinate | null = null;

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

  /**
   * Input-aware entry point for the canonical pre-render smoothing stage.
   * Pen/touch/Hand deliberately retain `smooth()`'s established behavior;
   * only mouse receives the extra jitter suppression needed to compensate
   * for its coarser event trajectory.
   */
  public smoothInput(
    raw: StrokeCoordinate,
    level: SmoothingLevel,
    input: StrokeInputKind,
    final = false,
  ): StrokeCoordinate {
    if (input !== "mouse") return this.smooth(raw, level);
    if (!this.point || level === "off" || final) {
      this.priorRaw = this.previousRaw;
      this.previousRaw = { ...raw };
      this.point = { ...raw };
      return { ...raw };
    }

    const distance = Math.hypot(raw.x - this.point.x, raw.y - this.point.y);
    const priorRaw = this.previousRaw;
    let cornerResponse = 0;
    if (priorRaw && this.priorRaw) {
      const incoming = { x: priorRaw.x - this.priorRaw.x, y: priorRaw.y - this.priorRaw.y };
      const outgoing = { x: raw.x - priorRaw.x, y: raw.y - priorRaw.y };
      const incomingLength = Math.hypot(incoming.x, incoming.y);
      const outgoingLength = Math.hypot(outgoing.x, outgoing.y);
      if (incomingLength > 3 && outgoingLength > 3) {
        const cosine = Math.max(-1, Math.min(1,
          (incoming.x * outgoing.x + incoming.y * outgoing.y) / (incomingLength * outgoingLength),
        ));
        const turnDegrees = Math.acos(cosine) * 180 / Math.PI;
        if (turnDegrees >= 55) cornerResponse = 0.82;
      }
    }

    // Unlike the generic path, large mouse deltas do not automatically
    // become less filtered: fast mouse motion is where event-to-event jitter
    // is most visible. Deliberate corners bypass most of that filtering.
    const mouseBase = Math.max(0.18, BASE_RESPONSE[level] - 0.09);
    const speedSuppression = Math.min(0.08, distance / 600);
    const response = Math.max(mouseBase - speedSuppression, cornerResponse);
    this.point = {
      x: this.point.x + (raw.x - this.point.x) * response,
      y: this.point.y + (raw.y - this.point.y) * response,
    };
    this.priorRaw = this.previousRaw;
    this.previousRaw = { ...raw };
    return { ...this.point };
  }

  public reset(): void {
    this.point = null;
    this.previousRaw = null;
    this.priorRaw = null;
  }
}
