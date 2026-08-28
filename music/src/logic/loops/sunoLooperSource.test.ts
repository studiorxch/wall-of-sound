import { describe, it, expect } from "vitest";
import { sunoLooperSourceTrackId, isSunoLooperSourceTrackId, buildSunoLooperSourceTrack } from "./sunoLooperSource";

const BEAT_MAP = {
  version: "v1", bpm: 122, beatTimesSeconds: [0, 0.5, 1.0], barStartTimesSeconds: [0],
  tempoStable: true, tempoStabilityScore: 0.9, tempoSegments: [], confidence: 0.9,
  source: "detected" as const, detectorVersion: "v1",
  analyzedAt: "2026-08-28T00:00:00.000Z", warnings: [],
};

describe("sunoLooperSourceTrackId / isSunoLooperSourceTrackId", () => {
  it("the id space is distinct and recognizable — never collides with a real track id or a stem-loop id", () => {
    const id = sunoLooperSourceTrackId("asset:asset-abc123");
    expect(id).toBe("sunoloop_asset:asset-abc123");
    expect(isSunoLooperSourceTrackId(id)).toBe(true);
    expect(isSunoLooperSourceTrackId("ext_mr9smtpl_wb0b")).toBe(false);
    expect(isSunoLooperSourceTrackId("stemloop_set_xyz_vocals")).toBe(false);
  });

  it("is deterministic — same canonicalRecordingId always yields the same id (reproducible, if not persisted)", () => {
    expect(sunoLooperSourceTrackId("asset:asset-abc123")).toBe(sunoLooperSourceTrackId("asset:asset-abc123"));
  });
});

describe("buildSunoLooperSourceTrack", () => {
  it("carries a distinct, namespaced id, never a real trackId or the bare canonicalRecordingId", () => {
    const synthetic = buildSunoLooperSourceTrack({
      canonicalRecordingId: "asset:asset-abc123", title: "Warm Analog Pads",
      durationSeconds: 187.4, playableAudioUrl: "/suno-library-audio/asset-abc123", bpm: 122,
    });
    expect(synthetic.trackId).not.toBe("asset:asset-abc123");
    expect(isSunoLooperSourceTrackId(synthetic.trackId)).toBe(true);
  });

  it("resolves audio via objectUrl (the already-resolved Suno playback URL), never a real audioRelPath/filePath", () => {
    const synthetic = buildSunoLooperSourceTrack({
      canonicalRecordingId: "asset:asset-abc123", title: "Warm Analog Pads",
      durationSeconds: 187.4, playableAudioUrl: "/suno-library-audio/asset-abc123", bpm: 122,
    });
    expect(synthetic.objectUrl).toBe("/suno-library-audio/asset-abc123");
    expect(synthetic.audioRelPath).toBeUndefined();
    expect(synthetic.filePath).toBeUndefined();
  });

  it("never adds a real TrackSourceOwner value — uses the same 'unknown' convention as analyzeSunoRecording's own adapter", () => {
    const synthetic = buildSunoLooperSourceTrack({
      canonicalRecordingId: "asset:asset-abc123", title: "t", durationSeconds: 10, playableAudioUrl: "u", bpm: null,
    });
    expect(synthetic.sourceOwner).toBe("unknown");
  });

  it("carries beatMap through when present — the real grid the Looper needs to snap against", () => {
    const synthetic = buildSunoLooperSourceTrack({
      canonicalRecordingId: "asset:asset-abc123", title: "t", durationSeconds: 10,
      playableAudioUrl: "u", bpm: 122, beatMap: BEAT_MAP,
    });
    expect(synthetic.beatMap).toEqual(BEAT_MAP);
  });

  it("leaves beatMap absent when none was supplied — never fabricates a grid", () => {
    const synthetic = buildSunoLooperSourceTrack({
      canonicalRecordingId: "asset:asset-abc123", title: "t", durationSeconds: 10, playableAudioUrl: "u", bpm: null,
    });
    expect(synthetic.beatMap).toBeUndefined();
  });
});
