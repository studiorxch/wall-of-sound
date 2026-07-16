import { describe, it, expect } from "vitest";
import { computeFrameRange, extractChannelRange, downmixToMono } from "./loopRenderExtraction";

describe("computeFrameRange", () => {
  it("computes correct frame indices from seconds", () => {
    const r = computeFrameRange(1, 2, 1000, 5000);
    expect(r.startFrame).toBe(1000);
    expect(r.endFrame).toBe(2000);
  });

  it("enforces source bounds — throws when endFrame exceeds sourceFrameCount", () => {
    expect(() => computeFrameRange(0, 10, 1000, 5000)).toThrow(/invalid_frame_range/);
  });

  it("throws for inverted or zero-length ranges", () => {
    expect(() => computeFrameRange(2, 1, 1000, 5000)).toThrow();
    expect(() => computeFrameRange(1, 1, 1000, 5000)).toThrow();
  });

  it("throws for a negative start", () => {
    expect(() => computeFrameRange(-1, 1, 1000, 5000)).toThrow();
  });
});

describe("extractChannelRange", () => {
  it("extracts mono correctly", () => {
    const source = [new Float32Array([0, 1, 2, 3, 4, 5])];
    const out = extractChannelRange(source, { startFrame: 2, endFrame: 5 });
    expect(Array.from(out[0])).toEqual([2, 3, 4]);
  });

  it("extracts stereo correctly, preserving both channels", () => {
    const left = new Float32Array([0, 1, 2, 3]);
    const right = new Float32Array([10, 11, 12, 13]);
    const out = extractChannelRange([left, right], { startFrame: 1, endFrame: 3 });
    expect(Array.from(out[0])).toEqual([1, 2]);
    expect(Array.from(out[1])).toEqual([11, 12]);
  });

  it("produces exact requested duration (frame count)", () => {
    const source = [new Float32Array(1000)];
    const out = extractChannelRange(source, { startFrame: 100, endFrame: 300 });
    expect(out[0].length).toBe(200);
  });
});

describe("downmixToMono", () => {
  it("averages channels explicitly (never a silent side-effect of extraction)", () => {
    const left = new Float32Array([1, 1]);
    const right = new Float32Array([-1, 3]);
    const out = downmixToMono([left, right]);
    expect(out.length).toBe(1);
    expect(Array.from(out[0])).toEqual([0, 2]);
  });
});
