import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { sortManifestEntries, buildManifestDocument, scanPackageManifests, regenerateManifestOnDisk, readCurrentManifest } from "./radioManifestBuilder";
import { writeJsonAtomic } from "./radioFsUtils";
import type { RadioCatalogManifestEntry, RadioLoopPackageManifest } from "../../src/data/radioLoopTypes";

describe("sortManifestEntries", () => {
  it("sorts by radioLoopId then packageVersion, deterministically", () => {
    const entries: RadioCatalogManifestEntry[] = [
      { radioLoopId: "rloop_000002", packageVersion: 1, status: "RADIO_READY", source: { trackId: "t", loopId: "l" }, relativePackagePath: "" },
      { radioLoopId: "rloop_000001", packageVersion: 2, status: "RADIO_READY", source: { trackId: "t", loopId: "l" }, relativePackagePath: "" },
      { radioLoopId: "rloop_000001", packageVersion: 1, status: "RADIO_READY", source: { trackId: "t", loopId: "l" }, relativePackagePath: "" },
    ];
    const sorted = sortManifestEntries(entries);
    expect(sorted.map((e) => `${e.radioLoopId}v${e.packageVersion}`)).toEqual(["rloop_000001v1", "rloop_000001v2", "rloop_000002v1"]);
  });

  it("does not mutate the input array", () => {
    const entries: RadioCatalogManifestEntry[] = [
      { radioLoopId: "rloop_000002", packageVersion: 1, status: "RADIO_READY", source: { trackId: "t", loopId: "l" }, relativePackagePath: "" },
      { radioLoopId: "rloop_000001", packageVersion: 1, status: "RADIO_READY", source: { trackId: "t", loopId: "l" }, relativePackagePath: "" },
    ];
    const original = [...entries];
    sortManifestEntries(entries);
    expect(entries).toEqual(original);
  });
});

describe("buildManifestDocument", () => {
  it("wraps sorted entries with schema version and timestamp", () => {
    const doc = buildManifestDocument([], "2026-07-16T00:00:00.000Z");
    expect(doc).toEqual({ schemaVersion: "1.0.0", generatedAt: "2026-07-16T00:00:00.000Z", entries: [] });
  });
});

function writePackageMetadata(root: string, radioLoopId: string, version: number, status: RadioLoopPackageManifest["status"], source = { trackId: "track_a", loopId: "loop_a" }) {
  const metadata: RadioLoopPackageManifest = {
    schemaVersion: "1.0.0",
    radioLoopId,
    packageVersion: version,
    status,
    source,
    audio: { primary: { codec: "opus", container: "ogg", mimeType: "audio/ogg; codecs=opus", relativePath: "core.opus", bitrateKbps: 128, channels: 2, durationSeconds: 1 }, variants: [] },
    musical: {},
    arrangement: { roles: ["foundation"], familyIds: ["family-1"] },
    approval: { publicUseApproved: true, approvedAt: new Date().toISOString() },
  };
  writeJsonAtomic(path.join(root, "packages", radioLoopId, `v${version}`, "metadata.json"), metadata);
}

describe("scanPackageManifests / regenerateManifestOnDisk", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "radio-manifest-builder-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("includes only RADIO_READY/PUBLISHED, excludes CANDIDATE/VALIDATING/RETIRED", () => {
    writePackageMetadata(root, "rloop_000001", 1, "RADIO_READY");
    writePackageMetadata(root, "rloop_000002", 1, "PUBLISHED");
    writePackageMetadata(root, "rloop_000003", 1, "CANDIDATE");
    writePackageMetadata(root, "rloop_000004", 1, "RETIRED");

    const { entries } = scanPackageManifests(root);
    expect(entries.map((e) => e.radioLoopId).sort()).toEqual(["rloop_000001", "rloop_000002"]);
  });

  it("0717A: suppresses the ENTIRE RadioLoop once its highest version is RETIRED, including earlier non-retired versions", () => {
    writePackageMetadata(root, "rloop_000001", 1, "RADIO_READY");
    writePackageMetadata(root, "rloop_000001", 2, "RETIRED");
    writePackageMetadata(root, "rloop_000002", 1, "RADIO_READY"); // unrelated, unaffected

    const { entries } = scanPackageManifests(root);
    expect(entries.map((e) => e.radioLoopId)).toEqual(["rloop_000002"]);
  });

  it("0717A regression: a non-retired RadioLoop with multiple RADIO_READY versions still emits one entry per version, exactly as before", () => {
    writePackageMetadata(root, "rloop_000001", 1, "RADIO_READY");
    writePackageMetadata(root, "rloop_000001", 2, "RADIO_READY");

    const { entries } = scanPackageManifests(root);
    expect(entries.filter((e) => e.radioLoopId === "rloop_000001").map((e) => e.packageVersion).sort()).toEqual([1, 2]);
  });

  it("regenerates the manifest atomically and it's readable back", () => {
    writePackageMetadata(root, "rloop_000001", 1, "RADIO_READY");
    const result = regenerateManifestOnDisk(root, "2026-07-16T00:00:00.000Z");
    expect(result.ok).toBe(true);
    const manifest = readCurrentManifest(root);
    expect(manifest?.entries).toHaveLength(1);
    expect(manifest?.entries[0].radioLoopId).toBe("rloop_000001");
  });

  it("never includes local absolute paths — relativePackagePath is always relative", () => {
    writePackageMetadata(root, "rloop_000001", 1, "RADIO_READY");
    const { entries } = scanPackageManifests(root);
    for (const e of entries) {
      expect(path.isAbsolute(e.relativePackagePath)).toBe(false);
    }
  });

  it("preserves the previous valid manifest when a package directory has unreadable metadata", () => {
    writePackageMetadata(root, "rloop_000001", 1, "RADIO_READY");
    regenerateManifestOnDisk(root, "2026-07-16T00:00:00.000Z");
    const before = readCurrentManifest(root);

    // Corrupt a second package's metadata — scan should skip it (recorded
    // as an issue) without failing the whole rebuild, and the first
    // package's entry survives unaffected.
    fs.mkdirSync(path.join(root, "packages", "rloop_000002", "v1"), { recursive: true });
    fs.writeFileSync(path.join(root, "packages", "rloop_000002", "v1", "metadata.json"), "not json");

    const result = regenerateManifestOnDisk(root, "2026-07-16T00:00:01.000Z");
    expect(result.ok).toBe(true);
    expect(result.issues.some((i) => i.startsWith("unreadable_metadata"))).toBe(true);
    const after = readCurrentManifest(root);
    expect(after?.entries.map((e) => e.radioLoopId)).toEqual(before?.entries.map((e) => e.radioLoopId));
  });
});
