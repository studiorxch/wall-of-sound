import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { importSunoLibraryManifests } from "./manifestAdapter";
import type { ManifestSourceTexts } from "./manifestValidation";
import { indexEncodedLocationsById, indexCanonicalRecordingsById } from "./canonicalIdentity";
import {
  computeSunoAssetReadiness,
  computeSunoArchiveReadinessSummary,
  applySunoReadinessFilter,
} from "./assetReadiness";

// Real evidence, same fixture set as canonicalIdentity.test.ts. A direct
// jq/python inspection of the real suno-audio-inventory.json (8,381 assets,
// run during implementation) found: 4,868 audioCodec "mp3", 3,508 audioCodec
// "opus" (inside ".m4a" containers — NOT ".opus" files), and exactly 5
// records with containerFormat "wav"/audioCodec "pcm_s16le" — 4 of those 5
// are misleadingly named with a ".mp3" extension. These tests use real
// archiveAssetIds identified directly from that inspection, not synthetic
// data.
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

const result = importSunoLibraryManifests(REAL_SOURCES);
if (result.status === "BLOCKED") throw new Error("fixture import blocked: " + result.messages.join("; "));

const locationsById = indexEncodedLocationsById(result.encodedLocations);
const canonicalById = indexCanonicalRecordingsById(result.canonicalRecordings);

// Real archive asset IDs, identified directly from the inventory during
// implementation (see comment above) — not fabricated.
const WAV_MISNAMED_MP3_ID = "asset-1b40ec6e15068fb6b2a8042e"; // "Chicago - ...sampleia.mp3", real WAV/PCM despite the .mp3 extension
const WAV_REAL_EXTENSION_ID = "asset-509910c8897e7841fef3c56b"; // "System Check.wav"
const OPUS_IN_M4A_ID = "asset-67815b3123e6a692030e3c9c"; // "Minor 7th Suspended Chords.m4a", audioCodec "opus"
const PLAIN_MP3_ID = "asset-d5ef49f261bcfda0175198cb"; // "Mass Realization Subway Edition.mp3"

function canonicalFor(archiveAssetId: string) {
  const loc = locationsById.get(archiveAssetId);
  if (!loc) throw new Error(`fixture location not found: ${archiveAssetId}`);
  const canonical = canonicalById.get(loc.canonicalRecordingId);
  if (!canonical) throw new Error(`fixture canonical not found for: ${archiveAssetId}`);
  return canonical;
}

describe("computeSunoAssetReadiness — real suno-snapshot-2026-08-11-full data", () => {
  it("detects a real WAV file that is misleadingly named with a .mp3 extension", () => {
    const canonical = canonicalFor(WAV_MISNAMED_MP3_ID);
    const loc = locationsById.get(WAV_MISNAMED_MP3_ID)!;
    expect(loc.filename.toLowerCase().endsWith(".mp3")).toBe(true); // confirms the misleading extension is real
    expect(computeSunoAssetReadiness(canonical, locationsById).wavPresent).toBe(true);
  });

  it("detects a real WAV file with a correct .wav extension", () => {
    const canonical = canonicalFor(WAV_REAL_EXTENSION_ID);
    expect(computeSunoAssetReadiness(canonical, locationsById).wavPresent).toBe(true);
  });

  it("detects a real Opus-codec recording packaged inside an .m4a container (not a .opus file)", () => {
    const canonical = canonicalFor(OPUS_IN_M4A_ID);
    const loc = locationsById.get(OPUS_IN_M4A_ID)!;
    expect(loc.filename.toLowerCase().endsWith(".m4a")).toBe(true);
    expect(computeSunoAssetReadiness(canonical, locationsById).opusPresent).toBe(true);
  });

  it("a plain mp3 recording is neither WAV nor Opus present", () => {
    const canonical = canonicalFor(PLAIN_MP3_ID);
    const readiness = computeSunoAssetReadiness(canonical, locationsById);
    expect(readiness.wavPresent).toBe(false);
    expect(readiness.opusPresent).toBe(false);
  });
});

describe("computeSunoArchiveReadinessSummary — real archive aggregate", () => {
  const summary = computeSunoArchiveReadinessSummary(result.canonicalRecordings, locationsById, result.duplicateRelationships);

  it("totals match the real canonical recording count", () => {
    expect(summary.totalRecordings).toBe(result.canonicalRecordings.length);
    expect(summary.wavPresentCount + summary.wavMissingCount).toBe(summary.totalRecordings);
    expect(summary.opusPresentCount + summary.opusMissingCount).toBe(summary.totalRecordings);
    expect(summary.uuidPresentCount + summary.uuidMissingCount).toBe(summary.totalRecordings);
    expect(summary.materializedCount + summary.notMaterializedCount).toBe(summary.totalRecordings);
  });

  it("WAV present count is small but nonzero (real archive has only a handful of true WAV masters)", () => {
    expect(summary.wavPresentCount).toBeGreaterThan(0);
    expect(summary.wavPresentCount).toBeLessThan(20);
  });

  it("Opus present count is real and substantial — not zero, unlike a naive mp3-only assumption", () => {
    expect(summary.opusPresentCount).toBeGreaterThan(1000);
  });

  it("duplicate group count matches the real, already-computed relationship list length", () => {
    expect(summary.duplicateGroupCount).toBe(result.duplicateRelationships.length);
    expect(summary.duplicateGroupCount).toBe(
      result.snapshot.exactDuplicateGroupCount + result.snapshot.alternateEncodingGroupCount,
    );
  });
});

describe("applySunoReadinessFilter", () => {
  it("wav-present filter returns only WAV-present recordings, matching the aggregate count", () => {
    const summary = computeSunoArchiveReadinessSummary(result.canonicalRecordings, locationsById, result.duplicateRelationships);
    const filtered = applySunoReadinessFilter(result.canonicalRecordings, locationsById, "wav-present");
    expect(filtered.length).toBe(summary.wavPresentCount);
    expect(filtered.every((r) => computeSunoAssetReadiness(r, locationsById).wavPresent)).toBe(true);
  });

  it("uuid-missing filter returns only recordings with a null sunoUuid", () => {
    const filtered = applySunoReadinessFilter(result.canonicalRecordings, locationsById, "uuid-missing");
    expect(filtered.every((r) => r.sunoUuid === null)).toBe(true);
  });

  it("materialized filter returns only recordings with a non-null playableEncodedLocationId", () => {
    const filtered = applySunoReadinessFilter(result.canonicalRecordings, locationsById, "materialized");
    expect(filtered.every((r) => r.playableEncodedLocationId !== null)).toBe(true);
  });

  it("a null filterKey returns every recording unchanged", () => {
    const filtered = applySunoReadinessFilter(result.canonicalRecordings, locationsById, null);
    expect(filtered).toBe(result.canonicalRecordings);
  });
});
