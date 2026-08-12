import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { importSunoLibraryManifests } from "./manifestAdapter";
import type { ManifestSourceTexts } from "./manifestValidation";
import {
  resolvePlaybackLocation,
  indexEncodedLocationsById,
  indexCanonicalRecordingsById,
} from "./canonicalIdentity";

// Real evidence: same manifest set as manifestAdapter.test.ts. See
// suno-supplemental-assets.json's resolution field — verified during
// implementation: 58 represented-by-zip-exact, 1 represented-by-zip-
// same-uuid, 1 supplemental-unique, and every "represented" supplemental
// assetId is already a member of a duplicateGroups.json group the adapter's
// existing union-find processes (confirmed via direct jq inspection before
// writing this code — no new cross-referencing was needed).
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

// Real archive asset IDs identified directly from suno-supplemental-
// assets.json during implementation — not fabricated, not synthetic.
const EXACT_DUPLICATE_SUPPLEMENTAL_ID = "asset-04a634a02ae04043c9ffa3d5";
const SAME_UUID_SUPPLEMENTAL_ID = "asset-665758f5466bb55de205b038";
const SUPPLEMENTAL_UNIQUE_ID = "asset-509910c8897e7841fef3c56b";

describe("resolvePlaybackLocation — real suno-snapshot-2026-08-11-full supplemental reconciliation", () => {
  it("1. a supplemental exact duplicate resolves to an extracted canonical representative", () => {
    const requested = locationsById.get(EXACT_DUPLICATE_SUPPLEMENTAL_ID);
    expect(requested).toBeDefined();
    expect(requested?.extractedRelativePath).toBeNull(); // confirms this is the unplayable-directly case
    const resolution = resolvePlaybackLocation(EXACT_DUPLICATE_SUPPLEMENTAL_ID, locationsById, canonicalById);
    expect(resolution.kind).toBe("fallback");
    if (resolution.kind === "fallback") {
      expect(resolution.requestedArchiveAssetId).toBe(EXACT_DUPLICATE_SUPPLEMENTAL_ID);
      expect(resolution.extractedRelativePath).not.toBeNull();
      expect(resolution.archiveAssetId).not.toBe(EXACT_DUPLICATE_SUPPLEMENTAL_ID);
    }
  });

  it("2. a supplemental same-UUID alternate resolves to an extracted representative", () => {
    const requested = locationsById.get(SAME_UUID_SUPPLEMENTAL_ID);
    expect(requested).toBeDefined();
    expect(requested?.extractedRelativePath).toBeNull();
    const resolution = resolvePlaybackLocation(SAME_UUID_SUPPLEMENTAL_ID, locationsById, canonicalById);
    expect(resolution.kind).toBe("fallback");
    if (resolution.kind === "fallback") {
      const fallbackLocation = locationsById.get(resolution.archiveAssetId);
      expect(fallbackLocation?.extractedRelativePath).toBe(resolution.extractedRelativePath);
      // Same canonical recording as the requested location — a real
      // equivalent, not an unrelated substitution.
      expect(fallbackLocation?.canonicalRecordingId).toBe(requested?.canonicalRecordingId);
    }
  });

  it("3. the unique supplemental-only record remains unavailable", () => {
    const requested = locationsById.get(SUPPLEMENTAL_UNIQUE_ID);
    expect(requested).toBeDefined();
    expect(requested?.extractedRelativePath).toBeNull();
    const resolution = resolvePlaybackLocation(SUPPLEMENTAL_UNIQUE_ID, locationsById, canonicalById);
    expect(resolution.kind).toBe("unavailable");
    // Still fully browsable/reviewable: it has a real canonical record.
    const canonical = canonicalById.get(requested!.canonicalRecordingId);
    expect(canonical).toBeDefined();
    expect(canonical?.playableEncodedLocationId).toBeNull();
    expect(canonical?.encodedLocationIds).toContain(SUPPLEMENTAL_UNIQUE_ID);
  });

  it("4. no generated URL/path ever references 00_ACQUISITION/", () => {
    // Exhaustive over all 60 supplemental locations plus every canonical
    // recording's chosen playable representative — the entire surface
    // resolvePlaybackLocation and playableEncodedLocationId can expose.
    const supplementalLocations = result.encodedLocations.filter(
      (l) => l.sourceClass === "supplemental-loose-audio",
    );
    expect(supplementalLocations.length).toBe(60);
    for (const loc of supplementalLocations) {
      const resolution = resolvePlaybackLocation(loc.archiveAssetId, locationsById, canonicalById);
      if (resolution.kind === "unavailable") continue;
      expect(resolution.extractedRelativePath).not.toContain("00_ACQUISITION");
      expect(resolution.extractedRelativePath.startsWith("/")).toBe(false);
    }
    for (const canonical of result.canonicalRecordings) {
      if (!canonical.playableEncodedLocationId) continue;
      const playable = locationsById.get(canonical.playableEncodedLocationId);
      expect(playable?.extractedRelativePath).not.toBeNull();
      expect(playable?.extractedRelativePath ?? "").not.toContain("00_ACQUISITION");
    }
  });

  it("5. canonical fallback is deterministic across repeated resolution and re-import", () => {
    const first = resolvePlaybackLocation(EXACT_DUPLICATE_SUPPLEMENTAL_ID, locationsById, canonicalById);
    const second = resolvePlaybackLocation(EXACT_DUPLICATE_SUPPLEMENTAL_ID, locationsById, canonicalById);
    expect(second).toEqual(first);

    // Re-run the full import from scratch and confirm the same fallback
    // representative is chosen again — determinism through the whole
    // pipeline, not just within one already-built index.
    const reimported = importSunoLibraryManifests(REAL_SOURCES);
    if (reimported.status === "BLOCKED") throw new Error("unexpected block on re-import");
    const reimportedLocationsById = indexEncodedLocationsById(reimported.encodedLocations);
    const reimportedCanonicalById = indexCanonicalRecordingsById(reimported.canonicalRecordings);
    const third = resolvePlaybackLocation(
      EXACT_DUPLICATE_SUPPLEMENTAL_ID,
      reimportedLocationsById,
      reimportedCanonicalById,
    );
    expect(third).toEqual(first);
  });

  it("reconciles exactly: 58 exact + 1 same-UUID = 59 represented, 1 supplemental-unique", () => {
    const supplementalLocations = result.encodedLocations.filter(
      (l) => l.sourceClass === "supplemental-loose-audio",
    );
    let representedCount = 0;
    let unavailableCount = 0;
    for (const loc of supplementalLocations) {
      const resolution = resolvePlaybackLocation(loc.archiveAssetId, locationsById, canonicalById);
      if (resolution.kind === "fallback") representedCount += 1;
      else if (resolution.kind === "unavailable") unavailableCount += 1;
    }
    expect(representedCount).toBe(59);
    expect(unavailableCount).toBe(1);
  });
});
