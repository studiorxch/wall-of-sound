import { describe, expect, it } from "vitest";
import {
  calculatePinchDistance,
  isPinchActive,
  mapMirroredFingertip,
  resolveHandTrackingCoordinates,
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

  it("updates aim immediately while retaining the established stabilized stroke path", () => {
    const first = resolveHandTrackingCoordinates(
      { x: 0.2, y: 0.4 },
      { x: 0, y: 0, initialized: false },
    );
    const moved = resolveHandTrackingCoordinates(
      { x: 0.8, y: 0.1 },
      first.state,
    );
    expect(moved.aim).toEqual({ x: 0.8, y: 0.1 });
    expect(moved.stroke.x).toBeCloseTo(0.41);
    expect(moved.stroke.y).toBeCloseTo(0.295);
    expect(moved.stroke).not.toEqual(moved.aim);
  });

  it("does not make aim responsiveness depend on the stroke smoothing response", () => {
    const previous = { x: 0.3, y: 0.3, initialized: true };
    expect(resolveHandTrackingCoordinates({ x: 0.9, y: 0.7 }, previous, 0.2).aim).toEqual(
      resolveHandTrackingCoordinates({ x: 0.9, y: 0.7 }, previous, 0.8).aim,
    );
  });
});
