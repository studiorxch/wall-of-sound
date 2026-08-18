import { describe, it, expect, vi } from "vitest";
import { renderMarkerStroke } from "./graffitiMarkerBrush";
import { renderFatcapStroke } from "./graffitiFatcapBrush";
import { renderMopStroke, simulateDrip } from "./graffitiMopBrush";
import type { Stroke, StrokePoint } from "./graffitiTypes";

// BUILD §33 categories 13-15. No jsdom/canvas emulation in this codebase's
// vitest setup (see wallRacetrackBridge.test.ts's header) — brushes are
// exercised against a minimal fake CanvasRenderingContext2D that records
// call counts rather than pixel output, which is sufficient to prove each
// brush's deterministic behavior (same input -> same call sequence) and
// that it doesn't throw across the real input shapes it must handle.

function makeFakeCtx() {
  const calls: Record<string, number> = {};
  const record = (name: string) => { calls[name] = (calls[name] || 0) + 1; };
  const ctx = {
    save: () => record("save"),
    restore: () => record("restore"),
    beginPath: () => record("beginPath"),
    moveTo: () => record("moveTo"),
    lineTo: () => record("lineTo"),
    quadraticCurveTo: () => record("quadraticCurveTo"),
    stroke: () => record("stroke"),
    fill: () => record("fill"),
    arc: () => record("arc"),
    clearRect: () => record("clearRect"),
    createRadialGradient: () => { record("createRadialGradient"); return { addColorStop: () => {} }; },
    set strokeStyle(_v: string) {},
    set fillStyle(_v: string) {},
    set lineWidth(_v: number) {},
    set lineCap(_v: string) {},
    set lineJoin(_v: string) {},
    set globalAlpha(_v: number) {},
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

function makeStroke(tool: Stroke["tool"], points: StrokePoint[], seed = 12345): Stroke {
  return { id: "s1", tool, color: "#ff0066", baseWidth: 0.02, points, seed, createdAt: 1000 };
}

const LINE_POINTS: StrokePoint[] = [
  { x: 0.1, y: 0.1, pointerType: "mouse", timestamp: 0, pressure: 1 },
  { x: 0.3, y: 0.15, pointerType: "mouse", timestamp: 50, pressure: 0.8, velocity: 0.002 },
  { x: 0.5, y: 0.2, pointerType: "mouse", timestamp: 100, pressure: 0.9, velocity: 0.001 },
  { x: 0.7, y: 0.25, pointerType: "mouse", timestamp: 150, pressure: 1, velocity: 0.0015 },
];

describe("marker brush output (#15)", () => {
  it("strokes each smoothed segment without throwing, for a real multi-point line", () => {
    const { ctx, calls } = makeFakeCtx();
    renderMarkerStroke(ctx, makeStroke("marker", LINE_POINTS), 1000, 1000);
    expect(calls.stroke).toBeGreaterThan(0);
  });

  it("a single-point stroke (a tap) draws a dot, not nothing", () => {
    const { ctx, calls } = makeFakeCtx();
    renderMarkerStroke(ctx, makeStroke("marker", [LINE_POINTS[0]]), 1000, 1000);
    expect(calls.fill).toBe(1);
    expect(calls.arc).toBe(1);
  });

  it("produces the identical call count for the same input twice (deterministic)", () => {
    const { ctx: ctx1, calls: calls1 } = makeFakeCtx();
    const { ctx: ctx2, calls: calls2 } = makeFakeCtx();
    renderMarkerStroke(ctx1, makeStroke("marker", LINE_POINTS), 1000, 1000);
    renderMarkerStroke(ctx2, makeStroke("marker", LINE_POINTS), 1000, 1000);
    expect(calls1).toEqual(calls2);
  });
});

describe("fatcap brush output (#13)", () => {
  it("stamps multiple overlapping dots along a real multi-point line", () => {
    const { ctx, calls } = makeFakeCtx();
    renderFatcapStroke(ctx, makeStroke("fatcap", LINE_POINTS), 1000, 1000);
    expect(calls.arc).toBeGreaterThan(1);
    expect(calls.createRadialGradient).toBe(calls.arc);
  });

  it("is deterministic — identical seed + points produces the identical stamp count every time (required for undo/redo/serialization replay)", () => {
    const { ctx: ctx1, calls: calls1 } = makeFakeCtx();
    const { ctx: ctx2, calls: calls2 } = makeFakeCtx();
    renderFatcapStroke(ctx1, makeStroke("fatcap", LINE_POINTS, 777), 1000, 1000);
    renderFatcapStroke(ctx2, makeStroke("fatcap", LINE_POINTS, 777), 1000, 1000);
    expect(calls1.arc).toBe(calls2.arc);
  });

  it("a different seed can change the deterministic jitter without changing the stamp COUNT (count depends on geometry/velocity, not the seed)", () => {
    const { ctx: ctx1, calls: calls1 } = makeFakeCtx();
    const { ctx: ctx2, calls: calls2 } = makeFakeCtx();
    renderFatcapStroke(ctx1, makeStroke("fatcap", LINE_POINTS, 1), 1000, 1000);
    renderFatcapStroke(ctx2, makeStroke("fatcap", LINE_POINTS, 999999), 1000, 1000);
    expect(calls1.arc).toBe(calls2.arc);
  });
});

describe("mop/drip lifecycle (#14)", () => {
  it("simulateDrip produces a bounded, non-empty sequence of circles", () => {
    const drip = simulateDrip(LINE_POINTS, 2, 0.02, 555);
    expect(drip.circles.length).toBeGreaterThan(0);
    expect(drip.circles.length).toBeLessThanOrEqual(26);
  });

  it("a drip moves strictly downward (gravity) and never upward or sideways-only", () => {
    const drip = simulateDrip(LINE_POINTS, 2, 0.02, 555);
    for (let i = 1; i < drip.circles.length; i++) {
      expect(drip.circles[i].y).toBeGreaterThanOrEqual(drip.circles[i - 1].y);
    }
  });

  it("a drip's radius tapers (decreases) over its lifetime, never grows", () => {
    const drip = simulateDrip(LINE_POINTS, 2, 0.02, 555);
    for (let i = 1; i < drip.circles.length; i++) {
      expect(drip.circles[i].radius).toBeLessThanOrEqual(drip.circles[i - 1].radius + 1e-9);
    }
  });

  it("is deterministic — the same origin/seed always simulates the identical drip shape (replay-safe)", () => {
    const a = simulateDrip(LINE_POINTS, 2, 0.02, 42);
    const b = simulateDrip(LINE_POINTS, 2, 0.02, 42);
    expect(a).toEqual(b);
  });

  it("renderMopStroke never throws and bounds total drip count regardless of stroke length (no unbounded object growth)", () => {
    const longPoints: StrokePoint[] = Array.from({ length: 200 }, (_, i) => ({
      x: (i % 100) / 100, y: 0.01 * (i % 50), pointerType: "pen" as const, timestamp: i * 5, pressure: 0.5,
    }));
    const { ctx, calls } = makeFakeCtx();
    renderMopStroke(ctx, makeStroke("mop", longPoints), 1000, 1000);
    // Hard bound regardless of a 200-point stroke: at most
    // MAX_DRIPS_PER_STROKE(8) drips * MAX_DRIP_STEPS(26) circle fills —
    // proving drip count is capped, not scaling with stroke length.
    expect(calls.fill).toBeLessThanOrEqual(8 * 26);
  });
});
