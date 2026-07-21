// 0718B — web bundle writer: real packages (real ffmpeg), real filesystem.
// Covers spec tests 14 (order + exact versions), 18 (repeated/concurrent
// export safety), 19 (failed finalize rolls back), 20 (unchanged re-export
// requires explicit intent).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { prepareTrackPackage } from "./radioTrackPackagePipeline";
import { exportWebBundle, computeContentSignature, listBundleVersions } from "./radioWebBundleWriter";
import { encodePcmWav } from "../../src/logic/loops/wavEncoder";
import type { RadioTrackPrepareRequest } from "../../src/data/radioTrackPackageTypes";
import type { RadioWebBundleExportRequest } from "../../src/data/radioWebBundleTypes";

const FFMPEG_TIMEOUT = 30_000;

// 1x1 transparent PNG.
const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

let root: string;
let musicLib: string;
let trackLib: string;
let webRoot: string;

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "radio-web-bundle-"));
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

function makeSourceWav(relPath: string, seconds: number): void {
  const sampleRate = 44100;
  const numFrames = Math.round(seconds * sampleRate);
  const data = new Float32Array(numFrames);
  for (let i = 0; i < numFrames; i++) data[i] = Math.sin((2 * Math.PI * 330 * i) / sampleRate) * 0.4;
  const wav = encodePcmWav({ channelData: [data, data], sampleRate, bitDepth: 24 });
  const abs = path.join(musicLib, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, Buffer.from(wav));
}

async function prepareRealPackage(sourceTrackId: string, relPath: string): Promise<{ radioTrackId: string; packageVersion: number }> {
  makeSourceWav(relPath, 1);
  const sourceHash = sha256(path.join(musicLib, relPath));
  const request: RadioTrackPrepareRequest = {
    sourceTrackId,
    audioRelPath: relPath,
    display: { title: `Song ${sourceTrackId}`, artist: "Fixture Artist" },
    musical: { bpm: 100 },
    songIntelligence: { sections: [{ label: "Body", structuralType: "body", startSeconds: 0, endSeconds: 1, verified: false }] },
    approval: { approved: true, approvedAt: "2026-07-18T00:00:00.000Z", sourceAssetHash: sourceHash },
  };
  const result = await prepareTrackPackage({ trackLibraryRoot: trackLib, musicLibraryRoot: musicLib, request });
  expect(result.ok).toBe(true);
  return { radioTrackId: result.radioTrackId!, packageVersion: result.packageVersion! };
}

async function makeExportRequest(): Promise<RadioWebBundleExportRequest> {
  const a = await prepareRealPackage("track_a", "audio/a.wav");
  const b = await prepareRealPackage("track_b", "audio/b.wav");
  return {
    stationId: "radplaylist_test_1",
    title: "Test Station",
    slug: "test-station",
    entries: [
      { radioTrackId: a.radioTrackId, packageVersion: a.packageVersion },
      { radioTrackId: b.radioTrackId, packageVersion: b.packageVersion },
    ],
    artworkDataUrl: TINY_PNG_DATA_URL,
  };
}

describe("exportWebBundle", () => {
  it("exports a validated, self-contained, order-preserving v1 bundle", async () => {
    const request = await makeExportRequest();
    const result = await exportWebBundle({ webExportRoot: webRoot, trackLibraryRoot: trackLib, request });

    expect(result.ok).toBe(true);
    expect(result.unchanged).toBe(false);
    expect(result.bundleVersion).toBe(1);
    expect(result.validation?.ok).toBe(true);
    expect(result.entryCount).toBe(2);

    const bundleDir = path.join(webRoot, "test-station", "v1");
    expect(result.exportPath).toBe(bundleDir);
    const files = fs.readdirSync(bundleDir).sort();
    expect(files).toEqual(["artwork", "audio", "checksums.json", "playlist.json", "radio-manifest.json"]);
    expect(fs.readdirSync(path.join(bundleDir, "audio")).sort()).toEqual([
      "rtrack_000001-v1.opus",
      "rtrack_000002-v1.opus",
    ]);
    expect(fs.readdirSync(path.join(bundleDir, "artwork"))).toEqual(["cover.png"]);

    const manifest = JSON.parse(fs.readFileSync(path.join(bundleDir, "radio-manifest.json"), "utf-8"));
    // Order + exact bindings preserved.
    expect(manifest.entries.map((e: { radioTrackId: string }) => e.radioTrackId)).toEqual(["rtrack_000001", "rtrack_000002"]);
    expect(manifest.entries.every((e: { packageVersion: number }) => e.packageVersion === 1)).toBe(true);
    expect(manifest.artworkUrl).toBe("artwork/cover.png");
    // No source-reference.json anywhere in the bundle.
    const allNames: string[] = [];
    const walk = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else allNames.push(e.name); } };
    walk(bundleDir);
    expect(allNames).not.toContain("source-reference.json");
  }, FFMPEG_TIMEOUT);

  it("detects an unchanged re-export and requires explicit force", async () => {
    const request = await makeExportRequest();
    const first = await exportWebBundle({ webExportRoot: webRoot, trackLibraryRoot: trackLib, request });
    expect(first.ok).toBe(true);

    const unchanged = await exportWebBundle({ webExportRoot: webRoot, trackLibraryRoot: trackLib, request });
    expect(unchanged.ok).toBe(true);
    expect(unchanged.unchanged).toBe(true);
    expect(unchanged.existingVersion).toBe(1);
    expect(listBundleVersions(webRoot, "test-station")).toEqual([1]);

    const forced = await exportWebBundle({ webExportRoot: webRoot, trackLibraryRoot: trackLib, request: { ...request, force: true } });
    expect(forced.ok).toBe(true);
    expect(forced.bundleVersion).toBe(2);
    expect(listBundleVersions(webRoot, "test-station")).toEqual([1, 2]);
  }, FFMPEG_TIMEOUT);

  it("re-export never touches v1 (byte-identical after v2 is created)", async () => {
    const request = await makeExportRequest();
    await exportWebBundle({ webExportRoot: webRoot, trackLibraryRoot: trackLib, request });
    const v1Manifest = path.join(webRoot, "test-station", "v1", "radio-manifest.json");
    const v1Audio = path.join(webRoot, "test-station", "v1", "audio", "rtrack_000001-v1.opus");
    const manifestHash = sha256(v1Manifest);
    const audioHash = sha256(v1Audio);

    await exportWebBundle({ webExportRoot: webRoot, trackLibraryRoot: trackLib, request: { ...request, force: true } });
    expect(sha256(v1Manifest)).toBe(manifestHash);
    expect(sha256(v1Audio)).toBe(audioHash);
  }, FFMPEG_TIMEOUT);

  it("concurrent forced exports cannot collide or create partial duplicate versions", async () => {
    const request = await makeExportRequest();
    const [r1, r2] = await Promise.all([
      exportWebBundle({ webExportRoot: webRoot, trackLibraryRoot: trackLib, request: { ...request, force: true } }),
      exportWebBundle({ webExportRoot: webRoot, trackLibraryRoot: trackLib, request: { ...request, force: true } }),
    ]);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    const versions = [r1.bundleVersion, r2.bundleVersion].sort();
    expect(versions).toEqual([1, 2]);
    // Both bundles fully valid on disk.
    expect(listBundleVersions(webRoot, "test-station")).toEqual([1, 2]);
  }, FFMPEG_TIMEOUT);

  it("a failed finalize rolls back cleanly (no partial bundle, no staging leak)", async () => {
    const request = await makeExportRequest();
    // Make the slug path a FILE so the finalize rename cannot succeed.
    fs.writeFileSync(path.join(webRoot, "test-station"), "blocker");

    const result = await exportWebBundle({ webExportRoot: webRoot, trackLibraryRoot: trackLib, request });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "RADIO_WEB_BUNDLE_WRITE_FAILED")).toBe(true);
    expect(fs.readdirSync(path.join(webRoot, "staging"))).toEqual([]);

    // Remove the blocker — retry succeeds as v1.
    fs.rmSync(path.join(webRoot, "test-station"));
    const retry = await exportWebBundle({ webExportRoot: webRoot, trackLibraryRoot: trackLib, request });
    expect(retry.ok).toBe(true);
    expect(retry.bundleVersion).toBe(1);
  }, FFMPEG_TIMEOUT);

  it("refuses a binding whose package audio fails its manifest hash", async () => {
    const request = await makeExportRequest();
    const audioPath = path.join(trackLib, "packages", "rtrack_000001", "v1", "audio.opus");
    fs.appendFileSync(audioPath, Buffer.from([1]));
    const result = await exportWebBundle({ webExportRoot: webRoot, trackLibraryRoot: trackLib, request });
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "RADIO_WEB_BUNDLE_PACKAGE_CORRUPT")).toBe(true);
    expect(fs.existsSync(path.join(webRoot, "test-station"))).toBe(false);
  }, FFMPEG_TIMEOUT);

  it("contentSignature ignores force/timestamps but changes with bindings and artwork", async () => {
    const request = await makeExportRequest();
    const sig = computeContentSignature(request, "arthash");
    expect(computeContentSignature({ ...request, force: true }, "arthash")).toBe(sig);
    expect(computeContentSignature({ ...request, entries: [request.entries[0]] }, "arthash")).not.toBe(sig);
    expect(computeContentSignature(request, "otherart")).not.toBe(sig);
  }, FFMPEG_TIMEOUT);
});
