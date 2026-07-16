import { describe, it, expect } from "vitest";
import {
  computeObservationDelayMs, computeVisualObservationLagMs, recordWrapObservation,
  summarizeWrapObservations, type LoopWrapObservation,
} from "./loopWrapDiagnostics";

function obs(observationDelayMs: number, visualObservationLagMs: number): LoopWrapObservation {
  return {
    expectedWrapAudioTime: 0, observedAtAudioTime: 0, observationDelayMs,
    visualFrameAtObservation: 0, visualObservationLagMs,
  };
}

describe("computeObservationDelayMs", () => {
  it("computes a positive delay in ms when observed after expected", () => {
    expect(computeObservationDelayMs(10, 10.008)).toBeCloseTo(8, 3);
  });

  it("clamps to zero rather than reporting a negative delay", () => {
    expect(computeObservationDelayMs(10, 9.999)).toBe(0);
  });
});

describe("computeVisualObservationLagMs", () => {
  it("computes a positive lag when observed after expected", () => {
    expect(computeVisualObservationLagMs(1000, 1016.7)).toBeCloseTo(16.7, 3);
  });

  it("clamps to zero rather than reporting a negative lag", () => {
    expect(computeVisualObservationLagMs(1000, 995)).toBe(0);
  });
});

describe("recordWrapObservation", () => {
  it("appends within capacity", () => {
    const buf = recordWrapObservation([obs(1, 1)], obs(2, 2), 5);
    expect(buf).toHaveLength(2);
    expect(buf[1].observationDelayMs).toBe(2);
  });

  it("evicts the oldest entry once capacity is exceeded", () => {
    let buf: LoopWrapObservation[] = [];
    for (let i = 0; i < 5; i++) buf = recordWrapObservation(buf, obs(i, i), 3);
    expect(buf).toHaveLength(3);
    expect(buf.map((e) => e.observationDelayMs)).toEqual([2, 3, 4]);
  });
});

describe("summarizeWrapObservations", () => {
  it("returns zeroed stats for an empty buffer", () => {
    expect(summarizeWrapObservations([])).toEqual({
      count: 0, meanObservationDelayMs: 0, maxObservationDelayMs: 0,
      meanVisualObservationLagMs: 0, maxVisualObservationLagMs: 0,
    });
  });

  it("computes mean/max over a synthetic sample set", () => {
    const entries = [obs(2, 10), obs(4, 20), obs(6, 30)];
    const summary = summarizeWrapObservations(entries);
    expect(summary.count).toBe(3);
    expect(summary.meanObservationDelayMs).toBeCloseTo(4, 5);
    expect(summary.maxObservationDelayMs).toBe(6);
    expect(summary.meanVisualObservationLagMs).toBeCloseTo(20, 5);
    expect(summary.maxVisualObservationLagMs).toBe(30);
  });
});
