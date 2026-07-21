import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { finalizePackage, findAbsolutePathIssues, packageVersionDir } from "./radioPackageWriter";
import { reserveRadioLoopId, findReservation } from "./radioIdAssigner";
import { createStagingOperation, stagingOperationDir } from "./radioStagingFs";
import { readCurrentManifest } from "./radioManifestBuilder";
import type { RadioLoopPackageManifest, RadioLoopSourceReference } from "../../src/data/radioLoopTypes";

function makeMetadata(radioLoopId: string, packageVersion: number): RadioLoopPackageManifest {
  return {
    schemaVersion: "1.0.0",
    radioLoopId,
    packageVersion,
    status: "RADIO_READY",
    source: { trackId: "track_a", loopId: "loop_a" },
    audio: { primary: { codec: "opus", container: "ogg", mimeType: "audio/ogg; codecs=opus", relativePath: "core.opus", bitrateKbps: 128, channels: 2, durationSeconds: 1 }, variants: [] },
    musical: { bpm: 120, key: "8A", bars: 8 },
    arrangement: { roles: ["foundation"], familyIds: ["family-1"] },
    approval: { publicUseApproved: true, approvedAt: new Date().toISOString() },
  };
}

function makeSourceReference(): RadioLoopSourceReference {
  return { trackId: "track_a", loopId: "loop_a", startSeconds: 0, endSeconds: 4, resolvedAt: new Date().toISOString() };
}

describe("findAbsolutePathIssues", () => {
  it("passes clean relative paths", () => {
    const meta = makeMetadata("rloop_000001", 1);
    expect(findAbsolutePathIssues(meta)).toEqual([]);
  });

  it("rejects an absolute primary delivery path", () => {
    const meta = makeMetadata("rloop_000001", 1);
    meta.audio.primary.relativePath = "/Users/studio/Library/core.opus";
    const issues = findAbsolutePathIssues(meta);
    expect(issues.some((i) => i.code === "RADIO_METADATA_ABSOLUTE_PATH")).toBe(true);
  });

  it("rejects an absolute stem path", () => {
    const meta = makeMetadata("rloop_000001", 1);
    meta.stems = [{ name: "drums", relativePath: "/tmp/drums.opus", channels: 2, durationSeconds: 1 }];
    const issues = findAbsolutePathIssues(meta);
    expect(issues.some((i) => i.code === "RADIO_METADATA_ABSOLUTE_PATH")).toBe(true);
  });
});

describe("finalizePackage (real fs, integration)", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "radio-package-writer-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  async function stageOperation(operationId: string, sourceTrackId = "track_a", sourceLoopId = "loop_a") {
    const alloc = await reserveRadioLoopId(root, operationId, sourceTrackId, sourceLoopId);
    const stagingDir = createStagingOperation(root, operationId);
    fs.writeFileSync(path.join(stagingDir, "core.opus"), Buffer.from("fake opus bytes"));
    return { alloc, stagingDir };
  }

  it("finalizes successfully and the package appears in the same-call rebuilt manifest", async () => {
    const { alloc } = await stageOperation("op1");

    const result = await finalizePackage({
      radioLibraryRoot: root,
      operationId: "op1",
      radioLoopId: alloc.radioLoopId,
      packageVersion: alloc.packageVersion,
      metadata: makeMetadata(alloc.radioLoopId, alloc.packageVersion),
      sourceReference: makeSourceReference(),
      reportBase: { startedAt: new Date().toISOString(), priorIssues: [] },
    });

    expect(result.ok).toBe(true);
    expect(result.rolledBack).toBe(false);
    expect(result.report.finalStatus).toBe("RADIO_READY");

    const targetDir = packageVersionDir(root, alloc.radioLoopId, alloc.packageVersion);
    expect(fs.existsSync(path.join(targetDir, "metadata.json"))).toBe(true);
    expect(fs.existsSync(path.join(targetDir, "core.opus"))).toBe(true);
    expect(fs.existsSync(stagingOperationDir(root, "op1"))).toBe(false);

    const manifest = readCurrentManifest(root);
    expect(manifest?.entries.some((e) => e.radioLoopId === alloc.radioLoopId && e.packageVersion === alloc.packageVersion)).toBe(true);

    // Reservation released on success.
    expect(findReservation(root, "op1")).toBeNull();
  });

  it("never leaks transient staging files (e.g. the lossless-intermediate WAV) into the immutable package, and cleans up staging on success", async () => {
    const { alloc, stagingDir } = await stageOperation("op1");
    fs.writeFileSync(path.join(stagingDir, "input-core.wav"), Buffer.from("fake lossless wav"));

    const result = await finalizePackage({
      radioLibraryRoot: root,
      operationId: "op1",
      radioLoopId: alloc.radioLoopId,
      packageVersion: alloc.packageVersion,
      metadata: makeMetadata(alloc.radioLoopId, alloc.packageVersion),
      sourceReference: makeSourceReference(),
      reportBase: { startedAt: new Date().toISOString(), priorIssues: [] },
    });

    expect(result.ok).toBe(true);
    const targetDir = packageVersionDir(root, alloc.radioLoopId, alloc.packageVersion);
    expect(fs.existsSync(path.join(targetDir, "input-core.wav"))).toBe(false);
    expect(fs.readdirSync(targetDir).sort()).toEqual(["core.opus", "metadata.json", "source-reference.json"]);
    expect(fs.existsSync(stagingDir)).toBe(false);
  });

  it("refuses to overwrite an existing package version directory", async () => {
    const { alloc } = await stageOperation("op1");
    // Pre-create the target as if a package already existed there.
    const targetDir = packageVersionDir(root, alloc.radioLoopId, alloc.packageVersion);
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, "sentinel.txt"), "do not touch");

    const result = await finalizePackage({
      radioLibraryRoot: root,
      operationId: "op1",
      radioLoopId: alloc.radioLoopId,
      packageVersion: alloc.packageVersion,
      metadata: makeMetadata(alloc.radioLoopId, alloc.packageVersion),
      sourceReference: makeSourceReference(),
      reportBase: { startedAt: new Date().toISOString(), priorIssues: [] },
    });

    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "RADIO_PACKAGE_VERSION_EXISTS")).toBe(true);
    // The pre-existing directory must be completely untouched.
    expect(fs.readFileSync(path.join(targetDir, "sentinel.txt"), "utf-8")).toBe("do not touch");
  });

  it("rolls the package back into staging when the manifest rebuild fails, and a retry of the SAME operation then succeeds without a duplicate-version refusal", async () => {
    const { alloc } = await stageOperation("op1");

    // Force regenerateManifestOnDisk to fail deterministically: put a
    // DIRECTORY where local-manifest.json needs to be written, so
    // writeJsonAtomic's final rename throws (can't rename a file onto an
    // existing directory).
    fs.mkdirSync(path.join(root, "catalog", "local-manifest.json"), { recursive: true });

    const failResult = await finalizePackage({
      radioLibraryRoot: root,
      operationId: "op1",
      radioLoopId: alloc.radioLoopId,
      packageVersion: alloc.packageVersion,
      metadata: makeMetadata(alloc.radioLoopId, alloc.packageVersion),
      sourceReference: makeSourceReference(),
      reportBase: { startedAt: new Date().toISOString(), priorIssues: [] },
    });

    expect(failResult.ok).toBe(false);
    expect(failResult.rolledBack).toBe(true);
    expect(failResult.report.finalStatus).toBe("FAILED");
    expect(fs.existsSync(packageVersionDir(root, alloc.radioLoopId, alloc.packageVersion))).toBe(false);
    expect(fs.existsSync(stagingOperationDir(root, "op1"))).toBe(true);
    // Reservation preserved across the rollback for retry.
    expect(findReservation(root, "op1")).not.toBeNull();

    // Fix the underlying problem, then retry the SAME operation.
    fs.rmSync(path.join(root, "catalog", "local-manifest.json"), { recursive: true, force: true });

    const retryResult = await finalizePackage({
      radioLibraryRoot: root,
      operationId: "op1",
      radioLoopId: alloc.radioLoopId,
      packageVersion: alloc.packageVersion,
      metadata: makeMetadata(alloc.radioLoopId, alloc.packageVersion),
      sourceReference: makeSourceReference(),
      reportBase: { startedAt: new Date().toISOString(), priorIssues: [] },
    });

    expect(retryResult.ok).toBe(true);
    expect(retryResult.rolledBack).toBe(false);
    const manifest = readCurrentManifest(root);
    expect(manifest?.entries.some((e) => e.radioLoopId === alloc.radioLoopId && e.packageVersion === alloc.packageVersion)).toBe(true);
  });

  it("fails without moving anything when no reservation matches the operation", async () => {
    const stagingDir = createStagingOperation(root, "op-no-reservation");
    fs.writeFileSync(path.join(stagingDir, "core.opus"), Buffer.from("fake"));

    const result = await finalizePackage({
      radioLibraryRoot: root,
      operationId: "op-no-reservation",
      radioLoopId: "rloop_000001",
      packageVersion: 1,
      metadata: makeMetadata("rloop_000001", 1),
      sourceReference: makeSourceReference(),
      reportBase: { startedAt: new Date().toISOString(), priorIssues: [] },
    });

    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "RADIO_RESERVATION_MISMATCH")).toBe(true);
    expect(fs.existsSync(stagingDir)).toBe(true);
  });
});
