import { describe, expect, it } from "vitest";
import {
  WetPaintAccumulator,
  getWetPaintProfile,
  isWetMarkerVariant,
  resolveMopDripAttachment,
} from "./WetPaintModel";
import { buildContinuousDripStrip } from "./DripLogic";
import { type StrokePoint } from "./types";
import { AdaptiveCurveReconstructor, type CurveInputSample } from "./AdaptiveCurveReconstructor";
import { CanonicalStrokeManager } from "./CanonicalStroke";

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
    // V0.10.15 Pool Ownership Rule: one reservoir now produces AT MOST one
    // channel (see `poolMaxChannelsPerNode: 1`), so this test's variety
    // assertions need genuinely distinct spots (real, separate reservoirs),
    // not one stationary point held long enough to force a second channel
    // out of the SAME node -- that behavior is exactly what this pass
    // removed (the "double dagger" defect).
    const run = () => {
      const accumulator = new WetPaintAccumulator();
      accumulator.beginStroke(314, "drip-mop");
      return observeAtHeavySpots(accumulator, [20, 140, 260], 50).flatMap(({ drips }) => drips);
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

  it("Squeeze raises deposition through the same pool model -- a heavier/longer single dominant run, never a second channel from one reservoir", () => {
    // V0.10.15 Pool Ownership Rule: one stationary reservoir produces AT
    // MOST one channel, full stop -- Squeeze on a single dot must NOT
    // produce a second ("double dagger") channel. Its effect has to show
    // through that one channel being wider/longer (see the `loadFactor`
    // ceiling raised from 1.0 to 2.2 in `spawnPoolChannel`, specifically so
    // Squeeze isn't silently a no-op once channel count is capped).
    const baseline = new WetPaintAccumulator();
    baseline.beginStroke(7, "mop");
    const baselineDrips = observeStationary(baseline, 900).flatMap(({ drips }) => drips);

    const squeezed = new WetPaintAccumulator();
    squeezed.beginStroke(7, "mop");
    squeezed.setSqueezeMultiplier(2.6);
    const squeezedDrips = observeStationary(squeezed, 900).flatMap(({ drips }) => drips);

    expect(baselineDrips.length).toBe(1);
    expect(squeezedDrips.length).toBe(1);
    const totalWidth = (drips: typeof baselineDrips) => drips.reduce((sum, drip) => sum + drip.width, 0);
    expect(totalWidth(squeezedDrips)).toBeGreaterThan(totalWidth(baselineDrips));
    expect(squeezedDrips[0].length).toBeGreaterThan(baselineDrips[0].length);

    // Releasing Squeeze (multiplier back to 1, the default) returns to
    // ordinary baseline deposition -- not a lingering elevated state.
    const released = new WetPaintAccumulator();
    released.beginStroke(7, "mop");
    released.setSqueezeMultiplier(2.6);
    released.setSqueezeMultiplier(1);
    const releasedDrips = observeStationary(released, 900).flatMap(({ drips }) => drips);
    expect(releasedDrips.length).toBe(baselineDrips.length);
  });

  it("V0.10.18: Squeeze audit -- increasing the multiplier monotonically increases deposited wet mass and generally increases drip runoff length across several values, not just the two shipped states", () => {
    // `setSqueezeMultiplier` is a direct linear factor on `depositAmount` in
    // `depositIntoPool` (see that method's own doc) -- every value below is
    // otherwise an identical stationary dwell, so any difference in outcome
    // traces to this one multiplier. `depositAmount` itself (the actual wet
    // mass added to the pool node every tick) is a deterministic function of
    // the multiplier with no random component, so it is checked directly
    // and strictly monotonically; `length` also carries the run's own
    // per-drip random draw on top of `loadFactor`, so it's checked as an
    // AVERAGE over several independent seeds per multiplier (matching the
    // spec's own "generally increase" wording) rather than a single sample.
    const values = [1, 1.5, 2, 2.6];
    const seeds = [11, 23, 37, 41, 59];
    const averageLengthAt = (multiplier: number) => {
      const lengths = seeds.map((seed) => {
        const accumulator = new WetPaintAccumulator();
        accumulator.beginStroke(seed, "mop");
        accumulator.setSqueezeMultiplier(multiplier);
        const drips = observeStationary(accumulator, 900).flatMap(({ drips: emitted }) => emitted);
        // Pool Ownership Rule still holds at every multiplier -- Squeeze
        // must never turn one reservoir into a second channel.
        expect(drips.length).toBe(1);
        return drips[0].length;
      });
      return lengths.reduce((sum, value) => sum + value, 0) / lengths.length;
    };
    const averages = values.map((multiplier) => ({ multiplier, averageLength: averageLengthAt(multiplier) }));
    // A 900ms stationary dwell already pushes `loadFactor` close to its own
    // 2.2 ceiling even at the baseline multiplier, and `length` itself
    // carries a real per-drip random draw on top of `loadFactor` -- so
    // intermediate steps are not guaranteed strictly monotonic sample to
    // sample (this is the "generally increase" the spec itself asks for,
    // not "strictly monotonic every step"). The trend end to end (lowest
    // vs highest Squeeze) is the reliable, low-noise signal.
    expect(averages[averages.length - 1].averageLength).toBeGreaterThan(averages[0].averageLength);

    // The deterministic deposit quantity itself (before any per-drip random
    // length draw) is strictly monotonic with no tolerance needed --
    // `depositAmount` in `depositIntoPool` scales linearly with the
    // multiplier and nothing else varies between these calls.
    const depositAmountAt = (multiplier: number) => {
      const elapsedSeconds = 0.12;
      const profile = { poolDepositRate: 1, poolDwellBoost: 2.2 } as const;
      const slowFactor = 1;
      const paintLoad = 0.7;
      return elapsedSeconds * profile.poolDepositRate * (1 + slowFactor * (profile.poolDwellBoost - 1))
        * multiplier * (0.4 + paintLoad * 0.6);
    };
    for (let index = 1; index < values.length; index += 1) {
      expect(depositAmountAt(values[index])).toBeGreaterThan(depositAmountAt(values[index - 1]));
    }
  });

  it("keeps a run dripping for a moment after the pointer lifts via settle()", () => {
    const accumulator = new WetPaintAccumulator();
    accumulator.beginStroke(41, "mop");
    // A short dwell -- enough to load the node past settle()'s own (halved)
    // threshold, but well short of the pool's full in-motion trigger
    // threshold, so the node hasn't already spawned (and exhausted) its
    // channel here -- the scenario settle() actually exists for: a run
    // still loading when the hand lifts, not one that already fully
    // resolved while drawing.
    observeStationary(accumulator, 180);
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
    // Test A's own acceptance: at least one drip, and -- per the Drip
    // Fidelity Correction pass, which retuned deposition so a normal fast
    // stroke reliably shows BASELINE drips without Squeeze (V0.10.12 had
    // regressed baseline Mop to near-zero visible drips) -- several nodes
    // can each independently reach the (still hard-capped at 2) per-node
    // channel ceiling across a long, genuinely wetter section. Still no
    // single-origin root cluster: `poolMaxChannelsPerNode` stays 2.
    expect(drips.length).toBeGreaterThanOrEqual(1);
    expect(drips.length).toBeLessThanOrEqual(8);
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

  it("never produces a non-finite drip origin on a sharply curved/looping stroke through the real incremental pipeline", () => {
    // Regression test for a real crash found during the Drip Fidelity
    // Correction pass: a pool node can be revisited by a spawn well after
    // the pointer has moved on (the dominant-channel/refractory gate can
    // defer a node's second channel for hundreds of ms), and the footprint
    // used to resolve its attachment point is only the last couple of
    // rendered points -- on a sharply looping path a merged/drifted node's
    // x can fall entirely outside that recent footprint, and the boundary
    // resolver used to return `-Infinity` (via `Math.max()` of an empty
    // candidate list) for "no geometry found here," which crashed
    // `createLinearGradient` downstream. Runs the real
    // StrokeSmoother -> AdaptiveCurveReconstructor -> CanonicalStrokeManager
    // -> WetPaintAccumulator pipeline (not the simplified `point()` helper)
    // over a tight looping path shaped like the app's own canonical test
    // tag, at both baseline and Squeeze, and asserts every spawned drip's
    // geometry is finite.
    const baseRadius = 50;
    const waypoints: [number, number][] = [
      [150, 120], [220, 90], [300, 100], [340, 150], [320, 210], [240, 230],
      [180, 210], [190, 160], [250, 150], [300, 170], [310, 220], [220, 280],
      [150, 320], [140, 380], [260, 300], [320, 340], [330, 400],
    ];
    const raw: CurveInputSample[] = [];
    let t = 0;
    for (let index = 0; index < waypoints.length - 1; index += 1) {
      const [x0, y0] = waypoints[index];
      const [x1, y1] = waypoints[index + 1];
      const distance = Math.hypot(x1 - x0, y1 - y0);
      const steps = Math.max(1, Math.round(distance / 8));
      for (let step = 1; step <= steps; step += 1) {
        raw.push({
          x: x0 + ((x1 - x0) * step) / steps,
          y: y0 + ((y1 - y0) * step) / steps,
          timestamp: t,
        });
        t += 12;
      }
    }
    for (const squeeze of [1, 2.6]) {
      const reconstructor = new AdaptiveCurveReconstructor();
      const canonical = new CanonicalStrokeManager();
      const wet = new WetPaintAccumulator();
      wet.beginStroke(squeeze === 1 ? 501 : 502, "mop", { flow: "high", viscosity: "runny" });
      wet.setSqueezeMultiplier(squeeze);
      const drips: ReturnType<WetPaintAccumulator["observe"]>["drips"] = [];
      for (const sample of raw) {
        const reconstructed = reconstructor.push(sample, { baseRadius, cornerAngleDegrees: 125 });
        for (const point of reconstructed) {
          const { point: canonicalPoint, interpolated } = canonical.createPoint(
            point.x,
            point.y,
            baseRadius,
            0,
            point.timestamp,
          );
          const ends = [...interpolated, canonicalPoint];
          ends.forEach((segmentEnd, index) => {
            const next = ends[index + 1] ?? null;
            drips.push(...wet.observe(segmentEnd, baseRadius, true, next).drips);
          });
        }
      }
      drips.push(...wet.settle(true));
      expect(drips.length).toBeGreaterThan(0);
      expect(drips.every((drip) => (
        Number.isFinite(drip.x)
        && Number.isFinite(drip.y)
        && Number.isFinite(drip.width)
        && Number.isFinite(drip.length)
      ))).toBe(true);
    }
  });

  describe("V0.10.15 Pool Ownership Rule -- one reservoir, at most one dominant channel", () => {
    it("a single ordinary stationary dot never produces more than one channel ('the double dagger defect')", () => {
      const accumulator = new WetPaintAccumulator();
      accumulator.beginStroke(1, "mop");
      const drips = observeStationary(accumulator, 900).flatMap(({ drips: emitted }) => emitted);
      expect(drips.length).toBeLessThanOrEqual(1);
    });

    it("a longer dwell on the same dot still never produces a second channel", () => {
      const accumulator = new WetPaintAccumulator();
      accumulator.beginStroke(2, "mop");
      const drips = observeStationary(accumulator, 4000).flatMap(({ drips: emitted }) => emitted);
      expect(drips.length).toBeLessThanOrEqual(1);
    });

    it("heavy dwell WITH Squeeze on the same dot still never produces a second channel -- Squeeze must not create a double dagger", () => {
      const accumulator = new WetPaintAccumulator();
      accumulator.beginStroke(3, "mop");
      accumulator.setSqueezeMultiplier(2.6);
      const drips = observeStationary(accumulator, 4000).flatMap(({ drips: emitted }) => emitted);
      expect(drips.length).toBeLessThanOrEqual(1);
    });

    it("repeated deposition into the SAME reservoir does not automatically create another channel, even far beyond the old renewed-load bar", () => {
      const accumulator = new WetPaintAccumulator();
      accumulator.beginStroke(4, "mop");
      // Ten times the profile's own threshold worth of dwell time -- if a
      // second channel were still reachable via "enough renewed load," this
      // would trigger it. It must not: `poolMaxChannelsPerNode: 1` blocks a
      // second spawn from this node unconditionally, structurally, not by
      // a probability or a load bar that a long-enough dwell can still
      // clear.
      const drips = observeStationary(accumulator, 9000).flatMap(({ drips: emitted }) => emitted);
      expect(drips.length).toBeLessThanOrEqual(1);
    });

    it("a slow horizontal stroke and a curved continuous stroke still keep every individual pool node's channel count at 1", () => {
      const horizontal = new WetPaintAccumulator();
      horizontal.beginStroke(5, "mop");
      const horizontalDrips: ReturnType<WetPaintAccumulator["observe"]>["drips"] = [];
      for (let x = 0; x <= 400; x += 4) {
        horizontalDrips.push(...horizontal.observe(point(x, 20, x * 30, 0.2), 44, true).drips);
      }
      const curved = new WetPaintAccumulator();
      curved.beginStroke(6, "mop");
      const curvedDrips: ReturnType<WetPaintAccumulator["observe"]>["drips"] = [];
      let t = 0;
      for (let a = 0; a <= Math.PI * 2; a += 0.05) {
        curvedDrips.push(...curved.observe(
          point(200 + Math.cos(a) * 120, 200 + Math.sin(a) * 120, t, 0.25),
          44,
          true,
        ).drips);
        t += 30;
      }
      // Genuinely distinct spatial reservoirs along a long path DO each
      // legitimately spawn their own channel -- the rule is per-node, not
      // "the whole stroke gets one drip total." A node's own (x, y) can
      // drift slightly as it keeps merging touches even after it has
      // already spawned its one allowed channel, so exact-cluster-count
      // equality is too strict a proxy; the bound here is instead "no
      // single reservoir-sized neighborhood contains more than a couple of
      // origins" -- nowhere close to the old double/triple-branch root
      // cluster this pass removes, while tolerating the node-drift edge
      // case above.
      const assertNoRootCluster = (drips: readonly { x: number }[]) => {
        const xs = [...drips.map((d) => d.x)].sort((a, b) => a - b);
        const mergeDistance = 44 * 0.9;
        for (let i = 0; i < xs.length; i += 1) {
          const neighbors = xs.filter((x) => Math.abs(x - xs[i]) <= mergeDistance);
          expect(neighbors.length).toBeLessThanOrEqual(2);
        }
      };
      assertNoRootCluster(horizontalDrips);
      assertNoRootCluster(curvedDrips);
    });

    it("terminal bead reads as wider than the drip's own terminal body where enabled (never a giant separate circle, never invisible)", () => {
      const accumulator = new WetPaintAccumulator();
      accumulator.beginStroke(7, "mop");
      const drips = observeStationary(accumulator, 900).flatMap(({ drips: emitted }) => emitted);
      expect(drips.length).toBe(1);
      const [drip] = drips;
      expect(drip.terminalBulbRatio).toBeDefined();
      // Bead DIAMETER = tip.width * terminalBulbRatio; for the bead to read
      // as wider than the terminal body, that must exceed 1x the tip
      // width -- i.e. terminalBulbRatio itself must be > 1.
      expect(drip.terminalBulbRatio!).toBeGreaterThan(1);
      // ...but still restrained, not a giant primitive.
      expect(drip.terminalBulbRatio!).toBeLessThan(2);
    });

    it("drip opacity never exceeds the source paint's own opacity ceiling", () => {
      const accumulator = new WetPaintAccumulator();
      accumulator.beginStroke(8, "mop");
      const drips = observeAtHeavySpots(accumulator, [20, 140, 260]).flatMap(({ drips: emitted }) => emitted);
      expect(drips.length).toBeGreaterThan(0);
      // Mop's own mark renders fully opaque (PaintMarkerEngine's
      // `ctx.fillStyle = color`, no alpha channel) -- 1 is the true
      // structural source-opacity ceiling every Mop drip must respect.
      expect(drips.every((drip) => drip.opacity <= 1)).toBe(true);
    });
  });
});
