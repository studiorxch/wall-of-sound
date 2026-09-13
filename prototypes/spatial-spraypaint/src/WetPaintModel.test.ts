import { describe, expect, it } from "vitest";
import {
  WetPaintAccumulator,
  getWetPaintProfile,
  isWetMarkerVariant,
  resolveMopDripAttachment,
} from "./WetPaintModel";
import { buildContinuousDripStrip } from "./DripLogic";
import { type StrokePoint } from "./types";

const point = (x: number, y: number, timestamp: number, velocity: number): StrokePoint => ({
  x,
  y,
  timestamp,
  velocity,
  width: 44,
  opacity: 1,
});

function distanceToSegment(
  sample: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
): number {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const lengthSquared = deltaX ** 2 + deltaY ** 2;
  const progress = lengthSquared === 0
    ? 0
    : Math.max(0, Math.min(1, (
      (sample.x - start.x) * deltaX + (sample.y - start.y) * deltaY
    ) / lengthSquared));
  return Math.hypot(
    sample.x - (start.x + deltaX * progress),
    sample.y - (start.y + deltaY * progress),
  );
}

function insideRenderedMopBody(
  sample: { x: number; y: number },
  footprint: readonly StrokePoint[],
): boolean {
  const radius = footprint[0].width * 1.32 * 0.5;
  if (footprint.length === 1) {
    return Math.hypot(sample.x - footprint[0].x, sample.y - footprint[0].y) <= radius;
  }
  return footprint.slice(1).some((end, index) => (
    distanceToSegment(sample, footprint[index], end) <= radius
  ));
}

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

  it("keeps Mop moderate while making Drip Mop stems and runs materially stronger", () => {
    const mopProfile = getWetPaintProfile("mop");
    const dripProfile = getWetPaintProfile("drip-mop");
    expect(dripProfile.stemWidthBaseRatio).toBeGreaterThan(mopProfile.stemWidthBaseRatio);
    expect(dripProfile.stemWidthLoadRatio).toBeGreaterThan(mopProfile.stemWidthLoadRatio);
    expect(dripProfile.lengthMin).toBeGreaterThan(mopProfile.lengthMin * 2);
    expect(dripProfile.lengthRange).toBeGreaterThan(mopProfile.lengthRange * 2);
    expect(dripProfile.tipWidthRatio).toBeGreaterThan(0.6);
    expect(dripProfile.originPoolRatio).toBeLessThan(1);
    expect(dripProfile.cooldownMs).toBeLessThan(mopProfile.cooldownMs);

    const collect = (variant: "mop" | "drip-mop", size: number) => {
      const accumulator = new WetPaintAccumulator();
      accumulator.beginStroke(314, variant);
      return observeStationary(accumulator, 3600, size).flatMap(({ drips }) => drips);
    };
    const mopDrips = collect("mop", 44);
    const dripMopDrips = collect("drip-mop", 50);
    const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
    expect(mopDrips.length).toBeGreaterThan(0);
    expect(dripMopDrips.length).toBeGreaterThan(mopDrips.length);
    expect(average(dripMopDrips.map(({ width }) => width))).toBeGreaterThan(average(mopDrips.map(({ width }) => width)) * 1.5);
    expect(average(dripMopDrips.map(({ length }) => length))).toBeGreaterThan(average(mopDrips.map(({ length }) => length)) * 2);
    expect(dripMopDrips.every(({ originPoolRadius, tipWidthRatio }) => Boolean(originPoolRadius) && Boolean(tipWidthRatio))).toBe(true);
    expect(dripMopDrips.every(({ renderAsOverlay }) => renderAsOverlay)).toBe(true);
    expect(dripMopDrips.every(({ bend, length }) => Math.abs(bend ?? 0) <= length * 0.028)).toBe(true);
    expect(dripMopDrips.every(({ width }) => width > 10)).toBe(true);
  });

  it("replays drip origins, lengths, bends, kinks, and timing deterministically", () => {
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
    expect(first.some(({ kink }) => kink !== 0)).toBe(true);
  });

  it("suppresses wet drips when stationary drips are disabled", () => {
    const accumulator = new WetPaintAccumulator();
    accumulator.beginStroke(4, "drip-mop");
    accumulator.observe(point(0, 0, 0, 0), 50, false);
    const results = Array.from({ length: 14 }, (_, index) =>
      accumulator.observe(point(0, 0, (index + 1) * 120, 0), 50, false));
    expect(results.flatMap(({ drips }) => drips)).toHaveLength(0);
  });

  it("applies Flow authority to reservoir delivery without affecting non-wet tools", () => {
    const low = new WetPaintAccumulator();
    low.beginStroke(21, "mop", { flow: "low", viscosity: "balanced" });
    const lowResults = observeStationary(low, 960);
    const high = new WetPaintAccumulator();
    high.beginStroke(21, "mop", { flow: "high", viscosity: "balanced" });
    const highResults = observeStationary(high, 960);
    expect(highResults[0].paintLoad).toBeGreaterThan(lowResults[0].paintLoad);
    expect(highResults[highResults.length - 1].paintLoad).toBeGreaterThan(lowResults[lowResults.length - 1].paintLoad);
    expect(isWetMarkerVariant("round")).toBe(false);
    expect(isWetMarkerVariant("chisel")).toBe(false);
  });

  it("applies Viscosity authority to deterministic run length, width, and fall time", () => {
    const collect = (viscosity: "thick" | "runny") => {
      const accumulator = new WetPaintAccumulator();
      accumulator.beginStroke(52, "drip-mop", { flow: "high", viscosity });
      return observeStationary(accumulator, 3600, 50).flatMap(({ drips }) => drips);
    };
    const thick = collect("thick");
    const runny = collect("runny");
    expect(thick.length).toBeGreaterThan(0);
    expect(runny.length).toBeGreaterThan(0);
    expect(runny[0].length).toBeGreaterThan(thick[0].length);
    expect(thick[0].width).toBeGreaterThan(runny[0].width);
    expect(runny[0].durationMs!).toBeLessThan(thick[0].durationMs!);
  });

  it("keeps Drippy Chisel wet but restrained below Drip Mop", () => {
    const chisel = getWetPaintProfile("drippy-chisel");
    const dripMop = getWetPaintProfile("drip-mop");
    expect(isWetMarkerVariant("drippy-chisel")).toBe(true);
    expect(chisel.dripLoadThreshold).toBeGreaterThan(dripMop.dripLoadThreshold);
    expect(chisel.lengthMin).toBeLessThan(dripMop.lengthMin);
    expect(chisel.lengthRange).toBeLessThan(dripMop.lengthRange);
    expect(chisel.stemWidthBaseRatio).toBeLessThan(dripMop.stemWidthBaseRatio);
    expect(chisel.cooldownMs).toBeGreaterThan(dripMop.cooldownMs);
  });

  it("places wet origins beneath the mark and within its contact span", () => {
    const accumulator = new WetPaintAccumulator();
    accumulator.beginStroke(314, "drip-mop", { flow: "high", viscosity: "runny" });
    const drips = observeStationary(accumulator, 2400, 50).flatMap(({ drips: emitted }) => emitted);
    expect(drips.length).toBeGreaterThan(0);
    expect(drips.every(({ x, y }) => y > 45 && y < 52 && Math.abs(x - 20) <= 15.5)).toBe(true);
  });

  const attachmentCases = [
    ["stationary dot / dwell", [[40, 40]], 0],
    ["vertical stroke", [[40, 0], [40, 40], [40, 80]], 1],
    ["horizontal stroke", [[0, 40], [40, 40], [80, 40]], 1],
    ["+45° lower-left → upper-right", [[0, 70], [35, 35], [70, 0]], 1],
    ["+45° upper-right → lower-left", [[70, 0], [35, 35], [0, 70]], 1],
    ["-45° upper-left → lower-right", [[0, 0], [35, 35], [70, 70]], 1],
    ["-45° lower-right → upper-left", [[70, 70], [35, 35], [0, 0]], 1],
    ["shallow diagonal", [[0, 30], [40, 40], [80, 50]], 1],
    ["steep diagonal", [[30, 0], [40, 40], [50, 80]], 1],
    ["clockwise circle", [[20, 0], [35, 5], [45, 18], [50, 35]], 2],
    ["counter-clockwise circle", [[50, 35], [45, 18], [35, 5], [20, 0]], 1],
    ["tight curve", [[0, 0], [25, 0], [25, 25], [50, 25]], 2],
    ["broad curve", [[0, 20], [25, 5], [55, 5], [80, 20]], 2],
  ] as const;

  it.each(attachmentCases)("keeps the first drip segment attached for %s", (_label, coordinates, reservoirIndex) => {
    const footprint = coordinates.map(([x, y], index) => point(x, y, index * 16, 0.25));
    const reservoir = footprint[reservoirIndex];
    const attachment = resolveMopDripAttachment("drip-mop", footprint, reservoir, 8);
    const strip = buildContinuousDripStrip({
      x: attachment.origin.x,
      y: attachment.origin.y,
      width: 12,
      length: 220,
      opacity: 0.84,
      bend: 4,
      tipWidthRatio: 0.62,
      originPoolRadius: 9,
      renderAsOverlay: true,
    }, 24);

    expect(attachment.origin.y).toBeLessThan(attachment.boundaryY);
    expect(attachment.boundaryY - attachment.origin.y).toBeCloseTo(attachment.overlap, 10);
    expect(strip[0].center).toEqual(attachment.origin);
    expect(insideRenderedMopBody(strip[0].center, footprint)).toBe(true);
    expect(insideRenderedMopBody(strip[1].center, footprint)).toBe(true);
    expect(attachment).toEqual(resolveMopDripAttachment("drip-mop", footprint, reservoir, 8));
  });

  it.each([
    ["+45°", [[0, 70], [35, 35], [70, 0]]],
    ["-45°", [[0, 0], [35, 35], [70, 70]]],
  ] as const)("is attachment-direction invariant for %s diagonals", (_label, coordinates) => {
    const forward = coordinates.map(([x, y], index) => point(x, y, index * 16, 0.25));
    const reverse = [...forward].reverse();
    const reservoir = forward[1];
    expect(resolveMopDripAttachment("drip-mop", forward, reservoir, 8)).toEqual(
      resolveMopDripAttachment("drip-mop", reverse, reservoir, 8),
    );
  });

  it("anchors Drippy Chisel pools inside even its narrow contact edge", () => {
    const accumulator = new WetPaintAccumulator();
    accumulator.beginStroke(314, "drippy-chisel", { flow: "high", viscosity: "runny" });
    const size = 38;
    const drips = observeStationary(accumulator, 3000, size).flatMap(({ drips: emitted }) => emitted);
    expect(drips.length).toBeGreaterThan(0);
    expect(drips.every(({ y, originPoolRadius }) => (
      y - 20 <= size * 0.15
      && y - (originPoolRadius ?? 0) < 20 + size * 0.15
    ))).toBe(true);
    expect(drips.every(({ renderAsOverlay }) => !renderAsOverlay)).toBe(true);
  });
});
