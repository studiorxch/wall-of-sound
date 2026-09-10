import { describe, expect, it } from "vitest";
import { DEFAULT_WALL_COMPOSITION, resolveWallComposition } from "./WallComposition";

describe("sensor-first wall composition", () => {
  it("disables segmentation in the default Hand experience", () => {
    expect(DEFAULT_WALL_COMPOSITION.segmentationEnabled).toBe(false);
  });

  it("does not require a person compositor in normal Hand mode", () => {
    expect(DEFAULT_WALL_COMPOSITION).toMatchObject({
      performer: "hidden",
      cameraFrameVisible: false,
      personCompositorRequired: false,
    });
  });

  it("renders the default Wall without a camera frame", () => {
    expect(resolveWallComposition("wall", false)).toMatchObject({
      environment: "wall",
      cameraFrameVisible: false,
      segmentationEnabled: false,
    });
  });

  it("renders an available image background without segmentation", () => {
    expect(resolveWallComposition("image", true)).toMatchObject({
      environment: "image",
      segmentationEnabled: false,
      personCompositorRequired: false,
    });
  });

  it("renders a solid background without segmentation", () => {
    expect(resolveWallComposition("solid", false)).toMatchObject({
      environment: "solid",
      segmentationEnabled: false,
      personCompositorRequired: false,
    });
  });

  it("keeps live performer and camera data out of the recorded canvas by default", () => {
    expect(DEFAULT_WALL_COMPOSITION.recordedLayers).toEqual(["environment", "wall", "paint"]);
    expect(DEFAULT_WALL_COMPOSITION.cameraFrameVisible).toBe(false);
  });
});
