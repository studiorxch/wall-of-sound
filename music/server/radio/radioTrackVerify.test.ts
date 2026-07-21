// 0718B — integrity/currency verification for exact RadioTrack bindings
// (spec tests 9 and 12). Uses the real pipeline (real ffmpeg) to build a
// genuine package, then degrades it in controlled ways.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prepareTrackPackage } from "./radioTrackPackagePipeline";
import { verifyTrackBinding, type VerifyTrackBindingParams } from "./radioTrackVerify";
import { trackPackageVersionDir } from "./radioTrackPackageWriter";
import { encodePcmWav } from "../../src/logic/loops/wavEncoder";
import type { RadioTrackPrepareRequest } from "../../src/data/radioTrackPackageTypes";

const FFMPEG_TIMEOUT = 20_000;

let root: string;
let musicLib: string;
let trackLib: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "radio-track-verify-"));
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

function makeSourceWav(relPath: string): void {
  const sampleRate = 44100;
  const numFrames = sampleRate; // 1s
  const data = new Float32Array(numFrames);
  for (let i = 0; i < numFrames; i++) data[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.5;
  const wav = encodePcmWav({ channelData: [data, data], sampleRate, bitDepth: 24 });
  const abs = path.join(musicLib, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, Buffer.from(wav));
}

async function prepareFixturePackage(): Promise<VerifyTrackBindingParams> {
  makeSourceWav("audio/song.wav");
  const sourceHash = sha256(path.join(musicLib, "audio/song.wav"));
  const request: RadioTrackPrepareRequest = {
    sourceTrackId: "track_1",
    audioRelPath: "audio/song.wav",
    display: { title: "T", artist: "A" },
    musical: {},
    songIntelligence: { sections: [] },
    approval: { approved: true, approvedAt: "2026-07-18T00:00:00.000Z", sourceAssetHash: sourceHash },
  };
  const result = await prepareTrackPackage({ trackLibraryRoot: trackLib, musicLibraryRoot: musicLib, request });
  expect(result.ok).toBe(true);
  return {
    trackLibraryRoot: trackLib,
    musicLibraryRoot: musicLib,
    radioTrackId: result.radioTrackId!,
    packageVersion: result.packageVersion!,
    sourceAssetHash: result.sourceAssetHash!,
    packageManifestHash: result.packageManifestHash!,
  };
}

describe("verifyTrackBinding", () => {
  it("verifies a freshly prepared package as fully current", async () => {
    const binding = await prepareFixturePackage();
    const result = verifyTrackBinding(binding);
    expect(result.ok).toBe(true);
    expect(result.packageExists).toBe(true);
    expect(result.manifestValid).toBe(true);
    expect(result.manifestHashMatches).toBe(true);
    expect(result.audioAssetIntact).toBe(true);
    expect(result.decodeVerificationRecorded).toBe(true);
    expect(result.sourceHashCurrent).toBe(true);
  }, FFMPEG_TIMEOUT);

  it("a missing package reports stale (packageExists false), never regenerates", async () => {
    const binding = await prepareFixturePackage();
    fs.rmSync(trackPackageVersionDir(trackLib, binding.radioTrackId, binding.packageVersion), { recursive: true, force: true });
    const result = verifyTrackBinding(binding);
    expect(result.ok).toBe(false);
    expect(result.packageExists).toBe(false);
    // Verification never recreated anything.
    expect(fs.existsSync(trackPackageVersionDir(trackLib, binding.radioTrackId, binding.packageVersion))).toBe(false);
  }, FFMPEG_TIMEOUT);

  it("a corrupted audio asset reports stale (audioAssetIntact false)", async () => {
    const binding = await prepareFixturePackage();
    const audioPath = path.join(trackPackageVersionDir(trackLib, binding.radioTrackId, binding.packageVersion), "audio.opus");
    fs.appendFileSync(audioPath, Buffer.from([0, 1, 2, 3]));
    const result = verifyTrackBinding(binding);
    expect(result.ok).toBe(false);
    expect(result.audioAssetIntact).toBe(false);
    expect(result.issues.some((i) => i.code === "RADIO_TRACK_VERIFY_AUDIO_CORRUPT")).toBe(true);
  }, FFMPEG_TIMEOUT);

  it("changed source bytes report stale (sourceHashCurrent false) while the package itself stays intact", async () => {
    const binding = await prepareFixturePackage();
    fs.appendFileSync(path.join(musicLib, "audio/song.wav"), Buffer.from([9, 9]));
    const result = verifyTrackBinding(binding);
    expect(result.ok).toBe(false);
    expect(result.sourceHashCurrent).toBe(false);
    expect(result.audioAssetIntact).toBe(true);
    expect(result.manifestHashMatches).toBe(true);
  }, FFMPEG_TIMEOUT);

  it("a tampered metadata.json reports a manifest hash mismatch", async () => {
    const binding = await prepareFixturePackage();
    const metadataPath = path.join(trackPackageVersionDir(trackLib, binding.radioTrackId, binding.packageVersion), "metadata.json");
    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"));
    metadata.display.title = "Tampered";
    fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));
    const result = verifyTrackBinding(binding);
    expect(result.ok).toBe(false);
    expect(result.manifestHashMatches).toBe(false);
  }, FFMPEG_TIMEOUT);
});
