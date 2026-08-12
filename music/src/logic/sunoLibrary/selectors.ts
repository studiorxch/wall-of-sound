// Suno Library Manifest Integration — derived/computed views.
//
// Pure, O(n) selectors over already-built collections and index maps —
// never re-scan the full 8,381-location/canonical-recording arrays inside
// a loop (spec §7.3: "Avoid repeated O(n²) grouping/filtering"). Callers
// (UI components) are responsible for memoizing these against their own
// dependency arrays; these functions themselves do no caching.

import type {
  SunoAssetKind,
  SunoBatch,
  SunoCanonicalRecording,
  SunoEncodedLocation,
  SunoLibraryImportResult,
  SunoListeningRecord,
  SunoWorkspace,
} from "../../data/sunoLibraryTypes";

export interface SunoOverviewStats {
  snapshotId: string;
  capturedAt: string;
  encodedLocationCount: number;
  canonicalRecordingCount: number;
  workspaceCount: number;
  batchCount: number;
  totalDurationSeconds: number;
  uuidLinkedCount: number;
  legacyNoIdCount: number;
  exactDuplicateGroupCount: number;
  alternateEncodingGroupCount: number;
  reviewedCount: number;
  unreviewedCount: number;
  assetKindDistribution: Record<SunoAssetKind, number>;
}

type LoadedImportResult = Extract<SunoLibraryImportResult, { status: "PASS" | "PASS_WITH_LIMITATION" }>;

const EMPTY_ASSET_KIND_DISTRIBUTION: Record<SunoAssetKind, number> = {
  unknown: 0,
  song: 0,
  sound: 0,
  loop: 0,
  environment: 0,
  transition: 0,
  voice: 0,
  stem: 0,
};

/**
 * Never labels the 8,381 encoded-location count as a song/unique-recording
 * count (spec: "Never label encoded-location count as unique song count") —
 * canonicalRecordingCount is reported as a fully separate field, both
 * derived directly from the adapter's own result, never recomputed.
 */
export function computeOverviewStats(
  result: LoadedImportResult,
  listeningRecordsByCanonicalId: Map<string, SunoListeningRecord>,
): SunoOverviewStats {
  const assetKindDistribution: Record<SunoAssetKind, number> = { ...EMPTY_ASSET_KIND_DISTRIBUTION };
  let reviewedCount = 0;
  for (const rec of result.canonicalRecordings) {
    const review = listeningRecordsByCanonicalId.get(rec.canonicalRecordingId);
    const kind = review?.assetKind ?? "unknown";
    assetKindDistribution[kind] += 1;
    if (review && review.listeningStatus !== "unheard") reviewedCount += 1;
  }
  return {
    snapshotId: result.snapshot.snapshotId,
    capturedAt: result.snapshot.capturedAt,
    encodedLocationCount: result.snapshot.encodedLocationCount,
    canonicalRecordingCount: result.canonicalRecordings.length,
    workspaceCount: result.snapshot.workspaceCount,
    batchCount: result.snapshot.batchCount,
    totalDurationSeconds: result.snapshot.totalDurationSeconds,
    uuidLinkedCount: result.snapshot.uuidLinkedCount,
    legacyNoIdCount: result.snapshot.legacyNoIdCount,
    exactDuplicateGroupCount: result.snapshot.exactDuplicateGroupCount,
    alternateEncodingGroupCount: result.snapshot.alternateEncodingGroupCount,
    reviewedCount,
    unreviewedCount: result.canonicalRecordings.length - reviewedCount,
    assetKindDistribution,
  };
}

export function indexListeningRecordsByCanonicalId(
  records: SunoListeningRecord[],
): Map<string, SunoListeningRecord> {
  return new Map(records.map((r) => [r.canonicalRecordingId, r]));
}

export function indexWorkspacesBySlug(workspaces: SunoWorkspace[]): Map<string, SunoWorkspace> {
  return new Map(workspaces.map((w) => [w.workspaceSlug, w]));
}

export function indexBatchesById(batches: SunoBatch[]): Map<string, SunoBatch> {
  return new Map(batches.map((b) => [b.batchId, b]));
}

export function batchesForWorkspace(batches: SunoBatch[], workspaceSlug: string): SunoBatch[] {
  return batches
    .filter((b) => b.workspaceSlug === workspaceSlug)
    .sort((a, b) => a.inferredBatchOrdinal - b.inferredBatchOrdinal);
}

export function canonicalRecordingsForWorkspace(
  canonicalRecordings: SunoCanonicalRecording[],
  workspaceSlug: string,
): SunoCanonicalRecording[] {
  return canonicalRecordings.filter((r) => r.workspaceSlugs.includes(workspaceSlug));
}

export function canonicalRecordingsForBatch(
  canonicalRecordings: SunoCanonicalRecording[],
  encodedLocationsById: Map<string, SunoEncodedLocation>,
  batchId: string,
): SunoCanonicalRecording[] {
  return canonicalRecordings.filter((r) =>
    r.encodedLocationIds.some((id) => encodedLocationsById.get(id)?.batchId === batchId),
  );
}

export function encodedLocationsForCanonicalRecording(
  canonical: SunoCanonicalRecording,
  encodedLocationsById: Map<string, SunoEncodedLocation>,
): SunoEncodedLocation[] {
  return canonical.encodedLocationIds
    .map((id) => encodedLocationsById.get(id))
    .filter((loc): loc is SunoEncodedLocation => loc !== undefined);
}
