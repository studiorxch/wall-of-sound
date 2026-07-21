import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { retireRadioLoop } from "./radioRetirementOrchestrator";
import { writeJsonAtomic } from "./radioFsUtils";
import { packageVersionDir } from "./radioPackageWriter";
import { readCurrentManifest } from "./radioManifestBuilder";
import { scanRadioLoopVersions } from "./radioPackageVersionIndex";
import type { RadioCatalogManifest, RadioLoopPackageManifest, RadioLoopSourceReference } from "../../src/data/radioLoopTypes";

describe("retireRadioLoop (real fs, integration)", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "radio-retirement-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function seedSourcePackage() {
    const dir = packageVersionDir(root, "rloop_000001", 1);
    const metadata: RadioLoopPackageManifest = {
      schemaVersion: "1.0.0", radioLoopId: "rloop_000001", packageVersion: 1, status: "RADIO_READY",
      source: { trackId: "track_a", loopId: "loop_a" },
      audio: { primary: { codec: "opus", container: "ogg", mimeType: "audio/ogg; codecs=opus", relativePath: "core.opus", bitrateKbps: 128, channels: 2, durationSeconds: 1 }, variants: [] },
      musical: { bpm: 120 }, arrangement: { roles: ["foundation"], familyIds: ["family-1"] },
      approval: { publicUseApproved: true, approvedAt: "2026-07-16T00:00:00.000Z" },
    };
    writeJsonAtomic(path.join(dir, "metadata.json"), metadata);
    fs.writeFileSync(path.join(dir, "core.opus"), Buffer.from("fake opus bytes"));
    const sourceReference: RadioLoopSourceReference = { trackId: "track_a", loopId: "loop_a", startSeconds: 0, endSeconds: 4, resolvedAt: "2026-07-16T00:00:00.000Z" };
    writeJsonAtomic(path.join(dir, "source-reference.json"), sourceReference);
    const manifest: RadioCatalogManifest = {
      schemaVersion: "1.0.0", generatedAt: new Date().toISOString(),
      entries: [{ radioLoopId: "rloop_000001", packageVersion: 1, status: "RADIO_READY", source: { trackId: "track_a", loopId: "loop_a" }, relativePackagePath: "packages/rloop_000001/v1" }],
    };
    writeJsonAtomic(path.join(root, "catalog", "local-manifest.json"), manifest);
    return dir;
  }

  it("creates a NEW immutable RETIRED version rather than mutating the source version", async () => {
    const sourceDir = seedSourcePackage();
    const beforeMetadataBytes = fs.readFileSync(path.join(sourceDir, "metadata.json"));
    const beforeCoreBytes = fs.readFileSync(path.join(sourceDir, "core.opus"));
    const beforeMtime = fs.statSync(path.join(sourceDir, "metadata.json")).mtimeMs;

    const result = await retireRadioLoop(root, "op1", { radioLoopId: "rloop_000001", reason: "superseded by a better take" });

    expect(result.ok).toBe(true);
    expect(result.newPackageVersion).toBe(2);
    expect(result.assetHashMatch).toBe(true);

    // The SOURCE version (v1) is provably untouched — same bytes, same mtime.
    expect(fs.readFileSync(path.join(sourceDir, "metadata.json"))).toEqual(beforeMetadataBytes);
    expect(fs.readFileSync(path.join(sourceDir, "core.opus"))).toEqual(beforeCoreBytes);
    expect(fs.statSync(path.join(sourceDir, "metadata.json")).mtimeMs).toBe(beforeMtime);

    const v2Dir = packageVersionDir(root, "rloop_000001", 2);
    const v2Metadata = JSON.parse(fs.readFileSync(path.join(v2Dir, "metadata.json"), "utf-8")) as RadioLoopPackageManifest;
    expect(v2Metadata.status).toBe("RETIRED");
    expect(v2Metadata.retirement?.reason).toBe("superseded by a better take");
  });

  it("requires a non-empty reason", async () => {
    seedSourcePackage();
    const result = await retireRadioLoop(root, "op1", { radioLoopId: "rloop_000001", reason: "   " });
    expect(result.ok).toBe(false);
    expect(result.issues[0].code).toBe("RADIO_RETIRE_REASON_REQUIRED");
    expect(fs.existsSync(packageVersionDir(root, "rloop_000001", 2))).toBe(false);
  });

  it("refuses to retire an already-retired RadioLoop", async () => {
    seedSourcePackage();
    const first = await retireRadioLoop(root, "op1", { radioLoopId: "rloop_000001", reason: "first retirement" });
    expect(first.ok).toBe(true);

    const second = await retireRadioLoop(root, "op2", { radioLoopId: "rloop_000001", reason: "second attempt" });
    expect(second.ok).toBe(false);
    expect(second.issues[0].code).toBe("RADIO_SOURCE_ALREADY_RETIRED");
  });

  it("suppresses the RadioLoop from the manifest after retiring, while its complete history (including the retirement) remains in the version index", async () => {
    seedSourcePackage();
    const result = await retireRadioLoop(root, "op1", { radioLoopId: "rloop_000001", reason: "test" });
    expect(result.ok).toBe(true);

    const manifest = readCurrentManifest(root);
    expect(manifest?.entries.some((e) => e.radioLoopId === "rloop_000001")).toBe(false);

    const versions = scanRadioLoopVersions(root, "rloop_000001");
    expect(versions.map((v) => v.packageVersion)).toEqual([1, 2]);
    expect(versions[1].status).toBe("RETIRED");
  });

  it("forced manifest-rebuild failure rolls back the retirement — package left uncreated, and a fresh attempt (a new operationId, exactly how the real route retries) still succeeds at the same next version", async () => {
    seedSourcePackage();
    // Force regenerateManifestOnDisk to fail: put a directory where
    // local-manifest.json needs to be written (removing the file
    // seedSourcePackage() already wrote there).
    fs.rmSync(path.join(root, "catalog", "local-manifest.json"), { force: true });
    fs.mkdirSync(path.join(root, "catalog", "local-manifest.json"), { recursive: true });

    const result = await retireRadioLoop(root, "op1", { radioLoopId: "rloop_000001", reason: "test" });
    expect(result.ok).toBe(false);
    expect(fs.existsSync(packageVersionDir(root, "rloop_000001", 2))).toBe(false);

    // Fix the underlying problem, then retry. The real /radio-package-retire
    // route generates a fresh operationId per request (exactly like
    // /radio-staging-create already does for promotion) — never reuses one
    // across attempts — so the retry here uses a new id too.
    fs.rmSync(path.join(root, "catalog", "local-manifest.json"), { recursive: true, force: true });
    const retry = await retireRadioLoop(root, "op2", { radioLoopId: "rloop_000001", reason: "test" });
    expect(retry.ok).toBe(true);
    expect(retry.newPackageVersion).toBe(2);
  });
});
