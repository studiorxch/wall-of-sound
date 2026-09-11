import { describe, expect, it } from "vitest";
import { WetPaintAccumulator } from "./WetPaintModel";
import { type StrokePoint } from "./types";

const point = (x: number, y: number, timestamp: number, velocity: number): StrokePoint => ({
  x,
  y,
  timestamp,
  velocity,
  width: 44,
  opacity: 1,
});

function observeStationary(
  accumulator: WetPaintAccumulator,
  durationMs: number,
  size = 44,
): ReturnType<WetPaintAccumulator["observe"]>[] {
  const results = [accumulator.observe(point(20, 20, 0, 0), size, true)];
  for (let timestamp = 120; timestamp <= durationMs; timestamp += 120) {
    results.push(accumulator.observe(point(20, 20, timestamp, 0), size, true));
  }
  return results;
}

describe("wet paint load authority", () => {
  it("builds load during slow dwell and emits gravity-driven Mop drips", () => {
    const accumulator = new WetPaintAccumulator();
    accumulator.beginStroke(17, "mop");
    const results = observeStationary(accumulator, 1440);
    const drips = results.flatMap(({ drips }) => drips);

    expect(results[results.length - 1].paintLoad).toBeGreaterThan(results[0].paintLoad);
    expect(drips.length).toBeGreaterThan(0);
    expect(drips.every((drip) => drip.length > 0 && drip.y > 20)).toBe(true);
  });

  it("thins fast motion while preserving a bounded paint load", () => {
    const slow = new WetPaintAccumulator();
    slow.beginStroke(2, "mop");
    slow.observe(point(0, 0, 0, 0), 44, true);
    const slowResult = slow.observe(point(1, 0, 120, 0.08), 44, true);

    const fast = new WetPaintAccumulator();
    fast.beginStroke(2, "mop");
    fast.observe(point(0, 0, 0, 0), 44, true);
    const fastResult = fast.observe(point(80, 0, 120, 5), 44, true);

    expect(slowResult.paintLoad).toBeGreaterThan(fastResult.paintLoad);
    expect(fast.snapshot().paintLoad).toBeGreaterThanOrEqual(0.22);
    expect(slow.snapshot().paintLoad).toBeLessThanOrEqual(1);
  });

  it("makes Drip Mop respond sooner and with a higher initial load than Mop", () => {
    const mop = new WetPaintAccumulator();
    mop.beginStroke(9, "mop");
    const mopResults = observeStationary(mop, 720);

    const dripMop = new WetPaintAccumulator();
    dripMop.beginStroke(9, "drip-mop");
    const dripResults = observeStationary(dripMop, 720, 50);

    expect(dripResults[0].paintLoad).toBeGreaterThan(mopResults[0].paintLoad);
    expect(dripResults.flatMap(({ drips }) => drips).length).toBeGreaterThan(0);
    expect(mopResults.flatMap(({ drips }) => drips)).toHaveLength(0);
  });

  it("replays drip origins, lengths, bends, and timing deterministically", () => {
    const run = () => {
      const accumulator = new WetPaintAccumulator();
      accumulator.beginStroke(314, "drip-mop");
      return observeStationary(accumulator, 2640, 50).flatMap(({ drips }) => drips);
    };
    const first = run();
    const second = run();

    expect(first).toEqual(second);
    expect(first.length).toBeGreaterThanOrEqual(2);
    expect(new Set(first.map(({ x }) => x)).size).toBeGreaterThan(1);
    expect(new Set(first.map(({ length }) => length)).size).toBeGreaterThan(1);
    expect(new Set(first.map(({ durationMs }) => durationMs)).size).toBeGreaterThan(1);
    expect(first.some(({ bend }) => bend !== 0)).toBe(true);
  });

  it("suppresses wet drips when stationary drips are disabled", () => {
    const accumulator = new WetPaintAccumulator();
    accumulator.beginStroke(4, "drip-mop");
    accumulator.observe(point(0, 0, 0, 0), 50, false);
    const results = Array.from({ length: 14 }, (_, index) =>
      accumulator.observe(point(0, 0, (index + 1) * 120, 0), 50, false));
    expect(results.flatMap(({ drips }) => drips)).toHaveLength(0);
  });
});
