import { type SprayCapId } from "./SprayCapPresets";
import { type InputSourceMode } from "./types";

export type DrawingToolId = "spray-can" | "paint-marker";
export type MarkerVariantId = "round" | "chisel" | "clean-chisel" | "drippy-chisel" | "mop" | "drip-mop";
export type DrawingToolVariantId = SprayCapId | MarkerVariantId;
export type ToolRendererId = "spray" | "paint-marker";
export type ToolFeedbackId = "spray-hiss" | "silent";

export interface DrawingToolDefinition {
  id: DrawingToolId;
  name: string;
  family: "aerosol" | "marker";
  cursor: "spray-ring" | "marker-ring";
  renderer: ToolRendererId;
  parameterLabel: "Cap" | "Marker / Nib";
  feedback: ToolFeedbackId;
  supportedInputs: readonly InputSourceMode[];
  acceptsGeneratedInput: boolean;
}

export interface DrawingToolSelection {
  selectedToolId: DrawingToolId;
  sprayCapId: SprayCapId;
  markerVariantId: MarkerVariantId;
}

export interface DrawingToolPresentation {
  toolName: string;
  parameterLabel: "Cap" | "Marker / Nib";
  contextualChooserId: "cap-chooser" | "marker-chooser";
  variantName: string;
}

export const DRAWING_TOOLS: readonly DrawingToolDefinition[] = [
  {
    id: "spray-can",
    name: "Spray Can",
    family: "aerosol",
    cursor: "spray-ring",
    renderer: "spray",
    parameterLabel: "Cap",
    feedback: "spray-hiss",
    supportedInputs: ["mouse", "spatial"],
    acceptsGeneratedInput: true,
  },
  {
    id: "paint-marker",
    name: "Paint Marker",
    family: "marker",
    cursor: "marker-ring",
    renderer: "paint-marker",
    parameterLabel: "Marker / Nib",
    feedback: "silent",
    supportedInputs: ["mouse", "spatial"],
    acceptsGeneratedInput: true,
  },
] as const;

export const INITIAL_DRAWING_TOOL_SELECTION: DrawingToolSelection = {
  selectedToolId: "spray-can",
  sprayCapId: "new-york-fat",
  markerVariantId: "round",
};

export function getDrawingTool(id: DrawingToolId): DrawingToolDefinition {
  return DRAWING_TOOLS.find((tool) => tool.id === id) ?? DRAWING_TOOLS[0];
}

export function isDrawingToolId(value: string): value is DrawingToolId {
  return DRAWING_TOOLS.some((tool) => tool.id === value);
}

export function selectDrawingTool(
  selection: DrawingToolSelection,
  selectedToolId: DrawingToolId,
): DrawingToolSelection {
  return { ...selection, selectedToolId };
}

export function selectSprayCap(
  selection: DrawingToolSelection,
  sprayCapId: SprayCapId,
): DrawingToolSelection {
  return { ...selection, sprayCapId };
}

export function selectMarkerVariant(
  selection: DrawingToolSelection,
  markerVariantId: MarkerVariantId,
): DrawingToolSelection {
  return { ...selection, markerVariantId };
}

export function selectedToolVariant(selection: DrawingToolSelection): DrawingToolVariantId {
  return selection.selectedToolId === "spray-can"
    ? selection.sprayCapId
    : selection.markerVariantId;
}

export function resolveSelectedToolForInput(
  selection: DrawingToolSelection,
  input: InputSourceMode,
): DrawingToolDefinition | null {
  const tool = getDrawingTool(selection.selectedToolId);
  return tool.supportedInputs.includes(input) ? tool : null;
}

export function resolveDrawingToolPresentation(
  selection: DrawingToolSelection,
  resolveSprayName: (id: SprayCapId) => string,
  resolveMarkerName: (id: MarkerVariantId) => string,
): DrawingToolPresentation {
  const tool = getDrawingTool(selection.selectedToolId);
  return {
    toolName: tool.name,
    parameterLabel: tool.parameterLabel,
    contextualChooserId: tool.id === "spray-can" ? "cap-chooser" : "marker-chooser",
    variantName: tool.id === "spray-can"
      ? resolveSprayName(selection.sprayCapId)
      : resolveMarkerName(selection.markerVariantId),
  };
}
