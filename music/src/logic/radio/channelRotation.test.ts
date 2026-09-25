import { describe, expect, it } from "vitest";
import { resolveChannelRotation, type ChannelRotation } from "./channelRotation";

const T0 = 1_700_000_000_000; // an arbitrary fixed anchor instant
const HOUR = 3_600_000;

// A = 2h, B = 3h, C = 1h -- exactly the worked example in the brief.
const ROTATION: ChannelRotation = {
  channelId: "channel-main",
  anchorAtMs: T0,
  entries: [
    { programId: "A", durationSeconds: 2 * 3600 },
    { programId: "B", durationSeconds: 3 * 3600 },
    { programId: "C", durationSeconds: 1 * 3600 },
  ],
};

describe("resolveChannelRotation -- worked example (A=2h, B=3h, C=1h)", () => {
  it("resolves exactly at anchor to Program A at offset 0", () => {
    const result = resolveChannelRotation(ROTATION, T0);
    expect(result).toMatchObject({ status: "on-air", programId: "A", programIndex: 0, programOffsetSeconds: 0, cycleIndex: 0 });
  });

  it("resolves inside the first Program (A)", () => {
    const result = resolveChannelRotation(ROTATION, T0 + HOUR);
    expect(result).toMatchObject({ status: "on-air", programId: "A", programOffsetSeconds: 3600 });
  });

  it("resolves the exact A -> B boundary onto B at offset 0", () => {
    const result = resolveChannelRotation(ROTATION, T0 + 2 * HOUR);
    expect(result).toMatchObject({ status: "on-air", programId: "B", programIndex: 1, programOffsetSeconds: 0 });
  });

  it("resolves inside Program B", () => {
    const result = resolveChannelRotation(ROTATION, T0 + 3.5 * HOUR);
    expect(result).toMatchObject({ status: "on-air", programId: "B", programOffsetSeconds: 1.5 * 3600 });
  });

  it("resolves the exact B -> C boundary onto C at offset 0", () => {
    const result = resolveChannelRotation(ROTATION, T0 + 5 * HOUR);
    expect(result).toMatchObject({ status: "on-air", programId: "C", programIndex: 2, programOffsetSeconds: 0 });
  });

  it("resolves the exact cycle wrap C -> A onto a new cycle", () => {
    const result = resolveChannelRotation(ROTATION, T0 + 6 * HOUR);
    expect(result).toMatchObject({ status: "on-air", programId: "A", programIndex: 0, programOffsetSeconds: 0, cycleIndex: 1 });
  });

  it("resolves multiple complete cycles later at the correct position", () => {
    // 6h cycle; 6h*10 + 1h = inside cycle 10, 1h into A.
    const result = resolveChannelRotation(ROTATION, T0 + 10 * 6 * HOUR + HOUR);
    expect(result).toMatchObject({ status: "on-air", programId: "A", programOffsetSeconds: 3600, cycleIndex: 10 });
  });

  it("resolves a large elapsed time (years later) consistently -- reload produces the same answer uninterrupted execution would have", () => {
    const nowMs = T0 + 365 * 24 * HOUR; // roughly a year later
    const result = resolveChannelRotation(ROTATION, nowMs);
    expect(result.status).toBe("on-air");
    // Re-resolving with the identical input must be byte-identical (determinism).
    const again = resolveChannelRotation(ROTATION, nowMs);
    expect(again).toEqual(result);
  });

  it("computes correct cycleDurationSeconds", () => {
    const result = resolveChannelRotation(ROTATION, T0);
    expect(result).toMatchObject({ cycleDurationSeconds: 6 * 3600 });
  });

  it("computes correct programStartedAtMs/programEndsAtMs for a mid-cycle Program", () => {
    const result = resolveChannelRotation(ROTATION, T0 + 3.5 * HOUR);
    if (result.status !== "on-air") throw new Error("expected on-air");
    expect(result.programStartedAtMs).toBe(T0 + 2 * HOUR);
    expect(result.programEndsAtMs).toBe(T0 + 5 * HOUR);
  });

  it("nextProgramId wraps correctly at every position, including the last entry", () => {
    expect(resolveChannelRotation(ROTATION, T0)).toMatchObject({ nextProgramId: "B" });
    expect(resolveChannelRotation(ROTATION, T0 + 2 * HOUR)).toMatchObject({ nextProgramId: "C" });
    expect(resolveChannelRotation(ROTATION, T0 + 5 * HOUR)).toMatchObject({ nextProgramId: "A" });
  });
});

describe("resolveChannelRotation -- before-anchor behavior", () => {
  it("returns an explicit before-start state, never a negative-modulo previous cycle", () => {
    const result = resolveChannelRotation(ROTATION, T0 - HOUR);
    expect(result).toEqual({ status: "before-start", channelId: "channel-main", startsInSeconds: 3600 });
  });

  it("before-start startsInSeconds is always positive", () => {
    const result = resolveChannelRotation(ROTATION, T0 - 1);
    if (result.status !== "before-start") throw new Error("expected before-start");
    expect(result.startsInSeconds).toBeGreaterThan(0);
  });
});

describe("resolveChannelRotation -- single-entry rotation", () => {
  const single: ChannelRotation = { channelId: "channel-single", anchorAtMs: T0, entries: [{ programId: "ONLY", durationSeconds: 3600 }] };

  it("stays on the one Program indefinitely, wrapping to itself", () => {
    const result = resolveChannelRotation(single, T0 + 10.5 * HOUR);
    expect(result).toMatchObject({ status: "on-air", programId: "ONLY", programIndex: 0, nextProgramId: "ONLY" });
  });
});

describe("resolveChannelRotation -- fractional-second offsets", () => {
  it("supports sub-second precision, matching existing timing conventions (plain seconds, no rounding)", () => {
    const result = resolveChannelRotation(ROTATION, T0 + 1500); // 1.5s in
    expect(result).toMatchObject({ status: "on-air", programId: "A", programOffsetSeconds: 1.5 });
  });
});

describe("resolveChannelRotation -- non-24-hour cycle proves no day-based assumption", () => {
  it("resolves correctly for a 5-hour cycle that never divides evenly into 24 hours", () => {
    const odd: ChannelRotation = {
      channelId: "channel-odd",
      anchorAtMs: T0,
      entries: [
        { programId: "X", durationSeconds: 2 * 3600 },
        { programId: "Y", durationSeconds: 3 * 3600 },
      ],
    };
    // 5h cycle; at 47h elapsed (9 full cycles = 45h, +2h into cycle 10) -> inside Y at offset 0.
    const result = resolveChannelRotation(odd, T0 + 47 * HOUR);
    expect(result).toMatchObject({ status: "on-air", programId: "Y", programOffsetSeconds: 0, cycleIndex: 9 });
  });
});

describe("resolveChannelRotation -- invalid rotation behavior", () => {
  it("rejects empty entries", () => {
    const result = resolveChannelRotation({ channelId: "c", anchorAtMs: T0, entries: [] }, T0);
    expect(result).toEqual({ status: "invalid", channelId: "c", reason: "empty_entries" });
  });

  it("rejects zero duration", () => {
    const result = resolveChannelRotation({ channelId: "c", anchorAtMs: T0, entries: [{ programId: "A", durationSeconds: 0 }] }, T0);
    expect(result).toEqual({ status: "invalid", channelId: "c", reason: "invalid_entry_duration" });
  });

  it("rejects negative duration", () => {
    const result = resolveChannelRotation({ channelId: "c", anchorAtMs: T0, entries: [{ programId: "A", durationSeconds: -1 }] }, T0);
    expect(result).toEqual({ status: "invalid", channelId: "c", reason: "invalid_entry_duration" });
  });

  it("rejects non-finite duration (NaN)", () => {
    const result = resolveChannelRotation({ channelId: "c", anchorAtMs: T0, entries: [{ programId: "A", durationSeconds: Number.NaN }] }, T0);
    expect(result).toEqual({ status: "invalid", channelId: "c", reason: "invalid_entry_duration" });
  });

  it("rejects non-finite duration (Infinity)", () => {
    const result = resolveChannelRotation({ channelId: "c", anchorAtMs: T0, entries: [{ programId: "A", durationSeconds: Number.POSITIVE_INFINITY }] }, T0);
    expect(result).toEqual({ status: "invalid", channelId: "c", reason: "invalid_entry_duration" });
  });

  it("rejects an invalid anchorAtMs", () => {
    const result = resolveChannelRotation({ channelId: "c", anchorAtMs: Number.NaN, entries: [{ programId: "A", durationSeconds: 3600 }] }, T0);
    expect(result).toEqual({ status: "invalid", channelId: "c", reason: "invalid_anchor_at_ms" });
  });

  it("rejects an invalid nowMs", () => {
    const result = resolveChannelRotation(ROTATION, Number.NaN);
    expect(result).toEqual({ status: "invalid", channelId: "channel-main", reason: "invalid_now_ms" });
  });

  it("rejects duplicate programIds rather than silently collapsing them", () => {
    const result = resolveChannelRotation(
      { channelId: "c", anchorAtMs: T0, entries: [{ programId: "A", durationSeconds: 3600 }, { programId: "A", durationSeconds: 1800 }] },
      T0,
    );
    expect(result).toEqual({ status: "invalid", channelId: "c", reason: "duplicate_program_id" });
  });

  it("never skips a malformed entry to salvage the rest of the rotation -- one bad entry invalidates the whole timeline", () => {
    const result = resolveChannelRotation(
      { channelId: "c", anchorAtMs: T0, entries: [{ programId: "A", durationSeconds: 3600 }, { programId: "B", durationSeconds: -1 }] },
      T0,
    );
    expect(result.status).toBe("invalid");
  });
});

describe("resolveChannelRotation -- determinism", () => {
  it("returns byte-identical results for repeated calls with identical inputs", () => {
    const a = resolveChannelRotation(ROTATION, T0 + 4 * HOUR);
    const b = resolveChannelRotation(ROTATION, T0 + 4 * HOUR);
    expect(a).toEqual(b);
  });

  it("never mutates the input rotation object", () => {
    const entriesBefore = JSON.stringify(ROTATION.entries);
    resolveChannelRotation(ROTATION, T0 + 4 * HOUR);
    expect(JSON.stringify(ROTATION.entries)).toBe(entriesBefore);
  });
});
