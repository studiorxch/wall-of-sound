import { describe, expect, it } from "vitest";
import { calculateAverageLuminance } from "./CameraLuminance";

describe("camera luminance diagnostics", () => {
  it("reports normalized average luminance from a tiny RGB sample", () => {
    const pixels = new Uint8ClampedArray([
      255, 255, 255, 255,
      0, 0, 0, 255,
    ]);
    expect(calculateAverageLuminance(pixels)).toBeCloseTo(0.5, 5);
  });

  it("returns no evidence for an empty sample", () => {
    expect(calculateAverageLuminance(new Uint8ClampedArray())).toBeNull();
  });
});
