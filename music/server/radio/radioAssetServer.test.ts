import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveRadioAsset } from "./radioAssetServer";
import { writeJsonAtomic } from "./radioFsUtils";
import { packageVersionDir } from "./radioPackageWriter";
import type { RadioLoopPackageManifest } from "../../src/data/radioLoopTypes";

function writePackage(root: string, radioLoopId: string, packageVersion: number, status: RadioLoopPackageManifest["status"], withStem = false) {
  const dir = packageVersionDir(root, radioLoopId, packageVersion);
  const metadata: RadioLoopPackageManifest = {
    schemaVersion: "1.0.0", radioLoopId, packageVersion, status,
    source: { trackId: "track_a", loopId: "loop_a" },
    audio: { primary: { codec: "opus", container: "ogg", mimeType: "audio/ogg; codecs=opus", relativePath: "core.opus", bitrateKbps: 128, channels: 2, durationSeconds: 1 }, variants: [] },
    stems: withStem ? [{ name: "drums", relativePath: "stems/drums.opus", channels: 2, durationSeconds: 1 }] : undefined,
    musical: {}, arrangement: { roles: ["foundation"], familyIds: ["family-1"] },
    approval: { publicUseApproved: true, approvedAt: new Date().toISOString() },
  };
  writeJsonAtomic(path.join(dir, "metadata.json"), metadata);
  fs.writeFileSync(path.join(dir, "core.opus"), Buffer.from("fake opus"));
  if (withStem) {
    fs.mkdirSync(path.join(dir, "stems"), { recursive: true });
    fs.writeFileSync(path.join(dir, "stems", "drums.opus"), Buffer.from("fake stem"));
  }
}

describe("resolveRadioAsset", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "radio-asset-server-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("resolves the core asset with the correct MIME type", () => {
    writePackage(root, "rloop_000001", 1, "RADIO_READY");
    const result = resolveRadioAsset(root, "rloop_000001", 1, "core");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.mimeType).toBe("audio/ogg; codecs=opus");
    expect(result.filePath.endsWith("core.opus")).toBe(true);
  });

  it("resolves a declared stem asset", () => {
    writePackage(root, "rloop_000001", 1, "RADIO_READY", true);
    const result = resolveRadioAsset(root, "rloop_000001", 1, "stem:drums");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");
    expect(result.filePath.endsWith(path.join("stems", "drums.opus"))).toBe(true);
  });

  it("404s for a missing package", () => {
    const result = resolveRadioAsset(root, "rloop_999999", 1, "core");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.httpStatus).toBe(404);
    expect(result.code).toBe("RADIO_ASSET_PACKAGE_NOT_FOUND");
  });

  it("409s for a retired package — distinct from missing", () => {
    writePackage(root, "rloop_000001", 1, "RETIRED");
    const result = resolveRadioAsset(root, "rloop_000001", 1, "core");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.httpStatus).toBe(409);
    expect(result.code).toBe("RADIO_ASSET_PACKAGE_RETIRED");
  });

  it("404s for an undeclared stem name — never accepts an arbitrary relative path", () => {
    writePackage(root, "rloop_000001", 1, "RADIO_READY");
    const result = resolveRadioAsset(root, "rloop_000001", 1, "stem:nonexistent");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.httpStatus).toBe(404);
    expect(result.code).toBe("RADIO_ASSET_NOT_DECLARED");
  });

  it("404s for a declared asset whose file is missing from disk", () => {
    writePackage(root, "rloop_000001", 1, "RADIO_READY");
    fs.rmSync(path.join(packageVersionDir(root, "rloop_000001", 1), "core.opus"));
    const result = resolveRadioAsset(root, "rloop_000001", 1, "core");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.code).toBe("RADIO_ASSET_FILE_MISSING");
  });

  it("rejects a path-traversal attempt disguised as a stem target", () => {
    writePackage(root, "rloop_000001", 1, "RADIO_READY");
    const result = resolveRadioAsset(root, "rloop_000001", 1, "stem:../../../etc/passwd");
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.httpStatus).toBe(404);
  });
});
