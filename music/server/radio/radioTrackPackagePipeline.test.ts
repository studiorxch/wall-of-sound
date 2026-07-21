// 0718B — real ffmpeg/ffprobe end-to-end tests for the RadioTrack
// preparation pipeline. No subprocess mocking (matching every other
// server/radio suite): every test here actually encodes, probes, and
// decodes.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prepareTrackPackage, buildSourceDecodeArgs } from "./radioTrackPackagePipeline";
import { readWavStreamInfoFromFile } from "./radioWavFrameCounter";
import { trackPackageVersionDir } from "./radioTrackPackageWriter";
import { readCurrentTrackManifest } from "./radioTrackManifestBuilder";
import { encodePcmWav } from "../../src/logic/loops/wavEncoder";
import type { RadioTrackPrepareRequest } from "../../src/data/radioTrackPackageTypes";

const FFMPEG_TIMEOUT = 20_000;

let root: string;
let musicLib: string;
let trackLib: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "radio-track-pipeline-"));
  musicLib = path.join(root, "musicLib");
  trackLib = path.join(root, "trackLib");
  fs.mkdirSync(musicLib, { recursive: true });
  fs.mkdirSync(trackLib, { recursive: true });
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function sha256(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

// Real 24-bit PCM WAV source (the browser wavEncoder's 24-bit output) —
// doubles as the 24-bit-source regression fixture required by the plan
// correction.
function makeSourceWav(relPath: string, durationSeconds: number, sampleRate: number, channels: 1 | 2): string {
  const numFrames = Math.round(durationSeconds * sampleRate);
  const channelData: Float32Array[] = [];
  for (let c = 0; c < channels; c++) {
    const data = new Float32Array(numFrames);
    for (let i = 0; i < numFrames; i++) data[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.5;
    channelData.push(data);
  }
  const wav = encodePcmWav({ channelData, sampleRate, bitDepth: 24 });
  const abs = path.join(musicLib, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, Buffer.from(wav));
  return abs;
}

function makeRequest(relPath: string, overrides: Partial<RadioTrackPrepareRequest> = {}): RadioTrackPrepareRequest {
  const sourceHash = sha256(path.join(musicLib, relPath));
  return {
    sourceTrackId: "track_test_1",
    audioRelPath: relPath,
    display: { title: "Fixture Song", artist: "Fixture Artist" },
    musical: { bpm: 120, key: "7A", moods: ["calm"], genres: [] },
    songIntelligence: { revision: "2026-07-18T00:00:00.000Z", status: "READY_PROVISIONAL", sections: [{ label: "Body", structuralType: "body", startSeconds: 0, endSeconds: 2, verified: false }] },
    approval: { approved: true, approvedAt: "2026-07-18T00:00:00.000Z", sourceAssetHash: sourceHash, songIntelligenceRevision: "2026-07-18T00:00:00.000Z" },
    ...overrides,
  };
}

describe("prepareTrackPackage — real ffmpeg round trip", () => {
  it("packages a stereo 44.1kHz 24-bit source into a valid immutable RadioTrack package", async () => {
    makeSourceWav("audio/song.wav", 2, 44100, 2);
    const sourceHashBefore = sha256(path.join(musicLib, "audio/song.wav"));

    const result = await prepareTrackPackage({ trackLibraryRoot: trackLib, musicLibraryRoot: musicLib, request: makeRequest("audio/song.wav") });

    expect(result.ok).toBe(true);
    expect(result.reused).toBe(false);
    expect(result.radioTrackId).toBe("rtrack_000001");
    expect(result.packageVersion).toBe(1);

    const pkgDir = trackPackageVersionDir(trackLib, "rtrack_000001", 1);
    // No transient intermediate inside the final package.
    expect(fs.readdirSync(pkgDir).sort()).toEqual(["audio.opus", "metadata.json", "source-reference.json"]);

    const metadata = JSON.parse(fs.readFileSync(path.join(pkgDir, "metadata.json"), "utf-8"));
    expect(metadata.status).toBe("RADIO_READY");
    expect(metadata.sourceAssetHash).toBe(sourceHashBefore);
    expect(metadata.audio.primary.channels).toBe(2);
    expect(metadata.audio.primary.bitrateKbps).toBe(160);
    expect(metadata.audio.primary.vbrMode).toBe("constrained");
    expect(metadata.audio.primary.sha256).toBe(sha256(path.join(pkgDir, "audio.opus")));
    // 2s at 48kHz decode = 96000 frames within tolerance.
    expect(Math.abs(metadata.audio.primary.decodedFrameCount48k - 96000)).toBeLessThanOrEqual(2);
    expect(metadata.verification.decodeVerifyOk).toBe(true);

    // packageManifestHash is the hash of the written metadata.json.
    expect(result.packageManifestHash).toBe(sha256(path.join(pkgDir, "metadata.json")));

    // Track manifest lists the package.
    const manifest = readCurrentTrackManifest(trackLib);
    expect(manifest?.entries).toHaveLength(1);
    expect(manifest?.entries[0]).toMatchObject({ radioTrackId: "rtrack_000001", packageVersion: 1, status: "RADIO_READY" });

    // Source bytes byte-identical before and after packaging.
    expect(sha256(path.join(musicLib, "audio/song.wav"))).toBe(sourceHashBefore);

    // Staging fully cleaned up.
    expect(fs.existsSync(path.join(trackLib, "staging")) ? fs.readdirSync(path.join(trackLib, "staging")) : []).toEqual([]);
  }, FFMPEG_TIMEOUT);

  it("24-bit staging regression: the staged decode is pcm_s24le and the RIFF walker reads it as 24-bit PCM", () => {
    makeSourceWav("audio/hires.wav", 1, 48000, 2);
    const stagedPath = path.join(root, "staged.wav");
    const args = buildSourceDecodeArgs(path.join(musicLib, "audio/hires.wav"), stagedPath, 2);
    expect(args).toContain("pcm_s24le");
    expect(args).not.toContain("-ac"); // no downmix at ≤2 channels
    execFileSync("ffmpeg", args, { stdio: "ignore" });

    const info = readWavStreamInfoFromFile(stagedPath);
    expect(info.valid).toBe(true);
    expect(info.bitsPerSample).toBe(24);
    expect(info.formatTag).toBe(1); // resolved through WAVE_FORMAT_EXTENSIBLE to PCM
    expect(info.numChannels).toBe(2);
    expect(info.frameCount).toBe(48000);
  }, FFMPEG_TIMEOUT);

  it("preserves a mono source as mono", async () => {
    makeSourceWav("audio/mono.wav", 1, 44100, 1);
    const result = await prepareTrackPackage({ trackLibraryRoot: trackLib, musicLibraryRoot: musicLib, request: makeRequest("audio/mono.wav") });
    expect(result.ok).toBe(true);
    const pkgDir = trackPackageVersionDir(trackLib, result.radioTrackId!, result.packageVersion!);
    const metadata = JSON.parse(fs.readFileSync(path.join(pkgDir, "metadata.json"), "utf-8"));
    expect(metadata.audio.primary.channels).toBe(1);
  }, FFMPEG_TIMEOUT);

  it("requests a stereo downmix only above two channels", () => {
    const argsAtStereo = buildSourceDecodeArgs("in.wav", "out.wav", 2);
    expect(argsAtStereo).not.toContain("-ac");
    const argsAt6 = buildSourceDecodeArgs("in.wav", "out.wav", 6);
    const acIndex = argsAt6.indexOf("-ac");
    expect(acIndex).toBeGreaterThan(-1);
    expect(argsAt6[acIndex + 1]).toBe("2");
  });

  it("reuses an existing current package instead of re-encoding (skip-already-current)", async () => {
    makeSourceWav("audio/song.wav", 1, 44100, 2);
    const first = await prepareTrackPackage({ trackLibraryRoot: trackLib, musicLibraryRoot: musicLib, request: makeRequest("audio/song.wav") });
    expect(first.ok).toBe(true);

    const second = await prepareTrackPackage({ trackLibraryRoot: trackLib, musicLibraryRoot: musicLib, request: makeRequest("audio/song.wav") });
    expect(second.ok).toBe(true);
    expect(second.reused).toBe(true);
    expect(second.radioTrackId).toBe(first.radioTrackId);
    expect(second.packageVersion).toBe(first.packageVersion);
    expect(fs.existsSync(trackPackageVersionDir(trackLib, first.radioTrackId!, 2))).toBe(false);
  }, FFMPEG_TIMEOUT * 2);

  it("forceNewVersion creates v2 while v1 stays byte-identical", async () => {
    makeSourceWav("audio/song.wav", 1, 44100, 2);
    const first = await prepareTrackPackage({ trackLibraryRoot: trackLib, musicLibraryRoot: musicLib, request: makeRequest("audio/song.wav") });
    expect(first.ok).toBe(true);
    const v1Dir = trackPackageVersionDir(trackLib, first.radioTrackId!, 1);
    const v1MetadataHash = sha256(path.join(v1Dir, "metadata.json"));
    const v1AudioHash = sha256(path.join(v1Dir, "audio.opus"));

    const second = await prepareTrackPackage({ trackLibraryRoot: trackLib, musicLibraryRoot: musicLib, request: makeRequest("audio/song.wav", { forceNewVersion: true }) });
    expect(second.ok).toBe(true);
    expect(second.reused).toBe(false);
    expect(second.radioTrackId).toBe(first.radioTrackId);
    expect(second.packageVersion).toBe(2);

    expect(sha256(path.join(v1Dir, "metadata.json"))).toBe(v1MetadataHash);
    expect(sha256(path.join(v1Dir, "audio.opus"))).toBe(v1AudioHash);
  }, FFMPEG_TIMEOUT * 2);

  it("refuses a stale/mismatched approval before doing any work", async () => {
    makeSourceWav("audio/song.wav", 1, 44100, 2);
    const request = makeRequest("audio/song.wav");
    request.approval = { ...request.approval, sourceAssetHash: "deadbeef" };
    const result = await prepareTrackPackage({ trackLibraryRoot: trackLib, musicLibraryRoot: musicLib, request });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "RADIO_TRACK_APPROVAL_STALE")).toBe(true);
    expect(fs.existsSync(path.join(trackLib, "packages"))).toBe(false);
  });

  it("refuses a source path that escapes the MUSIC library root", async () => {
    makeSourceWav("audio/song.wav", 1, 44100, 2);
    const request = makeRequest("audio/song.wav");
    request.audioRelPath = "../outside.wav";
    const result = await prepareTrackPackage({ trackLibraryRoot: trackLib, musicLibraryRoot: musicLib, request });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "RADIO_TRACK_SOURCE_OUTSIDE_LIBRARY")).toBe(true);
  });

  it("rolls back cleanly when the manifest rebuild fails, and a retry succeeds", async () => {
    makeSourceWav("audio/song.wav", 1, 44100, 2);

    // Force the manifest write to fail: make catalog/local-manifest.json a
    // DIRECTORY so writeJsonAtomic's rename throws.
    fs.mkdirSync(path.join(trackLib, "catalog", "local-manifest.json"), { recursive: true });

    const failed = await prepareTrackPackage({ trackLibraryRoot: trackLib, musicLibraryRoot: musicLib, request: makeRequest("audio/song.wav") });
    expect(failed.ok).toBe(false);
    expect(failed.issues.some((i) => i.code === "RADIO_TRACK_MANIFEST_REBUILD_FAILED")).toBe(true);
    // No half-published package, no leaked staging, no leaked reservation.
    expect(fs.existsSync(trackPackageVersionDir(trackLib, "rtrack_000001", 1))).toBe(false);
    expect(fs.readdirSync(path.join(trackLib, "staging"))).toEqual([]);
    const reservations = JSON.parse(fs.readFileSync(path.join(trackLib, "catalog", "id-reservations.json"), "utf-8"));
    expect(reservations).toEqual([]);

    // Remove the blocker; a retry is an ordinary first attempt.
    fs.rmdirSync(path.join(trackLib, "catalog", "local-manifest.json"));
    const retry = await prepareTrackPackage({ trackLibraryRoot: trackLib, musicLibraryRoot: musicLib, request: makeRequest("audio/song.wav") });
    expect(retry.ok).toBe(true);
    expect(retry.radioTrackId).toBe("rtrack_000001");
    expect(retry.packageVersion).toBe(1);
  }, FFMPEG_TIMEOUT * 2);
});
