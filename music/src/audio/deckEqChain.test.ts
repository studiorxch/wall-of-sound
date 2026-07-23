import { describe, it, expect } from "vitest";
import type { EqPoint } from "../data/djTransitionTypes";
import {
  buildEqAutomationEvents, clampEqGainDb, bassOwnershipSum, isBassOwnershipWithinTolerance, dbToLinearGain,
  EQ_GAIN_DB_MIN, EQ_GAIN_DB_MAX,
} from "./deckEqChain";

describe("clampEqGainDb", () => {
  it("clamps to the documented safe range", () => {
    expect(clampEqGainDb(100)).toBe(EQ_GAIN_DB_MAX);
    expect(clampEqGainDb(-100)).toBe(EQ_GAIN_DB_MIN);
    expect(clampEqGainDb(-6)).toBe(-6);
  });
  it("treats non-finite input as neutral (0dB), never NaN through to a node", () => {
    expect(clampEqGainDb(NaN)).toBe(0);
    expect(clampEqGainDb(Infinity)).toBe(0);
  });
});

describe("buildEqAutomationEvents", () => {
  const points: EqPoint[] = [
    { progress: 0, lowDb: 0, midDb: 0, highDb: 0 },
    { progress: 0.48, lowDb: 0, midDb: 0, highDb: 0 },
    { progress: 0.52, lowDb: -24, midDb: 0, highDb: 0 },
    { progress: 1, lowDb: -24, midDb: -6, highDb: -6 },
  ];

  it("never schedules an event before nowContextTimeSeconds, even if startContextTime is in the past", () => {
    const events = buildEqAutomationEvents(points, /* startContextTime */ 5, /* duration */ 10, /* now */ 20);
    for (const e of events) expect(e.timeContextSeconds).toBeGreaterThanOrEqual(20);
  });

  it("produces strictly increasing times per band — no duplicate or backwards ramps", () => {
    const events = buildEqAutomationEvents(points, 100, 10, 100);
    const byBand: Record<string, number[]> = { low: [], mid: [], high: [] };
    for (const e of events) byBand[e.band].push(e.timeContextSeconds);
    for (const band of Object.keys(byBand)) {
      const times = byBand[band];
      for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1]);
    }
  });

  it("clamps every scheduled gain to the safe dB range", () => {
    const extreme: EqPoint[] = [{ progress: 0, lowDb: 999, midDb: -999, highDb: 0 }, { progress: 1, lowDb: 0, midDb: 0, highDb: 0 }];
    const events = buildEqAutomationEvents(extreme, 0, 5, 0);
    for (const e of events) {
      expect(e.gainDb).toBeLessThanOrEqual(EQ_GAIN_DB_MAX);
      expect(e.gainDb).toBeGreaterThanOrEqual(EQ_GAIN_DB_MIN);
    }
  });

  it("produces a zero-length-safe schedule for duration 0 without throwing", () => {
    expect(() => buildEqAutomationEvents(points, 10, 0, 5)).not.toThrow();
    const events = buildEqAutomationEvents(points, 10, 0, 5);
    for (const e of events) expect(e.timeContextSeconds).toBe(10);
  });

  it("sorts out-of-order input points by progress before building events", () => {
    const shuffled: EqPoint[] = [points[2], points[0], points[3], points[1]];
    const events = buildEqAutomationEvents(shuffled, 0, 10, 0);
    const lowTimes = events.filter((e) => e.band === "low").map((e) => e.timeContextSeconds);
    for (let i = 1; i < lowTimes.length; i++) expect(lowTimes[i]).toBeGreaterThan(lowTimes[i - 1]);
  });
});

describe("bass ownership invariant", () => {
  it("stays within tolerance of a constant across the full mirrored transfer curve (the resolver's own managedBassEq shape)", () => {
    // Mirrors djTransitionAutomationDefaults.ts's managedBassEq exactly:
    // outgoing 0dB->-24dB, incoming -24dB->0dB, swapping at the transfer
    // point — sampled densely across the whole progress range.
    const transferProgress = 0.5;
    const epsilon = 0.02;
    const expectedConstant = bassOwnershipSum(0, -24); // one full source + one fully-reduced source

    for (let p = 0; p <= 1; p += 0.01) {
      const outgoingDb = p < transferProgress - epsilon ? 0 : p > transferProgress + epsilon ? -24 : (p < transferProgress ? 0 : -24);
      const incomingDb = p < transferProgress - epsilon ? -24 : p > transferProgress + epsilon ? 0 : (p < transferProgress ? -24 : 0);
      const sum = bassOwnershipSum(outgoingDb, incomingDb);
      expect(isBassOwnershipWithinTolerance(sum, expectedConstant)).toBe(true);
    }
  });

  it("flags a genuine bass hole (both sides reduced) as outside tolerance", () => {
    const expectedConstant = bassOwnershipSum(0, -24);
    const holeSum = bassOwnershipSum(-24, -24);
    expect(isBassOwnershipWithinTolerance(holeSum, expectedConstant)).toBe(false);
  });

  it("flags a genuine bass collision (both sides at full) as outside tolerance", () => {
    const expectedConstant = bassOwnershipSum(0, -24);
    const collisionSum = bassOwnershipSum(0, 0);
    expect(isBassOwnershipWithinTolerance(collisionSum, expectedConstant)).toBe(false);
  });
});

describe("dbToLinearGain", () => {
  it("0dB is unity gain", () => {
    expect(dbToLinearGain(0)).toBeCloseTo(1, 10);
  });
  it("-6dB is approximately half amplitude", () => {
    expect(dbToLinearGain(-6)).toBeCloseTo(0.501, 2);
  });
});
