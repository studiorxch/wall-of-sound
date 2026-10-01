import { describe, expect, it } from "vitest";
import {
  MOP_DRIP_TUNING,
  SPRAY_DRIP_TUNING,
  resolveDripOrigins,
  resolveMaterialDripPlans,
  simulateMaterialDrip,
  type DripSourcePoint,
} from "./dripDeposition";

function fastPoints(count: number): DripSourcePoint[] {
  // Fast/dispersed gesture -- densityFactor at or below neutral (1) the
  // whole way, so local load never accumulates.
  return Array.from({ length: count }, (_, i) => ({ x: i * 10, y: 0, densityFactor: 0.8 }));
}

function dwelledPoints(count: number, densityFactor = 1.6): DripSourcePoint[] {
  // Slow/dwelled gesture -- densityFactor consistently above neutral, so
  // load accumulates across the trailing window.
  return Array.from({ length: count }, (_, i) => ({ x: i * 2, y: 0, densityFactor }));
}

describe("dripDeposition -- resolveDripOrigins (accumulation/threshold)", () => {
  it("an ordinary fast/light gesture never crosses the load threshold -- no drip origins at all", () => {
    const origins = resolveDripOrigins(fastPoints(40), 10, MOP_DRIP_TUNING);
    expect(origins).toEqual([]);
  });

  it("sufficient dwell/local accumulation crosses the threshold and yields at least one bounded origin", () => {
    const origins = resolveDripOrigins(dwelledPoints(40), 10, MOP_DRIP_TUNING);
    expect(origins.length).toBeGreaterThan(0);
    expect(origins.length).toBeLessThanOrEqual(MOP_DRIP_TUNING.maxDripsPerStroke);
  });

  it("never exceeds maxDripsPerStroke even for a very long, heavily-dwelled gesture", () => {
    const origins = resolveDripOrigins(dwelledPoints(400, 3), 10, MOP_DRIP_TUNING);
    expect(origins.length).toBeLessThanOrEqual(MOP_DRIP_TUNING.maxDripsPerStroke);
  });

  it("returns no origins for an empty path or non-positive base radius, rather than throwing", () => {
    expect(resolveDripOrigins([], 10, MOP_DRIP_TUNING)).toEqual([]);
    expect(resolveDripOrigins(dwelledPoints(10), 0, MOP_DRIP_TUNING)).toEqual([]);
    expect(resolveDripOrigins(dwelledPoints(10), -5, MOP_DRIP_TUNING)).toEqual([]);
  });

  it("Spray's tuning requires materially more accumulation than Mop's before a drip spawns -- a moderately dwelled gesture that drips under Mop's tuning may drip less under Spray's", () => {
    const moderate = dwelledPoints(40, 1.24); // windowed load ~1.44 -- crosses Mop's 1.3 threshold but not Spray's 1.6
    const mopOrigins = resolveDripOrigins(moderate, 10, MOP_DRIP_TUNING);
    const sprayOrigins = resolveDripOrigins(moderate, 10, SPRAY_DRIP_TUNING);
    expect(mopOrigins.length).toBeGreaterThan(0);
    expect(sprayOrigins.length).toBe(0);
  });
});

describe("dripDeposition -- simulateMaterialDrip (gravity/taper/determinism)", () => {
  it("is a pure, deterministic function of its inputs -- identical origin/load/seed/tuning always replay to an identical drip", () => {
    const origin: DripSourcePoint = { x: 12, y: 34, densityFactor: 2 };
    const a = simulateMaterialDrip(origin, 2, 10, 42, MOP_DRIP_TUNING);
    const b = simulateMaterialDrip(origin, 2, 10, 42, MOP_DRIP_TUNING);
    expect(a).toEqual(b);
  });

  it("a different seed (different stable identity) produces a different -- but still bounded, still downward -- drip, never identical by coincidence of the same gravity math", () => {
    const origin: DripSourcePoint = { x: 0, y: 0, densityFactor: 2 };
    const a = simulateMaterialDrip(origin, 2, 10, 1, MOP_DRIP_TUNING);
    const b = simulateMaterialDrip(origin, 2, 10, 2, MOP_DRIP_TUNING);
    expect(a).not.toEqual(b);
  });

  it("travels downward (monotonically non-decreasing y) according to local-coordinate gravity -- never upward", () => {
    const origin: DripSourcePoint = { x: 0, y: 0, densityFactor: 2 };
    const drip = simulateMaterialDrip(origin, 2, 10, 7, MOP_DRIP_TUNING);
    for (let i = 1; i < drip.length; i += 1) {
      expect(drip[i].y).toBeGreaterThanOrEqual(drip[i - 1].y);
    }
    expect(drip[drip.length - 1].y).toBeGreaterThan(drip[0].y);
  });

  it("the step-to-step y advance shrinks over the drip's own run (drag/taper-of-motion), never growing indefinitely", () => {
    const origin: DripSourcePoint = { x: 0, y: 0, densityFactor: 3 };
    const drip = simulateMaterialDrip(origin, 3, 10, 7, MOP_DRIP_TUNING);
    const deltas = drip.slice(1).map((p, i) => p.y - drip[i].y);
    for (let i = 1; i < deltas.length; i += 1) {
      expect(deltas[i]).toBeLessThanOrEqual(deltas[i - 1] + 1e-9);
    }
  });

  it("never exceeds maxDripSteps + 1 points, even at maximum bounded load", () => {
    const origin: DripSourcePoint = { x: 0, y: 0, densityFactor: 5 };
    const drip = simulateMaterialDrip(origin, 999, 10, 7, MOP_DRIP_TUNING);
    expect(drip.length).toBeLessThanOrEqual(MOP_DRIP_TUNING.maxDripSteps + 1);
  });

  it("heavier accumulated load produces a longer-running (or equal) drip than a lighter one, all else equal", () => {
    const origin: DripSourcePoint = { x: 0, y: 0, densityFactor: 1 };
    const light = simulateMaterialDrip(origin, 0, 10, 7, MOP_DRIP_TUNING);
    const heavy = simulateMaterialDrip(origin, 3, 10, 7, MOP_DRIP_TUNING);
    expect(heavy.length).toBeGreaterThanOrEqual(light.length);
  });
});

describe("dripDeposition -- resolveMaterialDripPlans (end-to-end)", () => {
  it("produces no plans for a fast/light gesture below threshold", () => {
    expect(resolveMaterialDripPlans(fastPoints(40), 10, 7, MOP_DRIP_TUNING)).toEqual([]);
  });

  it("produces at least one bounded plan for a sufficiently dwelled gesture", () => {
    const plans = resolveMaterialDripPlans(dwelledPoints(40), 10, 7, MOP_DRIP_TUNING);
    expect(plans.length).toBeGreaterThan(0);
    expect(plans.length).toBeLessThanOrEqual(MOP_DRIP_TUNING.maxDripsPerStroke);
    for (const plan of plans) {
      expect(plan.points.length).toBeGreaterThanOrEqual(2);
      expect(plan.points.length).toBeLessThanOrEqual(MOP_DRIP_TUNING.maxDripSteps + 1);
    }
  });

  it("is deterministic end-to-end -- same points/radius/seed/tuning always replay to identical plans", () => {
    const points = dwelledPoints(40);
    const a = resolveMaterialDripPlans(points, 10, 99, MOP_DRIP_TUNING);
    const b = resolveMaterialDripPlans(points, 10, 99, MOP_DRIP_TUNING);
    expect(a).toEqual(b);
  });

  it("multiple drips on one stroke never produce the identical shape as each other", () => {
    const heavilyDwelled = dwelledPoints(200, 3);
    const plans = resolveMaterialDripPlans(heavilyDwelled, 10, 99, MOP_DRIP_TUNING);
    expect(plans.length).toBeGreaterThan(1);
    expect(plans[0].points).not.toEqual(plans[1].points);
  });
});
