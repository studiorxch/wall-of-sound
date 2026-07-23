import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { finalizeStemSet, setDirName, manifestFileName } from "./stemSetWriter";
import { trackStemSetsDir } from "./stemFsUtils";
import { STEM_ROLES, type StemRole, type TrackStemFile, type TrackStemSet } from "../../src/data/trackStemTypes";

function stubStems(): Record<StemRole, TrackStemFile> {
  const stems = {} as Record<StemRole, TrackStemFile>;
  for (const role of STEM_ROLES) {
    stems[role] = {
      role, relativeArchivePath: "", fileName: `${role}.wav`, durationFrames: 1000, durationSeconds: 1000 / 44100,
      sampleRateHz: 44100, channels: 2, bitDepth: 16, codec: "pcm_s16le", sizeBytes: 4000, contentHash: "a".repeat(64),
    };
  }
  return stems;
}

function stubSet(overrides: Partial<TrackStemSet> = {}): Omit<TrackStemSet, "archiveDirectory" | "stems"> & { stems: Record<StemRole, TrackStemFile> } {
  return {
    id: "set_1", sourceTrackId: "track_1", sourceAudioPathAtCreation: "catalog/audio/a.wav",
    sourceAudioIdentity: { fingerprint: "f".repeat(64), fingerprintAlgorithm: "pcm-sha256", fingerprintVersion: 1, sampleRateHz: 44100, normalizedChannels: 2, durationFrames: 1000 },
    sourceRawFileHashAtCreation: "b".repeat(64),
    sourceStatAtCreation: { sizeBytes: 100, mtimeMs: 0, inode: 1 },
    sourceAudioProvenance: { decoderTool: "ffmpeg", decoderVersion: "8.0", computedAt: new Date().toISOString() },
    origin: "demucs", engine: "demucs", model: "htdemucs", engineVersion: "4.1.0", engineDevice: "cpu",
    manifestVersion: 1, stems: stubStems(),
    createdAt: "2026-07-22T00:00:00.000Z", completedAt: "2026-07-22T00:01:00.000Z",
    ...overrides,
  };
}

describe("stemSetWriter", () => {
  let root: string;
  let stagingDir: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "stem-writer-"));
    stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), "stem-writer-staging-"));
    for (const role of STEM_ROLES) fs.writeFileSync(path.join(stagingDir, `${role}.wav`), "fake-wav-bytes");
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(stagingDir, { recursive: true, force: true });
  });

  it("atomically promotes staging to the final archive dir with correct relative paths", () => {
    const result = finalizeStemSet({ stemLibraryRoot: root, safeTrackId: "track_1", stagingDir, set: stubSet() });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const role of STEM_ROLES) {
      expect(result.stemSet!.stems[role].relativeArchivePath).toContain(role);
      expect(fs.existsSync(path.join(root, result.stemSet!.stems[role].relativeArchivePath))).toBe(true);
    }
    expect(fs.existsSync(stagingDir)).toBe(false); // staging moved, not copied
    const manifestPath = path.join(root, result.stemSet!.archiveDirectory, manifestFileName());
    expect(fs.existsSync(manifestPath)).toBe(true);
  });

  it("never overwrites an existing valid set directory", () => {
    const set = stubSet();
    const first = finalizeStemSet({ stemLibraryRoot: root, safeTrackId: "track_1", stagingDir, set });
    expect(first.ok).toBe(true);

    // A second staging attempt that would resolve to the exact same dir name.
    const secondStaging = fs.mkdtempSync(path.join(os.tmpdir(), "stem-writer-staging2-"));
    for (const role of STEM_ROLES) fs.writeFileSync(path.join(secondStaging, `${role}.wav`), "different-bytes");
    const second = finalizeStemSet({ stemLibraryRoot: root, safeTrackId: "track_1", stagingDir: secondStaging, set });
    expect(second.ok).toBe(false);
    fs.rmSync(secondStaging, { recursive: true, force: true });

    // The original set is untouched.
    const original = fs.readFileSync(path.join(root, first.ok ? first.stemSet!.archiveDirectory : "", "vocals.wav"), "utf-8");
    expect(original).toBe("fake-wav-bytes");
  });

  it("setDirName includes createdAt, an 8-char fingerprint prefix, and the model", () => {
    const name = setDirName("2026-07-22T00:00:00.000Z", "f".repeat(64), "htdemucs");
    expect(name).toContain("ffffffff");
    expect(name).toContain("htdemucs");
  });

  it("scans back to the same location via trackStemSetsDir", () => {
    const result = finalizeStemSet({ stemLibraryRoot: root, safeTrackId: "track_1", stagingDir, set: stubSet() });
    expect(result.ok).toBe(true);
    const setsDir = trackStemSetsDir(root, "track_1");
    expect(fs.existsSync(setsDir)).toBe(true);
    expect(fs.readdirSync(setsDir).length).toBe(1);
  });
});
