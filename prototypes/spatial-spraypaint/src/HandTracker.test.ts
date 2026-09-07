import { describe, expect, it } from "vitest";
import {
  calculatePinchDistance,
  isPinchActive,
  mapMirroredFingertip,
} from "./HandTracker";

describe("hand tracking geometry", () => {
  it("calculates normalized pinch distance", () => {
    expect(calculatePinchDistance({ x: 0.2, y: 0.3 }, { x: 0.5, y: 0.7 })).toBeCloseTo(0.5);
  });

  it("uses the established pinch threshold", () => {
    expect(isPinchActive(0.079)).toBe(true);
    expect(isPinchActive(0.08)).toBe(false);
  });

  it("mirrors and clamps fingertip coordinates", () => {
    expect(mapMirroredFingertip({ x: 0.25, y: 0.4 })).toEqual({ x: 0.75, y: 0.4 });
    expect(mapMirroredFingertip({ x: -0.2, y: 1.4 })).toEqual({ x: 1, y: 1 });
  });
});
