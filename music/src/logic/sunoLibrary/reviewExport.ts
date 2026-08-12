// Suno Library review export/import (0812_MUSIC_Suno-Library-Manifest-
// Integration_v1.0.0, §8 Persistence — "Review export"). Deterministic JSON
// envelope, mirroring machineLifeExport.ts's exact envelope pattern.
// Exports only editable human metadata — never archive-authority data or
// audio (spec §5.1/§8: no audio blob, no ZIP data, no extracted-mirror copy
// ever enters an export).

import type {
  SunoInterestMarker,
  SunoListeningRecord,
  SunoLibraryReviewExport,
  SunoSnapshotId,
} from "../../data/sunoLibraryTypes";
import { SUNO_LIBRARY_REVIEW_EXPORT_KIND, SUNO_LIBRARY_REVIEW_EXPORT_VERSION } from "../../data/sunoLibraryTypes";
import { downloadFile } from "../../data/exportPlaylist";

function sortedListeningRecords(records: SunoListeningRecord[]): SunoListeningRecord[] {
  return [...records].sort((a, b) => a.canonicalRecordingId.localeCompare(b.canonicalRecordingId));
}

function sortedInterestMarkers(markers: SunoInterestMarker[]): SunoInterestMarker[] {
  return [...markers].sort((a, b) => a.markerId.localeCompare(b.markerId));
}

/** Deterministic by construction: both arrays are always sorted before export. */
export function createSunoLibraryReviewExport(
  snapshotId: SunoSnapshotId,
  listeningRecords: SunoListeningRecord[],
  interestMarkers: SunoInterestMarker[],
  now: string,
): SunoLibraryReviewExport {
  return {
    exportKind: SUNO_LIBRARY_REVIEW_EXPORT_KIND,
    exportVersion: SUNO_LIBRARY_REVIEW_EXPORT_VERSION,
    snapshotId,
    exportedAt: now,
    listeningRecords: sortedListeningRecords(listeningRecords),
    interestMarkers: sortedInterestMarkers(interestMarkers),
  };
}

export function sunoLibraryReviewExportJson(exportData: SunoLibraryReviewExport): string {
  return JSON.stringify(exportData, null, 2);
}

export function downloadSunoLibraryReviewExport(
  snapshotId: SunoSnapshotId,
  listeningRecords: SunoListeningRecord[],
  interestMarkers: SunoInterestMarker[],
  now: string,
): string {
  const exportData = createSunoLibraryReviewExport(snapshotId, listeningRecords, interestMarkers, now);
  const dateStr = now.slice(0, 10);
  const filename = `SunoLibrary_Reviews_${snapshotId}_${dateStr}.json`;
  downloadFile(filename, sunoLibraryReviewExportJson(exportData), "application/json");
  return exportData.exportedAt;
}

// ── Re-import + round-trip validation ────────────────────────────────────

export type SunoLibraryReviewImportResult =
  | { ok: true; exportData: SunoLibraryReviewExport }
  | { ok: false; error: string };

export function parseSunoLibraryReviewExport(jsonText: string): SunoLibraryReviewImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false, error: "Could not parse review export JSON." };
  }
  if (!parsed || typeof parsed !== "object") return { ok: false, error: "Review export is not a JSON object." };
  const v = parsed as Record<string, unknown>;
  if (v.exportKind !== SUNO_LIBRARY_REVIEW_EXPORT_KIND) {
    return { ok: false, error: `Unexpected exportKind: ${String(v.exportKind)}` };
  }
  if (typeof v.snapshotId !== "string") return { ok: false, error: "Missing snapshotId." };
  if (!Array.isArray(v.listeningRecords)) return { ok: false, error: "Missing listeningRecords array." };
  if (!Array.isArray(v.interestMarkers)) return { ok: false, error: "Missing interestMarkers array." };
  return { ok: true, exportData: parsed as SunoLibraryReviewExport };
}

/**
 * Snapshot compatibility check (spec §8: "Re-import must validate snapshot
 * compatibility and reject ambiguous IDs").
 */
export function isSunoLibraryReviewExportCompatible(
  exportData: SunoLibraryReviewExport,
  currentSnapshotId: SunoSnapshotId,
): boolean {
  return exportData.snapshotId === currentSnapshotId;
}

/**
 * Merges a re-imported export into existing state idempotently: importing
 * the same export twice (or importing an export that only re-states
 * already-present records unchanged) produces the same result as importing
 * it once (spec §8: "Duplicate imports must be idempotent").
 */
export function mergeSunoLibraryReviewImport(
  existingListeningRecords: SunoListeningRecord[],
  existingInterestMarkers: SunoInterestMarker[],
  imported: SunoLibraryReviewExport,
): { listeningRecords: SunoListeningRecord[]; interestMarkers: SunoInterestMarker[] } {
  const listeningById = new Map(existingListeningRecords.map((r) => [r.canonicalRecordingId, r]));
  for (const record of imported.listeningRecords) {
    const existing = listeningById.get(record.canonicalRecordingId);
    if (!existing || existing.updatedAt < record.updatedAt) listeningById.set(record.canonicalRecordingId, record);
  }
  const markersById = new Map(existingInterestMarkers.map((m) => [m.markerId, m]));
  for (const marker of imported.interestMarkers) {
    const existing = markersById.get(marker.markerId);
    if (!existing || existing.updatedAt < marker.updatedAt) markersById.set(marker.markerId, marker);
  }
  return {
    listeningRecords: sortedListeningRecords(Array.from(listeningById.values())),
    interestMarkers: sortedInterestMarkers(Array.from(markersById.values())),
  };
}

/** Order-independent equality: sorts both sides before comparing. */
export function sunoLibraryReviewsRoundTripEquals(
  a: { listeningRecords: SunoListeningRecord[]; interestMarkers: SunoInterestMarker[] },
  b: { listeningRecords: SunoListeningRecord[]; interestMarkers: SunoInterestMarker[] },
): boolean {
  return (
    JSON.stringify(sortedListeningRecords(a.listeningRecords)) ===
      JSON.stringify(sortedListeningRecords(b.listeningRecords)) &&
    JSON.stringify(sortedInterestMarkers(a.interestMarkers)) === JSON.stringify(sortedInterestMarkers(b.interestMarkers))
  );
}
