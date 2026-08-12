// Suno Training Eligibility Exclusions — deterministic report export
// (0812C_MUSIC_Suno-Training-Eligibility-Exclusions_v1.0.1). One-way report
// only (no re-import path) — this is a machine/human decision audit trail,
// not editable human metadata like the review export.

import type { SunoTrainingExclusionBuildResult, SunoTrainingExclusionExport } from "../../data/sunoTrainingExclusionTypes";
import { SUNO_TRAINING_EXCLUSION_EXPORT_KIND, SUNO_TRAINING_EXCLUSION_EXPORT_VERSION } from "../../data/sunoTrainingExclusionTypes";
import { downloadFile } from "../../data/exportPlaylist";

/** Deterministic by construction: buildTrainingExclusionRecords already sorts every array it returns. */
export function createTrainingExclusionExport(
  result: SunoTrainingExclusionBuildResult,
  now: string,
): SunoTrainingExclusionExport {
  if (result.status !== "PASS") {
    return {
      exportKind: SUNO_TRAINING_EXCLUSION_EXPORT_KIND,
      exportVersion: SUNO_TRAINING_EXCLUSION_EXPORT_VERSION,
      exportedAt: now,
      workspaceAuthority: [],
      classificationCounts: [],
      locationRecords: [],
      canonicalSummaries: [],
    };
  }
  return {
    exportKind: SUNO_TRAINING_EXCLUSION_EXPORT_KIND,
    exportVersion: SUNO_TRAINING_EXCLUSION_EXPORT_VERSION,
    exportedAt: now,
    workspaceAuthority: result.workspaceAuthority,
    classificationCounts: result.classificationCounts,
    locationRecords: result.locationRecords,
    canonicalSummaries: result.canonicalSummaries,
  };
}

export function trainingExclusionExportJson(exportData: SunoTrainingExclusionExport): string {
  return JSON.stringify(exportData, null, 2);
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

const CSV_COLUMNS = [
  "encodedLocationId",
  "canonicalRecordingId",
  "workspaceSlug",
  "workspaceNameOriginal",
  "propagationSource",
  "provenanceClassification",
  "provenanceConfidence",
  "reviewableForClearance",
  "archiveStatus",
  "commercialStatus",
  "eligibilityStatus",
  "exclusionCode",
  "exclusionReason",
  "decisionAuthority",
  "decidedAt",
] as const;

export function trainingExclusionExportCsv(exportData: SunoTrainingExclusionExport): string {
  const rows = exportData.locationRecords.map((r) =>
    [
      r.encodedLocationId,
      r.canonicalRecordingId,
      r.workspaceSlug ?? "",
      r.workspaceNameOriginal ?? "",
      r.isDirectWorkspaceMember ? "direct" : "propagated-via-canonical-group",
      r.provenance.classification,
      r.provenance.confidence,
      String(r.provenance.reviewableForClearance),
      r.archiveStatus,
      r.commercialStatus,
      r.eligibilityStatus,
      r.exclusionCode ?? "",
      r.exclusionReason ?? "",
      r.decisionAuthority,
      r.decidedAt,
    ]
      .map((v) => csvEscape(String(v)))
      .join(","),
  );
  return [CSV_COLUMNS.join(","), ...rows].join("\n");
}

export function downloadTrainingExclusionExport(result: SunoTrainingExclusionBuildResult, now: string): void {
  const exportData = createTrainingExclusionExport(result, now);
  const dateStr = now.slice(0, 10);
  downloadFile(`SunoTrainingExclusions_${dateStr}.json`, trainingExclusionExportJson(exportData), "application/json");
  downloadFile(`SunoTrainingExclusions_${dateStr}.csv`, trainingExclusionExportCsv(exportData), "text/csv");
}
