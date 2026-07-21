import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { validateAndFinalizePackage } from "./radioFinalizeOrchestrator";
import { reserveRadioLoopId } from "./radioIdAssigner";
import { createStagingOperation } from "./radioStagingFs";
import { encodeOpusToFile } from "./radioOpusEncoder";
import { encodePcmWav } from "../../src/logic/loops/wavEncoder";
import { readCurrentManifest } from "./radioManifestBuilder";
import type { RadioApprovalMetadata, RadioArrangementMetadata, RadioLoopSourceReference, RadioMusicalMetadata } from "../../src/data/radioLoopTypes";

function makeFixtureWav(pathOut: string, durationSeconds: number, sampleRate: number): void {
  const numFrames = Math.round(durationSeconds * sampleRate);
  const left = new Float32Array(numFrames);
  const right = new Float32Array(numFrames);
  for (let i = 0; i < numFrames; i++) left[i] = right[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.5;
  const wav = encodePcmWav({ channelData: [left, right], sampleRate, bitDepth: 24 });
  fs.writeFileSync(pathOut, Buffer.from(wav));
}

const musical: RadioMusicalMetadata = { bpm: 120, key: "8A", bars: 8 };
const arrangement: RadioArrangementMetadata = { roles: ["foundation"], familyIds: ["family-1"] };
const approval: RadioApprovalMetadata = { publicUseApproved: true, approvedAt: new Date().toISOString() };
const sourceReference: RadioLoopSourceReference = { trackId: "track_a", loopId: "loop_a", startSeconds: 0, endSeconds: 4, resolvedAt: new Date().toISOString() };

describe("validateAndFinalizePackage (real ffmpeg, real fs, end to end)", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "radio-finalize-orchestrator-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("promotes a core-only loop to RADIO_READY with server-verified audio metadata", async () => {
    const alloc = await reserveRadioLoopId(root, "op1", "track_a", "loop_a");
    const stagingDir = createStagingOperation(root, "op1");
    makeFixtureWav(path.join(stagingDir, "input-core.wav"), 1.0, 44100);
    await encodeOpusToFile(path.join(stagingDir, "input-core.wav"), path.join(stagingDir, "core.opus"));

    const result = await validateAndFinalizePackage({
      radioLibraryRoot: root, operationId: "op1", radioLoopId: alloc.radioLoopId, packageVersion: alloc.packageVersion,
      sourceReference, musical, arrangement, approval, startedAt: new Date().toISOString(),
    });

    expect(result.ok).toBe(true);
    expect(result.stemsOmitted).toBe(false);
    expect(result.report.finalStatus).toBe("RADIO_READY");

    const metaPath = path.join(root, "packages", alloc.radioLoopId, `v${alloc.packageVersion}`, "metadata.json");
    const metadata = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    expect(metadata.audio.primary.codec).toBe("opus");
    expect(metadata.audio.primary.channels).toBe(2);
    expect(metadata.audio.primary.durationSeconds).toBeGreaterThan(0.9);
    expect(metadata.musical).toEqual(musical);

    const manifest = readCurrentManifest(root);
    expect(manifest?.entries.some((e) => e.radioLoopId === alloc.radioLoopId)).toBe(true);
  }, 20_000);

  it("includes a matching stem in the finalized package", async () => {
    const alloc = await reserveRadioLoopId(root, "op1", "track_b", "loop_b");
    const stagingDir = createStagingOperation(root, "op1");
    makeFixtureWav(path.join(stagingDir, "input-core.wav"), 1.0, 48000);
    await encodeOpusToFile(path.join(stagingDir, "input-core.wav"), path.join(stagingDir, "core.opus"));
    const stemWav = path.join(stagingDir, "stem-drums.wav");
    makeFixtureWav(stemWav, 1.0, 48000);
    await encodeOpusToFile(stemWav, path.join(stagingDir, "stems", "drums.opus"));

    const result = await validateAndFinalizePackage({
      radioLibraryRoot: root, operationId: "op1", radioLoopId: alloc.radioLoopId, packageVersion: alloc.packageVersion,
      sourceReference, musical, arrangement, approval, startedAt: new Date().toISOString(),
    });

    expect(result.ok).toBe(true);
    expect(result.stemsOmitted).toBe(false);
    const metaPath = path.join(root, "packages", alloc.radioLoopId, `v${alloc.packageVersion}`, "metadata.json");
    const metadata = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    expect(metadata.stems).toHaveLength(1);
    expect(metadata.stems[0].name).toBe("drums");
  }, 20_000);

  it("omits a mismatched stem but still finalizes the core successfully", async () => {
    const alloc = await reserveRadioLoopId(root, "op1", "track_c", "loop_c");
    const stagingDir = createStagingOperation(root, "op1");
    makeFixtureWav(path.join(stagingDir, "input-core.wav"), 1.0, 48000);
    await encodeOpusToFile(path.join(stagingDir, "input-core.wav"), path.join(stagingDir, "core.opus"));
    const badStemWav = path.join(stagingDir, "stem-bass.wav");
    makeFixtureWav(badStemWav, 2.0, 48000); // deliberately mismatched duration
    await encodeOpusToFile(badStemWav, path.join(stagingDir, "stems", "bass.opus"));

    const result = await validateAndFinalizePackage({
      radioLibraryRoot: root, operationId: "op1", radioLoopId: alloc.radioLoopId, packageVersion: alloc.packageVersion,
      sourceReference, musical, arrangement, approval, startedAt: new Date().toISOString(),
    });

    expect(result.ok).toBe(true);
    expect(result.stemsOmitted).toBe(true);
    expect(result.issues.some((i) => i.code === "RADIO_STEMS_OMITTED")).toBe(true);
    const metaPath = path.join(root, "packages", alloc.radioLoopId, `v${alloc.packageVersion}`, "metadata.json");
    const metadata = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    expect(metadata.stems).toBeUndefined();
  }, 20_000);

  it("fails cleanly when the core was never encoded", async () => {
    const alloc = await reserveRadioLoopId(root, "op1", "track_d", "loop_d");
    createStagingOperation(root, "op1");

    const result = await validateAndFinalizePackage({
      radioLibraryRoot: root, operationId: "op1", radioLoopId: alloc.radioLoopId, packageVersion: alloc.packageVersion,
      sourceReference, musical, arrangement, approval, startedAt: new Date().toISOString(),
    });

    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "RADIO_CORE_NOT_ENCODED")).toBe(true);
  }, 20_000);
});
