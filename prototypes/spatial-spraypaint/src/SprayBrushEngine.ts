import { StrokePoint } from "./types";

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

  public renderPoint(ctx: CanvasRenderingContext2D, point: StrokePoint, colorHex: string) {
    const radius = point.width;
    const x = point.x;
    const y = point.y;

    // 1. Dense Radial Core with Feathered Edge (Fat-Cap Profile)
    const coreGrad = ctx.createRadialGradient(x, y, 0, x, y, radius);
    coreGrad.addColorStop(0, this.hexToRgba(colorHex, 0.45 * point.opacity));
    coreGrad.addColorStop(0.4, this.hexToRgba(colorHex, 0.25 * point.opacity));
    coreGrad.addColorStop(0.8, this.hexToRgba(colorHex, 0.08 * point.opacity));
    coreGrad.addColorStop(1, "rgba(0,0,0,0)");

    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    // 2. Particulate Overspray (Realistic Aerosol Droplets)
    const particleCount = Math.floor(radius * 1.8);
    const particleRadiusMax = Math.max(1, radius * 1.5);

    ctx.fillStyle = this.hexToRgba(colorHex, 0.6 * point.opacity);

    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      // Gaussian-like distance distribution for overspray
      const dist = Math.pow(Math.random(), 1.8) * particleRadiusMax;
      const px = x + Math.cos(angle) * dist;
      const py = y + Math.sin(angle) * dist;
      const pSize = Math.random() < 0.2 ? Math.random() * 1.8 + 0.8 : Math.random() * 0.9 + 0.3;

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
