import { describe, expect, it } from "vitest";
import { StrokeSmoother } from "./StrokeSmoother";

describe("StrokeSmoother", () => {
  it("returns exact input when smoothing is off", () => {
    const smoother = new StrokeSmoother();
    smoother.smooth({ x: 10, y: 10 }, "off");
    expect(smoother.smooth({ x: 30, y: 20 }, "off")).toEqual({ x: 30, y: 20 });
  });

  it("reduces small input jitter", () => {
    const smoother = new StrokeSmoother();
    smoother.smooth({ x: 100, y: 100 }, "medium");
    const smoothed = smoother.smooth({ x: 104, y: 96 }, "medium");
    expect(smoothed.x).toBeGreaterThan(100);
    expect(smoothed.x).toBeLessThan(104);
    expect(smoothed.y).toBeGreaterThan(96);
    expect(smoothed.y).toBeLessThan(100);
  });

  it("responds more quickly at low smoothing than high smoothing", () => {
    const low = new StrokeSmoother();
    const high = new StrokeSmoother();
    low.smooth({ x: 0, y: 0 }, "low");
    high.smooth({ x: 0, y: 0 }, "high");
    expect(low.smooth({ x: 30, y: 0 }, "low").x).toBeGreaterThan(
      high.smooth({ x: 30, y: 0 }, "high").x,
    );
  });
});
