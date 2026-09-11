import { type DripSeed } from "./DripLogic";
import { resolveSprayDynamics, type SprayCapPreset } from "./SprayCapPresets";
import { type StrokePoint } from "./types";

interface ActiveDrip extends DripSeed {
  color: string;
  startedAt: number;
  lastProgress: number;
  bend: number;
  durationMs: number;
}

export function createStrokeRandom(seed: number): () => number {
  let state = (seed || 1) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export class SprayBrushEngine {
  private activeDrips: ActiveDrip[] = [];

  public resize(_width: number, _height: number): void {
    // The brush deposits directly into the persistent paint canvas.
  }

  public clear(): void {
    this.activeDrips = [];
  }

  public renderSegment(
    ctx: CanvasRenderingContext2D,
    previous: StrokePoint | null,
    point: StrokePoint,
    colorHex: string,
    cap: SprayCapPreset,
    random: () => number = Math.random,
  ): void {
    const dynamics = resolveSprayDynamics(cap, point.velocity, point.width);
    const start = previous ?? point;
    const dx = point.x - start.x;
    const dy = point.y - start.y;
    const distance = Math.hypot(dx, dy);
    const angle = distance > 0 ? Math.atan2(dy, dx) : 0;
    const passOpacity = (dynamics.coreOpacity * point.opacity) / Math.sqrt(dynamics.corePasses);

    ctx.save();
    ctx.lineCap = cap.endpointBehavior === "raw" ? "butt" : "round";
    ctx.lineJoin = "round";

    for (let pass = dynamics.corePasses - 1; pass >= 0; pass -= 1) {
      const passRatio = dynamics.corePasses === 1 ? 0 : pass / (dynamics.corePasses - 1);
      const edgeExpansion = 1 + passRatio * (1 - cap.edgeFalloff) * 0.72;
      const jitterX = (random() - 0.5) * dynamics.jitter;
      const jitterY = (random() - 0.5) * dynamics.jitter;
      const endpointScale = previous ? 1 : cap.endpointBehavior === "punchy" ? 0.82 : 0.68;
      ctx.strokeStyle = this.hexToRgba(colorHex, passOpacity * (1 - passRatio * 0.48));
      ctx.lineWidth = Math.max(0.7, dynamics.radius * 2 * dynamics.anisotropy * edgeExpansion * endpointScale);
      ctx.beginPath();
      ctx.moveTo(start.x + jitterX, start.y + jitterY);
      ctx.lineTo(point.x + jitterX, point.y + jitterY);
      ctx.stroke();
    }

    ctx.restore();
    this.renderOverspray(ctx, start, point, colorHex, dynamics, angle, distance, random);
  }

  public startDrip(seed: DripSeed, color: string, now = performance.now()): void {
    this.activeDrips.push({
      ...seed,
      color,
      startedAt: now,
      lastProgress: 0,
      bend: seed.bend ?? (Math.random() - 0.5) * seed.length * 0.12,
      durationMs: seed.durationMs ?? 1200,
    });
  }

  public advanceDrips(ctx: CanvasRenderingContext2D, now = performance.now()): void {
    this.activeDrips = this.activeDrips.filter((drip) => {
      const progress = Math.min(1, Math.max(0, (now - drip.startedAt) / drip.durationMs));
      if (progress <= drip.lastProgress) return progress < 1;

      const easedPrevious = drip.lastProgress * drip.lastProgress;
      const easedCurrent = progress * progress;
      const startX = drip.x + drip.bend * easedPrevious;
      const startY = drip.y + drip.length * easedPrevious;
      const endX = drip.x + drip.bend * easedCurrent;
      const endY = drip.y + drip.length * easedCurrent;

      ctx.save();
      ctx.lineCap = "round";
      ctx.strokeStyle = this.hexToRgba(drip.color, drip.opacity * (1 - progress * 0.24));
      ctx.lineWidth = Math.max(0.8, drip.width * (1 - progress * 0.42));
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      ctx.restore();

      drip.lastProgress = progress;
      return progress < 1;
    });
  }

  public renderCompletedDrip(
    ctx: CanvasRenderingContext2D,
    drip: DripSeed,
    color: string,
  ): void {
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = this.hexToRgba(color, drip.opacity * 0.76);
    ctx.lineWidth = Math.max(0.8, drip.width * 0.72);
    ctx.beginPath();
    ctx.moveTo(drip.x, drip.y);
    ctx.lineTo(drip.x + (drip.bend ?? 0), drip.y + drip.length);
    ctx.stroke();
    ctx.restore();
  }

  private renderOverspray(
    ctx: CanvasRenderingContext2D,
    start: StrokePoint,
    point: StrokePoint,
    color: string,
    dynamics: ReturnType<typeof resolveSprayDynamics>,
    angle: number,
    distance: number,
    random: () => number,
  ): void {
    const segmentFactor = Math.max(0.3, Math.min(1.6, distance / Math.max(1, dynamics.radius) + 0.32));
    const count = Math.round(dynamics.particleCount * segmentFactor);
    ctx.fillStyle = this.hexToRgba(color, dynamics.particleOpacity * point.opacity);

    for (let index = 0; index < count; index += 1) {
      const along = random();
      const centerX = start.x + (point.x - start.x) * along;
      const centerY = start.y + (point.y - start.y) * along;
      const spreadAngle = random() * Math.PI * 2;
      const spread = Math.pow(random(), 1.55) * dynamics.particleSpread;
      const directionalX = Math.cos(spreadAngle) * spread;
      const directionalY = Math.sin(spreadAngle) * spread;
      const anisotropicX = directionalX * Math.cos(angle) - directionalY * dynamics.anisotropy * Math.sin(angle);
      const anisotropicY = directionalX * Math.sin(angle) + directionalY * dynamics.anisotropy * Math.cos(angle);
      const splatter = random() < dynamics.splatterProbability ? 1.8 + random() * 1.8 : 1;
      const particleSize = Math.max(0.18, dynamics.particleSize * splatter * (0.45 + random() * 0.9));

      ctx.beginPath();
      ctx.arc(centerX + anisotropicX, centerY + anisotropicY, particleSize, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private hexToRgba(hex: string, alpha: number): string {
    let value = hex.replace("#", "");
    if (value.length === 3) value = value.split("").map((channel) => channel + channel).join("");
    const numeric = Number.parseInt(value, 16);
    const red = (numeric >> 16) & 255;
    const green = (numeric >> 8) & 255;
    const blue = numeric & 255;
    return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
  }
}
