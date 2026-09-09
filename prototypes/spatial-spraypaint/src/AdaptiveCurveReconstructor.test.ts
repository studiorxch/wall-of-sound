import { describe, expect, it } from "vitest";
import {
  AdaptiveCurveReconstructor,
  resolveCurveSampleSpacing,
  turnAngleDegrees,
  type CurveInputSample,
} from "./AdaptiveCurveReconstructor";

const options = { baseRadius: 32 };

function reconstruct(inputs: CurveInputSample[]): CurveInputSample[] {
  const reconstructor = new AdaptiveCurveReconstructor();
  return [
    ...inputs.flatMap((sample) => reconstructor.push(sample, options)),
    ...reconstructor.finish(options),
  ];
}

describe("AdaptiveCurveReconstructor", () => {
  it("densifies a sparse fast arc and bends between its input chords", () => {
    const output = reconstruct([
      { x: 0, y: 80, timestamp: 0 },
      { x: 30, y: 30, timestamp: 16 },
      { x: 80, y: 0, timestamp: 32 },
      { x: 140, y: 12, timestamp: 48 },
    ]);

    expect(output.length).toBeGreaterThan(30);
    const betweenFirstPair = output.filter((point) => point.x > 0 && point.x < 30);
    expect(betweenFirstPair.some((point) => {
      const lineY = 80 + (30 - 80) * (point.x / 30);
      return Math.abs(point.y - lineY) > 0.2;
    })).toBe(true);
  });

  it("keeps dense slow arcs ordered and avoids redundant expansion", () => {
    const inputs = Array.from({ length: 21 }, (_, index) => {
      const angle = (Math.PI * index) / 40;
      return { x: Math.cos(angle) * 100, y: Math.sin(angle) * 100, timestamp: index * 40 };
    });
    const output = reconstruct(inputs);
    expect(output[0]).toEqual(inputs[0]);
    expect(output[output.length - 1]).toEqual(inputs[inputs.length - 1]);
    expect(output.length).toBeLessThan(inputs.length * 4);
  });

  it("preserves a sharp corner instead of rounding across it", () => {
    const inputs = [
      { x: 0, y: 0, timestamp: 0 },
      { x: 80, y: 0, timestamp: 16 },
      { x: 80, y: 80, timestamp: 32 },
    ];
    const output = reconstruct(inputs);
    const corner = output.find((point) => point.x === 80 && point.y === 0);
    expect(turnAngleDegrees(inputs[0], inputs[1], inputs[2])).toBe(90);
    expect(corner).toBeDefined();
    expect(output.every((point) => point.x <= 80 + 1e-9 && point.y >= -1e-9)).toBe(true);
  });

  it("reconstructs an S-curve without changing endpoint order", () => {
    const inputs = [
      { x: 0, y: 50, timestamp: 0 },
      { x: 40, y: 0, timestamp: 16 },
      { x: 80, y: 100, timestamp: 32 },
      { x: 120, y: 50, timestamp: 48 },
    ];
    const output = reconstruct(inputs);
    expect(output[0]).toEqual(inputs[0]);
    expect(output[output.length - 1]).toEqual(inputs[inputs.length - 1]);
    expect(output.some((point) => point.y < 50)).toBe(true);
    expect(output.some((point) => point.y > 50)).toBe(true);
    expect(output.every((point, index) => index === 0 || point.timestamp >= output[index - 1].timestamp)).toBe(true);
  });

  it("keeps a rapid reversal localized at the reversal input", () => {
    const output = reconstruct([
      { x: 0, y: 0, timestamp: 0 },
      { x: 100, y: 0, timestamp: 16 },
      { x: 10, y: 0, timestamp: 32 },
    ]);
    expect(output.some((point) => point.x === 100)).toBe(true);
    expect(Math.max(...output.map((point) => point.x))).toBeCloseTo(100, 8);
  });

  it("is deterministic for replayable input", () => {
    const inputs = [
      { x: -10, y: 4, timestamp: 0 },
      { x: 20, y: 30, timestamp: 19 },
      { x: 70, y: 42, timestamp: 35 },
      { x: 91, y: 12, timestamp: 54 },
    ];
    expect(reconstruct(inputs)).toEqual(reconstruct(inputs));
  });

  it("preserves transformed wall-space coordinates without screen coupling", () => {
    const inputs = [
      { x: -200, y: 140, timestamp: 0 },
      { x: -120, y: 180, timestamp: 16 },
      { x: -20, y: 160, timestamp: 32 },
    ];
    const output = reconstruct(inputs);
    expect(output[0]).toEqual(inputs[0]);
    expect(output[output.length - 1]).toEqual(inputs[inputs.length - 1]);
    expect(output.every((point) => point.x >= -200 && point.x <= -20)).toBe(true);
  });

  it("does not bend a straight fast gesture", () => {
    const output = reconstruct([
      { x: 0, y: 40, timestamp: 0 },
      { x: 120, y: 40, timestamp: 12 },
      { x: 260, y: 40, timestamp: 24 },
    ]);
    expect(output.every((point) => Math.abs(point.y - 40) < 1e-9)).toBe(true);
    const maxGap = Math.max(...output.slice(1).map((point, index) =>
      Math.hypot(point.x - output[index].x, point.y - output[index].y),
    ));
    expect(maxGap).toBeLessThanOrEqual(resolveCurveSampleSpacing(32, 120 / 12) + 1e-9);
  });
});
