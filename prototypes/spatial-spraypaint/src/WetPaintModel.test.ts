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

/**
 * A heavy tag has a few genuinely dwelled/loaded sections, not one. This
 * holds at several well-separated x positions -- by default for a
 * realistic ~900ms pause each, the same order of magnitude as an actual
 * hand/mouse dwell -- so each forms its own pool node. Per the
 * dominant-channel/refractory rule (`depositIntoPool`), a typical node like
 * this produces ONE channel; only sustained, well-beyond-realistic holds
 * accumulate enough renewed load for a second.
 */
function observeAtHeavySpots(
  accumulator: WetPaintAccumulator,
  spots: readonly number[],
  size = 44,
  holdMs = 900,
): ReturnType<WetPaintAccumulator["observe"]>[] {
  const results: ReturnType<WetPaintAccumulator["observe"]>[] = [];
  let timestamp = 0;
  for (const x of spots) {
    results.push(accumulator.observe(point(x, 20, timestamp, 0.3), size, true));
    timestamp += 120;
    for (let elapsed = 120; elapsed <= holdMs; elapsed += 120) {
      results.push(accumulator.observe(point(x, 20, timestamp, 0), size, true));
      timestamp += 120;
    }
  }
  return results;
}

/** Groups drip x-positions into clusters (within `epsilon` of each other) as a black-box stand-in for "how many distinct pool nodes actually produced these channels." */
function countDistinctOriginClusters(xs: readonly number[], epsilon: number): number {
  const sorted = [...xs].sort((a, b) => a - b);
  let clusters = 0;
  let clusterStart = -Infinity;
  for (const x of sorted) {
    if (x - clusterStart > epsilon) clusters += 1;
    clusterStart = x;
  }
  return clusters;
}

describe("wet paint load authority", () => {
  it("builds load during dwell and emits a gravity-driven Mop drip from its pooled reservoir -- one dominant channel, not a cluster", () => {
    const accumulator = new WetPaintAccumulator();
    accumulator.beginStroke(17, "mop");
    const results = observeStationary(accumulator, 2400);
    const drips = results.flatMap(({ drips }) => drips);

    // Load legitimately oscillates now -- a channel firing drains it hard
    // (the dominant-channel rule), then dwell rebuilds it, same as real
    // paint being used up and re-pooling -- so this no longer asserts
    // monotonic increase. What matters is it never leaves the valid load
    // range, and that even a very long single-spot dwell stays a dominant
    // channel plus at most one occasional secondary -- never a cluster.
    expect(results.every(({ paintLoad }) => paintLoad >= 0.22 && paintLoad <= 1)).toBe(true);
    expect(drips.length).toBeGreaterThan(0);
    expect(drips.length).toBeLessThanOrEqual(2);
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

  it("makes Drip Mop respond sooner (reaches its first channel earlier) than Mop, with a higher initial load", () => {
    const mop = new WetPaintAccumulator();
    mop.beginStroke(9, "mop");
    const mopResults = observeStationary(mop, 720);

    const dripMop = new WetPaintAccumulator();
    dripMop.beginStroke(9, "drip-mop");
    const dripResults = observeStationary(dripMop, 720, 50);

    expect(dripResults[0].paintLoad).toBeGreaterThan(mopResults[0].paintLoad);
    // Neither variant produces a root cluster from one static dwell...
    const mopDrips = mopResults.flatMap(({ drips }) => drips);
    const dripMopDrips = dripResults.flatMap(({ drips }) => drips);
    expect(mopDrips.length).toBeLessThanOrEqual(2);
    expect(dripMopDrips.length).toBeLessThanOrEqual(2);
    // ...but Drip Mop's lower threshold and higher deposit rate mean its
    // one dominant channel breaks free sooner.
    const firstDripCallIndex = (results: typeof mopResults) => results.findIndex(({ drips }) => drips.length > 0);
    const mopFirst = firstDripCallIndex(mopResults);
    const dripMopFirst = firstDripCallIndex(dripResults);
    expect(mopFirst).toBeGreaterThanOrEqual(0);
    expect(dripMopFirst).toBeGreaterThanOrEqual(0);
    expect(dripMopFirst).toBeLessThan(mopFirst);
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
    // Both stay dominant-channel (no cluster) from one static dwell, so
    // "stronger" is measured in per-drip width/length, not raw count.
    expect(mopDrips.length).toBeLessThanOrEqual(2);
    expect(dripMopDrips.length).toBeLessThanOrEqual(2);
    expect(average(dripMopDrips.map(({ width }) => width))).toBeGreaterThan(average(mopDrips.map(({ width }) => width)) * 1.5);
    expect(average(dripMopDrips.map(({ length }) => length))).toBeGreaterThan(average(mopDrips.map(({ length }) => length)) * 2);
    expect(dripMopDrips.every(({ originPoolRadius, tipWidthRatio }) => Boolean(originPoolRadius) && Boolean(tipWidthRatio))).toBe(true);
    expect(dripMopDrips.every(({ renderAsOverlay }) => renderAsOverlay)).toBe(true);
    expect(dripMopDrips.every(({ bend, length }) => Math.abs(bend ?? 0) <= length * 0.028)).toBe(true);
    // Drip Mop stays chunky on average, not that literally every drip is
    // wide (width still varies with per-channel flux/randomness).
    expect(average(dripMopDrips.map(({ width }) => width))).toBeGreaterThan(10);
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

  it("keeps average channels per pool node close to 1 -- a typical pooled spot produces one main drip, not a root cluster", () => {
    const accumulator = new WetPaintAccumulator();
    accumulator.beginStroke(41, "mop");
    // Three well-separated heavy spots, each held for a realistic ~900ms
    // pause -- a stand-in for the couple of genuinely saturated sections a
    // real heavy tag has.
    const drips = observeAtHeavySpots(accumulator, [20, 120, 240])
      .flatMap(({ drips: emitted }) => emitted);
    expect(drips.length).toBeGreaterThanOrEqual(3);
    const clusters = countDistinctOriginClusters(drips.map(({ x }) => x), 44 * 0.5);
    // At most one true origin per heavy spot (merging keeps it from ever
    // exceeding that)...
    expect(clusters).toBeGreaterThanOrEqual(2);
    expect(clusters).toBeLessThanOrEqual(3);
    // ...and average channels per node stays close to 1, never approaching
    // the old 6-10-per-node "root cluster" density.
    const averageChannelsPerNode = drips.length / clusters;
    expect(averageChannelsPerNode).toBeGreaterThanOrEqual(1);
    expect(averageChannelsPerNode).toBeLessThan(2.5);
  });

  it("keeps channels from the SAME pool node clustered near its own origin, not scattered across the stroke", () => {
    const accumulator = new WetPaintAccumulator();
    accumulator.beginStroke(41, "mop");
    const drips = observeStationary(accumulator, 2400).flatMap(({ drips: emitted }) => emitted);
    expect(drips.length).toBeGreaterThan(0);
    const xs = drips.map(({ x }) => x);
    const spread = Math.max(...xs) - Math.min(...xs);
    // Whatever channel(s) came from one pool at one stationary point (at
    // most 2, per the dominant-channel cap) should coalesce near it (a
    // fraction of the marker's own size), not spread across an arbitrarily
    // wide span.
    expect(spread).toBeLessThan(44);
  });

  it("gives Mop drips a mostly-vertical gravity path -- gravity dominates, kinks are occasional not universal", () => {
    const accumulator = new WetPaintAccumulator();
    accumulator.beginStroke(41, "mop");
    // Several heavy spots (rather than one dwell, now capped at 1-2
    // channels) to gather enough samples to test path-shape distribution.
    const drips = observeAtHeavySpots(accumulator, [20, 120, 240, 360, 480])
      .flatMap(({ drips: emitted }) => emitted);
    expect(drips.length).toBeGreaterThan(3);
    // A restrained path: most drips are NOT dominated by an artificial
    // wiggle -- |bend| stays a modest fraction of the run's own length.
    expect(drips.every(({ bend, length }) => Math.abs(bend ?? 0) <= length * 0.16)).toBe(true);
    // Some drips do carry a kink (a real gravity path isn't perfectly
    // straight either) but it is the exception, not the rule -- unlike the
    // near-universal kink of the prior "curly hair" pass.
    const kinkedFraction = drips.filter(({ kink }) => (kink ?? 0) !== 0).length / drips.length;
    expect(kinkedFraction).toBeLessThan(0.85);
  });

  it("Squeeze raises deposition through the same pool model -- more/heavier runs, not a direct drip-count multiplier", () => {
    const baseline = new WetPaintAccumulator();
    baseline.beginStroke(7, "mop");
    const baselineDrips = observeStationary(baseline, 900).flatMap(({ drips }) => drips);

    const squeezed = new WetPaintAccumulator();
    squeezed.beginStroke(7, "mop");
    squeezed.setSqueezeMultiplier(2.6);
    const squeezedDrips = observeStationary(squeezed, 900).flatMap(({ drips }) => drips);

    expect(squeezedDrips.length).toBeGreaterThan(baselineDrips.length);
    const totalWidth = (drips: typeof baselineDrips) => drips.reduce((sum, drip) => sum + drip.width, 0);
    expect(totalWidth(squeezedDrips)).toBeGreaterThan(totalWidth(baselineDrips));

    // Releasing Squeeze (multiplier back to 1, the default) returns to
    // ordinary baseline deposition -- not a lingering elevated state.
    const released = new WetPaintAccumulator();
    released.beginStroke(7, "mop");
    released.setSqueezeMultiplier(2.6);
    released.setSqueezeMultiplier(1);
    const releasedDrips = observeStationary(released, 900).flatMap(({ drips }) => drips);
    expect(releasedDrips.length).toBe(baselineDrips.length);
  });

  it("keeps a run dripping for a moment after the pointer lifts via settle()", () => {
    const accumulator = new WetPaintAccumulator();
    accumulator.beginStroke(41, "mop");
    observeStationary(accumulator, 960);
    const settled = accumulator.settle(true);
    expect(settled.length).toBeGreaterThan(0);
    expect(settled.every((drip) => drip.length > 0)).toBe(true);

    // No accumulated load (never began a stroke) -> nothing to settle.
    expect(new WetPaintAccumulator().settle(true)).toHaveLength(0);
    // dripsEnabled=false must suppress settle() drips too.
    const disabled = new WetPaintAccumulator();
    disabled.beginStroke(41, "mop");
    observeStationary(disabled, 960);
    expect(disabled.settle(false)).toHaveLength(0);
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
    // Both stay dominant-channel (at most 1-2 from one static dwell, per
    // the refractory rule) so the "Flow authority" signal is that High
    // flow's one dominant channel breaks free SOONER than Low flow's, not
    // a higher raw count.
    const firstDripCallIndex = (results: typeof lowResults) => results.findIndex(({ drips }) => drips.length > 0);
    const lowFirst = firstDripCallIndex(lowResults);
    const highFirst = firstDripCallIndex(highResults);
    expect(lowFirst).toBeGreaterThanOrEqual(0);
    expect(highFirst).toBeGreaterThanOrEqual(0);
    expect(highFirst).toBeLessThan(lowFirst);
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
    // Origins are now sampled across the full contact width (stratified,
    // not just near the tip), including near its edges, where the mark's
    // own circular footprint is naturally shallower -- so the y-window
    // widens versus a single-drip sample, while the x-span stays exactly
    // bounded by the contact width used to place it.
    expect(drips.every(({ x, y }) => y > 20 && y < 55 && Math.abs(x - 20) <= 15.5 + 1e-6)).toBe(true);
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

  it("lets a drip originate from the wet MIDDLE of a long horizontal stroke, not only its endpoints/corners", () => {
    // Regression test for requirement 4: drips must sample the wet lower
    // boundary anywhere it's sufficiently loaded, not special-case
    // endpoints/joints/pauses. A single long horizontal pass, faster at
    // both ends and noticeably (but never fully) slower through the
    // middle third -- a genuinely wetter middle section, not a stop.
    const accumulator = new WetPaintAccumulator();
    accumulator.beginStroke(99, "mop");
    const totalLength = 600;
    const size = 44;
    const results: ReturnType<WetPaintAccumulator["observe"]>[] = [];
    let timestamp = 0;
    for (let x = 0; x <= totalLength; x += 6) {
      const inMiddleThird = x > totalLength * 0.35 && x < totalLength * 0.65;
      const velocity = inMiddleThird ? 0.15 : 1.1;
      results.push(accumulator.observe(point(x, 20, timestamp, velocity), size, true));
      timestamp += inMiddleThird ? 40 : 16;
    }
    const drips = results.flatMap(({ drips: emitted }) => emitted);
    // Test A's own acceptance: 1-3 drips possible, no root cluster.
    expect(drips.length).toBeGreaterThanOrEqual(1);
    expect(drips.length).toBeLessThanOrEqual(3);
    const endpointMargin = totalLength * 0.12;
    const originatesMidStroke = drips.some(({ x }) => (
      x > endpointMargin && x < totalLength - endpointMargin
    ));
    expect(originatesMidStroke).toBe(true);
    // Not all origins may be endpoint/corner-biased.
    const allAtEndpoints = drips.every(({ x }) => (
      x <= endpointMargin || x >= totalLength - endpointMargin
    ));
    expect(allAtEndpoints).toBe(false);
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
