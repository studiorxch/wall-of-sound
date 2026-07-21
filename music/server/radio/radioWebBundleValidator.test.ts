// 0718B — bundle validator: real exported bundles (real ffmpeg via
// exportWebBundle), copied-directory portability, and seeded privacy/
// traversal/absolute-path violations. Spec tests 15–17.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prepareTrackPackage } from "./radioTrackPackagePipeline";
import { exportWebBundle } from "./radioWebBundleWriter";
import { validateWebBundle, findPrivacyViolations } from "./radioWebBundleValidator";
import { encodePcmWav } from "../../src/logic/loops/wavEncoder";
import type { RadioTrackPrepareRequest } from "../../src/data/radioTrackPackageTypes";

const FFMPEG_TIMEOUT = 30_000;

let root: string;
let musicLib: string;
let trackLib: string;
let webRoot: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "radio-web-validator-"));
  musicLib = path.join(root, "musicLib");
  trackLib = path.join(root, "trackLib");
  webRoot = path.join(root, "webRoot");
  fs.mkdirSync(musicLib, { recursive: true });
  fs.mkdirSync(trackLib, { recursive: true });
  fs.mkdirSync(webRoot, { recursive: true });
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function sha256(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function makeSourceWav(relPath: string): void {
  const sampleRate = 44100;
  const numFrames = sampleRate;
  const data = new Float32Array(numFrames);
  for (let i = 0; i < numFrames; i++) data[i] = Math.sin((2 * Math.PI * 220 * i) / sampleRate) * 0.4;
  const wav = encodePcmWav({ channelData: [data, data], sampleRate, bitDepth: 24 });
  const abs = path.join(musicLib, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, Buffer.from(wav));
}

async function buildRealBundle(): Promise<string> {
  makeSourceWav("audio/song.wav");
  const sourceHash = sha256(path.join(musicLib, "audio/song.wav"));
  const request: RadioTrackPrepareRequest = {
    sourceTrackId: "track_1",
    audioRelPath: "audio/song.wav",
    display: { title: "Validator Fixture", artist: "Fixture Artist" },
    musical: { bpm: 128 },
    songIntelligence: { sections: [] },
    approval: { approved: true, approvedAt: "2026-07-18T00:00:00.000Z", sourceAssetHash: sourceHash },
  };
  const prepared = await prepareTrackPackage({ trackLibraryRoot: trackLib, musicLibraryRoot: musicLib, request });
  expect(prepared.ok).toBe(true);
  const exported = await exportWebBundle({
    webExportRoot: webRoot,
    trackLibraryRoot: trackLib,
    request: {
      stationId: "radplaylist_1",
      title: "Validator Station",
      slug: "validator-station",
      entries: [{ radioTrackId: prepared.radioTrackId!, packageVersion: prepared.packageVersion! }],
    },
  });
  expect(exported.ok).toBe(true);
  return exported.exportPath!;
}

describe("validateWebBundle", () => {
  it("validates a real freshly exported bundle as fully OK", async () => {
    const bundleDir = await buildRealBundle();
    const result = validateWebBundle(bundleDir, { trackLibraryRoot: trackLib });
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  }, FFMPEG_TIMEOUT);

  it("portability: validates correctly after being copied to a completely different directory with no trackLibraryRoot available", async () => {
    const bundleDir = await buildRealBundle();
    const copyDir = fs.mkdtempSync(path.join(os.tmpdir(), "radio-bundle-copy-"));
    fs.cpSync(bundleDir, copyDir, { recursive: true });

    const result = validateWebBundle(copyDir); // no trackLibraryRoot — pure portability check
    expect(result.ok).toBe(true);
    fs.rmSync(copyDir, { recursive: true, force: true });
  }, FFMPEG_TIMEOUT);

  it("detects a missing referenced asset", async () => {
    const bundleDir = await buildRealBundle();
    fs.rmSync(path.join(bundleDir, "audio", "rtrack_000001-v1.opus"));
    const result = validateWebBundle(bundleDir);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "RADIO_WEB_BUNDLE_MISSING_ASSET")).toBe(true);
  }, FFMPEG_TIMEOUT);

  it("detects a hash mismatch on a tampered audio file", async () => {
    const bundleDir = await buildRealBundle();
    fs.appendFileSync(path.join(bundleDir, "audio", "rtrack_000001-v1.opus"), Buffer.from([1, 2, 3]));
    const result = validateWebBundle(bundleDir);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "RADIO_WEB_BUNDLE_HASH_MISMATCH" || i.code === "RADIO_WEB_BUNDLE_SIZE_MISMATCH")).toBe(true);
  }, FFMPEG_TIMEOUT);

  it("detects an unexpected file not declared in checksums.json", async () => {
    const bundleDir = await buildRealBundle();
    fs.writeFileSync(path.join(bundleDir, "audio", "extra.opus"), "junk");
    const result = validateWebBundle(bundleDir);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "RADIO_WEB_BUNDLE_UNEXPECTED_FILE")).toBe(true);
  }, FFMPEG_TIMEOUT);

  it("rejects an absolute path reference in radio-manifest.json", async () => {
    const bundleDir = await buildRealBundle();
    const manifestPath = path.join(bundleDir, "radio-manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    manifest.artworkUrl = "/Users/studio/Projects/wall-of-sound/library/music/cover.png";
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    // Also re-declare it in checksums so the "missing asset" check doesn't
    // mask the path-rejection check under test.
    const checksumsPath = path.join(bundleDir, "checksums.json");
    const checksums = JSON.parse(fs.readFileSync(checksumsPath, "utf-8"));
    checksums.files[manifest.artworkUrl] = { sha256: "x", byteSize: 0 };
    fs.writeFileSync(checksumsPath, JSON.stringify(checksums, null, 2));

    const result = validateWebBundle(bundleDir);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "RADIO_WEB_BUNDLE_NONPORTABLE_PATH")).toBe(true);
  }, FFMPEG_TIMEOUT);

  it("rejects a path-traversal reference", async () => {
    const bundleDir = await buildRealBundle();
    const manifestPath = path.join(bundleDir, "radio-manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    manifest.entries[0].audioUrl = "../../../etc/passwd";
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    const result = validateWebBundle(bundleDir);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "RADIO_WEB_BUNDLE_NONPORTABLE_PATH")).toBe(true);
  }, FFMPEG_TIMEOUT);

  it("rejects an audioUrl whose filename doesn't encode its declared binding", async () => {
    const bundleDir = await buildRealBundle();
    const manifestPath = path.join(bundleDir, "radio-manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    manifest.entries[0].packageVersion = 99; // no longer matches the audioUrl filename
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    const result = validateWebBundle(bundleDir);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "RADIO_WEB_BUNDLE_AUDIO_NAME_MISMATCH")).toBe(true);
  }, FFMPEG_TIMEOUT);

  it("detects a binding that no longer matches its immutable package (hash mismatch)", async () => {
    const bundleDir = await buildRealBundle();
    const pkgAudio = path.join(trackLib, "packages", "rtrack_000001", "v1", "audio.opus");
    // Re-encode the source package after export so the bundle's baked-in
    // hash and the (now-different) live package disagree.
    fs.appendFileSync(pkgAudio, Buffer.from([9]));
    const pkgMetaPath = path.join(trackLib, "packages", "rtrack_000001", "v1", "metadata.json");
    const pkgMeta = JSON.parse(fs.readFileSync(pkgMetaPath, "utf-8"));
    pkgMeta.audio.primary.sha256 = "deadbeef";
    fs.writeFileSync(pkgMetaPath, JSON.stringify(pkgMeta, null, 2));

    const result = validateWebBundle(bundleDir, { trackLibraryRoot: trackLib });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "RADIO_WEB_BUNDLE_BINDING_HASH_MISMATCH")).toBe(true);
  }, FFMPEG_TIMEOUT);
});

describe("findPrivacyViolations — seeded violations", () => {
  it("rejects an embedded source-reference-shaped payload", () => {
    const issues = findPrivacyViolations("radio-manifest.json", { note: "see source-reference.json for origin" });
    expect(issues.length).toBeGreaterThan(0);
  });

  it("rejects an absolute POSIX path", () => {
    const issues = findPrivacyViolations("radio-manifest.json", { artworkUrl: "/Users/studio/secret/cover.png" });
    expect(issues.length).toBeGreaterThan(0);
  });

  it("rejects a library-path fragment", () => {
    const issues = findPrivacyViolations("playlist.json", { note: "library/music/External/song.mp3" });
    expect(issues.length).toBeGreaterThan(0);
  });

  it("rejects a home-directory pattern", () => {
    const issues = findPrivacyViolations("checksums.json", { path: "/Users/richielau/Music/song.wav" });
    expect(issues.length).toBeGreaterThan(0);
  });

  it("rejects a file:// URL", () => {
    const issues = findPrivacyViolations("radio-manifest.json", { url: "file:///Users/studio/track.wav" });
    expect(issues.length).toBeGreaterThan(0);
  });

  it("passes clean, portable content", () => {
    const issues = findPrivacyViolations("radio-manifest.json", {
      schemaVersion: "1.0.0",
      entries: [{ audioUrl: "audio/rtrack_000001-v1.opus", title: "White Ropes", artist: "Soulphiction" }],
    });
    expect(issues).toEqual([]);
  });

  it("does not false-positive on ordinary track/artist text unrelated to filesystem paths", () => {
    const issues = findPrivacyViolations("playlist.json", {
      title: "Studio Sessions Vol. 1",
      artist: "Studio Rich",
    });
    expect(issues).toEqual([]);
  });
});
