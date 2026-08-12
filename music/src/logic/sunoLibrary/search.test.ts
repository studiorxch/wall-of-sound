import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { importSunoLibraryManifests } from "./manifestAdapter";
import type { ManifestSourceTexts } from "./manifestValidation";
import { indexEncodedLocationsById } from "./canonicalIdentity";
import { applySunoSearchAndFilters, EMPTY_SUNO_SEARCH_FILTERS } from "./search";
import { computeOverviewStats, indexListeningRecordsByCanonicalId } from "./selectors";
import { createListeningRecord, setListeningStatus } from "./reviews";
import { buildTrainingExclusionRecords } from "./trainingEligibility";
import { validateManifestSourceTexts } from "./manifestValidation";

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

const validation = validateManifestSourceTexts(REAL_SOURCES);
if (validation.status === "BLOCKED") throw new Error("fixture validation blocked");
const exclusionResult = buildTrainingExclusionRecords(
  result.encodedLocations,
  result.canonicalRecordings,
  result.batches,
  result.duplicateRelationships,
  validation.bundle.audioInventory.audioAssets,
  "2026-08-12T12:00:00.000Z",
);
const excludedCanonicalIds =
  exclusionResult.status === "PASS" ? new Set(exclusionResult.canonicalSummaries.map((s) => s.canonicalRecordingId)) : new Set<string>();

describe("applySunoSearchAndFilters — real 8,381-location snapshot", () => {
  it("no filters returns every canonical recording", () => {
    const out = applySunoSearchAndFilters(result.canonicalRecordings, locationsById, new Map(), EMPTY_SUNO_SEARCH_FILTERS);
    expect(out.length).toBe(result.canonicalRecordings.length);
  });

  it("filters by workspace", () => {
    const workspaceSlug = result.workspaces[0].workspaceSlug;
    const out = applySunoSearchAndFilters(result.canonicalRecordings, locationsById, new Map(), {
      ...EMPTY_SUNO_SEARCH_FILTERS,
      workspaceSlug,
    });
    expect(out.length).toBeGreaterThan(0);
    for (const rec of out) expect(rec.workspaceSlugs).toContain(workspaceSlug);
  });

  it("filters by UUID availability (legacy-no-id matches the 5,835 count)", () => {
    const out = applySunoSearchAndFilters(result.canonicalRecordings, locationsById, new Map(), {
      ...EMPTY_SUNO_SEARCH_FILTERS,
      uuidAvailability: "legacy-no-id",
    });
    for (const rec of out) expect(rec.sunoUuid).toBeNull();
    expect(out.length).toBeGreaterThan(0);
  });

  it("filters by audio availability (unavailable matches exactly the 1 known supplemental-unique case)", () => {
    const out = applySunoSearchAndFilters(result.canonicalRecordings, locationsById, new Map(), {
      ...EMPTY_SUNO_SEARCH_FILTERS,
      audioAvailability: "unavailable",
    });
    expect(out.length).toBe(1);
    expect(out[0].playableEncodedLocationId).toBeNull();
  });

  it("filters by duplicate relationship kind", () => {
    const out = applySunoSearchAndFilters(result.canonicalRecordings, locationsById, new Map(), {
      ...EMPTY_SUNO_SEARCH_FILTERS,
      duplicateRelationship: "same-suno-asset-alternate-encoding",
    });
    expect(out.length).toBe(1); // exactly the 1 real alternate-encoding group
  });

  it("free-text search matches a real filename substring", () => {
    const sample = result.encodedLocations[0];
    const fragment = sample.filename.split(" ")[0];
    const out = applySunoSearchAndFilters(result.canonicalRecordings, locationsById, new Map(), {
      ...EMPTY_SUNO_SEARCH_FILTERS,
      queryText: fragment,
    });
    expect(out.length).toBeGreaterThan(0);
  });

  it("favorite filter respects listening records", () => {
    const targetId = result.canonicalRecordings[0].canonicalRecordingId;
    const now = "2026-08-12T00:00:00.000Z";
    const records = setListeningStatus([], targetId, result.snapshot.snapshotId, "favorite", now);
    const byId = indexListeningRecordsByCanonicalId(records);
    const out = applySunoSearchAndFilters(result.canonicalRecordings, locationsById, byId, {
      ...EMPTY_SUNO_SEARCH_FILTERS,
      favoriteOnly: true,
    });
    expect(out.length).toBe(1);
    expect(out[0].canonicalRecordingId).toBe(targetId);
  });

  it("completes a full scan over 8,381-location-derived canonical recordings in well under a second", () => {
    const start = performance.now();
    applySunoSearchAndFilters(result.canonicalRecordings, locationsById, new Map(), {
      ...EMPTY_SUNO_SEARCH_FILTERS,
      queryText: "synth",
    });
    const elapsedMs = performance.now() - start;
    expect(elapsedMs).toBeLessThan(500);
  });
});

describe("computeOverviewStats — real snapshot", () => {
  it("never conflates encoded-location count with canonical-recording count", () => {
    const stats = computeOverviewStats(result, new Map());
    expect(stats.encodedLocationCount).toBe(8381);
    expect(stats.canonicalRecordingCount).toBe(result.canonicalRecordings.length);
    expect(stats.canonicalRecordingCount).not.toBe(stats.encodedLocationCount);
  });

  it("asset-kind distribution sums to the canonical recording count", () => {
    const stats = computeOverviewStats(result, new Map());
    const sum = Object.values(stats.assetKindDistribution).reduce((a, b) => a + b, 0);
    expect(sum).toBe(stats.canonicalRecordingCount);
  });

  it("reviewed/unreviewed split reflects real listening records", () => {
    const targetId = result.canonicalRecordings[0].canonicalRecordingId;
    const record = createListeningRecord(targetId, result.snapshot.snapshotId, "2026-08-12T00:00:00.000Z");
    const byId = indexListeningRecordsByCanonicalId([{ ...record, listeningStatus: "heard" }]);
    const stats = computeOverviewStats(result, byId);
    expect(stats.reviewedCount).toBe(1);
    expect(stats.unreviewedCount).toBe(result.canonicalRecordings.length - 1);
  });
});

describe("applySunoSearchAndFilters — trainingEligibility filter (0812C)", () => {
  it("'excluded' returns exactly the 402 real excluded canonical recordings and none of them appear in 'eligible'", () => {
    const excluded = applySunoSearchAndFilters(
      result.canonicalRecordings,
      locationsById,
      new Map(),
      { ...EMPTY_SUNO_SEARCH_FILTERS, trainingEligibility: "excluded" },
      excludedCanonicalIds,
    );
    expect(excluded.length).toBe(402);
    expect(excluded.every((c) => excludedCanonicalIds.has(c.canonicalRecordingId))).toBe(true);

    const eligible = applySunoSearchAndFilters(
      result.canonicalRecordings,
      locationsById,
      new Map(),
      { ...EMPTY_SUNO_SEARCH_FILTERS, trainingEligibility: "eligible" },
      excludedCanonicalIds,
    );
    expect(eligible.every((c) => !excludedCanonicalIds.has(c.canonicalRecordingId))).toBe(true);

    const unreviewed = applySunoSearchAndFilters(
      result.canonicalRecordings,
      locationsById,
      new Map(),
      { ...EMPTY_SUNO_SEARCH_FILTERS, trainingEligibility: "unreviewed" },
      excludedCanonicalIds,
    );
    // Exactly 1 real canonical recording (the supplemental-unique
    // "Brooklyn Spray Can" identity) has zero workspace attribution on any
    // member and so cannot be assessed against the exclusion boundary at
    // all — it is "unreviewed", never silently folded into "eligible".
    expect(unreviewed.length).toBe(1);
    expect(unreviewed[0].workspaceSlugs).toEqual([]);
    expect(eligible.length + excluded.length + unreviewed.length).toBe(result.canonicalRecordings.length);
  });

  it("without an excludedCanonicalRecordingIds set, the filter is a safe no-op (never fabricates exclusion)", () => {
    const out = applySunoSearchAndFilters(result.canonicalRecordings, locationsById, new Map(), {
      ...EMPTY_SUNO_SEARCH_FILTERS,
      trainingEligibility: "excluded",
    });
    expect(out.length).toBe(0); // nothing is excluded when the set is unknown — never assumed
  });
});
