import { type MarkerVariantId } from "./DrawingTool";
import { type StrokePoint } from "./types";

export interface MarkerVariantDefinition {
  id: MarkerVariantId;
  name: string;
  defaultSize: number;
  dripTendency: number;
  material: "dense" | "calligraphy" | "wet-calligraphy" | "wet" | "high-flow";
}

export interface MarkerGeometry {
  width: number;
  opacity: number;
  direction: number;
  nibAngle: number;
  passCount: number;
  particleCount: 0;
  paintLoad: number;
  edgeStreakWidth: number;
}

export interface SweptRibbonSegment {
  startLeft: { x: number; y: number };
  startRight: { x: number; y: number };
  endLeft: { x: number; y: number };
  endRight: { x: number; y: number };
  direction: number;
}

export type MarkerJoinPolygon = readonly [
  { x: number; y: number },
  { x: number; y: number },
  { x: number; y: number },
  { x: number; y: number },
];

export const MARKER_VARIANTS: readonly MarkerVariantDefinition[] = [
  { id: "round", name: "Round Marker", defaultSize: 28, dripTendency: 0, material: "dense" },
  { id: "chisel", name: "Chisel / Calligraphy", defaultSize: 34, dripTendency: 0, material: "calligraphy" },
  { id: "clean-chisel", name: "Clean Chisel", defaultSize: 34, dripTendency: 0, material: "calligraphy" },
  { id: "drippy-chisel", name: "Drippy Chisel", defaultSize: 38, dripTendency: 0.48, material: "wet-calligraphy" },
  { id: "mop", name: "Mop", defaultSize: 44, dripTendency: 0.68, material: "wet" },
  { id: "drip-mop", name: "Drip Mop", defaultSize: 50, dripTendency: 1, material: "high-flow" },
] as const;

export const CHISEL_NIB_ANGLE = -25 * Math.PI / 180;

export function resolveMarkerCurveCornerAngle(variantId: MarkerVariantId): number | undefined {
  if (variantId === "mop" || variantId === "drip-mop") return 125;
  if (variantId === "drippy-chisel") return 78;
  return undefined;
}

interface MarkerStrokeState {
  variantId: MarkerVariantId;
  lastDirection: number | null;
  lastHalfWidth: number | null;
  lastPoint: StrokePoint | null;
  lastColor: string | null;
}

export function getMarkerVariant(id: string): MarkerVariantDefinition {
  return MARKER_VARIANTS.find((variant) => variant.id === id) ?? MARKER_VARIANTS[0];
}

export function resolveMarkerGeometry(
  variantId: MarkerVariantId,
  previous: StrokePoint | null,
  point: StrokePoint,
  directionOverride?: number,
): MarkerGeometry {
  const direction = directionOverride ?? (previous
    ? Math.atan2(point.y - previous.y, point.x - previous.x)
    : 0);
  const baseWidth = Math.max(1, point.width);
  const organicVariation = 1 + Math.sin(
    point.x * 0.031 + point.y * 0.017 + point.timestamp * 0.0007,
  ) * 0.022;
  if (isChiselVariant(variantId)) {
    const broadEdge = Math.abs(Math.sin(direction - CHISEL_NIB_ANGLE));
    const narrowRatio = variantId === "chisel" ? 0.22 : 0.3;
    return {
      width: baseWidth * (narrowRatio + broadEdge * (1 - narrowRatio)),
      opacity: 1,
      direction,
      nibAngle: CHISEL_NIB_ANGLE,
      passCount: 1,
      particleCount: 0,
      paintLoad: 0,
      edgeStreakWidth: 0,
    };
  }
  if (variantId === "mop" || variantId === "drip-mop") {
    const paintLoad = Math.max(0.22, Math.min(1, point.paintLoad ?? (variantId === "drip-mop" ? 0.68 : 0.54)));
    const speedThinning = Math.min(0.28, Math.max(0, point.velocity) * (variantId === "drip-mop" ? 0.065 : 0.085));
    const flowScale = variantId === "drip-mop" ? 1.1 : 1;
    const width = baseWidth * flowScale * (1.04 + paintLoad * 0.34 - speedThinning);
    return {
      width,
      opacity: 1,
      direction,
      nibAngle: direction,
      passCount: variantId === "drip-mop" ? 4 : 3,
      particleCount: 0,
      paintLoad,
      edgeStreakWidth: Math.max(1.2, width * (0.038 + paintLoad * 0.024)),
    };
  }
  return {
    width: baseWidth * organicVariation * (1 - Math.min(0.08, Math.max(0, point.velocity) * 0.018)),
    opacity: 1,
    direction,
    nibAngle: direction,
    passCount: 1,
    particleCount: 0,
    paintLoad: 0,
    edgeStreakWidth: 0,
  };
}

export function buildSweptRibbonSegment(
  start: StrokePoint,
  end: StrokePoint,
  startWidth: number,
  endWidth: number,
  direction: number,
): SweptRibbonSegment {
  const normalX = -Math.sin(direction);
  const normalY = Math.cos(direction);
  const startHalf = startWidth * 0.5;
  const endHalf = endWidth * 0.5;
  return {
    startLeft: { x: start.x + normalX * startHalf, y: start.y + normalY * startHalf },
    startRight: { x: start.x - normalX * startHalf, y: start.y - normalY * startHalf },
    endLeft: { x: end.x + normalX * endHalf, y: end.y + normalY * endHalf },
    endRight: { x: end.x - normalX * endHalf, y: end.y - normalY * endHalf },
    direction,
  };
}

export function smoothMarkerDirection(
  previousDirection: number | null,
  nextDirection: number,
  velocity: number,
): number {
  if (previousDirection === null) return nextDirection;
  const delta = normalizeAngle(nextDirection - previousDirection);
  if (Math.abs(delta) >= Math.PI * 0.52) return nextDirection;
  const response = Math.max(0.44, Math.min(0.74, 0.54 + velocity * 0.08));
  return previousDirection + delta * response;
}

export function smoothWetContactWidth(
  previousWidth: number,
  targetWidth: number,
  variantId: Extract<MarkerVariantId, "mop" | "drip-mop">,
): number {
  const response = variantId === "drip-mop" ? 0.24 : 0.3;
  const maximumStep = Math.max(1, previousWidth * (variantId === "drip-mop" ? 0.075 : 0.09));
  const requestedStep = (targetWidth - previousWidth) * response;
  return previousWidth + Math.max(-maximumStep, Math.min(maximumStep, requestedStep));
}

export function smoothWetMarkerDirection(
  previousDirection: number | null,
  nextDirection: number,
): number {
  if (previousDirection === null) return nextDirection;
  const delta = normalizeAngle(nextDirection - previousDirection);
  const boundedDelta = Math.max(-Math.PI * 0.34, Math.min(Math.PI * 0.34, delta));
  return previousDirection + boundedDelta * 0.42;
}

export function buildContinuousJoinPolygon(
  point: Pick<StrokePoint, "x" | "y">,
  priorDirection: number,
  nextDirection: number,
  priorHalfWidth: number,
  nextHalfWidth: number,
): MarkerJoinPolygon {
  const priorNormal = { x: -Math.sin(priorDirection), y: Math.cos(priorDirection) };
  const nextNormal = { x: -Math.sin(nextDirection), y: Math.cos(nextDirection) };
  const priorTangent = { x: Math.cos(priorDirection), y: Math.sin(priorDirection) };
  const nextTangent = { x: Math.cos(nextDirection), y: Math.sin(nextDirection) };
  const overlap = Math.max(0.8, Math.min(2, Math.min(priorHalfWidth, nextHalfWidth) * 0.14));
  const vertices = [
    {
      x: point.x + priorNormal.x * priorHalfWidth - priorTangent.x * overlap,
      y: point.y + priorNormal.y * priorHalfWidth - priorTangent.y * overlap,
    },
    {
      x: point.x + nextNormal.x * nextHalfWidth + nextTangent.x * overlap,
      y: point.y + nextNormal.y * nextHalfWidth + nextTangent.y * overlap,
    },
    {
      x: point.x - nextNormal.x * nextHalfWidth + nextTangent.x * overlap,
      y: point.y - nextNormal.y * nextHalfWidth + nextTangent.y * overlap,
    },
    {
      x: point.x - priorNormal.x * priorHalfWidth - priorTangent.x * overlap,
      y: point.y - priorNormal.y * priorHalfWidth - priorTangent.y * overlap,
    },
  ];
  vertices.sort((first, second) =>
    Math.atan2(first.y - point.y, first.x - point.x)
    - Math.atan2(second.y - point.y, second.x - point.x));
  return vertices as unknown as MarkerJoinPolygon;
}

export class PaintMarkerEngine {
  private stroke: MarkerStrokeState | null = null;

  public beginStroke(variantId: MarkerVariantId): void {
    this.stroke = {
      variantId,
      lastDirection: null,
      lastHalfWidth: null,
      lastPoint: null,
      lastColor: null,
    };
  }

  public endStroke(ctx?: CanvasRenderingContext2D): void {
    if (
      ctx
      && this.stroke
      && (this.stroke.variantId === "mop" || this.stroke.variantId === "drip-mop")
      && this.stroke.lastPoint
      && this.stroke.lastHalfWidth
      && this.stroke.lastColor
    ) {
      ctx.save();
      ctx.fillStyle = this.stroke.lastColor;
      ctx.beginPath();
      ctx.arc(
        this.stroke.lastPoint.x,
        this.stroke.lastPoint.y,
        this.stroke.lastHalfWidth,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.restore();
    }
    this.stroke = null;
  }

  public renderSegment(
    ctx: CanvasRenderingContext2D,
    previous: StrokePoint | null,
    point: StrokePoint,
    color: string,
    variantId: MarkerVariantId,
  ): void {
    if (!this.stroke || this.stroke.variantId !== variantId || !previous) this.beginStroke(variantId);
    const stroke = this.stroke!;
    const start = previous ?? point;
    const rawDirection = previous
      ? Math.atan2(point.y - previous.y, point.x - previous.x)
      : stroke.lastDirection ?? 0;
    const wetVariant = variantId === "mop" || variantId === "drip-mop" ? variantId : null;
    const direction = isChiselVariant(variantId)
      ? smoothMarkerDirection(
        stroke.lastDirection,
        rawDirection,
        variantId === "chisel" ? point.velocity : Math.min(point.velocity, 0.35),
      )
      : wetVariant
        ? smoothWetMarkerDirection(stroke.lastDirection, rawDirection)
      : rawDirection;
    const targetGeometry = resolveMarkerGeometry(variantId, previous, point, direction);
    const previousWetWidth = previous && wetVariant
      ? stroke.lastHalfWidth !== null
        ? stroke.lastHalfWidth * 2
        : resolveMarkerGeometry(wetVariant, null, previous, direction).width
      : null;
    const geometry = previousWetWidth === null || wetVariant === null
      ? targetGeometry
      : {
        ...targetGeometry,
        width: smoothWetContactWidth(previousWetWidth, targetGeometry.width, wetVariant),
      };

    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";

    if (!previous) {
      this.renderStartingFootprint(ctx, point, geometry, variantId);
    } else {
      const startHalfWidth = stroke.lastHalfWidth ?? resolveMarkerGeometry(
        variantId,
        null,
        previous,
        direction,
      ).width * 0.5;
      const ribbon = buildSweptRibbonSegment(start, point, startHalfWidth * 2, geometry.width, direction);
      this.fillRibbon(ctx, ribbon);
      if (stroke.lastDirection !== null && stroke.lastHalfWidth !== null && stroke.lastPoint) {
        this.fillContinuousJoin(ctx, stroke.lastPoint, stroke.lastDirection, direction, stroke.lastHalfWidth, startHalfWidth);
      }
      if (variantId === "round") {
        ctx.beginPath();
        ctx.arc(point.x, point.y, geometry.width * 0.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (isChiselVariant(variantId)) {
        this.renderChiselCap(ctx, point, geometry, variantId !== "chisel");
      }
      if (variantId === "mop" || variantId === "drip-mop") {
        this.renderWetEdges(ctx, ribbon, geometry, color);
      }
    }
    ctx.restore();

    stroke.lastDirection = previous ? direction : null;
    stroke.lastHalfWidth = previous ? geometry.width * 0.5 : null;
    stroke.lastPoint = { ...point };
    stroke.lastColor = color;
  }

  private fillRibbon(ctx: CanvasRenderingContext2D, ribbon: SweptRibbonSegment): void {
    ctx.beginPath();
    ctx.moveTo(ribbon.startLeft.x, ribbon.startLeft.y);
    ctx.lineTo(ribbon.endLeft.x, ribbon.endLeft.y);
    ctx.lineTo(ribbon.endRight.x, ribbon.endRight.y);
    ctx.lineTo(ribbon.startRight.x, ribbon.startRight.y);
    ctx.closePath();
    ctx.fill();
  }

  private fillContinuousJoin(
    ctx: CanvasRenderingContext2D,
    point: StrokePoint,
    priorDirection: number,
    nextDirection: number,
    priorHalfWidth: number,
    nextHalfWidth: number,
  ): void {
    const vertices = buildContinuousJoinPolygon(
      point,
      priorDirection,
      nextDirection,
      priorHalfWidth,
      nextHalfWidth,
    );
    ctx.beginPath();
    ctx.moveTo(vertices[0].x, vertices[0].y);
    for (const vertex of vertices.slice(1)) ctx.lineTo(vertex.x, vertex.y);
    ctx.closePath();
    ctx.fill();
  }

  private renderStartingFootprint(
    ctx: CanvasRenderingContext2D,
    point: StrokePoint,
    geometry: MarkerGeometry,
    variantId: MarkerVariantId,
  ): void {
    ctx.beginPath();
    if (isChiselVariant(variantId)) {
      // Direction is unknown until the first real segment. Deferring the
      // footprint lets that segment establish one clean, authoritative cap.
      return;
    } else {
      ctx.arc(point.x, point.y, geometry.width * 0.5, 0, Math.PI * 2);
    }
    ctx.fill();
  }

  private renderChiselCap(
    ctx: CanvasRenderingContext2D,
    point: StrokePoint,
    geometry: MarkerGeometry,
    clean = false,
  ): void {
    ctx.beginPath();
    ctx.ellipse(
      point.x,
      point.y,
      geometry.width * 0.5,
      clean
        ? Math.max(1.8, Math.min(4.2, geometry.width * 0.16))
        : Math.max(0.9, Math.min(2.2, geometry.width * 0.09)),
      geometry.direction + Math.PI * 0.5,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  private renderWetEdges(
    ctx: CanvasRenderingContext2D,
    ribbon: SweptRibbonSegment,
    geometry: MarkerGeometry,
    color: string,
  ): void {
    ctx.strokeStyle = adjustHex(color, -18);
    ctx.lineWidth = geometry.edgeStreakWidth;
    for (const [start, end] of [
      [ribbon.startLeft, ribbon.endLeft],
      [ribbon.startRight, ribbon.endRight],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }
    if (geometry.paintLoad > 0.72) {
      const inset = 0.18;
      ctx.strokeStyle = adjustHex(color, 10);
      ctx.lineWidth = Math.max(0.8, geometry.edgeStreakWidth * 0.55);
      ctx.beginPath();
      ctx.moveTo(
        ribbon.startLeft.x + (ribbon.startRight.x - ribbon.startLeft.x) * inset,
        ribbon.startLeft.y + (ribbon.startRight.y - ribbon.startLeft.y) * inset,
      );
      ctx.lineTo(
        ribbon.endLeft.x + (ribbon.endRight.x - ribbon.endLeft.x) * inset,
        ribbon.endLeft.y + (ribbon.endRight.y - ribbon.endLeft.y) * inset,
      );
      ctx.stroke();
    }
  }
}

function isChiselVariant(variantId: MarkerVariantId): boolean {
  return variantId === "chisel" || variantId === "clean-chisel" || variantId === "drippy-chisel";
}

function normalizeAngle(value: number): number {
  let normalized = value;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  while (normalized < -Math.PI) normalized += Math.PI * 2;
  return normalized;
}

function adjustHex(hex: string, amount: number): string {
  let value = hex.replace("#", "");
  if (value.length === 3) value = value.split("").map((channel) => channel + channel).join("");
  const numeric = Number.parseInt(value, 16);
  const channel = (shift: number) => Math.max(0, Math.min(255, ((numeric >> shift) & 255) + amount));
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}
