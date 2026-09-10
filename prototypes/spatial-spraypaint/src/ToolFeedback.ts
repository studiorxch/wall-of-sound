import { getDrawingTool, type DrawingToolId } from "./DrawingTool";

export interface ToolFeedbackState {
  sprayHissActive: boolean;
  materialState: "hiss" | "marking" | "quiet";
}

export function resolveToolFeedback(
  toolId: DrawingToolId,
  drawingActive: boolean,
): ToolFeedbackState {
  const feedback = getDrawingTool(toolId).feedback;
  if (!drawingActive) return { sprayHissActive: false, materialState: "quiet" };
  if (feedback === "spray-hiss") return { sprayHissActive: true, materialState: "hiss" };
  return { sprayHissActive: false, materialState: "marking" };
}
