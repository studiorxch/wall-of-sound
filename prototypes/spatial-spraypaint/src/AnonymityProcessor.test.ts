import { describe, expect, it } from "vitest";
import {
  applySilhouettePosterization,
  calculateSilhouetteThreshold,
} from "./AnonymityProcessor";

describe("silhouette treatment", () => {
  it("uses a bounded adaptive threshold", () => {
    expect(calculateSilhouetteThreshold(new Uint8ClampedArray([0, 0, 0, 255]))).toBe(72);
    expect(calculateSilhouetteThreshold(new Uint8ClampedArray([255, 255, 255, 255]))).toBe(170);
  });

  it("posterizes the frame into strongly separated dark and light values", () => {
    const pixels = new Uint8ClampedArray([
      30, 35, 40, 180,
      220, 225, 230, 180,
    ]);

    applySilhouettePosterization(pixels, 120);

    expect(Array.from(pixels)).toEqual([
      5, 7, 12, 255,
      218, 214, 202, 255,
    ]);
  });
});
