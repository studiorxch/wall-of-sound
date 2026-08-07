import { describe, it, expect } from "vitest";
import { computePulseTruth } from "./pulseTruth";

describe("computePulseTruth — expected pulse count", () => {
  it("matches floor(duration * bpm / 60) with no anchors", () => {
    const result = computePulseTruth({ durationSeconds: 30, confirmedBpm: 120, detectedAnchorSeconds: [], beatsPerBar: 4 });
    // secondsPerPulse = 0.5; expected = floor(30*120/60) = 60
    expect(result.expectedPulseCount).toBe(60);
    expect(result.pulses.length).toBe(60);
  });

  it("covers a track duration far exceeding what any small detected-anchor list would imply", () => {
    // Only 3 detected anchors near the start of a 4-minute track — the full
    // grid must still cover the whole track (the exact bug this build fixes).
    const result = computePulseTruth({
      durationSeconds: 240, confirmedBpm: 128,
      detectedAnchorSeconds: [0.1, 0.6, 1.1],
      beatsPerBar: 4,
    });
    expect(result.pulses.length).toBeGreaterThan(400);
    expect(result.coverageEndSeconds).toBeGreaterThan(239);
  });
});

describe("computePulseTruth — coverage", () => {
  it("reaches ~100% coverage within one pulse interval of track end", () => {
    const result = computePulseTruth({ durationSeconds: 60, confirmedBpm: 100, detectedAnchorSeconds: [], beatsPerBar: 4 });
    expect(result.coveragePercent).toBeGreaterThan(95);
    expect(result.warnings).not.toContain("coverageBelow100");
  });

  it("never truncates before track end regardless of anchor sparsity", () => {
    const result = computePulseTruth({ durationSeconds: 180, confirmedBpm: 140, detectedAnchorSeconds: [5, 5.4], beatsPerBar: 4 });
    const secondsPerPulse = 60 / 140;
    expect(180 - result.coverageEndSeconds).toBeLessThanOrEqual(secondsPerPulse + 1e-9);
  });
});

describe("computePulseTruth — pulse sourcing", () => {
  it("marks pulses near a detected anchor as detected/aligned, others as synthesized", () => {
    // secondsPerPulse = 0.5 at 120 BPM; place one anchor exactly on-grid.
    const result = computePulseTruth({
      durationSeconds: 5, confirmedBpm: 120, detectedAnchorSeconds: [1.0], beatsPerBar: 4,
    });
    const onGrid = result.pulses.find((p) => Math.abs(p.timeSeconds - 1.0) < 1e-6);
    expect(onGrid?.source).toBe("detected");
    expect(result.pulses.some((p) => p.source === "synthesized")).toBe(true);
  });

  it("nudges a near-anchor pulse within tolerance to 'aligned', matching the anchor's exact time", () => {
    // Two anchors with slightly different phases (1.00 and 1.63 at 100 BPM,
    // secondsPerPulse=0.6) average to a phase that lands near, but not
    // exactly on, either raw anchor — so the grid pulse gets nudged
    // ("aligned") rather than landing perfectly on top of one ("detected").
    const result = computePulseTruth({
      durationSeconds: 5, confirmedBpm: 100, detectedAnchorSeconds: [1.0, 1.63], beatsPerBar: 4,
    });
    const aligned = result.pulses.filter((p) => p.source === "aligned");
    expect(aligned.length).toBeGreaterThan(0);
    for (const pulse of aligned) {
      expect([1.0, 1.63]).toContain(pulse.timeSeconds);
    }
  });

  it("keeps a pulse synthesized when no anchor is within tolerance", () => {
    const result = computePulseTruth({ durationSeconds: 3, confirmedBpm: 120, detectedAnchorSeconds: [], beatsPerBar: 4 });
    expect(result.pulses.every((p) => p.source === "synthesized")).toBe(true);
    expect(result.synthesizedPulseCount).toBe(result.pulses.length);
  });
});

describe("computePulseTruth — expected/generated count invariant (§8/§24/§28.12)", () => {
  it("always generates exactly expectedPulseCount pulses when there are no detected anchors (phaseOffset=0)", () => {
    // A real, non-exact-multiple case caught live: 235s (3:55) at 123.05 BPM
    // — an open "while gridTime < duration" loop generates one extra pulse
    // here (482 expected vs 483 generated); the bounded loop must not.
    const result = computePulseTruth({ durationSeconds: 235, confirmedBpm: 123.05, detectedAnchorSeconds: [], beatsPerBar: 4 });
    expect(result.pulses.length).toBe(result.expectedPulseCount);
    expect(result.warnings).not.toContain("pulseCountMismatch");
  });

  it("holds across a range of non-exact-multiple durations and BPMs", () => {
    const cases: Array<[number, number]> = [[235, 123.05], [187.3, 128], [61, 174.5], [333.7, 95.2], [42, 140]];
    for (const [durationSeconds, confirmedBpm] of cases) {
      const result = computePulseTruth({ durationSeconds, confirmedBpm, detectedAnchorSeconds: [], beatsPerBar: 4 });
      expect(result.pulses.length).toBe(result.expectedPulseCount);
    }
  });

  it("still holds with a nonzero phase offset from detected anchors", () => {
    const result = computePulseTruth({ durationSeconds: 235, confirmedBpm: 123.05, detectedAnchorSeconds: [0.2, 0.7, 1.2], beatsPerBar: 4 });
    expect(result.pulses.length).toBe(result.expectedPulseCount);
  });

  it("still reaches coverage within one pulse interval of track end despite the bounded loop", () => {
    const result = computePulseTruth({ durationSeconds: 235, confirmedBpm: 123.05, detectedAnchorSeconds: [], beatsPerBar: 4 });
    expect(235 - result.coverageEndSeconds).toBeLessThan(result.secondsPerPulse);
    expect(result.warnings).not.toContain("coverageBelow100");
  });
});

describe("computePulseTruth — invariants", () => {
  it("produces sorted, chronologically strictly increasing pulse times", () => {
    const result = computePulseTruth({ durationSeconds: 20, confirmedBpm: 133, detectedAnchorSeconds: [2.1, 5.4, 9.9], beatsPerBar: 4 });
    for (let i = 1; i < result.pulses.length; i++) {
      expect(result.pulses[i].timeSeconds).toBeGreaterThan(result.pulses[i - 1].timeSeconds);
    }
  });

  it("is fully deterministic for identical input", () => {
    const input = { durationSeconds: 45, confirmedBpm: 128, detectedAnchorSeconds: [1, 2.5, 4.9], beatsPerBar: 4 };
    expect(computePulseTruth(input)).toEqual(computePulseTruth(input));
  });

  it("assigns barIndex/beatInBar consistent with beatsPerBar", () => {
    const result = computePulseTruth({ durationSeconds: 10, confirmedBpm: 120, detectedAnchorSeconds: [], beatsPerBar: 4 });
    expect(result.pulses[0].barIndex).toBe(0);
    expect(result.pulses[4].barIndex).toBe(1);
    expect(result.pulses[4].beatInBar).toBe(0);
  });

  it("computes durationSeconds field on every pulse", () => {
    const result = computePulseTruth({ durationSeconds: 10, confirmedBpm: 120, detectedAnchorSeconds: [], beatsPerBar: 4 });
    expect(result.pulses.every((p) => p.durationSeconds === result.secondsPerPulse)).toBe(true);
  });
});

describe("computePulseTruth — unconfirmed BPM rejection", () => {
  it("returns an empty grid with unconfirmedBpm warning for a zero BPM", () => {
    const result = computePulseTruth({ durationSeconds: 60, confirmedBpm: 0, detectedAnchorSeconds: [], beatsPerBar: 4 });
    expect(result.pulses).toEqual([]);
    expect(result.warnings).toContain("unconfirmedBpm");
  });

  it("returns an empty grid with unconfirmedBpm warning for a negative or NaN BPM", () => {
    expect(computePulseTruth({ durationSeconds: 60, confirmedBpm: -5, detectedAnchorSeconds: [], beatsPerBar: 4 }).warnings).toContain("unconfirmedBpm");
    expect(computePulseTruth({ durationSeconds: 60, confirmedBpm: NaN, detectedAnchorSeconds: [], beatsPerBar: 4 }).warnings).toContain("unconfirmedBpm");
  });
});

describe("computePulseTruth — warnings", () => {
  it("warns noDetectedAnchors when no anchors are supplied", () => {
    const result = computePulseTruth({ durationSeconds: 10, confirmedBpm: 120, detectedAnchorSeconds: [], beatsPerBar: 4 });
    expect(result.warnings).toContain("noDetectedAnchors");
  });

  it("warns synthesizedPulseMajority when most pulses lack a nearby anchor", () => {
    const result = computePulseTruth({ durationSeconds: 30, confirmedBpm: 120, detectedAnchorSeconds: [1.0], beatsPerBar: 4 });
    expect(result.warnings).toContain("synthesizedPulseMajority");
  });

  it("does not warn synthesizedPulseMajority when most pulses are aligned/detected", () => {
    const secondsPerPulse = 0.5;
    const anchors = Array.from({ length: 20 }, (_, i) => i * secondsPerPulse);
    const result = computePulseTruth({ durationSeconds: 10, confirmedBpm: 120, detectedAnchorSeconds: anchors, beatsPerBar: 4 });
    expect(result.warnings).not.toContain("synthesizedPulseMajority");
  });
});
