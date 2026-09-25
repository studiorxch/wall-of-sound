import { describe, expect, it } from "vitest";
import { resolveBroadcastState, type BroadcastProgramInput, type ResolveBroadcastStateInput } from "./resolvedBroadcastState";
import type { RadioWebManifest, RadioWebManifestEntry } from "../../data/radioWebBundleTypes";
import type { RadioResumableSession } from "../../audio/radioResumableSession";

const MANIFEST_BASE_URL = "/radio-web-export/soft-motion-radio/v1/";

function entry(overrides: Partial<RadioWebManifestEntry> = {}): RadioWebManifestEntry {
  return {
    radioTrackId: "track-1",
    packageVersion: 1,
    audioUrl: "audio/track-1.opus",
    durationSeconds: 100,
    byteSize: 1000,
    sha256: "abc",
    title: "Track One",
    artist: "StudioRich",
    ...overrides,
  };
}

function manifest(entries: RadioWebManifestEntry[]): RadioWebManifest {
  return {
    schemaVersion: "1.0.0",
    stationId: "soft-motion-radio",
    bundleVersion: 1,
    title: "Soft Motion Radio",
    entries,
    totalDurationSeconds: entries.reduce((sum, e) => sum + e.durationSeconds, 0),
    totalByteSize: entries.reduce((sum, e) => sum + e.byteSize, 0),
    createdAt: new Date(0).toISOString(),
    performanceAssets: [],
  };
}

const THREE_TRACKS = manifest([
  entry({ radioTrackId: "t0", title: "Zero", durationSeconds: 100 }),
  entry({ radioTrackId: "t1", title: "One", durationSeconds: 50 }),
  entry({ radioTrackId: "t2", title: "Two", durationSeconds: 80 }),
]);

function clockProgram(overrides: Partial<BroadcastProgramInput> = {}): BroadcastProgramInput {
  return { programId: "prog-1", playbackMode: "clock", startAtMs: 0, endPolicy: "stop", ...overrides };
}

function personalProgram(overrides: Partial<BroadcastProgramInput> = {}): BroadcastProgramInput {
  return { programId: "prog-1", playbackMode: "personal", startAtMs: null, endPolicy: "stop", ...overrides };
}

function baseInput(overrides: Partial<ResolveBroadcastStateInput> = {}): ResolveBroadcastStateInput {
  return {
    program: clockProgram(),
    manifestBaseUrl: MANIFEST_BASE_URL,
    manifest: THREE_TRACKS,
    nowMs: 0,
    resumableSession: null,
    ...overrides,
  };
}

describe("resolveBroadcastState -- inactive", () => {
  it("resolves to inactive when there is no program at all", () => {
    expect(resolveBroadcastState(baseInput({ program: null }))).toEqual({ status: "inactive" });
  });
});

describe("resolveBroadcastState -- clock mode", () => {
  it("resolves before-start when now precedes programStartAtMs", () => {
    const result = resolveBroadcastState(baseInput({ program: clockProgram({ startAtMs: 10_000 }), nowMs: 0 }));
    expect(result).toEqual({ status: "before-start", programId: "prog-1", startsInSeconds: 10 });
  });

  it("resolves playing at the first track when now equals start", () => {
    const result = resolveBroadcastState(baseInput({ nowMs: 0 }));
    expect(result).toMatchObject({ status: "playing", trackIndex: 0, trackId: "t0", title: "Zero", offsetSeconds: 0, isPlaying: true, playbackMode: "clock" });
  });

  it("resolves playing mid-first-track", () => {
    const result = resolveBroadcastState(baseInput({ nowMs: 30_000 }));
    expect(result).toMatchObject({ status: "playing", trackIndex: 0, offsetSeconds: 30 });
  });

  it("resolves the exact track boundary onto the NEXT track at offset 0", () => {
    // track 0 is exactly 100s; at elapsed=100s we should be at track 1, offset 0.
    const result = resolveBroadcastState(baseInput({ nowMs: 100_000 }));
    expect(result).toMatchObject({ status: "playing", trackIndex: 1, trackId: "t1", offsetSeconds: 0 });
  });

  it("resolves mid-second-track correctly", () => {
    const result = resolveBroadcastState(baseInput({ nowMs: 120_000 }));
    expect(result).toMatchObject({ status: "playing", trackIndex: 1, offsetSeconds: 20 });
  });

  it("resolves ended once the program finishes under a stop policy", () => {
    // total duration = 100+50+80 = 230s
    const result = resolveBroadcastState(baseInput({ nowMs: 230_000, program: clockProgram({ endPolicy: "stop" }) }));
    expect(result).toEqual({ status: "ended", programId: "prog-1" });
  });

  it("loops back to the first track under a repeat policy", () => {
    const result = resolveBroadcastState(baseInput({ nowMs: 235_000, program: clockProgram({ endPolicy: "repeat" }) }));
    expect(result).toMatchObject({ status: "playing", trackIndex: 0, offsetSeconds: 5 });
  });

  it("resolves empty when the program has no startAtMs", () => {
    const result = resolveBroadcastState(baseInput({ program: clockProgram({ startAtMs: null }) }));
    expect(result).toEqual({ status: "empty", programId: "prog-1" });
  });

  it("resolves empty for an empty manifest", () => {
    const result = resolveBroadcastState(baseInput({ manifest: manifest([]) }));
    expect(result).toEqual({ status: "empty", programId: "prog-1" });
  });

  it("resolves empty for a null manifest", () => {
    const result = resolveBroadcastState(baseInput({ manifest: null }));
    expect(result).toEqual({ status: "empty", programId: "prog-1" });
  });

  it("drops unusable-duration tracks the same way the underlying clock resolver does", () => {
    const withBadTrack = manifest([
      entry({ radioTrackId: "bad", durationSeconds: 0 }),
      entry({ radioTrackId: "t0", title: "Zero", durationSeconds: 100 }),
    ]);
    const result = resolveBroadcastState(baseInput({ manifest: withBadTrack, nowMs: 10_000 }));
    // The bad track is filtered out by resolveProgramPosition; the surviving
    // track's timeline position is index 0 into the FILTERED list, mapped
    // directly (not by id) back into manifest.entries[0] -- which is the
    // BAD track's slot in the original array. This is the exact pre-existing
    // direct-index relationship this refactor preserves rather than "fixes."
    expect(result).toMatchObject({ status: "playing", trackIndex: 0, trackId: "bad" });
  });
});

describe("resolveBroadcastState -- personal mode", () => {
  function session(overrides: Partial<RadioResumableSession> = {}): RadioResumableSession {
    return {
      schemaVersion: 1,
      manifestBaseUrl: MANIFEST_BASE_URL,
      trackId: "t1",
      trackIndex: 1,
      offsetSeconds: 20,
      referenceAtMs: 1_000_000,
      isPlaying: true,
      volume: 1,
      playbackMode: "personal",
      ...overrides,
    };
  }

  it("resolves empty with no session", () => {
    const result = resolveBroadcastState(baseInput({ program: personalProgram(), resumableSession: null }));
    expect(result).toEqual({ status: "empty", programId: "prog-1" });
  });

  it("resolves playing from a matching session", () => {
    const result = resolveBroadcastState(baseInput({ program: personalProgram(), resumableSession: session(), nowMs: 1_000_000 }));
    expect(result).toMatchObject({ status: "playing", playbackMode: "personal", trackIndex: 1, trackId: "t1", offsetSeconds: 20, isPlaying: true });
  });

  it("extrapolates offset forward by elapsed real time while the session was playing", () => {
    const result = resolveBroadcastState(baseInput({ program: personalProgram(), resumableSession: session(), nowMs: 1_015_000 }));
    expect(result).toMatchObject({ status: "playing", offsetSeconds: 35, isPlaying: true });
  });

  it("does not extrapolate a paused session", () => {
    const result = resolveBroadcastState(baseInput({ program: personalProgram(), resumableSession: session({ isPlaying: false }), nowMs: 1_015_000 }));
    expect(result).toMatchObject({ status: "playing", offsetSeconds: 20, isPlaying: false });
  });

  it("ignores a session for a different RADIO Package (mismatched manifestBaseUrl)", () => {
    const result = resolveBroadcastState(
      baseInput({ program: personalProgram(), resumableSession: session({ manifestBaseUrl: "/radio-web-export/other-station/v1/" }) }),
    );
    expect(result).toEqual({ status: "empty", programId: "prog-1" });
  });

  it("ignores a clock-mode session while resolving personal mode", () => {
    const result = resolveBroadcastState(baseInput({ program: personalProgram(), resumableSession: session({ playbackMode: "clock" }) }));
    expect(result).toEqual({ status: "empty", programId: "prog-1" });
  });

  it("resolves empty when the session's trackIndex is out of range for the current manifest", () => {
    const result = resolveBroadcastState(baseInput({ program: personalProgram(), resumableSession: session({ trackIndex: 99 }) }));
    expect(result).toEqual({ status: "empty", programId: "prog-1" });
  });

  it("never consults resumableSession for clock mode, even if one is present", () => {
    const result = resolveBroadcastState(baseInput({ program: clockProgram(), resumableSession: session({ trackIndex: 2, offsetSeconds: 999 }), nowMs: 0 }));
    expect(result).toMatchObject({ status: "playing", playbackMode: "clock", trackIndex: 0, offsetSeconds: 0 });
  });
});
