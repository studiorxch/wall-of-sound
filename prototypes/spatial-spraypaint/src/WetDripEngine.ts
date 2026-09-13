import { buildContinuousDripStrip, type DripSeed, type DripStripSection } from "./DripLogic";

interface ActiveWetDrip extends DripSeed {
  color: string;
  startedAt: number;
  durationMs: number;
}

export class WetDripEngine {
  private activeDrips: ActiveWetDrip[] = [];

  public clear(): void {
    this.activeDrips = [];
  }

  public startDrip(seed: DripSeed, color: string, now: number): void {
    this.activeDrips.push({
      ...seed,
      color,
      startedAt: now,
      durationMs: seed.durationMs ?? 1200,
    });
  }

  public advanceDrips(
    persistentCtx: CanvasRenderingContext2D,
    overlayCtx: CanvasRenderingContext2D,
    now: number,
  ): void {
    this.activeDrips = this.activeDrips.filter((drip) => {
      const progress = Math.min(1, Math.max(0, (now - drip.startedAt) / drip.durationMs));
      if (progress >= 1) {
        this.renderCompletedDrip(persistentCtx, drip, drip.color);
        return false;
      }
      if (progress > 0) this.renderGrowingDrip(overlayCtx, drip, progress);
      return true;
    });
  }

  public renderCompletedDrip(
    ctx: CanvasRenderingContext2D,
    drip: DripSeed,
    color: string,
  ): void {
    const strip = buildContinuousDripStrip(drip, 24);
    ctx.save();
    ctx.fillStyle = this.createGradient(ctx, drip, color);
    this.fillStrip(ctx, strip);
    this.fillRoundedTip(ctx, strip[strip.length - 1], drip.terminalBulbRatio);
    ctx.restore();
  }

  private renderGrowingDrip(
    ctx: CanvasRenderingContext2D,
    drip: ActiveWetDrip,
    progress: number,
  ): void {
    const sectionCount = Math.max(4, Math.ceil(progress * 24));
    const strip = buildContinuousDripStrip(drip, sectionCount, progress);
    ctx.save();
    ctx.fillStyle = this.createGradient(ctx, drip, drip.color);
    this.fillStrip(ctx, strip);
    this.fillRoundedTip(ctx, strip[strip.length - 1], drip.terminalBulbRatio);
    ctx.restore();
  }

  private createGradient(
    ctx: CanvasRenderingContext2D,
    drip: DripSeed,
    color: string,
  ): CanvasGradient {
    const gradient = ctx.createLinearGradient(
      drip.x,
      drip.y,
      drip.x + (drip.bend ?? 0),
      drip.y + drip.length,
    );
    gradient.addColorStop(0, hexToRgba(color, 1));
    gradient.addColorStop(0.16, hexToRgba(color, Math.min(0.96, drip.opacity + 0.08)));
    gradient.addColorStop(1, hexToRgba(color, drip.opacity * 0.82));
    return gradient;
  }

  private fillStrip(
    ctx: CanvasRenderingContext2D,
    sections: readonly DripStripSection[],
  ): void {
    if (sections.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(sections[0].left.x, sections[0].left.y);
    for (const section of sections.slice(1)) ctx.lineTo(section.left.x, section.left.y);
    for (const section of [...sections].reverse()) ctx.lineTo(section.right.x, section.right.y);
    ctx.closePath();
    ctx.fill();
  }

  private fillRoundedTip(
    ctx: CanvasRenderingContext2D,
    tip: DripStripSection,
    terminalBulbRatio = 0.5,
  ): void {
    ctx.beginPath();
    ctx.arc(
      tip.center.x,
      tip.center.y,
      Math.max(0.7, tip.width * terminalBulbRatio * 0.5),
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
}

function hexToRgba(hex: string, alpha: number): string {
  let value = hex.replace("#", "");
  if (value.length === 3) value = value.split("").map((channel) => channel + channel).join("");
  const numeric = Number.parseInt(value, 16);
  const red = (numeric >> 16) & 255;
  const green = (numeric >> 8) & 255;
  const blue = numeric & 255;
  return `rgba(${red}, ${green}, ${blue}, ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}
