import type { ExternalTrackRecord } from "../data/externalTrackTypes";

export function mergeExternalTrackPatch(
  existing: ExternalTrackRecord,
  patch: Partial<ExternalTrackRecord>,
): ExternalTrackRecord {
  const result: ExternalTrackRecord = { ...existing };
  for (const [key, patchVal] of Object.entries(patch)) {
    if (patchVal === undefined || patchVal === null || patchVal === "") continue;
    const existingVal = existing[key];
    if (existingVal !== undefined && existingVal !== null && existingVal !== "") continue;
    result[key] = patchVal;
  }
  return result;
}

export function validateExternalTrackRecord(record: ExternalTrackRecord): string[] {
  const warnings: string[] = [];
  if (!record.trackId) warnings.push("Missing required field: trackId");
  if (!record.artist) warnings.push("Missing required field: artist");
  if (!record.title) warnings.push("Missing required field: title");
  if (!record.filePath && !record.sourcePath) warnings.push("Missing recommended field: filePath or sourcePath");
  if (!record.filename) warnings.push("Missing recommended field: filename");
  if (!record.sourceZone) warnings.push("Missing recommended field: sourceZone");
  if (!record.identityStatus) warnings.push("Missing recommended field: identityStatus");
  return warnings;
}

export function repairExternalTrackRecord(record: ExternalTrackRecord): ExternalTrackRecord {
  const repaired: ExternalTrackRecord = { ...record };
  const warnings: string[] = [...(record.repairWarnings ?? [])];

  if (!repaired.sourceZone) {
    repaired.sourceZone = "external";
    warnings.push("sourceZone defaulted to 'external'");
  }

  if (!repaired.filename && repaired.filePath) {
    const parts = (repaired.filePath as string).split(/[\\/]/);
    repaired.filename = parts[parts.length - 1];
    warnings.push("filename derived from filePath");
  }

  if (!repaired.identityStatus) {
    repaired.identityStatus = "unverified";
    warnings.push("identityStatus defaulted to 'unverified'");
  }

  if (warnings.length > (record.repairWarnings?.length ?? 0)) {
    repaired.repairWarnings = warnings;
  }

  return repaired;
}
