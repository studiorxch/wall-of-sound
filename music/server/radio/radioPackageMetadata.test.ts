import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readPackageMetadata } from "./radioPackageMetadata";
import { writeJsonAtomic } from "./radioFsUtils";
import { packageVersionDir } from "./radioPackageWriter";
import type { RadioLoopPackageManifest } from "../../src/data/radioLoopTypes";

describe("readPackageMetadata", () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "radio-package-metadata-"));
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("reads back exactly what was written, metadata-only", () => {
    const metadata: RadioLoopPackageManifest = {
      schemaVersion: "1.0.0", radioLoopId: "rloop_000001", packageVersion: 1, status: "RADIO_READY",
      source: { trackId: "track_a", loopId: "loop_a" },
      audio: { primary: { codec: "opus", container: "ogg", mimeType: "audio/ogg; codecs=opus", relativePath: "core.opus", bitrateKbps: 128, channels: 2, durationSeconds: 1 }, variants: [] },
      musical: {}, arrangement: { roles: ["foundation"], familyIds: ["family-1"] },
      approval: { publicUseApproved: true, approvedAt: new Date().toISOString() },
    };
    writeJsonAtomic(path.join(packageVersionDir(root, "rloop_000001", 1), "metadata.json"), metadata);

    expect(readPackageMetadata(root, "rloop_000001", 1)).toEqual(metadata);
  });

  it("returns null for a missing package version", () => {
    expect(readPackageMetadata(root, "rloop_999999", 1)).toBeNull();
  });

  it("never returns source-reference.json content even if present alongside", () => {
    const dir = packageVersionDir(root, "rloop_000001", 1);
    writeJsonAtomic(path.join(dir, "metadata.json"), { schemaVersion: "1.0.0", radioLoopId: "rloop_000001" } as unknown as RadioLoopPackageManifest);
    writeJsonAtomic(path.join(dir, "source-reference.json"), { trackId: "secret", audioRelPath: "/should/never/appear" });

    const result = readPackageMetadata(root, "rloop_000001", 1);
    expect(JSON.stringify(result)).not.toContain("should/never/appear");
  });
});
