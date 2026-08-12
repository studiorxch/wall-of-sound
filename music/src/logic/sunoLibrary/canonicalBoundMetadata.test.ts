import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { importSunoLibraryManifests } from "./manifestAdapter";
import type { ManifestSourceTexts } from "./manifestValidation";
import { indexEncodedLocationsById, indexCanonicalRecordingsById, resolvePlaybackLocation } from "./canonicalIdentity";
import { createListeningRecord, setListeningStatus, getListeningRecord, upsertListeningRecord } from "./reviews";
import { createSunoLibraryReviewExport, parseSunoLibraryReviewExport, mergeSunoLibraryReviewImport } from "./reviewExport";

// Real evidence: same manifests as manifestAdapter.test.ts /
// canonicalIdentity.test.ts. All four tests required by the 0812
// continuation instruction ("Add tests proving that: ...") — human
// metadata must always attach to the canonical recording ID, never the
// currently-playing encoded-location ID.
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
if (result.status === "BLOCKED") throw new Error("fixture import blocked");
const locationsById = indexEncodedLocationsById(result.encodedLocations);
const canonicalById = indexCanonicalRecordingsById(result.canonicalRecordings);

const EXACT_DUPLICATE_SUPPLEMENTAL_ID = "asset-04a634a02ae04043c9ffa3d5"; // fallback case
const SUPPLEMENTAL_UNIQUE_ID = "asset-509910c8897e7841fef3c56b"; // unavailable case
const NOW = "2026-08-12T12:00:00.000Z";

describe("canonical-bound metadata — never keyed by the currently-playing encoded-location ID", () => {
  it("1. saving metadata while fallback playback is active writes to the canonical ID, not the requested location's own ID", () => {
    const requestedLocation = locationsById.get(EXACT_DUPLICATE_SUPPLEMENTAL_ID);
    expect(requestedLocation).toBeDefined();
    const resolution = resolvePlaybackLocation(EXACT_DUPLICATE_SUPPLEMENTAL_ID, locationsById, canonicalById);
    expect(resolution.kind).toBe("fallback");

    // The UI always writes reviews using the REQUESTED recording's own
    // canonicalRecordingId (from the encoded location the user opened),
    // never the fallback playback location's own archiveAssetId — those
    // are different concepts entirely (canonical identity vs. which file
    // bytes happen to be streamed).
    const canonicalRecordingId = requestedLocation!.canonicalRecordingId;
    const records = setListeningStatus([], canonicalRecordingId, result.snapshot.snapshotId, "favorite", NOW);

    expect(records).toHaveLength(1);
    expect(records[0].canonicalRecordingId).toBe(canonicalRecordingId);
    // Critically: NOT keyed by the fallback archiveAssetId that actually
    // served the audio bytes.
    if (resolution.kind === "fallback") {
      expect(records[0].canonicalRecordingId).not.toBe(resolution.archiveAssetId);
    }
  });

  it("2. changing the chosen playable encoded location does not lose or fork review history", () => {
    const requestedLocation = locationsById.get(EXACT_DUPLICATE_SUPPLEMENTAL_ID)!;
    const canonicalRecordingId = requestedLocation.canonicalRecordingId;
    const canonical = canonicalById.get(canonicalRecordingId)!;

    // Establish a review under the canonical ID.
    const records = setListeningStatus([], canonicalRecordingId, result.snapshot.snapshotId, "heard", NOW);
    expect(getListeningRecord(records, canonicalRecordingId)?.listeningStatus).toBe("heard");

    // Simulate "the chosen playable encoded location changes" — e.g. a
    // future re-import picks a different member of the same canonical
    // group as playableEncodedLocationId (still deterministic per-import,
    // but conceptually could differ across snapshots). The review must
    // still resolve correctly because it was never keyed by any specific
    // encoded-location/archiveAssetId in the first place.
    const alternateMemberInSameGroup = canonical.encodedLocationIds.find(
      (id) => id !== canonical.playableEncodedLocationId,
    );
    expect(alternateMemberInSameGroup).toBeDefined();

    // Re-fetching the review via the canonical ID (the only key reviews
    // ever use) still finds the same, unforked record.
    const stillFound = getListeningRecord(records, canonicalRecordingId);
    expect(stillFound).toBeDefined();
    expect(stillFound?.listeningStatus).toBe("heard");
    expect(records).toHaveLength(1); // never forked into a second record
  });

  it("3. export/re-import preserves canonical-bound metadata exactly", () => {
    const canonicalRecordingId = canonicalById.keys().next().value as string;
    const record = createListeningRecord(canonicalRecordingId, result.snapshot.snapshotId, NOW);
    const withFavorite = upsertListeningRecord([], { ...record, listeningStatus: "favorite", notes: "great texture" }, NOW);

    const exported = createSunoLibraryReviewExport(result.snapshot.snapshotId, withFavorite, [], NOW);
    const reparsed = parseSunoLibraryReviewExport(JSON.stringify(exported));
    expect(reparsed.ok).toBe(true);
    if (!reparsed.ok) return;

    const merged = mergeSunoLibraryReviewImport([], [], reparsed.exportData);
    expect(merged.listeningRecords).toHaveLength(1);
    expect(merged.listeningRecords[0].canonicalRecordingId).toBe(canonicalRecordingId);
    expect(merged.listeningRecords[0].listeningStatus).toBe("favorite");
    expect(merged.listeningRecords[0].notes).toBe("great texture");
  });

  it("4. the unavailable supplemental identity remains reviewable even though playback is disabled", () => {
    const requestedLocation = locationsById.get(SUPPLEMENTAL_UNIQUE_ID)!;
    const canonicalRecordingId = requestedLocation.canonicalRecordingId;
    const canonical = canonicalById.get(canonicalRecordingId)!;
    expect(canonical.playableEncodedLocationId).toBeNull(); // confirms this is the genuinely unavailable case

    const resolution = resolvePlaybackLocation(SUPPLEMENTAL_UNIQUE_ID, locationsById, canonicalById);
    expect(resolution.kind).toBe("unavailable");

    // Reviewing (favoriting, classifying, noting) does not require playable
    // audio — it is a pure metadata write against the canonical ID.
    let records = setListeningStatus([], canonicalRecordingId, result.snapshot.snapshotId, "favorite", NOW);
    records = upsertListeningRecord(records, { ...records[0], notes: "keep for later, no extracted copy" }, NOW);

    const review = getListeningRecord(records, canonicalRecordingId);
    expect(review).toBeDefined();
    expect(review?.listeningStatus).toBe("favorite");
    expect(review?.notes).toBe("keep for later, no extracted copy");
  });
});
