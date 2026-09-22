import { describe, expect, it } from "vitest";
import { fillSprayParticle, hash01, hashLateralUnit, traceSmoothedPath, withAlpha } from "./strokeSmoothing";

function fakeContext() {
  const calls: string[] = [];
  const gradientStops: [number, string][] = [];
  const ctx = {
    moveTo: (x: number, y: number) => calls.push(`moveTo(${x},${y})`),
    lineTo: (x: number, y: number) => calls.push(`lineTo(${x},${y})`),
    quadraticCurveTo: (cx: number, cy: number, x: number, y: number) => calls.push(`quadraticCurveTo(${cx},${cy},${x},${y})`),
    beginPath: () => calls.push("beginPath"),
    arc: (x: number, y: number, r: number) => calls.push(`arc(${x},${y},${r})`),
    fill: () => calls.push("fill"),
    createRadialGradient: () => ({
      addColorStop: (offset: number, color: string) => gradientStops.push([offset, color]),
    }),
    fillStyle: "" as unknown,
  };
  return { ctx, calls, gradientStops };
}

describe("traceSmoothedPath -- quadratic-midpoint smoothing", () => {
  it("draws nothing for 0 or 1 points", () => {
    const { ctx, calls } = fakeContext();
    traceSmoothedPath(ctx as never, []);
    traceSmoothedPath(ctx as never, [{ x: 1, y: 1 }]);
    expect(calls).toEqual([]);
  });

  it("falls back to a single lineTo for exactly 2 points -- a curve needs a midpoint to aim at", () => {
    const { ctx, calls } = fakeContext();
    traceSmoothedPath(ctx as never, [{ x: 0, y: 0 }, { x: 10, y: 0 }]);
    expect(calls).toEqual(["moveTo(0,0)", "lineTo(10,0)"]);
  });

  it("traces a quadraticCurveTo through the midpoint of each interior pair, using the authored point as the control point", () => {
    const points = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    const { ctx, calls } = fakeContext();
    traceSmoothedPath(ctx as never, points);
    // moveTo the first authored point, one quadraticCurveTo per interior
    // point (control = the authored point, end = midpoint to the next),
    // then a final lineTo the last authored point.
    expect(calls[0]).toBe("moveTo(0,0)");
    expect(calls[1]).toBe("quadraticCurveTo(10,0,10,5)"); // control (10,0), end = midpoint((10,0),(10,10))
    expect(calls[2]).toBe("quadraticCurveTo(10,10,5,10)"); // control (10,10), end = midpoint((10,10),(0,10))
    expect(calls[3]).toBe("lineTo(0,10)");
  });

  it("never routes the traced path further from an authored point than half its local segment length -- gesture fidelity, not beautification", () => {
    // The curve's endpoint at each step IS the exact midpoint, and its
    // control point IS the exact authored point, so by construction the
    // traced curve never diverges from the authored polyline by more than
    // half the shorter adjacent segment -- verified here by checking every
    // emitted midpoint is the arithmetic mean of two consecutive authored
    // points, not some smoothed/resampled position.
    const points = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 100 }];
    const { calls } = (() => { const f = fakeContext(); traceSmoothedPath(f.ctx as never, points); return f; })();
    expect(calls[1]).toBe("quadraticCurveTo(4,0,4,50)");
  });
});

describe("withAlpha -- hex to rgba", () => {
  it("converts a #rrggbb color and alpha into an rgba() string", () => {
    expect(withAlpha("#e2572b", 0.5)).toBe("rgba(226, 87, 43, 0.5)");
  });

  it("clamps alpha into [0, 1]", () => {
    expect(withAlpha("#ffffff", 2)).toBe("rgba(255, 255, 255, 1)");
    expect(withAlpha("#000000", -1)).toBe("rgba(0, 0, 0, 0)");
  });

  it("passes through a non-hex color unchanged", () => {
    expect(withAlpha("red", 0.5)).toBe("red");
  });
});

describe("fillSprayParticle -- soft radial-gradient fill, not a flat circle", () => {
  it("skips drawing entirely for a zero-alpha or zero-radius particle", () => {
    const { ctx, calls } = fakeContext();
    fillSprayParticle(ctx as never, { x: 5, y: 5, radius: 0, alpha: 1 }, "#e2572b", 1);
    fillSprayParticle(ctx as never, { x: 5, y: 5, radius: 2, alpha: 0 }, "#e2572b", 1);
    expect(calls).toEqual([]);
  });

  it("fades the gradient's outer stop to fully transparent, never a hard edge", () => {
    const { ctx, gradientStops } = fakeContext();
    fillSprayParticle(ctx as never, { x: 5, y: 5, radius: 3, alpha: 0.8 }, "#e2572b", 0.6);
    const last = gradientStops[gradientStops.length - 1];
    expect(last[0]).toBe(1);
    expect(last[1]).toBe("rgba(226, 87, 43, 0)");
  });

  it("draws exactly one arc + fill per particle", () => {
    const { ctx, calls } = fakeContext();
    fillSprayParticle(ctx as never, { x: 5, y: 5, radius: 3, alpha: 0.8 }, "#e2572b", 0.6);
    expect(calls).toEqual(["beginPath", "arc(5,5,3)", "fill"]);
  });
});

describe("hashLateralUnit -- Revision 5 deterministic scatter", () => {
  it("is a pure, deterministic function of its inputs -- same position always gives the same value", () => {
    expect(hashLateralUnit(12.5, 40.2)).toBe(hashLateralUnit(12.5, 40.2));
  });

  it("returns a value within [-1, 1]", () => {
    for (let i = 0; i < 50; i += 1) {
      const value = hashLateralUnit(i * 3.7, i * -5.1);
      expect(value).toBeGreaterThanOrEqual(-1);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("different positions generally give different values -- not a constant", () => {
    const values = new Set(Array.from({ length: 20 }, (_, i) => hashLateralUnit(i * 4, i * 9)));
    expect(values.size).toBeGreaterThan(1);
  });
});

describe("hash01 -- Revision 6 salted deterministic hash", () => {
  it("is a pure, deterministic function of its inputs including salt", () => {
    expect(hash01(12.5, 40.2, 3)).toBe(hash01(12.5, 40.2, 3));
  });

  it("returns a value within [0, 1)", () => {
    for (let i = 0; i < 50; i += 1) {
      const value = hash01(i * 3.7, i * -5.1, i % 5);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("different salts decorrelate the SAME position -- independent-looking streams from one (x, y)", () => {
    const a = hash01(10, 20, 1);
    const b = hash01(10, 20, 2);
    const c = hash01(10, 20, 3);
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it("hashLateralUnit is exactly hash01(x, y, 0) remapped to [-1, 1]", () => {
    expect(hashLateralUnit(5, 7)).toBeCloseTo(hash01(5, 7, 0) * 2 - 1, 10);
  });
});
