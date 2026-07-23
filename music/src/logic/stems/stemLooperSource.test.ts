import { describe, it, expect } from "vitest";
import { stemLooperSourceTrackId, isStemLooperSourceTrackId, stemAssetUrl, buildStemLooperSourceTrack, buildStemSourceReference } from "./stemLooperSource";
import type { Track } from "../../data/trackTypes";
import type { TrackStemSet } from "../../data/trackStemTypes";

const PARENT: Track = {
  trackId: "ext_abc123", title: "White Ropes", artist: "Soulphiction",
  durationSeconds: 235, energy: 0.5, energySource: "estimated", audioRelPath: "external/audio/white-ropes.flac",
};

const STEM_SET: TrackStemSet = {
  id: "set_xyz", sourceTrackId: "ext_abc123", sourceAudioPathAtCreation: "external/audio/white-ropes.flac",
  sourceAudioIdentity: { fingerprint: "f".repeat(64), fingerprintAlgorithm: "pcm-sha256", fingerprintVersion: 1, sampleRateHz: 44100, normalizedChannels: 2, durationFrames: 44100 },
  sourceRawFileHashAtCreation: "b".repeat(64),
  sourceStatAtCreation: { sizeBytes: 100, mtimeMs: 0, inode: 1 },
  sourceAudioProvenance: { decoderTool: "ffmpeg", decoderVersion: "8.0", computedAt: "2026-07-22T00:00:00.000Z" },
  origin: "demucs", engine: "demucs", model: "htdemucs", engineVersion: "4.1.0", engineDevice: "cpu",
  archiveDirectory: "ext_abc123/sets/2026-07-22_ffffffff_htdemucs", manifestVersion: 1,
  stems: {
    vocals: { role: "vocals", relativeArchivePath: "x/vocals.wav", fileName: "vocals.wav", durationFrames: 44100, durationSeconds: 1, sampleRateHz: 44100, channels: 2, bitDepth: 16, codec: "pcm_s16le", sizeBytes: 100, contentHash: "a".repeat(64) },
    drums: { role: "drums", relativeArchivePath: "x/drums.wav", fileName: "drums.wav", durationFrames: 44100, durationSeconds: 1, sampleRateHz: 44100, channels: 2, bitDepth: 16, codec: "pcm_s16le", sizeBytes: 100, contentHash: "a".repeat(64) },
    bass: { role: "bass", relativeArchivePath: "x/bass.wav", fileName: "bass.wav", durationFrames: 44100, durationSeconds: 1, sampleRateHz: 44100, channels: 2, bitDepth: 16, codec: "pcm_s16le", sizeBytes: 100, contentHash: "a".repeat(64) },
    other: { role: "other", relativeArchivePath: "x/other.wav", fileName: "other.wav", durationFrames: 44100, durationSeconds: 1, sampleRateHz: 44100, channels: 2, bitDepth: 16, codec: "pcm_s16le", sizeBytes: 100, contentHash: "a".repeat(64) },
  },
  createdAt: "2026-07-22T00:00:00.000Z", completedAt: "2026-07-22T00:01:00.000Z",
};

describe("stemLooperSourceTrackId / isStemLooperSourceTrackId", () => {
  it("the id space is distinct and recognizable — never collides with a real track id", () => {
    const id = stemLooperSourceTrackId("set_xyz", "vocals");
    expect(id).toBe("stemloop_set_xyz_vocals");
    expect(isStemLooperSourceTrackId(id)).toBe(true);
    expect(isStemLooperSourceTrackId(PARENT.trackId)).toBe(false);
    expect(isStemLooperSourceTrackId("ext_mr9smtpl_wb0b")).toBe(false);
  });

  it("is deterministic — same set+role always yields the same id (reproducible, if not persisted)", () => {
    expect(stemLooperSourceTrackId("set_xyz", "vocals")).toBe(stemLooperSourceTrackId("set_xyz", "vocals"));
  });

  it("is unique per role within the same set", () => {
    expect(stemLooperSourceTrackId("set_xyz", "vocals")).not.toBe(stemLooperSourceTrackId("set_xyz", "drums"));
  });
});

describe("stemAssetUrl", () => {
  it("builds the /stem-set-asset URL with all four required params", () => {
    const url = stemAssetUrl("ext_abc123", "external/audio/white-ropes.flac", "set_xyz", "vocals");
    expect(url).toContain("/stem-set-asset?");
    expect(url).toContain("trackId=ext_abc123");
    expect(url).toContain("stemSetId=set_xyz");
    expect(url).toContain("role=vocals");
  });
});

describe("buildStemLooperSourceTrack", () => {
  it("never uses derivedKind/parentTrackId/stemRole — the deprecated top-level-track fields", () => {
    const synthetic = buildStemLooperSourceTrack(PARENT, PARENT.audioRelPath!, STEM_SET, "vocals");
    expect(synthetic.derivedKind).toBeUndefined();
    expect(synthetic.parentTrackId).toBeUndefined();
    expect(synthetic.stemRole).toBeUndefined();
  });

  it("resolves audio via objectUrl (the stem asset route), never audioRelPath", () => {
    const synthetic = buildStemLooperSourceTrack(PARENT, PARENT.audioRelPath!, STEM_SET, "drums");
    expect(synthetic.audioRelPath).toBeUndefined();
    expect(synthetic.objectUrl).toContain("/stem-set-asset");
    expect(synthetic.objectUrl).toContain("role=drums");
  });

  it("carries a distinct id, never the parent's own track id", () => {
    const synthetic = buildStemLooperSourceTrack(PARENT, PARENT.audioRelPath!, STEM_SET, "bass");
    expect(synthetic.trackId).not.toBe(PARENT.trackId);
    expect(isStemLooperSourceTrackId(synthetic.trackId)).toBe(true);
  });
});

describe("buildStemSourceReference", () => {
  it("is exactly {stemSetId, role} — the only thing ever persisted for a stem-sourced loop", () => {
    expect(buildStemSourceReference("set_xyz", "vocals")).toEqual({ stemSetId: "set_xyz", role: "vocals" });
  });
});
