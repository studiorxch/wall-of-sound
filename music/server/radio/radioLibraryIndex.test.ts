import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { scanLibraryIndex } from "./radioLibraryIndex";
import { scanPackageManifests } from "./radioManifestBuilder";
import { scanRadioLoopVersions } from "./radioPackageVersionIndex";
import { writeJsonAtomic } from "./radioFsUtils";
import type { RadioLoopPackageManifest } from "../../src/data/radioLoopTypes";

function writePackage(root: string, radioLoopId: string, packageVersion: number, status: RadioLoopPackageManifest["status"], extra: Partial<RadioLoopPackageManifest> = {}) {
  const metadata: RadioLoopPackageManifest = {
    schemaVersion: "1.0.0", radioLoopId, packageVersion, status,
    source: { trackId: "track_a", loopId: "loop_a" },
    audio: { primary: { codec: "opus", container: "ogg", mimeType: "audio/ogg; codecs=opus", relativePath: "core.opus", bitrateKbps: 128, channels: 2, durationSeconds: 1 }, variants: [] },
    musical: {}, arrangement: { roles: ["foundation"], familyIds: ["family-1"] },
    approval: { publicUseApproved: true, approvedAt: new Date().toISOString() },
    ...extra,
  };
  writeJsonAtomic(path.join(root, "packages", radioLoopId, `v${packageVersion}`, "metadata.json"), metadata);
}

describe("scanLibraryIndex", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "radio-library-index-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns one entry per RadioLoop ID, using its highest version and status", () => {
    writePackage(root, "rloop_000001", 1, "RADIO_READY");
    writePackage(root, "rloop_000001", 2, "RADIO_READY");
    writePackage(root, "rloop_000002", 1, "RADIO_READY");

    const index = scanLibraryIndex(root);
    expect(index).toHaveLength(2);
    const loop1 = index.find((e) => e.radioLoopId === "rloop_000001");
    expect(loop1?.packageVersion).toBe(2);
  });

  it("is sorted deterministically by radioLoopId", () => {
    writePackage(root, "rloop_000003", 1, "RADIO_READY");
    writePackage(root, "rloop_000001", 1, "RADIO_READY");
    writePackage(root, "rloop_000002", 1, "RADIO_READY");

    const index = scanLibraryIndex(root);
    expect(index.map((e) => e.radioLoopId)).toEqual(["rloop_000001", "rloop_000002", "rloop_000003"]);
  });

  it("never includes a local absolute path or source-reference fields", () => {
    writePackage(root, "rloop_000001", 1, "RADIO_READY");
    const json = JSON.stringify(scanLibraryIndex(root));
    expect(json).not.toContain(os.tmpdir());
    expect(json).not.toContain("audioRelPath");
  });

  // --- The four proofs the second plan correction explicitly requires ---
  describe("retired RadioLoop persistence (required by plan correction)", () => {
    beforeEach(() => {
      // v1 was the original promotion; v2 is the retirement (a NEW
      // immutable version, never a mutation of v1 — see
      // radioRetirementOrchestrator.ts).
      writePackage(root, "rloop_000001", 1, "RADIO_READY");
      writePackage(root, "rloop_000001", 2, "RETIRED", { retirement: { reason: "test retirement", retiredAt: "2026-07-17T00:00:00.000Z" } });
    });

    it("(1) remains visible in the library index after a fresh scan (simulating a new session)", () => {
      const freshScan = scanLibraryIndex(root);
      expect(freshScan.some((e) => e.radioLoopId === "rloop_000001")).toBe(true);
    });

    it("(2) displays RETIRED status", () => {
      const entry = scanLibraryIndex(root).find((e) => e.radioLoopId === "rloop_000001");
      expect(entry?.status).toBe("RETIRED");
    });

    it("(3) remains absent from /radio-manifest (scanPackageManifests)", () => {
      const { entries } = scanPackageManifests(root);
      expect(entries.some((e) => e.radioLoopId === "rloop_000001")).toBe(false);
    });

    it("(4) its complete immutable history remains available through the version index", () => {
      const versions = scanRadioLoopVersions(root, "rloop_000001");
      expect(versions.map((v) => v.packageVersion)).toEqual([1, 2]);
      expect(versions[0].status).toBe("RADIO_READY");
      expect(versions[1].status).toBe("RETIRED");
    });
  });
});
