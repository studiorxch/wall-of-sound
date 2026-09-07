import { describe, it, expect, beforeEach } from "vitest";
import { CanonicalStrokeManager } from "./CanonicalStroke";

describe("CanonicalStrokeManager", () => {
  let strokeManager: CanonicalStrokeManager;

  beforeEach(() => {
    strokeManager = new CanonicalStrokeManager();
  });

  it("creates a initial point with zero velocity", () => {
    const { point, interpolated } = strokeManager.createPoint(100, 100, 20);
    expect(point.x).toBe(100);
    expect(point.y).toBe(100);
    expect(point.velocity).toBe(0);
    expect(interpolated.length).toBe(0);
  });

  it("interpolates points on rapid mouse or hand movement", () => {
    strokeManager.createPoint(0, 0, 20, 0, 100);
    const { interpolated } = strokeManager.createPoint(100, 0, 20, 0, 116);
    expect(interpolated.length).toBeGreaterThan(20);
    expect(interpolated[0].x).toBeGreaterThan(0);
    expect(interpolated[0].x).toBeLessThan(100);
  });

  it("keeps endpoint width within a restrained range", () => {
    const start = strokeManager.createPoint(0, 0, 20, 0, 100).point;
    const fast = strokeManager.createPoint(100, 0, 20, 0, 116).point;
    expect(start.width).toBeLessThanOrEqual(21.2);
    expect(fast.width).toBeGreaterThanOrEqual(16.4);
  });

  it("resets state clean when reset() is invoked", () => {
    strokeManager.createPoint(10, 10, 20);
    strokeManager.reset();
    const { point, interpolated } = strokeManager.createPoint(200, 200, 20);
    expect(point.velocity).toBe(0);
    expect(interpolated.length).toBe(0);
  });
});
