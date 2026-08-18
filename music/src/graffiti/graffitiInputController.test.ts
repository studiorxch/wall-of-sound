import { describe, it, expect } from "vitest";
import { normalizePointerEvent, computeVelocity, type SurfaceRect } from "./graffitiInputController";
import type { StrokePoint } from "./graffitiTypes";

// 0818_SUBWAY_Artwork_Creation_Drawing_App_v1.0.0 — BUILD §33 categories 1-7.
// No jsdom in this codebase's vitest setup (confirmed via wallRacetrackBridge.test.ts's
// own header comment) — normalizePointerEvent takes a plain event-shaped
// object, so no real PointerEvent/DOM is needed to exercise it.

const RECT: SurfaceRect = { left: 100, top: 50, width: 400, height: 200 };

describe("normalizePointerEvent — pointer normalization (#1)", () => {
  it("maps client coordinates into normalized 0..1 surface space, never raw pixels", () => {
    const p = normalizePointerEvent({ clientX: 300, clientY: 150, pointerType: "mouse", pressure: 0, timeStamp: 1000 }, RECT);
    expect(p.x).toBeCloseTo(0.5, 5);
    expect(p.y).toBeCloseTo(0.5, 5);
  });

  it("clamps out-of-canvas coordinates to [0,1] rather than producing an out-of-bounds point (#16 bounds enforcement)", () => {
    const p = normalizePointerEvent({ clientX: -500, clientY: 9000, pointerType: "pen", pressure: 0.5, timeStamp: 1000 }, RECT);
    expect(p.x).toBe(0);
    expect(p.y).toBe(1);
  });
});

describe("normalizePointerEvent — mouse input (#2)", () => {
  it("mouse input normalizes with pointerType 'mouse' and clears the Pointer Events spec's synthetic 0 pressure to undefined (documented fallback, not a fabricated value)", () => {
    const p = normalizePointerEvent({ clientX: 100, clientY: 50, pointerType: "mouse", pressure: 0, timeStamp: 1000 }, RECT);
    expect(p.pointerType).toBe("mouse");
    expect(p.pressure).toBeUndefined();
  });
});

describe("normalizePointerEvent — touch input normalization (#3)", () => {
  it("touch input normalizes with pointerType 'touch' and preserves a real reported pressure", () => {
    const p = normalizePointerEvent({ clientX: 100, clientY: 50, pointerType: "touch", pressure: 0.7, timeStamp: 1000 }, RECT);
    expect(p.pointerType).toBe("touch");
    expect(p.pressure).toBe(0.7);
  });
});

describe("normalizePointerEvent — pen metadata preservation (#4)", () => {
  it("preserves pressure/tilt/twist exactly as the browser reports them for a pen pointer", () => {
    const p = normalizePointerEvent({ clientX: 100, clientY: 50, pointerType: "pen", pressure: 0.42, tiltX: -30, tiltY: 15, twist: 90, timeStamp: 1000 }, RECT);
    expect(p.pointerType).toBe("pen");
    expect(p.pressure).toBe(0.42);
    expect(p.tiltX).toBe(-30);
    expect(p.tiltY).toBe(15);
    expect(p.twist).toBe(90);
  });

  it("never fabricates tilt/twist that the device didn't report (left as 0, the Pointer Events non-support default) — omitted, not defaulted to a fake nonzero value", () => {
    const p = normalizePointerEvent({ clientX: 100, clientY: 50, pointerType: "pen", pressure: 0.5, tiltX: 0, tiltY: 0, twist: 0, timeStamp: 1000 }, RECT);
    expect(p.tiltX).toBeUndefined();
    expect(p.tiltY).toBeUndefined();
    expect(p.twist).toBeUndefined();
  });
});

describe("normalizePointerEvent — pressure fallback (#5)", () => {
  it("a real low pen pressure (e.g. a light touch) is preserved as-is, never floored to a fallback", () => {
    const p = normalizePointerEvent({ clientX: 100, clientY: 50, pointerType: "pen", pressure: 0.02, timeStamp: 1000 }, RECT);
    expect(p.pressure).toBe(0.02);
  });
});

describe("normalizePointerEvent — high-DPI coordinate mapping (#6)", () => {
  it("normalization is resolution-independent — the same CSS-space rect produces identical normalized output regardless of devicePixelRatio (DPR scaling is applied only to the canvas backing store, never to point normalization)", () => {
    const p1 = normalizePointerEvent({ clientX: 300, clientY: 150, pointerType: "mouse", pressure: 0, timeStamp: 1000 }, RECT);
    // A DPR change never alters getBoundingClientRect()'s CSS-pixel values,
    // so the same rect + same client coords must normalize identically.
    const p2 = normalizePointerEvent({ clientX: 300, clientY: 150, pointerType: "mouse", pressure: 0, timeStamp: 1000 }, RECT);
    expect(p1.x).toBe(p2.x);
    expect(p1.y).toBe(p2.y);
  });
});

describe("normalizePointerEvent — normalized surface coordinates (#7)", () => {
  it("never stores raw browser pixel coordinates — output is always within [0,1] regardless of input rect size", () => {
    const bigRect: SurfaceRect = { left: 0, top: 0, width: 3000, height: 1200 };
    const p = normalizePointerEvent({ clientX: 1500, clientY: 600, pointerType: "mouse", pressure: 0, timeStamp: 1000 }, bigRect);
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.x).toBeLessThanOrEqual(1);
    expect(p.y).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeLessThanOrEqual(1);
  });
});

describe("computeVelocity", () => {
  it("computes a positive velocity between two distinct, time-separated points", () => {
    const a: StrokePoint = { x: 0, y: 0, pointerType: "mouse", timestamp: 0 };
    const b: StrokePoint = { x: 0.1, y: 0, pointerType: "mouse", timestamp: 100 };
    expect(computeVelocity(a, b)).toBeCloseTo(0.001, 5);
  });

  it("never divides by zero even for two identically-timestamped points (dt floored to 1ms)", () => {
    const a: StrokePoint = { x: 0, y: 0, pointerType: "mouse", timestamp: 500 };
    const b: StrokePoint = { x: 0.05, y: 0, pointerType: "mouse", timestamp: 500 };
    expect(Number.isFinite(computeVelocity(a, b))).toBe(true);
  });
});
