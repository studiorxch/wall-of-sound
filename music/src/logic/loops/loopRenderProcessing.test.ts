import { describe, it, expect } from "vitest";
import { applyNormalization, applyBoundaryCrossfade } from "./loopRenderProcessing";

describe("applyNormalization", () => {
  it("preserves level when disabled", () => {
    const input = [new Float32Array([0.1, 0.2, -0.1])];
    const out = applyNormalization(input, { enabled: false, targetDbfs: -1 });
    expect(Array.from(out[0])).toEqual(Array.from(input[0]));
  });

  it("reaches the target peak (dBFS) when enabled", () => {
    const input = [new Float32Array([0.1, 0.2, -0.1])];
    const out = applyNormalization(input, { enabled: true, targetDbfs: -1 });
    const peak = Math.max(...Array.from(out[0]).map(Math.abs));
    const targetLinear = Math.pow(10, -1 / 20);
    expect(peak).toBeCloseTo(targetLinear, 5);
  });

  it("does not divide by zero for pure silence", () => {
    const input = [new Float32Array([0, 0, 0])];
    const out = applyNormalization(input, { enabled: true, targetDbfs: -1 });
    expect(Array.from(out[0])).toEqual([0, 0, 0]);
  });
});

describe("applyBoundaryCrossfade", () => {
  it("preserves samples when disabled", () => {
    const input = [new Float32Array([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])];
    const out = applyBoundaryCrossfade(input, { enabled: false, durationMs: 20, curve: "linear" }, 44100);
    expect(Array.from(out[0])).toEqual(Array.from(input[0]));
  });

  it("only changes the edge regions, leaving the interior untouched", () => {
    const sampleRate = 1000;
    const n = 100;
    const input = [new Float32Array(n).fill(1)];
    const out = applyBoundaryCrossfade(input, { enabled: true, durationMs: 5, curve: "linear" }, sampleRate); // 5 fade frames
    // middle sample (well outside the 5-frame fade region at each edge) unchanged
    expect(out[0][50]).toBe(1);
    // first sample faded toward 0
    expect(out[0][0]).toBeLessThan(1);
    // last sample faded toward 0
    expect(out[0][n - 1]).toBeLessThan(1);
  });
});
