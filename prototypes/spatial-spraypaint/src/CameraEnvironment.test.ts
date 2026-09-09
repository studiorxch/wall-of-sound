import { describe, expect, it } from "vitest";
import {
  calculateCoverRect,
  effectiveEnvironmentMode,
  needsPersonSegmentation,
} from "./CameraEnvironment";

describe("camera environment planning", () => {
  it("skips segmentation only for the unchanged Clean + Original camera", () => {
    expect(needsPersonSegmentation("clean", "original")).toBe(false);
    expect(needsPersonSegmentation("pixel", "original")).toBe(true);
    expect(needsPersonSegmentation("clean", "blur")).toBe(true);
    expect(needsPersonSegmentation("hidden", "image")).toBe(true);
  });

  it("falls environment rendering back to Original without a reusable mask", () => {
    expect(effectiveEnvironmentMode("blur", false, false)).toBe("original");
    expect(effectiveEnvironmentMode("solid", true, false)).toBe("solid");
    expect(effectiveEnvironmentMode("image", true, false)).toBe("original");
    expect(effectiveEnvironmentMode("image", true, true)).toBe("image");
  });

  it("calculates CSS-cover geometry for wide and tall local images", () => {
    expect(calculateCoverRect(1600, 900, 800, 800)).toEqual({
      x: -311.1111111111111,
      y: 0,
      width: 1422.2222222222222,
      height: 800,
    });
    expect(calculateCoverRect(900, 1600, 800, 400)).toEqual({
      x: 0,
      y: -511.1111111111111,
      width: 800,
      height: 1422.2222222222222,
    });
  });
});
