import { describe, expect, it } from "vitest";
import { MAP_SURFACE_REFERENCE_ZOOM, resolveZoomScale } from "./mapZoomScale";

describe("resolveZoomScale -- authored-zoom scale correction", () => {
  it("same zoom as authored => scale of exactly 1 (renders at authored Width)", () => {
    expect(resolveZoomScale(14, 14)).toBe(1);
    expect(resolveZoomScale(8.3, 8.3)).toBe(1);
  });

  it("zoom +1 from authored => scale of exactly 2 (Mapbox's own one-level-doubles-pixel-density model)", () => {
    expect(resolveZoomScale(15, 14)).toBe(2);
  });

  it("zoom -1 from authored => scale of exactly 0.5", () => {
    expect(resolveZoomScale(13, 14)).toBe(0.5);
  });

  it("multiple zoom deltas are deterministic and follow 2^delta", () => {
    expect(resolveZoomScale(16, 12)).toBeCloseTo(16, 10); // +4 -> 2^4
    expect(resolveZoomScale(10, 12)).toBeCloseTo(0.25, 10); // -2 -> 2^-2
    expect(resolveZoomScale(18, 12)).toBeCloseTo(64, 10); // +6 -> 2^6
  });

  it("a legacy Mark (authoredZoom undefined) falls back to the shared Map reference zoom", () => {
    expect(resolveZoomScale(MAP_SURFACE_REFERENCE_ZOOM, undefined)).toBe(1);
    expect(resolveZoomScale(MAP_SURFACE_REFERENCE_ZOOM + 1, undefined)).toBe(2);
  });

  it("is a pure function -- same inputs always produce the same output", () => {
    expect(resolveZoomScale(11.4, 9.2)).toBe(resolveZoomScale(11.4, 9.2));
  });

  it("is unclamped -- extreme deltas produce extreme (but mathematically correct) scale factors, no artificial floor/ceiling", () => {
    expect(resolveZoomScale(2, 14)).toBeCloseTo(Math.pow(2, -12), 10); // far overview
    expect(resolveZoomScale(20, 14)).toBeCloseTo(Math.pow(2, 6), 10); // close inspection
  });
});
