import { describe, it, expect } from "vitest";
import { createTimelineTransform, zoomViewport } from "./timelineTransform";

const SR = 44100;

describe("createTimelineTransform", () => {
  it("maps the viewport start to x=0 and end to x=widthPx", () => {
    const t = createTimelineTransform(0, 44100, 1000, SR);
    expect(t.frameToX(0)).toBeCloseTo(0, 3);
    expect(t.frameToX(44100)).toBeCloseTo(1000, 3);
  });

  it("frameToX and xToFrame are inverses", () => {
    const t = createTimelineTransform(1000, 50000, 800, SR);
    const frame = 20000;
    expect(t.xToFrame(t.frameToX(frame))).toBeCloseTo(frame, 1);
  });

  it("secondsToX and xToSeconds round-trip", () => {
    const t = createTimelineTransform(0, SR * 10, 500, SR);
    expect(t.xToSeconds(t.secondsToX(3.5))).toBeCloseTo(3.5, 3);
  });

  it("exposes the viewport bounds it was created with", () => {
    const t = createTimelineTransform(500, 9500, 400, SR);
    expect(t.viewportStartFrame).toBe(500);
    expect(t.viewportEndFrame).toBe(9500);
    expect(t.widthPx).toBe(400);
  });
});

describe("zoomViewport", () => {
  it("zooming in shrinks the span", () => {
    const { start, end } = zoomViewport(0, 10000, 2, 5000, 100, 100000);
    expect(end - start).toBeLessThan(10000);
  });

  it("zooming out grows the span", () => {
    const { start, end } = zoomViewport(0, 10000, 0.5, 5000, 100, 100000);
    expect(end - start).toBeGreaterThan(10000);
  });

  it("keeps the anchor frame at the same relative position", () => {
    const anchor = 3000;
    const before = createTimelineTransform(0, 10000, 1000, SR);
    const xBefore = before.frameToX(anchor);
    const { start, end } = zoomViewport(0, 10000, 2, anchor, 100, 100000);
    const after = createTimelineTransform(start, end, 1000, SR);
    const xAfter = after.frameToX(anchor);
    expect(xAfter).toBeCloseTo(xBefore, 0);
  });

  it("respects the minimum span", () => {
    const { start, end } = zoomViewport(0, 1000, 100, 500, 500, 100000);
    expect(end - start).toBeGreaterThanOrEqual(500);
  });

  it("respects the maximum span", () => {
    const { start, end } = zoomViewport(0, 1000, 0.001, 500, 100, 5000);
    expect(end - start).toBeLessThanOrEqual(5000);
  });
});
