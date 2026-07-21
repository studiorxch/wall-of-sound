import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { reviseRadioLoopMetadata, validateMetadataEditRequest, type MetadataEditRequest } from "./radioMetadataRevisionOrchestrator";
import { writeJsonAtomic } from "./radioFsUtils";
import { packageVersionDir } from "./radioPackageWriter";
import { readCurrentManifest } from "./radioManifestBuilder";
import type { RadioCatalogManifest, RadioLoopPackageManifest, RadioLoopSourceReference } from "../../src/data/radioLoopTypes";

function baseRequest(overrides: Partial<MetadataEditRequest> = {}): MetadataEditRequest {
  return {
    radioLoopId: "rloop_000001",
    sourcePackageVersion: 1,
    title: "Updated Title",
    roles: ["motion"],
    publicUseApproved: true,
    ...overrides,
  };
}

describe("validateMetadataEditRequest", () => {
  it("passes a fully valid request", () => {
    expect(validateMetadataEditRequest(baseRequest())).toEqual([]);
  });

  it("rejects an unknown/legacy role", () => {
    const issues = validateMetadataEditRequest(baseRequest({ roles: ["atmosphere"] }));
    expect(issues.some((i) => i.code === "RADIO_EDIT_UNKNOWN_ROLE")).toBe(true);
  });

  it("requires at least one role", () => {
    expect(validateMetadataEditRequest(baseRequest({ roles: [] })).some((i) => i.code === "RADIO_EDIT_ROLE_REQUIRED")).toBe(true);
  });

  // 0717C §3.4 — Compatibility Family removed, not merely relaxed.
  it("never requires or flags a Compatibility Family (removed in 0717C)", () => {
    expect(validateMetadataEditRequest(baseRequest())).toEqual([]);
    expect("familyIds" in baseRequest()).toBe(false);
  });

  it("rejects out-of-range normalized fields and invalid repeat/rest bounds", () => {
    expect(validateMetadataEditRequest(baseRequest({ energy: 1.5 })).some((i) => i.code === "RADIO_EDIT_FIELD_OUT_OF_RANGE")).toBe(true);
    expect(validateMetadataEditRequest(baseRequest({ maximumConsecutiveRepeats: 0 })).some((i) => i.code === "RADIO_EDIT_FIELD_OUT_OF_RANGE")).toBe(true);
    expect(validateMetadataEditRequest(baseRequest({ minimumRestCycles: -1 })).some((i) => i.code === "RADIO_EDIT_FIELD_OUT_OF_RANGE")).toBe(true);
  });
});

describe("reviseRadioLoopMetadata (real fs, integration)", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "radio-metadata-revision-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function seedSourcePackage() {
    const dir = packageVersionDir(root, "rloop_000001", 1);
    const metadata: RadioLoopPackageManifest = {
      schemaVersion: "1.0.0", radioLoopId: "rloop_000001", packageVersion: 1, status: "RADIO_READY", title: "Original Title",
      source: { trackId: "track_a", loopId: "loop_a" },
      audio: { primary: { codec: "opus", container: "ogg", mimeType: "audio/ogg; codecs=opus", relativePath: "core.opus", bitrateKbps: 128, channels: 2, durationSeconds: 1 }, variants: [] },
      musical: { bpm: 120, key: "8A", bars: 8 },
      arrangement: { roles: ["foundation"], familyIds: ["family-1"] },
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
  }

  it("creates the next immutable version, preserves asset hash, leaves the prior version untouched", async () => {
    seedSourcePackage();

    const result = await reviseRadioLoopMetadata(root, "op1", baseRequest());

    expect(result.ok).toBe(true);
    expect(result.packageVersion).toBe(2);
    expect(result.assetHashMatch).toBe(true);

    const v1Dir = packageVersionDir(root, "rloop_000001", 1);
    const v2Dir = packageVersionDir(root, "rloop_000001", 2);
    expect(fs.readFileSync(path.join(v1Dir, "core.opus"))).toEqual(Buffer.from("fake opus bytes"));
    expect(fs.readFileSync(path.join(v2Dir, "core.opus"))).toEqual(Buffer.from("fake opus bytes"));

    const v1Metadata = JSON.parse(fs.readFileSync(path.join(v1Dir, "metadata.json"), "utf-8")) as RadioLoopPackageManifest;
    const v2Metadata = JSON.parse(fs.readFileSync(path.join(v2Dir, "metadata.json"), "utf-8")) as RadioLoopPackageManifest;
    expect(v2Metadata.title).toBe("Updated Title");
    expect(v2Metadata.arrangement.roles).toEqual(["motion"]);
    expect(v2Metadata.status).toBe("RADIO_READY");
    // Audio asset identity carried forward unchanged — no re-encode.
    expect(v2Metadata.audio.primary).toEqual(v1Metadata.audio.primary);

    // 0717C §3.4 — the legacy v1 source has a populated familyIds (seeded
    // above), proving the field still parses/loads for a pre-0717C package
    // (backward compatibility), but the newly-revised v2 never carries it
    // forward — every new package version omits it going forward.
    expect(v1Metadata.arrangement.familyIds).toEqual(["family-1"]);
    expect(v2Metadata.arrangement.familyIds).toBeUndefined();

    const manifest = readCurrentManifest(root);
    expect(manifest?.entries.some((e) => e.packageVersion === 2)).toBe(true);
  });

  it("rejects an unknown role before ever touching disk", async () => {
    seedSourcePackage();
    const result = await reviseRadioLoopMetadata(root, "op1", baseRequest({ roles: ["atmosphere"] }));
    expect(result.ok).toBe(false);
    expect(result.issues[0].code).toBe("RADIO_EDIT_UNKNOWN_ROLE");
    expect(fs.existsSync(packageVersionDir(root, "rloop_000001", 2))).toBe(false);
  });

  it("carries approvedAt forward unchanged when publicUseApproved is not actually changed", async () => {
    seedSourcePackage();
    const result = await reviseRadioLoopMetadata(root, "op1", baseRequest({ publicUseApproved: true }));
    expect(result.ok).toBe(true);
    const v2Dir = packageVersionDir(root, "rloop_000001", 2);
    const v2Metadata = JSON.parse(fs.readFileSync(path.join(v2Dir, "metadata.json"), "utf-8")) as RadioLoopPackageManifest;
    expect(v2Metadata.approval).toEqual({ publicUseApproved: true, approvedAt: "2026-07-16T00:00:00.000Z" });
  });

  it("stamps a fresh approvedAt only when publicUseApproved actually changes", async () => {
    seedSourcePackage();
    const result = await reviseRadioLoopMetadata(root, "op1", baseRequest({ publicUseApproved: false }));
    expect(result.ok).toBe(true);
    const v2Dir = packageVersionDir(root, "rloop_000001", 2);
    const v2Metadata = JSON.parse(fs.readFileSync(path.join(v2Dir, "metadata.json"), "utf-8")) as RadioLoopPackageManifest;
    expect(v2Metadata.approval.publicUseApproved).toBe(false);
    expect(v2Metadata.approval.approvedAt).not.toBe("2026-07-16T00:00:00.000Z");
  });

  it("refuses to revise a source version that no longer matches the current disk state (stale edit)", async () => {
    seedSourcePackage();
    // Someone else already advanced the loop to v2.
    const v2Dir = packageVersionDir(root, "rloop_000001", 2);
    fs.mkdirSync(v2Dir, { recursive: true });
    fs.writeFileSync(path.join(v2Dir, "metadata.json"), fs.readFileSync(path.join(packageVersionDir(root, "rloop_000001", 1), "metadata.json")));

    const result = await reviseRadioLoopMetadata(root, "op1", baseRequest({ sourcePackageVersion: 1 }));
    expect(result.ok).toBe(false);
    expect(result.issues[0].code).toBe("RADIO_SOURCE_VERSION_STALE");
  });
});
