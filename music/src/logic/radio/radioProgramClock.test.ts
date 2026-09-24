import { describe, expect, it } from "vitest";
import { resolveProgramPosition, TOLERATED_DRIFT_SECONDS, CORRECTABLE_DRIFT_SECONDS, type ProgramTrack } from "./radioProgramClock";

// TRACK A 04:00, TRACK B 05:00, TRACK C 03:00 -- the exact worked example
// from this build's own brief.
const ABC: ProgramTrack[] = [
  { id: "a", durationSeconds: 4 * 60 },
  { id: "b", durationSeconds: 5 * 60 },
  { id: "c", durationSeconds: 3 * 60 },
];
const T0 = Date.parse("2026-01-01T20:00:00.000Z");

function at(seconds: number): number {
  return T0 + seconds * 1000;
}

describe("resolveProgramPosition -- Clock Radio timeline resolver", () => {
  it("resolves the brief's own worked example: T0+06:30 -> Track B at 02:30", () => {
    const result = resolveProgramPosition({ tracks: ABC, programStartAtMs: T0, nowMs: at(6 * 60 + 30) });
    expect(result).toMatchObject({ status: "playing", trackIndex: 1, offsetSeconds: 2 * 60 + 30 });
  });

  it("exact program start resolves to Track A at offset 0", () => {
    const result = resolveProgramPosition({ tracks: ABC, programStartAtMs: T0, nowMs: T0 });
    expect(result).toMatchObject({ status: "playing", trackIndex: 0, offsetSeconds: 0 });
  });

  it("middle of the first track resolves correctly", () => {
    const result = resolveProgramPosition({ tracks: ABC, programStartAtMs: T0, nowMs: at(90) });
    expect(result).toMatchObject({ status: "playing", trackIndex: 0, offsetSeconds: 90 });
  });

  it("the exact track A/B boundary belongs to the NEXT track, at offset 0 -- not the last instant of the previous one", () => {
    const result = resolveProgramPosition({ tracks: ABC, programStartAtMs: T0, nowMs: at(4 * 60) });
    expect(result).toMatchObject({ status: "playing", trackIndex: 1, offsetSeconds: 0 });
  });

  it("middle of a later track (Track C) resolves correctly", () => {
    const result = resolveProgramPosition({ tracks: ABC, programStartAtMs: T0, nowMs: at(4 * 60 + 5 * 60 + 60) });
    expect(result).toMatchObject({ status: "playing", trackIndex: 2, offsetSeconds: 60 });
  });

  it("the final track resolves right up to (but not past) its own end", () => {
    const totalSeconds = 4 * 60 + 5 * 60 + 3 * 60;
    const result = resolveProgramPosition({ tracks: ABC, programStartAtMs: T0, nowMs: at(totalSeconds - 1) });
    expect(result).toMatchObject({ status: "playing", trackIndex: 2, offsetSeconds: 3 * 60 - 1 });
  });

  it("after program end (no repeat) resolves to 'ended' with elapsed-since-end, never a phantom track", () => {
    const totalSeconds = 4 * 60 + 5 * 60 + 3 * 60;
    const result = resolveProgramPosition({ tracks: ABC, programStartAtMs: T0, nowMs: at(totalSeconds + 45) });
    expect(result).toMatchObject({ status: "ended", secondsSinceEnd: 45 });
  });

  it("repeat policy wraps back to Track A after the program's own total duration", () => {
    const totalSeconds = 4 * 60 + 5 * 60 + 3 * 60;
    const result = resolveProgramPosition({ tracks: ABC, programStartAtMs: T0, nowMs: at(totalSeconds + 30), endPolicy: "repeat" });
    expect(result).toMatchObject({ status: "playing", trackIndex: 0, offsetSeconds: 30, repeatCount: 1 });
  });

  it("repeat policy correctly counts multiple elapsed cycles", () => {
    const totalSeconds = 4 * 60 + 5 * 60 + 3 * 60;
    const result = resolveProgramPosition({ tracks: ABC, programStartAtMs: T0, nowMs: at(totalSeconds * 3 + 30), endPolicy: "repeat" });
    expect(result).toMatchObject({ status: "playing", trackIndex: 0, offsetSeconds: 30, repeatCount: 3 });
  });

  it("a zero-duration track is dropped from the timeline defensively, never frozen on or silently zero-length", () => {
    const withZero: ProgramTrack[] = [{ id: "a", durationSeconds: 4 * 60 }, { id: "bad", durationSeconds: 0 }, { id: "c", durationSeconds: 3 * 60 }];
    const result = resolveProgramPosition({ tracks: withZero, programStartAtMs: T0, nowMs: at(4 * 60 + 30) });
    // With "bad" dropped, elapsed 4:30 lands 30s into what is now the second usable track ("c").
    expect(result).toMatchObject({ status: "playing", trackIndex: 1, track: { id: "c" }, offsetSeconds: 30 });
  });

  it("an invalid (NaN/negative) duration track is dropped the same way", () => {
    const withInvalid: ProgramTrack[] = [{ id: "a", durationSeconds: 4 * 60 }, { id: "bad", durationSeconds: -5 }, { id: "c", durationSeconds: 3 * 60 }];
    const result = resolveProgramPosition({ tracks: withInvalid, programStartAtMs: T0, nowMs: at(4 * 60 + 10) });
    expect(result).toMatchObject({ status: "playing", trackIndex: 1, track: { id: "c" } });
  });

  it("an empty (or all-invalid) track list resolves to 'empty', never throwing", () => {
    expect(resolveProgramPosition({ tracks: [], programStartAtMs: T0, nowMs: T0 })).toEqual({ status: "empty" });
    expect(resolveProgramPosition({ tracks: [{ id: "bad", durationSeconds: 0 }], programStartAtMs: T0, nowMs: T0 })).toEqual({ status: "empty" });
  });

  it("late join (listener arrives after the program has been running) resolves to the CURRENT track/offset, never Track 1 at 0", () => {
    // Event starts 8:00 PM, listener arrives 8:37 PM (37 minutes in).
    const result = resolveProgramPosition({ tracks: ABC, programStartAtMs: T0, nowMs: at(37 * 60), endPolicy: "repeat" });
    // 37:00 total, program length 12:00 -> 3 full cycles (36:00) + 1:00 into cycle 4 -> Track A at 1:00.
    expect(result).toMatchObject({ status: "playing", trackIndex: 0, offsetSeconds: 60, repeatCount: 3 });
  });

  it("a moment before the program starts resolves to 'before-start' with a positive countdown, never a negative offset", () => {
    const result = resolveProgramPosition({ tracks: ABC, programStartAtMs: T0, nowMs: at(-30) });
    expect(result).toMatchObject({ status: "before-start", startsInSeconds: 30 });
  });

  it("is fully deterministic: identical inputs always resolve identically (what lets two independent clients agree)", () => {
    const input = { tracks: ABC, programStartAtMs: T0, nowMs: at(4 * 60 + 90) };
    const first = resolveProgramPosition(input);
    const second = resolveProgramPosition(input);
    expect(second).toEqual(first);
  });

  it("two independent 'clients' resolving the same program+time agree on track and offset (simulated multi-listener agreement)", () => {
    const sharedNow = at(6 * 60 + 30);
    const clientA = resolveProgramPosition({ tracks: ABC, programStartAtMs: T0, nowMs: sharedNow });
    const clientB = resolveProgramPosition({ tracks: ABC, programStartAtMs: T0, nowMs: sharedNow });
    expect(clientA).toEqual(clientB);
  });

  it("resolves correctly against a realistic long playlist (real Soft Motion Radio durations, StudioRich's actual 11-track event playlist)", () => {
    // Real durationSeconds values from library/music/RadioWebExports/soft-motion-radio/v1/radio-manifest.json.
    const softMotion: ProgramTrack[] = [
      { id: "rtrack_000019", durationSeconds: 106.63997916666666 },
      { id: "rtrack_000020", durationSeconds: 92.91997916666666 },
      { id: "rtrack_000021", durationSeconds: 103.99997916666666 },
      { id: "rtrack_000022", durationSeconds: 187.07997916666667 },
      { id: "rtrack_000023", durationSeconds: 158.47997916666668 },
      { id: "rtrack_000024", durationSeconds: 140 },
      { id: "rtrack_000025", durationSeconds: 130 },
      { id: "rtrack_000026", durationSeconds: 150 },
      { id: "rtrack_000027", durationSeconds: 160 },
      { id: "rtrack_000028", durationSeconds: 145 },
      { id: "rtrack_000029", durationSeconds: 173.14 },
    ];
    const total = softMotion.reduce((sum, track) => sum + track.durationSeconds, 0);
    // Just past the midpoint of the whole real playlist.
    const midResult = resolveProgramPosition({ tracks: softMotion, programStartAtMs: T0, nowMs: at(total / 2) });
    expect(midResult.status).toBe("playing");
    // Exactly at the final track's own last instant.
    const nearEnd = resolveProgramPosition({ tracks: softMotion, programStartAtMs: T0, nowMs: at(total - 0.5) });
    expect(nearEnd).toMatchObject({ status: "playing", trackIndex: softMotion.length - 1 });
    // Past the end with "stop" (the current player's own behavior).
    const past = resolveProgramPosition({ tracks: softMotion, programStartAtMs: T0, nowMs: at(total + 5) });
    expect(past).toMatchObject({ status: "ended" });
  });

  it("drift policy thresholds are ordered sensibly (tolerated < correctable) and documented, not sample-perfect", () => {
    expect(TOLERATED_DRIFT_SECONDS).toBeGreaterThan(0);
    expect(CORRECTABLE_DRIFT_SECONDS).toBeGreaterThan(TOLERATED_DRIFT_SECONDS);
  });

  describe("playlist size scaling (metadata-only -- no audio bytes involved)", () => {
    function metadataOnlyPlaylist(count: number): ProgramTrack[] {
      return Array.from({ length: count }, (_, index) => ({ id: `track-${index}`, durationSeconds: 180 }));
    }

    it.each([1, 10, 100, 500])("resolves correctly and in bounded time for a %i-track metadata-only playlist", (count) => {
      const tracks = metadataOnlyPlaylist(count);
      const total = count * 180;
      const start = performance.now();
      const result = resolveProgramPosition({ tracks, programStartAtMs: T0, nowMs: at(total - 30) });
      const elapsedMs = performance.now() - start;
      expect(result).toMatchObject({ status: "playing", trackIndex: count - 1, offsetSeconds: 150 });
      // A single resolution is a single linear scan of the track list --
      // even 500 tracks must resolve in comfortably sub-millisecond time,
      // not grow into anything resembling per-frame or O(n^2) work.
      expect(elapsedMs).toBeLessThan(50);
    });
  });
});
