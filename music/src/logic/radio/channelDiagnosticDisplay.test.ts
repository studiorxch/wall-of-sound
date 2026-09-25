import { describe, expect, it } from "vitest";
import { buildChannelDiagnosticDisplay, formatClockDuration } from "./channelDiagnosticDisplay";
import type { ChannelTrackBroadcastResult } from "./channelTrackBroadcast";
import type { RadioProgramSummary } from "@studiorich/member-identity";

function program(overrides: Partial<RadioProgramSummary> = {}): RadioProgramSummary {
  return { id: "program-a", title: "Night Transmission", manifestBaseUrl: "/x/", trackCount: 5, totalDurationSeconds: 3600, ...overrides };
}

describe("formatClockDuration", () => {
  it("formats hours/minutes/seconds", () => {
    expect(formatClockDuration(3600 + 17 * 60 + 42)).toBe("01:17:42");
  });

  it("formats under an hour with a zero hours segment", () => {
    expect(formatClockDuration(2 * 60 + 13)).toBe("00:02:13");
  });

  it("formats zero", () => {
    expect(formatClockDuration(0)).toBe("00:00:00");
  });

  it("clamps a negative value to zero rather than showing a negative time", () => {
    expect(formatClockDuration(-5)).toBe("00:00:00");
  });

  it("clamps a non-finite value to zero", () => {
    expect(formatClockDuration(Number.NaN)).toBe("00:00:00");
  });

  it("truncates fractional seconds", () => {
    expect(formatClockDuration(90.9)).toBe("00:01:30");
  });
});

describe("buildChannelDiagnosticDisplay -- non-on-air states", () => {
  const programsById = new Map([["program-a", program()]]);

  it("maps channel-inactive", () => {
    const result: ChannelTrackBroadcastResult = { status: "channel-inactive", channelId: "channel-main" };
    const display = buildChannelDiagnosticDisplay(result, programsById, 0);
    expect(display.kind).toBe("inactive");
    expect(display.headline).toBe("INACTIVE");
    expect(display.technicalReason).toBe("channel-inactive");
  });

  it("maps before-start with a human-readable countdown", () => {
    const result: ChannelTrackBroadcastResult = { status: "before-start", channelId: "channel-main", startsInSeconds: 3661 };
    const display = buildChannelDiagnosticDisplay(result, programsById, 0);
    expect(display.kind).toBe("before-start");
    expect(display.detail).toContain("01:01:01");
  });

  it("maps channel-not-found to an error state, preserving the technical reason", () => {
    const result: ChannelTrackBroadcastResult = { status: "channel-not-found", channelId: "channel-main" };
    const display = buildChannelDiagnosticDisplay(result, programsById, 0);
    expect(display.kind).toBe("error");
    expect(display.technicalReason).toBe("channel-not-found");
  });

  it("maps hydration-failed, preserving the underlying reason and programId", () => {
    const result: ChannelTrackBroadcastResult = { status: "hydration-failed", channelId: "channel-main", reason: "missing-program", programId: "program-x" };
    const display = buildChannelDiagnosticDisplay(result, programsById, 0);
    expect(display.kind).toBe("error");
    expect(display.technicalReason).toBe("hydration-failed:missing-program:program-x");
  });

  it("maps package-unavailable distinctly -- never collapses into any other Program's state", () => {
    const result: ChannelTrackBroadcastResult = { status: "package-unavailable", channelId: "channel-main", programId: "program-a", message: "network down" };
    const display = buildChannelDiagnosticDisplay(result, programsById, 0);
    expect(display.kind).toBe("error");
    expect(display.technicalReason).toBe("package-unavailable:program-a");
    expect(display.detail).toContain("network down");
    // Critically: no programTitle/trackLabel is fabricated -- this state never pretends to be on-air.
    expect(display.programTitle).toBeUndefined();
  });

  it("maps track-resolution-failed distinctly", () => {
    const result: ChannelTrackBroadcastResult = { status: "track-resolution-failed", channelId: "channel-main", programId: "program-a" };
    const display = buildChannelDiagnosticDisplay(result, programsById, 0);
    expect(display.technicalReason).toBe("track-resolution-failed:program-a");
  });
});

describe("buildChannelDiagnosticDisplay -- on-air", () => {
  const programsById = new Map([
    ["program-a", program({ id: "program-a", title: "Night Transmission" })],
    ["program-b", program({ id: "program-b", title: "Soft Motion Radio" })],
  ]);

  const onAir: ChannelTrackBroadcastResult = {
    status: "on-air",
    channelId: "channel-main",
    programId: "program-a",
    programIndex: 0,
    programOffsetSeconds: 3600 + 17 * 60 + 42,
    programStartedAtMs: 0,
    programEndsAtMs: 10_000_000,
    trackId: "t7",
    trackIndex: 6,
    trackOffsetSeconds: 133,
    trackDurationSeconds: 200,
    nextProgramId: "program-b",
    cycleIndex: 0,
  };

  it("resolves the Program title from the catalog", () => {
    const display = buildChannelDiagnosticDisplay(onAir, programsById, 0);
    expect(display.programTitle).toBe("Night Transmission");
  });

  it("resolves the NEXT Program title from the catalog using nextProgramId, never recomputing it", () => {
    const display = buildChannelDiagnosticDisplay(onAir, programsById, 0);
    expect(display.nextProgramTitle).toBe("Soft Motion Radio");
  });

  it("falls back to the raw id when a title is missing from the catalog", () => {
    const display = buildChannelDiagnosticDisplay(onAir, new Map(), 0);
    expect(display.programTitle).toBe("program-a");
    expect(display.nextProgramTitle).toBe("program-b");
  });

  it("formats Program position", () => {
    const display = buildChannelDiagnosticDisplay(onAir, programsById, 0);
    expect(display.programPosition).toBe("01:17:42");
  });

  it("formats Track position", () => {
    const display = buildChannelDiagnosticDisplay(onAir, programsById, 0);
    expect(display.trackPosition).toBe("00:02:13");
  });

  it("displays trackId as the track label (the only safe identifier the resolver currently exposes)", () => {
    const display = buildChannelDiagnosticDisplay(onAir, programsById, 0);
    expect(display.trackLabel).toBe("t7");
  });

  it("computes Program-ends-in from programEndsAtMs and the supplied nowMs", () => {
    const display = buildChannelDiagnosticDisplay(onAir, programsById, 9_995_000);
    expect(display.programEndsIn).toBe("00:00:05");
  });
});

describe("buildChannelDiagnosticDisplay -- determinism / no local accumulation", () => {
  it("repeated calls with the same result and nowMs produce identical output (no hidden state)", () => {
    const programsById = new Map([["program-a", program()]]);
    const onAir: ChannelTrackBroadcastResult = {
      status: "on-air", channelId: "c", programId: "program-a", programIndex: 0,
      programOffsetSeconds: 100, programStartedAtMs: 0, programEndsAtMs: 1000,
      trackId: "t0", trackIndex: 0, trackOffsetSeconds: 10, trackDurationSeconds: 200,
      nextProgramId: "program-a", cycleIndex: 0,
    };
    const first = buildChannelDiagnosticDisplay(onAir, programsById, 500);
    const second = buildChannelDiagnosticDisplay(onAir, programsById, 500);
    expect(first).toEqual(second);
  });
});
