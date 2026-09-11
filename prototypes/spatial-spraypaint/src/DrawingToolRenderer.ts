import { type MarkerVariantId } from "./DrawingTool";
import { PaintMarkerEngine, getMarkerVariant } from "./PaintMarkerEngine";
import { SprayBrushEngine } from "./SprayBrushEngine";
import { type SprayCapId } from "./SprayCapPresets";
import { getSprayCapProfile } from "./SprayCapProfile";
import { type StrokePoint } from "./types";
import { type DripSeed } from "./DripLogic";

interface BaseToolStrokeStyle {
  color: string;
  size: number;
}

export type ToolStrokeStyle = BaseToolStrokeStyle & (
  | { toolId: "spray-can"; variantId: SprayCapId }
  | { toolId: "paint-marker"; variantId: MarkerVariantId }
);

export class DrawingToolRenderer {
  private readonly spray = new SprayBrushEngine();
  private readonly marker = new PaintMarkerEngine();

  public beginStroke(style: ToolStrokeStyle): void {
    if (style.toolId === "paint-marker") this.marker.beginStroke(style.variantId);
  }

  public endStroke(): void {
    this.marker.endStroke();
  }

  public resize(width: number, height: number): void {
    this.spray.resize(width, height);
  }

  public clear(): void {
    this.spray.clear();
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
    this.spray.startDrip(seed, color, now);
  }

  public advanceDrips(ctx: CanvasRenderingContext2D, now: number): void {
    this.spray.advanceDrips(ctx, now);
  }

  public renderCompletedDrip(ctx: CanvasRenderingContext2D, drip: DripSeed, color: string): void {
    this.spray.renderCompletedDrip(ctx, drip, color);
  }
}
