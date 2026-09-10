export type WallEnvironmentMode = "wall" | "solid" | "image";

export interface WallCompositionPlan {
  environment: WallEnvironmentMode;
  performer: "hidden";
  cameraFrameVisible: false;
  personCompositorRequired: false;
  segmentationEnabled: false;
  recordedLayers: readonly ["environment", "wall", "paint"];
}

export const DEFAULT_WALL_COMPOSITION: WallCompositionPlan = Object.freeze({
  environment: "wall",
  performer: "hidden",
  cameraFrameVisible: false,
  personCompositorRequired: false,
  segmentationEnabled: false,
  recordedLayers: ["environment", "wall", "paint"] as const,
});

export function resolveWallComposition(
  requestedEnvironment: WallEnvironmentMode,
  hasImage: boolean,
): WallCompositionPlan {
  return {
    ...DEFAULT_WALL_COMPOSITION,
    environment: requestedEnvironment === "image" && !hasImage ? "wall" : requestedEnvironment,
  };
}
