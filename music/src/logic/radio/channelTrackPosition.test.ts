import { describe, expect, it } from "vitest";
import { resolveTrackAtProgramOffset } from "./channelTrackPosition";

const TRACKS = [
  { radioTrackId: "t0", durationSeconds: 100 },
  { radioTrackId: "t1", durationSeconds: 50 },
  { radioTrackId: "t2", durationSeconds: 80 },
];

describe("resolveTrackAtProgramOffset", () => {
  it("resolves offset 0 to the first track", () => {
    expect(resolveTrackAtProgramOffset(TRACKS, 0)).toEqual({ status: "resolved", trackId: "t0", trackIndex: 0, trackOffsetSeconds: 0, trackDurationSeconds: 100 });
  });

  it("resolves mid-first-track", () => {
    expect(resolveTrackAtProgramOffset(TRACKS, 30)).toEqual({ status: "resolved", trackId: "t0", trackIndex: 0, trackOffsetSeconds: 30, trackDurationSeconds: 100 });
  });

  it("resolves the exact track boundary onto the next track at offset 0", () => {
    expect(resolveTrackAtProgramOffset(TRACKS, 100)).toEqual({ status: "resolved", trackId: "t1", trackIndex: 1, trackOffsetSeconds: 0, trackDurationSeconds: 50 });
  });

  it("resolves mid-second-track", () => {
    expect(resolveTrackAtProgramOffset(TRACKS, 120)).toEqual({ status: "resolved", trackId: "t1", trackIndex: 1, trackOffsetSeconds: 20, trackDurationSeconds: 50 });
  });

  it("resolves inside the last track", () => {
    // cumulative: t0 ends 100, t1 ends 150, t2 ends 230 -- offset 200 is 50s into t2.
    expect(resolveTrackAtProgramOffset(TRACKS, 200)).toEqual({ status: "resolved", trackId: "t2", trackIndex: 2, trackOffsetSeconds: 50, trackDurationSeconds: 80 });
  });

  it("rejects an empty manifest", () => {
    expect(resolveTrackAtProgramOffset([], 0)).toEqual({ status: "invalid-manifest" });
  });

  it("rejects a negative offset", () => {
    expect(resolveTrackAtProgramOffset(TRACKS, -1)).toEqual({ status: "track-resolution-failed" });
  });

  it("rejects a non-finite offset", () => {
    expect(resolveTrackAtProgramOffset(TRACKS, Number.NaN)).toEqual({ status: "track-resolution-failed" });
  });

  it("skips a zero-duration entry for cumulative math but still reports the REAL array index for the entry it lands on", () => {
    const withBadEntry = [
      { radioTrackId: "bad", durationSeconds: 0 },
      { radioTrackId: "t0", durationSeconds: 100 },
      { radioTrackId: "t1", durationSeconds: 50 },
    ];
    // 10s in: the bad entry consumed no time, so this should land on t0 (real index 1), not be thrown off by the filtered position.
    const result = resolveTrackAtProgramOffset(withBadEntry, 10);
    expect(result).toEqual({ status: "resolved", trackId: "t0", trackIndex: 1, trackOffsetSeconds: 10, trackDurationSeconds: 100 });
  });

  it("falls back to the last usable entry for an offset at the very end (floating-point safety)", () => {
    const result = resolveTrackAtProgramOffset(TRACKS, 230); // exactly the sum of all durations
    expect(result).toMatchObject({ status: "resolved", trackId: "t2" });
  });
});
