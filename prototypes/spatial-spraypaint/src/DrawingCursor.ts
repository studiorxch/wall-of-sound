import { type ToolStrokeStyle } from "./DrawingToolRenderer";
import { CHISEL_NIB_ANGLE, resolveMarkerGeometry } from "./PaintMarkerEngine";
import { getSprayCapProfile } from "./SprayCapProfile";
import { type WallPoint } from "./WallView";

export type DrawingCursorShape = "circle" | "ellipse" | "chisel";

export interface DrawingCursorGeometry {
  shape: DrawingCursorShape;
  width: number;
  height: number;
  angle: number;
  toolId: ToolStrokeStyle["toolId"];
  variantId: ToolStrokeStyle["variantId"];
}

export interface DrawingCursorAimState {
  point: WallPoint | null;
  angle: number;
}

export function resolveDrawingCursorAim(
  previous: DrawingCursorAimState,
  point: WallPoint,
): DrawingCursorAimState {
  const distance = previous.point
    ? Math.hypot(point.x - previous.point.x, point.y - previous.point.y)
    : 0;
  return {
    point: { ...point },
    angle: distance >= 0.5 && previous.point
      ? Math.atan2(point.y - previous.point.y, point.x - previous.point.x)
      : previous.angle,
  };
}

export function resolveDrawingCursorGeometry(
  style: ToolStrokeStyle,
  wallZoom: number,
  movementAngle = 0,
): DrawingCursorGeometry {
  const zoom = Math.max(0.01, wallZoom);
  if (style.toolId === "spray-can") {
    const profile = getSprayCapProfile(style.variantId);
    const diameter = style.size * 2 * profile.cursorFootprint.coverageScale * zoom;
    return {
      shape: profile.cursorFootprint.shape,
      width: diameter,
      height: diameter * profile.cursorFootprint.aspectRatio,
      angle: profile.cursorFootprint.orientationBehavior === "fixed-transversal" ? movementAngle : 0,
      toolId: style.toolId,
      variantId: style.variantId,
    };
  }

  if (
    style.variantId === "chisel"
    || style.variantId === "clean-chisel"
    || style.variantId === "drippy-chisel"
  ) {
    return {
      shape: "chisel",
      width: style.size * zoom,
      height: style.size * 0.22 * zoom,
      angle: CHISEL_NIB_ANGLE,
      toolId: style.toolId,
      variantId: style.variantId,
    };
  }

  const geometry = resolveMarkerGeometry(style.variantId, null, {
    x: 0,
    y: 0,
    timestamp: 0,
    velocity: 0,
    width: style.size,
    opacity: 1,
  });
  return {
    shape: "circle",
    width: geometry.width * zoom,
    height: geometry.width * zoom,
    angle: 0,
    toolId: style.toolId,
    variantId: style.variantId,
  };
}
