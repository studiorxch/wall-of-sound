import { describe, expect, it } from "vitest";
import {
  createListeningRecord,
  createInterestMarker,
  upsertListeningRecord,
  upsertInterestMarker,
  setListeningStatus,
  toggleSuggestedUse,
  validateMarkerRange,
  removeInterestMarker,
} from "./reviews";
import {
  createSunoLibraryReviewExport,
  parseSunoLibraryReviewExport,
  mergeSunoLibraryReviewImport,
  sunoLibraryReviewsRoundTripEquals,
} from "./reviewExport";

const SNAPSHOT_ID = "suno-snapshot-2026-08-11-full";
const NOW = "2026-08-12T12:00:00.000Z";
const LATER = "2026-08-12T13:00:00.000Z";

describe("listening records — never interpret unheard/not-favorite as negative", () => {
  it("defaults to unheard, unknown kind, no suggested uses, empty notes", () => {
    const record = createListeningRecord("uuid:abc", SNAPSHOT_ID, NOW);
    expect(record.listeningStatus).toBe("unheard");
    expect(record.assetKind).toBe("unknown");
    expect(record.suggestedUses).toEqual([]);
    expect(record.notes).toBe("");
    expect(record.trainingEligibility).toBe("excluded-suno-terms");
  });

  it("upsert replaces an existing record by canonicalRecordingId, not append", () => {
    const first = createListeningRecord("uuid:abc", SNAPSHOT_ID, NOW);
    const records = upsertListeningRecord([], first, NOW);
    const updated = setListeningStatus(records, "uuid:abc", SNAPSHOT_ID, "favorite", LATER);
    expect(updated.length).toBe(1);
    expect(updated[0].listeningStatus).toBe("favorite");
    expect(updated[0].updatedAt).toBe(LATER);
    expect(updated[0].createdAt).toBe(NOW);
  });

  it("toggling a suggested use adds then removes it", () => {
    let records = upsertListeningRecord([], createListeningRecord("uuid:abc", SNAPSHOT_ID, NOW), NOW);
    records = toggleSuggestedUse(records, "uuid:abc", SNAPSHOT_ID, "radio", LATER);
    expect(records[0].suggestedUses).toEqual(["radio"]);
    records = toggleSuggestedUse(records, "uuid:abc", SNAPSHOT_ID, "radio", LATER);
    expect(records[0].suggestedUses).toEqual([]);
  });
});

describe("interest markers — range validation", () => {
  it("rejects a negative start", () => {
    const result = validateMarkerRange({ startSeconds: -1, endSeconds: null }, 120);
    expect(result.valid).toBe(false);
  });

  it("rejects end <= start", () => {
    const result = validateMarkerRange({ startSeconds: 30, endSeconds: 30 }, 120);
    expect(result.valid).toBe(false);
  });

  it("rejects a start beyond known duration", () => {
    const result = validateMarkerRange({ startSeconds: 200, endSeconds: null }, 120);
    expect(result.valid).toBe(false);
  });

  it("accepts a valid range within duration", () => {
    const result = validateMarkerRange({ startSeconds: 10, endSeconds: 20 }, 120);
    expect(result.valid).toBe(true);
  });

  it("accepts a valid range when duration is unknown", () => {
    const result = validateMarkerRange({ startSeconds: 10, endSeconds: 20 }, null);
    expect(result.valid).toBe(true);
  });

  it("upsert-then-remove by markerId", () => {
    const marker = createInterestMarker("uuid:abc", 12.5, "hook", NOW, "marker-1");
    let markers = upsertInterestMarker([], marker, NOW);
    expect(markers.length).toBe(1);
    markers = removeInterestMarker(markers, "marker-1");
    expect(markers.length).toBe(0);
  });
});

describe("review export/re-import — spec §12.1 tests 15-16", () => {
  it("15. export then re-parse round-trips equal", () => {
    const records = [createListeningRecord("uuid:abc", SNAPSHOT_ID, NOW)];
    const markers = [createInterestMarker("uuid:abc", 5, "drop", NOW, "marker-1")];
    const exported = createSunoLibraryReviewExport(SNAPSHOT_ID, records, markers, NOW);
    const json = JSON.stringify(exported);
    const parsed = parseSunoLibraryReviewExport(json);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(
      sunoLibraryReviewsRoundTripEquals(
        { listeningRecords: records, interestMarkers: markers },
        { listeningRecords: parsed.exportData.listeningRecords, interestMarkers: parsed.exportData.interestMarkers },
      ),
    ).toBe(true);
  });

  it("rejects a malformed export (wrong exportKind)", () => {
    const parsed = parseSunoLibraryReviewExport(JSON.stringify({ exportKind: "SOMETHING_ELSE" }));
    expect(parsed.ok).toBe(false);
  });

  it("16. re-importing the same export twice is idempotent", () => {
    const records = [createListeningRecord("uuid:abc", SNAPSHOT_ID, NOW)];
    const markers = [createInterestMarker("uuid:abc", 5, "drop", NOW, "marker-1")];
    const exported = createSunoLibraryReviewExport(SNAPSHOT_ID, records, markers, NOW);

    const firstMerge = mergeSunoLibraryReviewImport([], [], exported);
    const secondMerge = mergeSunoLibraryReviewImport(
      firstMerge.listeningRecords,
      firstMerge.interestMarkers,
      exported,
    );
    expect(secondMerge).toEqual(firstMerge);
  });

  it("merge prefers the newer updatedAt when re-importing an edited export", () => {
    const original = createListeningRecord("uuid:abc", SNAPSHOT_ID, NOW);
    const exported = createSunoLibraryReviewExport(SNAPSHOT_ID, [original], [], NOW);
    const locallyEdited = upsertListeningRecord([], { ...original, listeningStatus: "favorite" }, LATER);

    const merged = mergeSunoLibraryReviewImport(locallyEdited, [], exported);
    // The local edit is newer than the (older) exported snapshot, so it wins.
    expect(merged.listeningRecords[0].listeningStatus).toBe("favorite");
  });
});
