import { type MarkerVariantId } from "./DrawingTool";
import { type StrokePoint } from "./types";

export interface MarkerVariantDefinition {
  id: MarkerVariantId;
  name: string;
  defaultSize: number;
  dripTendency: number;
}

export interface MarkerGeometry {
  width: number;
  opacity: number;
  direction: number;
  nibAngle: number;
  passCount: number;
  particleCount: 0;
}

export const MARKER_VARIANTS: readonly MarkerVariantDefinition[] = [
  { id: "round", name: "Round Marker", defaultSize: 28, dripTendency: 0.04 },
  { id: "chisel", name: "Chisel / Calligraphy", defaultSize: 34, dripTendency: 0.08 },
  { id: "mop", name: "Mop / Drip Mop", defaultSize: 46, dripTendency: 0.96 },
] as const;

const CHISEL_NIB_ANGLE = -25 * Math.PI / 180;

export function getMarkerVariant(id: string): MarkerVariantDefinition {
  return MARKER_VARIANTS.find((variant) => variant.id === id) ?? MARKER_VARIANTS[0];
}

export function resolveMarkerGeometry(
  variantId: MarkerVariantId,
  previous: StrokePoint | null,
  point: StrokePoint,
): MarkerGeometry {
  const direction = previous
    ? Math.atan2(point.y - previous.y, point.x - previous.x)
    : 0;
  const baseWidth = Math.max(1, point.width);
  if (variantId === "chisel") {
    const broadEdge = Math.abs(Math.sin(direction - CHISEL_NIB_ANGLE));
    return {
      width: baseWidth * (0.24 + broadEdge * 0.76),
      opacity: 0.96,
      direction,
      nibAngle: CHISEL_NIB_ANGLE,
      passCount: 1,
      particleCount: 0,
    };
  }
  if (variantId === "mop") {
    const speedThinning = Math.min(0.42, Math.max(0, point.velocity) * 0.12);
    return {
      width: baseWidth * (1.42 - speedThinning),
      opacity: Math.min(1, 0.82 + Math.max(0, 0.16 - point.velocity * 0.025)),
      direction,
      nibAngle: direction,
      passCount: 3,
      particleCount: 0,
    };
  }
  return {
    width: baseWidth * (1 - Math.min(0.12, Math.max(0, point.velocity) * 0.025)),
    opacity: 0.94,
    direction,
    nibAngle: direction,
    passCount: 1,
    particleCount: 0,
  };
}

export class PaintMarkerEngine {
  public renderSegment(
    ctx: CanvasRenderingContext2D,
    previous: StrokePoint | null,
    point: StrokePoint,
    color: string,
    variantId: MarkerVariantId,
  ): void {
    const geometry = resolveMarkerGeometry(variantId, previous, point);
    const start = previous ?? point;
    const normalX = -Math.sin(geometry.direction);
    const normalY = Math.cos(geometry.direction);

    ctx.save();
    ctx.lineJoin = variantId === "chisel" ? "miter" : "round";
    ctx.lineCap = variantId === "chisel" ? "butt" : "round";
    for (let pass = 0; pass < geometry.passCount; pass += 1) {
      const passOffset = geometry.passCount === 1
        ? 0
        : (pass - (geometry.passCount - 1) / 2) * geometry.width * 0.11;
      const edgePass = geometry.passCount > 1 && pass !== 1;
      ctx.strokeStyle = hexToRgba(color, geometry.opacity * point.opacity * (edgePass ? 0.5 : 0.78));
      ctx.lineWidth = geometry.width * (edgePass ? 0.24 : 0.82);
      ctx.beginPath();
      ctx.moveTo(start.x + normalX * passOffset, start.y + normalY * passOffset);
      ctx.lineTo(point.x + normalX * passOffset, point.y + normalY * passOffset);
      ctx.stroke();
    }

    if (!previous) {
      ctx.fillStyle = hexToRgba(color, geometry.opacity * point.opacity);
      ctx.beginPath();
      if (variantId === "chisel") {
        ctx.ellipse(
          point.x,
          point.y,
          geometry.width * 0.5,
          Math.max(1, point.width * 0.12),
          geometry.nibAngle,
          0,
          Math.PI * 2,
        );
      } else {
        ctx.arc(point.x, point.y, geometry.width * 0.41, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    ctx.restore();
  }
}

function hexToRgba(hex: string, alpha: number): string {
  let value = hex.replace("#", "");
  if (value.length === 3) value = value.split("").map((channel) => channel + channel).join("");
  const numeric = Number.parseInt(value, 16);
  return `rgba(${(numeric >> 16) & 255}, ${(numeric >> 8) & 255}, ${numeric & 255}, ${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}
