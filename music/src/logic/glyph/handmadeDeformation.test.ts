import { describe, it, expect } from "vitest";
import { applyHandmadeDeformation } from "./handmadeDeformation";
import type { ArchGrammarParameters } from "../../data/glyphGrammarTypes";

function params(overrides: Partial<ArchGrammarParameters> = {}): ArchGrammarParameters {
  return {
    archCount: 2, width: 20, height: 10, curveSharpness: 0.2, asymmetry: 0,
    baselineOffset: 0, connectorLength: 4, connectorSag: 1, entryOvershoot: 2, exitOvershoot: 2,
    localCompression: 0, dotEnabled: false, dotSize: 1, dotOffset: 0, handmadeVariance: 0.5,
    ...overrides,
  };
}

describe("applyHandmadeDeformation", () => {
  it("returns a byte-identical pass-through when handmadeVariance is 0", () => {
    const input = params({ handmadeVariance: 0 });
    const result = applyHandmadeDeformation(input, 42, 3);
    expect(result).toEqual(input);
  });

  it("is deterministic: same seed + same beat index always produces the same output", () => {
    const a = applyHandmadeDeformation(params(), 42, 3);
    const b = applyHandmadeDeformation(params(), 42, 3);
    expect(a).toEqual(b);
  });

  it("produces different output for a different seed", () => {
    const a = applyHandmadeDeformation(params(), 1, 0);
    const b = applyHandmadeDeformation(params(), 2, 0);
    expect(a).not.toEqual(b);
  });

  it("produces different output for a different beat index under the same seed", () => {
    const a = applyHandmadeDeformation(params(), 42, 0);
    const b = applyHandmadeDeformation(params(), 42, 1);
    expect(a).not.toEqual(b);
  });

  it("bounds height/width jitter to a small fraction of the base value, never runaway", () => {
    const base = params({ height: 10, width: 20, handmadeVariance: 1 });
    for (let beatIndex = 0; beatIndex < 20; beatIndex++) {
      const result = applyHandmadeDeformation(base, 99, beatIndex);
      expect(Math.abs(result.height - base.height)).toBeLessThanOrEqual(base.height * 0.08 + 1e-9);
      expect(Math.abs(result.width - base.width)).toBeLessThanOrEqual(base.width * 0.08 + 1e-9);
    }
  });

  it("keeps asymmetry within [-1, 1]", () => {
    for (let beatIndex = 0; beatIndex < 20; beatIndex++) {
      const result = applyHandmadeDeformation(params({ asymmetry: 0.95, handmadeVariance: 1 }), 7, beatIndex);
      expect(result.asymmetry).toBeGreaterThanOrEqual(-1);
      expect(result.asymmetry).toBeLessThanOrEqual(1);
    }
  });

  it("never produces a negative connectorSag", () => {
    for (let beatIndex = 0; beatIndex < 20; beatIndex++) {
      const result = applyHandmadeDeformation(params({ connectorSag: 0, handmadeVariance: 1 }), 7, beatIndex);
      expect(result.connectorSag).toBeGreaterThanOrEqual(0);
    }
  });
});
