import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { importSunoLibraryManifests } from "./manifestAdapter";
import { validateManifestSourceTexts, type ManifestSourceTexts } from "./manifestValidation";

// Real evidence, not fixtures: reads the actual WOS Share SUNO_LIBRARY
// manifests for suno-snapshot-2026-08-11-full (0812_MUSIC_Suno-Library-
// Manifest-Integration_v1.0.0 §12.2 "Real authority tests"). Mirrors the
// exact real-manifest-reading precedent already established by
// machineLifeManifestAdapter.test.ts.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_DIR = path.resolve(__dirname, "../../../../WOS-share/SUNO_LIBRARY/MANIFESTS");

function readReal(name: string): string {
  return readFileSync(path.join(MANIFEST_DIR, name), "utf-8");
}

const REAL_SOURCES: ManifestSourceTexts = {
  acquisitionSnapshot: readReal("suno-acquisition-snapshot.json"),
  audioInventory: readReal("suno-audio-inventory.json"),
  duplicateGroups: readReal("suno-duplicate-groups.json"),
  supplementalAssets: readReal("suno-supplemental-assets.json"),
  syncCheckpoint: readReal("suno-sync-checkpoint.json"),
};

describe("importSunoLibraryManifests — real suno-snapshot-2026-08-11-full", () => {
  const result = importSunoLibraryManifests(REAL_SOURCES);

  it("does not block on the real manifest set", () => {
    expect(result.status === "PASS" || result.status === "PASS_WITH_LIMITATION").toBe(true);
  });

  it("reconciles every §2 verified fact", () => {
    if (result.status === "BLOCKED") throw new Error("import blocked: " + result.messages.join("; "));
    expect(result.snapshot.snapshotId).toBe("suno-snapshot-2026-08-11-full");
    expect(result.encodedLocations.length).toBe(8381);
    expect(result.snapshot.extractedLocationCount).toBe(8321);
    expect(result.snapshot.supplementalLocationCount).toBe(60);
    expect(result.workspaces.length).toBe(243);
    expect(result.batches.length).toBe(470);
    expect(result.snapshot.uuidLinkedCount).toBe(2546);
    expect(result.snapshot.legacyNoIdCount).toBe(5835);
    expect(result.snapshot.exactDuplicateGroupCount).toBe(1426);
    expect(result.snapshot.alternateEncodingGroupCount).toBe(1);
    expect(result.snapshot.identityConflictCount).toBe(0);
    // 389h 52m ± a few seconds of floating-point summation noise.
    expect(result.snapshot.totalDurationSeconds).toBeGreaterThan(389 * 3600 + 52 * 60 - 5);
    expect(result.snapshot.totalDurationSeconds).toBeLessThan(389 * 3600 + 53 * 60);
  });

  it("accepts every relative path safely (no unsafe-relative-path rejection)", () => {
    expect(result.status).not.toBe("BLOCKED");
    if (result.status === "BLOCKED") return;
    for (const location of result.encodedLocations) {
      if (location.extractedRelativePath === null) continue; // supplemental-loose-audio: see adapter doc comment
      expect(location.extractedRelativePath.startsWith("/")).toBe(false);
      expect(location.extractedRelativePath.split("/")).not.toContain("..");
    }
  });

  it("produces a canonical recording for every encoded location, grouped only by UUID/checksum", () => {
    if (result.status === "BLOCKED") return;
    const idsSeen = new Set(result.canonicalRecordings.flatMap((r) => r.encodedLocationIds));
    expect(idsSeen.size).toBe(result.encodedLocations.length);
    // Every encoded location's canonicalRecordingId resolves to a real record.
    const canonicalIds = new Set(result.canonicalRecordings.map((r) => r.canonicalRecordingId));
    for (const location of result.encodedLocations) {
      expect(canonicalIds.has(location.canonicalRecordingId)).toBe(true);
    }
  });

  it("is deterministic across repeated calls on the same input", () => {
    const again = importSunoLibraryManifests(REAL_SOURCES);
    if (result.status === "BLOCKED" || again.status === "BLOCKED") throw new Error("unexpected block");
    expect(again.canonicalRecordings.map((r) => r.canonicalRecordingId).sort()).toEqual(
      result.canonicalRecordings.map((r) => r.canonicalRecordingId).sort(),
    );
    expect(again.snapshot).toEqual(result.snapshot);
  });
});

describe("validateManifestSourceTexts — synthetic gate tests", () => {
  it("BLOCKS when a required manifest is missing", () => {
    const sources: ManifestSourceTexts = { ...REAL_SOURCES, syncCheckpoint: null };
    const result = validateManifestSourceTexts(sources);
    expect(result.status).toBe("BLOCKED");
    if (result.status === "BLOCKED") expect(result.reasons).toContain("manifest-missing");
  });

  it("BLOCKS on invalid JSON", () => {
    const sources: ManifestSourceTexts = { ...REAL_SOURCES, supplementalAssets: "{not valid json" };
    const result = validateManifestSourceTexts(sources);
    expect(result.status).toBe("BLOCKED");
    if (result.status === "BLOCKED") expect(result.reasons).toContain("manifest-invalid-json");
  });

  it("BLOCKS on a conflicting snapshot ID", () => {
    const tampered = JSON.stringify({
      ...JSON.parse(REAL_SOURCES.syncCheckpoint as string),
      snapshotId: "suno-snapshot-9999-99-99-tampered",
    });
    const sources: ManifestSourceTexts = { ...REAL_SOURCES, syncCheckpoint: tampered };
    const result = validateManifestSourceTexts(sources);
    expect(result.status).toBe("BLOCKED");
    if (result.status === "BLOCKED") expect(result.reasons).toContain("snapshot-id-conflict");
  });

  it("BLOCKS on a material count conflict between embedded and standalone manifests", () => {
    const parsed = JSON.parse(REAL_SOURCES.audioInventory as string);
    parsed.audioAssets = parsed.audioAssets.slice(0, parsed.audioAssets.length - 1);
    const sources: ManifestSourceTexts = { ...REAL_SOURCES, audioInventory: JSON.stringify(parsed) };
    const result = validateManifestSourceTexts(sources);
    expect(result.status).toBe("BLOCKED");
    if (result.status === "BLOCKED") expect(result.reasons).toContain("material-count-conflict");
  });

  it("BLOCKS on an absolute or upward-traversing relative path", () => {
    const parsed = JSON.parse(REAL_SOURCES.acquisitionSnapshot as string);
    parsed.audioAssets[0].extractedRelativePath = "../../etc/passwd";
    const acquisitionSnapshot = JSON.stringify(parsed);
    // Keep the standalone audio-inventory's copy tampered identically so
    // this test isolates the traversal check, not a count-conflict.
    const audioParsed = JSON.parse(REAL_SOURCES.audioInventory as string);
    audioParsed.audioAssets[0].extractedRelativePath = "../../etc/passwd";
    const sources: ManifestSourceTexts = {
      ...REAL_SOURCES,
      acquisitionSnapshot,
      audioInventory: JSON.stringify(audioParsed),
    };
    const result = validateManifestSourceTexts(sources);
    expect(result.status).toBe("BLOCKED");
    if (result.status === "BLOCKED") expect(result.reasons).toContain("unsafe-relative-path");
  });
});
