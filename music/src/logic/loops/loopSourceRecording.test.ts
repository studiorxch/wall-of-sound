import { describe, it, expect } from "vitest";
import { sourceLibraryFromTrackOwner, buildSourceRecordingForTrack, buildSourceRecordingForSuno } from "./loopSourceRecording";
import type { Track } from "../../data/trackTypes";

function track(overrides: Partial<Track> = {}): Track {
  return {
    trackId: "t1", title: "Track One", artist: "StudioRich",
    durationSeconds: 120, energy: 0.5, energySource: "estimated",
    sourceOwner: "studiorich",
    ...overrides,
  } as Track;
}

describe("sourceLibraryFromTrackOwner", () => {
  it("maps the three known sourceOwner values to their real nav-defined library", () => {
    expect(sourceLibraryFromTrackOwner("studiorich")).toBe("catalog");
    expect(sourceLibraryFromTrackOwner("external")).toBe("external");
    expect(sourceLibraryFromTrackOwner("reference")).toBe("sounds");
  });

  it("returns null for unknown/absent rather than guessing", () => {
    expect(sourceLibraryFromTrackOwner("unknown")).toBeNull();
    expect(sourceLibraryFromTrackOwner(undefined)).toBeNull();
  });
});

describe("buildSourceRecordingForTrack", () => {
  it("builds a qualified source reference for a real Track", () => {
    expect(buildSourceRecordingForTrack(track())).toEqual({ sourceLibrary: "catalog", recordingId: "t1" });
    expect(buildSourceRecordingForTrack(track({ sourceOwner: "external", trackId: "t2" })))
      .toEqual({ sourceLibrary: "external", recordingId: "t2" });
  });

  it("returns null for a track with no resolvable library — never fabricates one", () => {
    expect(buildSourceRecordingForTrack(track({ sourceOwner: "unknown" }))).toBeNull();
  });
});

describe("buildSourceRecordingForSuno", () => {
  it("builds a qualified song_library source reference, pinning both the canonical id and the asset id", () => {
    expect(buildSourceRecordingForSuno("asset:abc123", "abc123")).toEqual({
      sourceLibrary: "song_library", recordingId: "asset:abc123", assetId: "abc123",
    });
  });
});
