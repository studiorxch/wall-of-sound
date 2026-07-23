import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { registerExistingStemSet } from "./stemSalvageOrchestrator";
import { encodePcmWav } from "../../src/logic/loops/wavEncoder";
import { STEM_ROLES, type StemRole } from "../../src/data/trackStemTypes";

function sineWav(dir: string, name: string, durationSeconds: number, freq = 440): string {
  const sampleRate = 44100;
  const frames = Math.round(durationSeconds * sampleRate);
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let i = 0; i < frames; i++) { left[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate) * 0.5; right[i] = left[i]; }
  const wav = encodePcmWav({ channelData: [left, right], sampleRate, bitDepth: 16 });
  const p = path.join(dir, name);
  fs.writeFileSync(p, Buffer.from(wav));
  return p;
}

describe("registerExistingStemSet (real ffmpeg)", () => {
  let stemRoot: string;
  let musicRoot: string;
  let stagingDir: string;
  let sourcePath: string;

  beforeEach(() => {
    stemRoot = fs.mkdtempSync(path.join(os.tmpdir(), "stem-salvage-root-"));
    musicRoot = fs.mkdtempSync(path.join(os.tmpdir(), "stem-salvage-music-"));
    stagingDir = fs.mkdtempSync(path.join(os.tmpdir(), "stem-salvage-staging-"));
    fs.mkdirSync(path.join(musicRoot, "catalog", "audio"), { recursive: true });
    sourcePath = path.join(musicRoot, "catalog", "audio", "song.wav");
    // Write a fixture directly at the expected relative path.
    const wav = encodePcmWav({ channelData: [new Float32Array(22050), new Float32Array(22050)], sampleRate: 44100, bitDepth: 16 });
    fs.writeFileSync(sourcePath, Buffer.from(wav));
  });

  afterEach(() => {
    fs.rmSync(stemRoot, { recursive: true, force: true });
    fs.rmSync(musicRoot, { recursive: true, force: true });
    fs.rmSync(stagingDir, { recursive: true, force: true });
  });

  function stageMatchingRoles(durationSeconds = 0.5): Record<StemRole, string> {
    const assignments = {} as Record<StemRole, string>;
    for (const role of STEM_ROLES) {
      const fileName = `${role}.wav`;
      sineWav(stagingDir, fileName, durationSeconds);
      assignments[role] = fileName;
    }
    return assignments;
  }

  it("rejects without an explicit confirm flag, even with otherwise-valid input", async () => {
    const roleAssignments = stageMatchingRoles(0.5);
    const result = await registerExistingStemSet({
      stemLibraryRoot: stemRoot, musicLibraryRoot: musicRoot, stagingDir,
      sourceTrackId: "track_1", audioRelPath: "catalog/audio/song.wav",
      roleAssignments, confirmed: false, origin: "registered_existing",
    });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("CONFIRMATION_REQUIRED");
  }, 20_000);

  it("rejects an incomplete role mapping (ambiguous — missing a role)", async () => {
    const roleAssignments = stageMatchingRoles(0.5);
    delete (roleAssignments as Partial<Record<StemRole, string>>).bass;
    const result = await registerExistingStemSet({
      stemLibraryRoot: stemRoot, musicLibraryRoot: musicRoot, stagingDir,
      sourceTrackId: "track_1", audioRelPath: "catalog/audio/song.wav",
      roleAssignments, confirmed: true, origin: "registered_existing",
    });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("AMBIGUOUS_ROLE_MAPPING");
  }, 20_000);

  it("rejects lossy (non-WAV) input outright, even fully confirmed and role-complete", async () => {
    const roleAssignments = stageMatchingRoles(0.5);
    const fakeMp3 = path.join(stagingDir, "vocals.wav");
    fs.writeFileSync(fakeMp3, Buffer.from([0xff, 0xfb, 0x90, 0x00])); // MP3 sync bytes, not RIFF
    const result = await registerExistingStemSet({
      stemLibraryRoot: stemRoot, musicLibraryRoot: musicRoot, stagingDir,
      sourceTrackId: "track_1", audioRelPath: "catalog/audio/song.wav",
      roleAssignments, confirmed: true, origin: "registered_existing",
    });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("VALIDATION_FAILED");
  }, 20_000);

  it("rejects a frame-misaligned set (duration doesn't match the current parent)", async () => {
    const roleAssignments = stageMatchingRoles(5.0); // parent fixture is only 0.5s
    const result = await registerExistingStemSet({
      stemLibraryRoot: stemRoot, musicLibraryRoot: musicRoot, stagingDir,
      sourceTrackId: "track_1", audioRelPath: "catalog/audio/song.wav",
      roleAssignments, confirmed: true, origin: "registered_existing",
    });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("VALIDATION_FAILED");
  }, 20_000);

  it("rejects a source path that escapes the music library root", async () => {
    const roleAssignments = stageMatchingRoles(0.5);
    const result = await registerExistingStemSet({
      stemLibraryRoot: stemRoot, musicLibraryRoot: musicRoot, stagingDir,
      sourceTrackId: "track_1", audioRelPath: "../../etc/passwd",
      roleAssignments, confirmed: true, origin: "registered_existing",
    });
    expect(result.ok).toBe(false);
    expect(result.errorCode).toBe("SOURCE_OUTSIDE_LIBRARY");
  }, 20_000);

  it("accepts and promotes a fully valid, confirmed, complete, aligned lossless set", async () => {
    // Source fixture duration must actually match the staged roles' — use
    // the same 0.5s parent this describe block's beforeEach wrote at
    // 22050 frames == 0.5s @ 44100Hz.
    const roleAssignments = stageMatchingRoles(0.5);
    const result = await registerExistingStemSet({
      stemLibraryRoot: stemRoot, musicLibraryRoot: musicRoot, stagingDir,
      sourceTrackId: "track_1", audioRelPath: "catalog/audio/song.wav",
      roleAssignments, confirmed: true, origin: "registered_existing",
    });
    expect(result.ok).toBe(true);
    expect(result.stemSet?.origin).toBe("registered_existing");
    for (const role of STEM_ROLES) expect(result.stemSet?.stems[role]).toBeDefined();
  }, 20_000);
});
