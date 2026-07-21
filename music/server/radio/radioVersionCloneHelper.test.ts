import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { cloneVersionForward } from "./radioVersionCloneHelper";
import { writeJsonAtomic } from "./radioFsUtils";
import { packageVersionDir } from "./radioPackageWriter";
import { findReservation } from "./radioIdAssigner";
import { stagingOperationExists } from "./radioStagingFs";
import type { RadioCatalogManifest, RadioLoopPackageManifest } from "../../src/data/radioLoopTypes";

function makeMetadata(radioLoopId: string, packageVersion: number, status: RadioLoopPackageManifest["status"], withStem = false): RadioLoopPackageManifest {
  return {
    schemaVersion: "1.0.0", radioLoopId, packageVersion, status,
    source: { trackId: "track_a", loopId: "loop_a" },
    audio: { primary: { codec: "opus", container: "ogg", mimeType: "audio/ogg; codecs=opus", relativePath: "core.opus", bitrateKbps: 128, channels: 2, durationSeconds: 1 }, variants: [] },
    stems: withStem ? [{ name: "drums", relativePath: "stems/drums.opus", channels: 2, durationSeconds: 1 }] : undefined,
    musical: { bpm: 120 }, arrangement: { roles: ["foundation"], familyIds: ["family-1"] },
    approval: { publicUseApproved: true, approvedAt: new Date().toISOString() },
  };
}

function writeExistingPackage(root: string, radioLoopId: string, packageVersion: number, status: RadioLoopPackageManifest["status"], withStem = false) {
  const metadata = makeMetadata(radioLoopId, packageVersion, status, withStem);
  const dir = packageVersionDir(root, radioLoopId, packageVersion);
  writeJsonAtomic(path.join(dir, "metadata.json"), metadata);
  fs.writeFileSync(path.join(dir, "core.opus"), Buffer.from(`fake opus bytes for ${radioLoopId} v${packageVersion}`));
  if (withStem) {
    fs.mkdirSync(path.join(dir, "stems"), { recursive: true });
    fs.writeFileSync(path.join(dir, "stems", "drums.opus"), Buffer.from("fake stem bytes"));
  }
  return metadata;
}

function writeManifestEntry(root: string, radioLoopId: string, packageVersion: number, status: RadioLoopPackageManifest["status"]) {
  const manifest: RadioCatalogManifest = {
    schemaVersion: "1.0.0", generatedAt: new Date().toISOString(),
    entries: [{ radioLoopId, packageVersion, status, source: { trackId: "track_a", loopId: "loop_a" }, relativePackagePath: `packages/${radioLoopId}/v${packageVersion}` }],
  };
  writeJsonAtomic(path.join(root, "catalog", "local-manifest.json"), manifest);
}

describe("cloneVersionForward", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "radio-version-clone-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("clones the current version forward with matching asset hashes", async () => {
    writeExistingPackage(root, "rloop_000001", 1, "RADIO_READY");
    writeManifestEntry(root, "rloop_000001", 1, "RADIO_READY");

    const result = await cloneVersionForward(root, "op1", "rloop_000001");

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.newPackageVersion).toBe(2);
    expect(result.sourcePackageVersion).toBe(1);
    expect(result.assetHashMatch).toBe(true);
    expect(fs.existsSync(path.join(result.stagingDir, "core.opus"))).toBe(true);
  });

  it("copies and hash-verifies declared stems too", async () => {
    writeExistingPackage(root, "rloop_000001", 1, "RADIO_READY", true);
    writeManifestEntry(root, "rloop_000001", 1, "RADIO_READY");

    const result = await cloneVersionForward(root, "op1", "rloop_000001");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.assetHashMatch).toBe(true);
    expect(fs.existsSync(path.join(result.stagingDir, "stems", "drums.opus"))).toBe(true);
  });

  it("refuses to clone an already-retired current version", async () => {
    writeExistingPackage(root, "rloop_000001", 1, "RETIRED");

    const result = await cloneVersionForward(root, "op1", "rloop_000001");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.issues[0].code).toBe("RADIO_SOURCE_ALREADY_RETIRED");
  });

  it("fails structurally when no version exists for the RadioLoop", async () => {
    const result = await cloneVersionForward(root, "op1", "rloop_999999");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.issues[0].code).toBe("RADIO_SOURCE_VERSION_NOT_FOUND");
  });

  it("rejects a stale expected source version (optimistic concurrency)", async () => {
    writeExistingPackage(root, "rloop_000001", 1, "RADIO_READY");
    writeManifestEntry(root, "rloop_000001", 1, "RADIO_READY");
    // Simulate someone else already advancing the loop to v2 on disk.
    writeExistingPackage(root, "rloop_000001", 2, "RADIO_READY");

    const result = await cloneVersionForward(root, "op1", "rloop_000001", 1);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.issues[0].code).toBe("RADIO_SOURCE_VERSION_STALE");
  });

  it("accepts a matching expected source version", async () => {
    writeExistingPackage(root, "rloop_000001", 1, "RADIO_READY");
    writeManifestEntry(root, "rloop_000001", 1, "RADIO_READY");

    const result = await cloneVersionForward(root, "op1", "rloop_000001", 1);
    expect(result.ok).toBe(true);
  });

  it("cleans up the reservation and staging dir when a source asset fails to copy", async () => {
    const metadata = writeExistingPackage(root, "rloop_000001", 1, "RADIO_READY");
    writeManifestEntry(root, "rloop_000001", 1, "RADIO_READY");
    // Remove the declared core.opus after writing metadata, so the copy
    // step fails mid-way.
    fs.rmSync(path.join(packageVersionDir(root, "rloop_000001", 1), metadata.audio.primary.relativePath));

    const result = await cloneVersionForward(root, "op1", "rloop_000001");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.issues[0].code).toBe("RADIO_CLONE_COPY_FAILED");
    expect(findReservation(root, "op1")).toBeNull();
    expect(stagingOperationExists(root, "op1")).toBe(false);
  });

  it("uses the disk-authoritative highest version, not the (possibly suppressed) manifest", async () => {
    // v2 exists on disk but the manifest was never rebuilt to include it
    // (simulating decision 2's suppression, or a lagging rebuild).
    writeExistingPackage(root, "rloop_000001", 1, "RADIO_READY");
    writeExistingPackage(root, "rloop_000001", 2, "RADIO_READY");
    writeManifestEntry(root, "rloop_000001", 1, "RADIO_READY");

    const result = await cloneVersionForward(root, "op1", "rloop_000001");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.sourcePackageVersion).toBe(2);
    expect(result.newPackageVersion).toBe(3);
  });
});
