import { StrokePoint } from "./types";
import { resolveSprayDynamics, type SprayCapPreset } from "./SprayCapPresets";

export class SprayBrushEngine {
  private offscreenCanvas: HTMLCanvasElement;
  private offscreenCtx: CanvasRenderingContext2D;

  constructor() {
    this.offscreenCanvas = document.createElement("canvas");
    this.offscreenCtx = this.offscreenCanvas.getContext("2d")!;
  }

  public resize(width: number, height: number) {
    this.offscreenCanvas.width = width;
    this.offscreenCanvas.height = height;
  }

  public clear() {
    this.offscreenCtx.clearRect(0, 0, this.offscreenCanvas.width, this.offscreenCanvas.height);
  }

  public renderPoint(
    ctx: CanvasRenderingContext2D,
    point: StrokePoint,
    colorHex: string,
    cap: SprayCapPreset,
  ) {
    const dynamics = resolveSprayDynamics(cap, point.velocity, point.width);
    const radius = dynamics.radius;
    const x = point.x;
    const y = point.y;

    // Layering creates physical accumulation without brightening the paint color.
    for (let pass = 0; pass < dynamics.corePasses; pass += 1) {
      const jitter = dynamics.corePasses > 1 ? radius * 0.018 : 0;
      const coreX = x + (Math.random() - 0.5) * jitter;
      const coreY = y + (Math.random() - 0.5) * jitter;
      const coreGrad = ctx.createRadialGradient(coreX, coreY, 0, coreX, coreY, radius);
      const passOpacity = (dynamics.coreOpacity * point.opacity) / Math.sqrt(dynamics.corePasses);
      coreGrad.addColorStop(0, this.hexToRgba(colorHex, passOpacity));
      coreGrad.addColorStop(
        Math.min(0.92, Math.max(0.08, cap.edgeFalloff)),
        this.hexToRgba(colorHex, passOpacity * 0.58),
      );
      coreGrad.addColorStop(1, this.hexToRgba(colorHex, 0));

      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(coreX, coreY, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Fine overspray replaces the old large, obvious particle halo.
    ctx.fillStyle = this.hexToRgba(colorHex, dynamics.particleOpacity * point.opacity);

    for (let i = 0; i < dynamics.particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.pow(Math.random(), 1.35) * dynamics.particleSpread;
      const px = x + Math.cos(angle) * dist;
      const py = y + Math.sin(angle) * dist;
      const pSize = Math.max(0.18, dynamics.particleSize * (0.45 + Math.random() * 0.9));

      ctx.beginPath();
      ctx.arc(px, py, pSize, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private hexToRgba(hex: string, alpha: number): string {
    let c = hex.replace("#", "");
    if (c.length === 3) c = c.split("").map((x) => x + x).join("");
    const num = parseInt(c, 16);
    const r = (num >> 16) & 255;
    const g = (num >> 8) & 255;
    const b = num & 255;
    return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
  }
}
