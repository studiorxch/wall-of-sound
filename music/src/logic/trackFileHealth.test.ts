import { describe, it, expect } from "vitest";
import { computeTrackFileHealth, computeTrackOverallFileHealth } from "./trackFileHealth";
import type { Track } from "../data/trackTypes";
import type { TrackPlaybackIssue } from "../data/playProjectTypes";

function track(overrides: Partial<Track> & { trackId: string }): Track {
  return {
    title: "T", artist: "A", durationSeconds: 100, energy: 0.5, energySource: "manual",
    sourceOwner: "studiorich",
    ...overrides,
  } as Track;
}

describe("computeTrackFileHealth — single-file signal (unaffected by analysisStatus)", () => {
  it("is healthy when a source resolves and there's no known issue", () => {
    const t = track({ trackId: "t1", audioRelPath: "catalog/audio/a.wav", analysisStatus: "failed" });
    expect(computeTrackFileHealth(t)).toBe("healthy");
  });

  it("is missing when audioMissing is true, regardless of analysisStatus", () => {
    const t = track({ trackId: "t1", audioRelPath: "catalog/audio/a.wav", audioMissing: true, analysisStatus: "analyzed" });
    expect(computeTrackFileHealth(t)).toBe("missing");
  });

  it("is missing when audioStatus is missing", () => {
    const t = track({ trackId: "t1", audioStatus: "missing" });
    expect(computeTrackFileHealth(t)).toBe("missing");
  });

  it("is unresolved when audioStatus is unresolved", () => {
    const t = track({ trackId: "t1", audioStatus: "unresolved", audioRelPath: "x" });
    expect(computeTrackFileHealth(t)).toBe("unresolved");
  });

  it("is missing when there is no source path at all", () => {
    const t = track({ trackId: "t1" });
    expect(computeTrackFileHealth(t)).toBe("missing");
  });

  it("classifies a live playback issue by code — CODEC/NETWORK/MISSING/NO_SOURCE", () => {
    const t = track({ trackId: "t1", audioRelPath: "a.wav" });
    const codec: TrackPlaybackIssue = { status: "unplayable", code: "CODEC" };
    const network: TrackPlaybackIssue = { status: "unplayable", code: "NETWORK" };
    const missing: TrackPlaybackIssue = { status: "unplayable", code: "MISSING" };
    expect(computeTrackFileHealth(t, { t1: codec })).toBe("codec_blocked");
    expect(computeTrackFileHealth(t, { t1: network })).toBe("unavailable");
    expect(computeTrackFileHealth(t, { t1: missing })).toBe("missing");
  });
});

describe("computeTrackOverallFileHealth — Step B asset-model participation", () => {
  it("rolls up a healthy WAV + missing MP3 + healthy FLAC to an overall 'missing' with per-format detail", () => {
    const t = track({
      trackId: "t1",
      audioRelPath: "catalog/audio/track.wav",
      assets: [
        { assetId: "primary:t1", format: "wav", fileName: "track.wav", filePath: "catalog/audio/track.wav", checksum: null, sourceOwner: "studiorich", addedAt: "", isPrimary: true },
        { assetId: "a2", format: "mp3", fileName: "track.mp3", filePath: "catalog/audio/track.mp3", checksum: "x", sourceOwner: "studiorich", addedAt: "", assetStatus: "missing" },
        { assetId: "a3", format: "flac", fileName: "track.flac", filePath: "catalog/audio/track.flac", checksum: "y", sourceOwner: "studiorich", addedAt: "", assetStatus: "healthy" },
      ],
    });
    const { overall, perAsset } = computeTrackOverallFileHealth(t);
    expect(overall).toBe("missing");
    expect(perAsset).toEqual([
      { format: "wav", status: "healthy" },
      { format: "mp3", status: "missing" },
      { format: "flac", status: "healthy" },
    ]);
  });

  it("a single-file legacy track (no assets[]) falls back to the synthesized primary view", () => {
    const t = track({ trackId: "t1", audioRelPath: "catalog/audio/track.wav", audioFileName: "track.wav" });
    const { overall, perAsset } = computeTrackOverallFileHealth(t);
    expect(overall).toBe("healthy");
    expect(perAsset).toHaveLength(1);
  });

  it("an asset never checked reports unknown, not healthy — never assume", () => {
    const t = track({
      trackId: "t1",
      audioRelPath: "catalog/audio/track.wav",
      assets: [
        { assetId: "primary:t1", format: "wav", fileName: "track.wav", filePath: "catalog/audio/track.wav", checksum: null, sourceOwner: "studiorich", addedAt: "", isPrimary: true },
        { assetId: "a2", format: "mp3", fileName: "track.mp3", filePath: "catalog/audio/track.mp3", checksum: "x", sourceOwner: "studiorich", addedAt: "" },
      ],
    });
    const { perAsset } = computeTrackOverallFileHealth(t);
    expect(perAsset.find((a) => a.format === "mp3")?.status).toBe("unknown");
  });
});
