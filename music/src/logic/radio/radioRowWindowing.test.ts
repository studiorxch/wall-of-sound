import { describe, it, expect } from "vitest";
import { computeVisibleRowRange } from "./radioRowWindowing";

describe("computeVisibleRowRange — boundary conditions", () => {
  it("0 rows returns an empty range", () => {
    expect(computeVisibleRowRange(0, 800, 100, 0)).toEqual({ startIndex: 0, endIndex: 0 });
  });

  it("fewer rows than fit in the viewport renders all of them, never past totalRows", () => {
    const range = computeVisibleRowRange(0, 1000, 100, 3);
    expect(range).toEqual({ startIndex: 0, endIndex: 3 });
  });

  it("overscan never pushes startIndex below 0 near the top", () => {
    const range = computeVisibleRowRange(0, 500, 100, 50, 5);
    expect(range.startIndex).toBe(0);
  });

  it("overscan never pushes endIndex past totalRows near the bottom", () => {
    // Scrolled to the very end of a 50-row, 100px-tall-row list.
    const range = computeVisibleRowRange(4900, 500, 100, 50, 5);
    expect(range.endIndex).toBeLessThanOrEqual(50);
  });

  it("scrolling into the middle windows to a subset, not the full list", () => {
    const range = computeVisibleRowRange(2000, 500, 100, 50, 0);
    expect(range.startIndex).toBeGreaterThan(0);
    expect(range.endIndex).toBeLessThan(50);
    expect(range.startIndex).toBe(20);
  });
});

describe("computeVisibleRowRange — expanded-row forced inclusion", () => {
  it("a forceIncludeIndex far outside the scrolled viewport still appears in the range", () => {
    // Viewport is scrolled to the top, but row 45 (of 50) is expanded.
    const range = computeVisibleRowRange(0, 500, 100, 50, 0, 45);
    expect(45).toBeGreaterThanOrEqual(range.startIndex);
    expect(45).toBeLessThan(range.endIndex);
  });

  it("forcing inclusion does not shrink the naturally-visible range", () => {
    const withoutForce = computeVisibleRowRange(2000, 500, 100, 50, 0, null);
    const withForce = computeVisibleRowRange(2000, 500, 100, 50, 0, 22); // already visible
    expect(withForce.startIndex).toBeLessThanOrEqual(withoutForce.startIndex);
    expect(withForce.endIndex).toBeGreaterThanOrEqual(withoutForce.endIndex);
  });

  it("an out-of-range forceIncludeIndex is ignored rather than corrupting the range", () => {
    const range = computeVisibleRowRange(0, 500, 100, 50, 0, 999);
    expect(range.endIndex).toBeLessThanOrEqual(50);
  });
});
