import { type MarkerVariantId } from "./DrawingTool";
import { PaintMarkerEngine, getMarkerVariant } from "./PaintMarkerEngine";
import { SprayBrushEngine } from "./SprayBrushEngine";
import { type SprayCapId } from "./SprayCapPresets";
import { getSprayCapProfile } from "./SprayCapProfile";
import { type StrokePoint } from "./types";
import { type DripSeed } from "./DripLogic";
import { WetDripEngine } from "./WetDripEngine";

interface BaseToolStrokeStyle {
  color: string;
  size: number;
  /** Spray-only build-up authority, independent of velocity. 1 preserves current default density. */
  coverage?: number;
  /** Spray-only per-stroke fill ceiling. Falsy/absent preserves current default behavior exactly. */
  fillMode?: boolean;
}

export type ToolStrokeStyle = BaseToolStrokeStyle & (
  | { toolId: "spray-can"; variantId: SprayCapId }
  | { toolId: "paint-marker"; variantId: MarkerVariantId }
);

export class DrawingToolRenderer {
  private readonly spray = new SprayBrushEngine();
  private readonly marker = new PaintMarkerEngine();
  private readonly wetDrips = new WetDripEngine();

  public beginStroke(style: ToolStrokeStyle): void {
    if (style.toolId === "paint-marker") this.marker.beginStroke(style.variantId);
    else this.spray.beginStroke();
  }

  public endStroke(ctx?: CanvasRenderingContext2D): void {
    this.marker.endStroke(ctx);
  }

  public resize(width: number, height: number): void {
    this.spray.resize(width, height);
  }

  public clear(): void {
    this.spray.clear();
    this.wetDrips.clear();
    this.marker.endStroke();
  }

  public renderSegment(
    ctx: CanvasRenderingContext2D,
    previous: StrokePoint | null,
    point: StrokePoint,
    style: ToolStrokeStyle,
    random: () => number = Math.random,
  ): void {
    if (style.toolId === "spray-can") {
      this.spray.renderSegment(
        ctx,
        previous,
        point,
        style.color,
        getSprayCapProfile(style.variantId).deposition,
        random,
        style.coverage ?? 1,
        style.fillMode ?? false,
      );
      return;
    }
    this.marker.renderSegment(ctx, previous, point, style.color, style.variantId);
  }

  public dripTendency(style: ToolStrokeStyle): number {
    return style.toolId === "spray-can"
      ? getSprayCapProfile(style.variantId).deposition.dripTendency
      : getMarkerVariant(style.variantId).dripTendency;
  }

  public startDrip(seed: DripSeed, color: string, now: number): void {
    if (seed.renderAsOverlay) {
      this.wetDrips.startDrip(seed, color, now);
      return;
    }
    this.spray.startDrip(seed, color, now);
  }

  public advanceDrips(
    ctx: CanvasRenderingContext2D,
    now: number,
    wetOverlayCtx?: CanvasRenderingContext2D,
    wetPersistentCtx: CanvasRenderingContext2D = ctx,
  ): void {
    this.spray.advanceDrips(ctx, now);
    if (wetOverlayCtx) this.wetDrips.advanceDrips(wetPersistentCtx, wetOverlayCtx, now);
  }

  public renderCompletedDrip(ctx: CanvasRenderingContext2D, drip: DripSeed, color: string): void {
    if (drip.renderAsOverlay) {
      this.wetDrips.renderCompletedDrip(ctx, drip, color);
      return;
    }
    this.spray.renderCompletedDrip(ctx, drip, color);
  }
}
