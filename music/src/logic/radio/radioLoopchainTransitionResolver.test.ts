import { describe, expect, it } from "vitest";
import { resolveTransitionTiming, type JunctionGridInput } from "./radioLoopchainTransitionResolver";
import type { MusicalGrid } from "../../data/loopTypes";
import type { TrackPlaybackBounds } from "../../data/playbackBoundsTypes";

function grid(overrides: Partial<MusicalGrid> = {}): MusicalGrid {
  return {
    bpm: 120,
    meterNumerator: 4,
    meterDenominator: 4,
    originSeconds: 0,
    originFrame: 0,
    originSource: "trusted_downbeat",
    trust: "trusted",
    confidence: 0.9,
    beatFrames: [],
    barFrames: [],
    sourceFingerprint: "fp1",
    updatedAt: "2026-07-22T00:00:00.000Z",
    ...overrides,
  };
}

function bounds(overrides: Partial<TrackPlaybackBounds> = {}): TrackPlaybackBounds {
  return {
    version: "1",
    sourceDurationSeconds: 200,
    audibleStartSeconds: 0,
    preferredStartSeconds: 0,
    preferredEndSeconds: 200,
    audibleEndSeconds: 200,
    leadingSilenceSeconds: 0,
    trailingSilenceSeconds: 0,
    effectiveDurationSeconds: 200,
    startClassification: "unknown",
    endClassification: "unknown",
    startConfidence: 1,
    endConfidence: 1,
    overallConfidence: 1,
    source: "detected",
    detectorVersion: "v1",
    analyzedAt: "2026-07-22T00:00:00.000Z",
    warnings: [],
    ...overrides,
  };
}

function input(overrides: Partial<JunctionGridInput> = {}): JunctionGridInput {
  return { grid: grid(), playbackBounds: null, cycleDurationSeconds: 20, ...overrides };
}

describe("resolveTransitionTiming — trusted both sides", () => {
  it("resolves an explicit bars request to bar-aligned with correct duration and confidence", () => {
    const outgoing = input({ grid: grid({ bpm: 120, confidence: 0.9 }) });
    const incoming = input({ grid: grid({ bpm: 120, confidence: 0.7 }) });
    const decision = resolveTransitionTiming(outgoing, incoming, { kind: "bars", bars: 2 }, "j1", 6);
    // 2 bars @ 120bpm, 4/4 => 2 * (60/120*4) = 4s
    expect(decision.computedDurationSeconds).toBeCloseTo(4);
    expect(decision.alignment).toBe("bar_aligned");
    expect(decision.confidence).toBeCloseTo(0.7); // min of both sides
  });

  it("auto picks the default bar count when both sides are trusted", () => {
    const outgoing = input({ grid: grid({ bpm: 100 }) });
    const incoming = input({ grid: grid({ bpm: 100 }) });
    const decision = resolveTransitionTiming(outgoing, incoming, { kind: "auto" }, "j1", 6);
    expect(decision.alignment).toBe("bar_aligned");
    // default 2 bars @ 100bpm = 2 * 2.4 = 4.8s
    expect(decision.computedDurationSeconds).toBeCloseTo(4.8);
  });
});

describe("resolveTransitionTiming — untrusted grid never produces bar alignment", () => {
  it("falls back to seconds with confidence 0 when auto is requested and one side is untrusted", () => {
    const outgoing = input({ grid: grid({ trust: "provisional" }) });
    const incoming = input({ grid: grid({ trust: "trusted" }) });
    const decision = resolveTransitionTiming(outgoing, incoming, { kind: "auto" }, "j1", 5);
    expect(decision.alignment).toBe("time_aligned");
    expect(decision.computedDurationSeconds).toBeCloseTo(5);
    expect(decision.confidence).toBe(0);
  });

  it("REJECTS an explicit bars request on an untrusted pair — never bar_aligned, never manual_override, confidence stays 0", () => {
    const outgoing = input({ grid: grid({ trust: "provisional" }) });
    const incoming = input({ grid: grid({ trust: "trusted" }) });
    const decision = resolveTransitionTiming(outgoing, incoming, { kind: "bars", bars: 4 }, "j1", 5);
    expect(decision.alignment).toBe("time_aligned");
    expect(decision.alignment).not.toBe("bar_aligned");
    expect(decision.alignment).not.toBe("manual_override");
    expect(decision.confidence).toBe(0);
    expect(decision.computedDurationSeconds).toBeCloseTo(5); // collapses to the fallback, not a bar-derived value
    expect(decision.reason).toMatch(/not trusted/);
  });

  it("also rejects a bars request when NEITHER side has a grid at all", () => {
    const outgoing = input({ grid: null });
    const incoming = input({ grid: null });
    const decision = resolveTransitionTiming(outgoing, incoming, { kind: "bars", bars: 8 }, "j1", 3);
    expect(decision.alignment).toBe("time_aligned");
    expect(decision.confidence).toBe(0);
  });
});

describe("resolveTransitionTiming — manual override", () => {
  it("labels a legitimate explicit seconds request that diverges from auto as manual_override", () => {
    const outgoing = input({ grid: grid({ bpm: 120 }) });
    const incoming = input({ grid: grid({ bpm: 120 }) });
    // auto (trusted) would pick 2 bars = 4s; operator explicitly asks for 8s instead
    const decision = resolveTransitionTiming(outgoing, incoming, { kind: "seconds", seconds: 8 }, "j1", 6);
    expect(decision.alignment).toBe("manual_override");
    expect(decision.computedDurationSeconds).toBeCloseTo(8);
  });

  it("labels a legitimate explicit bars request that diverges from the auto bar count as manual_override, but still carries real confidence", () => {
    const outgoing = input({ grid: grid({ bpm: 120, confidence: 0.85 }) });
    const incoming = input({ grid: grid({ bpm: 120, confidence: 0.85 }) });
    const decision = resolveTransitionTiming(outgoing, incoming, { kind: "bars", bars: 8 }, "j1", 6);
    expect(decision.alignment).toBe("manual_override");
    expect(decision.confidence).toBeCloseTo(0.85); // bar math still underlies it
  });

  it("does NOT label a request as manual_override when it happens to match what auto would produce", () => {
    const outgoing = input({ grid: grid({ bpm: 120 }) });
    const incoming = input({ grid: grid({ bpm: 120 }) });
    const decision = resolveTransitionTiming(outgoing, incoming, { kind: "bars", bars: 2 }, "j1", 6); // same as auto's default
    expect(decision.alignment).toBe("bar_aligned");
  });
});

describe("resolveTransitionTiming — silence-aware nudge", () => {
  it("extends the duration to clear detected outgoing trailing silence, never shrinking below the requested value", () => {
    const outgoing = input({
      cycleDurationSeconds: 20,
      playbackBounds: bounds({ trailingSilenceSeconds: 3 }), // audible ends 3s before cycle end
    });
    const incoming = input();
    const decision = resolveTransitionTiming(outgoing, incoming, { kind: "seconds", seconds: 2 }, "j1", 2);
    // requested 2s fade would start at 18s local, but audible ends at 17s —
    // nudge extends duration to 3s so the fade starts right at the audible boundary
    expect(decision.computedDurationSeconds).toBeCloseTo(3);
  });

  it("extends the duration to clear detected incoming leading silence", () => {
    const outgoing = input();
    const incoming = input({
      cycleDurationSeconds: 20,
      playbackBounds: bounds({ leadingSilenceSeconds: 2.5 }),
    });
    const decision = resolveTransitionTiming(outgoing, incoming, { kind: "seconds", seconds: 2 }, "j1", 2);
    expect(decision.computedDurationSeconds).toBeCloseTo(2.5);
  });

  it("leaves the duration unchanged when no silence is present", () => {
    const outgoing = input({ playbackBounds: bounds({ trailingSilenceSeconds: 0 }) });
    const incoming = input({ playbackBounds: bounds({ leadingSilenceSeconds: 0 }) });
    const decision = resolveTransitionTiming(outgoing, incoming, { kind: "seconds", seconds: 4 }, "j1", 4);
    expect(decision.computedDurationSeconds).toBeCloseTo(4);
  });

  it("never lets the nudge consume an entire cycle on either side", () => {
    const outgoing = input({ cycleDurationSeconds: 5, playbackBounds: bounds({ trailingSilenceSeconds: 100 }) });
    const incoming = input({ cycleDurationSeconds: 5 });
    const decision = resolveTransitionTiming(outgoing, incoming, { kind: "seconds", seconds: 2 }, "j1", 2);
    expect(decision.computedDurationSeconds).toBeLessThan(5);
  });
});
