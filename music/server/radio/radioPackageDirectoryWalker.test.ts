import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { walkPackageVersions, findHighestPackageVersion } from "./radioPackageDirectoryWalker";
import { writeJsonAtomic } from "./radioFsUtils";
import type { RadioLoopPackageManifest } from "../../src/data/radioLoopTypes";

function makeMetadata(radioLoopId: string, packageVersion: number, status: RadioLoopPackageManifest["status"]): RadioLoopPackageManifest {
  return {
    schemaVersion: "1.0.0", radioLoopId, packageVersion, status,
    source: { trackId: "track_a", loopId: "loop_a" },
    audio: { primary: { codec: "opus", container: "ogg", mimeType: "audio/ogg; codecs=opus", relativePath: "core.opus", bitrateKbps: 128, channels: 2, durationSeconds: 1 }, variants: [] },
    musical: {}, arrangement: { roles: ["foundation"], familyIds: ["family-1"] },
    approval: { publicUseApproved: true, approvedAt: new Date().toISOString() },
  };
}

function writePackage(root: string, radioLoopId: string, packageVersion: number, status: RadioLoopPackageManifest["status"]) {
  writeJsonAtomic(path.join(root, "packages", radioLoopId, `v${packageVersion}`, "metadata.json"), makeMetadata(radioLoopId, packageVersion, status));
}

describe("walkPackageVersions / findHighestPackageVersion", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "radio-dir-walker-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns nothing for an empty library", () => {
    expect(walkPackageVersions(root)).toEqual([]);
    expect(findHighestPackageVersion(root, "rloop_000001")).toBeNull();
  });

  it("walks every version of every RadioLoop when unfiltered", () => {
    writePackage(root, "rloop_000001", 1, "RADIO_READY");
    writePackage(root, "rloop_000001", 2, "RADIO_READY");
    writePackage(root, "rloop_000002", 1, "RETIRED");

    const all = walkPackageVersions(root);
    expect(all).toHaveLength(3);
    expect(all.map((v) => `${v.radioLoopId}/v${v.packageVersion}`).sort()).toEqual(["rloop_000001/v1", "rloop_000001/v2", "rloop_000002/v1"]);
  });

  it("filters to one RadioLoop ID when requested", () => {
    writePackage(root, "rloop_000001", 1, "RADIO_READY");
    writePackage(root, "rloop_000002", 1, "RADIO_READY");

    const filtered = walkPackageVersions(root, "rloop_000001");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].radioLoopId).toBe("rloop_000001");
  });

  it("skips unreadable/corrupt version directories rather than throwing", () => {
    writePackage(root, "rloop_000001", 1, "RADIO_READY");
    fs.mkdirSync(path.join(root, "packages", "rloop_000001", "v2"), { recursive: true });
    fs.writeFileSync(path.join(root, "packages", "rloop_000001", "v2", "metadata.json"), "not json");
    fs.mkdirSync(path.join(root, "packages", "rloop_000001", "not-a-version-dir"), { recursive: true });

    const versions = walkPackageVersions(root, "rloop_000001");
    expect(versions).toHaveLength(1);
    expect(versions[0].packageVersion).toBe(1);
  });

  it("finds the disk-authoritative highest version regardless of status", () => {
    writePackage(root, "rloop_000001", 1, "RADIO_READY");
    writePackage(root, "rloop_000001", 2, "RETIRED");

    const highest = findHighestPackageVersion(root, "rloop_000001");
    expect(highest?.packageVersion).toBe(2);
    expect(highest?.metadata.status).toBe("RETIRED");
  });
});
