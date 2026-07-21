import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
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

describe("scanRadioLoopVersions", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "radio-version-index-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns every version for one RadioLoop, sorted ascending, retired included", () => {
    writePackage(root, "rloop_000001", 1, "RADIO_READY");
    writePackage(root, "rloop_000001", 2, "RETIRED", { retirement: { reason: "superseded", retiredAt: "2026-07-17T00:00:00.000Z" } });
    writePackage(root, "rloop_000002", 1, "RADIO_READY"); // unrelated loop, excluded

    const versions = scanRadioLoopVersions(root, "rloop_000001");
    expect(versions.map((v) => v.packageVersion)).toEqual([1, 2]);
    expect(versions[1].status).toBe("RETIRED");
    expect(versions[1].retirement).toEqual({ reason: "superseded", retiredAt: "2026-07-17T00:00:00.000Z" });
  });

  it("returns an empty array for an unknown RadioLoop ID", () => {
    expect(scanRadioLoopVersions(root, "rloop_999999")).toEqual([]);
  });

  it("never includes a local absolute path or source-reference fields", () => {
    writePackage(root, "rloop_000001", 1, "RADIO_READY");
    const versions = scanRadioLoopVersions(root, "rloop_000001");
    const json = JSON.stringify(versions);
    expect(json).not.toContain(os.tmpdir());
    expect(json).not.toContain("audioRelPath");
  });
});
