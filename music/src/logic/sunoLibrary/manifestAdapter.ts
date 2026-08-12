// Suno Library Manifest Integration — manifest adapter.
//
// Orchestrates validation (manifestValidation.ts) and canonical identity
// resolution (canonicalIdentity.ts) into the full domain-typed
// SunoLibraryImportResult. Pure — operates on already-read file text;
// callers own filesystem/HTTP I/O so this runs identically against real
// WOS-share manifests or synthetic test fixtures.

import type {
  SunoBatch,
  SunoDuplicateRelationship,
  SunoDuplicateRelationshipKind,
  SunoEncodedLocation,
  SunoEncodedLocationSourceClass,
  SunoLibraryImportResult,
  SunoLibrarySnapshot,
  SunoMediaStatus,
  SunoWorkspace,
  SunoEmbeddedIdRecoveryState,
  SunoZipStatus,
  SunoCollisionAnnotation,
  SunoImportWarning,
} from "../../data/sunoLibraryTypes";
import {
  validateManifestSourceTexts,
  type ManifestSourceTexts,
  type RawAudioAsset,
  type RawZipBatch,
  type RawManifestBundle,
} from "./manifestValidation";
import { buildCanonicalIdentities } from "./canonicalIdentity";

function basename(relativeOrName: string): string {
  const segments = relativeOrName.split(/[\\/]/);
  return segments[segments.length - 1] ?? relativeOrName;
}

function deriveCollisionAnnotation(asset: RawAudioAsset): SunoCollisionAnnotation {
  const originalBasename =
    asset.sourceClass === "zip-batch-member"
      ? asset.zipMemberPath
        ? basename(asset.zipMemberPath)
        : null
      : asset.supplementalRelativePath
        ? basename(asset.supplementalRelativePath)
        : null;
  // Supplemental locations have no extracted copy (extractedRelativePath is
  // null) — collision renaming is an extraction-time concern, so it never
  // applies to them; fall back to the original name for display purposes.
  const derivedBasename = asset.extractedRelativePath ? basename(asset.extractedRelativePath) : (originalBasename ?? asset.filename);
  const isCollisionRenamed =
    asset.extractedRelativePath !== null && originalBasename !== null && originalBasename !== derivedBasename;
  return {
    isCollisionRenamed,
    originalMemberBasename: originalBasename,
    derivedBasename,
    note: isCollisionRenamed
      ? `Extracted filename "${derivedBasename}" differs from the original member name "${originalBasename}" — a filesystem-fold-collision-safe suffix was applied during extraction.`
      : null,
  };
}

function deriveBatchId(zip: Pick<RawZipBatch, "sha256">): string {
  return `batch:${zip.sha256}`;
}

function mapZipStatus(raw: string): SunoZipStatus {
  const known: SunoZipStatus[] = [
    "valid",
    "valid-with-unexpected-files",
    "empty",
    "corrupt",
    "encrypted",
    "unsafe-paths",
    "unreadable",
  ];
  return (known as string[]).includes(raw) ? (raw as SunoZipStatus) : "unreadable";
}

function mapMediaStatus(raw: string): SunoMediaStatus {
  const known: SunoMediaStatus[] = [
    "valid",
    "valid-with-metadata-warning",
    "decode-failed",
    "probe-failed",
    "zero-duration",
    "unsupported-codec",
  ];
  return (known as string[]).includes(raw) ? (raw as SunoMediaStatus) : "probe-failed";
}

function mapRecoveryState(raw: string): SunoEmbeddedIdRecoveryState {
  const known: SunoEmbeddedIdRecoveryState[] = [
    "embedded-id",
    "legacy-no-embedded-id",
    "invalid-embedded-id",
    "conflicting-embedded-ids",
  ];
  return (known as string[]).includes(raw) ? (raw as SunoEmbeddedIdRecoveryState) : "legacy-no-embedded-id";
}

function mapDuplicateRelationshipKind(raw: string): SunoDuplicateRelationshipKind {
  const known: SunoDuplicateRelationshipKind[] = [
    "exact-file-duplicate",
    "same-suno-asset-alternate-encoding",
    "identity-conflict",
  ];
  return (known as string[]).includes(raw) ? (raw as SunoDuplicateRelationshipKind) : "identity-conflict";
}

function mapSourceClass(raw: string): SunoEncodedLocationSourceClass {
  return raw === "supplemental-loose-audio" ? "supplemental-loose-audio" : "zip-batch-member";
}

function buildSnapshot(
  bundle: RawManifestBundle,
  encodedLocations: SunoEncodedLocation[],
  batches: SunoBatch[],
  workspaces: SunoWorkspace[],
  duplicateRelationships: SunoDuplicateRelationship[],
): SunoLibrarySnapshot {
  const uuidLinkedCount = encodedLocations.filter((l) => l.provider.recoveryState === "embedded-id").length;
  const legacyNoIdCount = encodedLocations.filter(
    (l) => l.provider.recoveryState === "legacy-no-embedded-id",
  ).length;
  const totalDurationSeconds = encodedLocations.reduce((sum, l) => sum + l.technical.durationSeconds, 0);
  const totalStorageBytes = encodedLocations.reduce((sum, l) => sum + l.technical.byteSize, 0);
  const extractedLocationCount = encodedLocations.filter((l) => l.sourceClass === "zip-batch-member").length;
  const supplementalLocationCount = encodedLocations.filter(
    (l) => l.sourceClass === "supplemental-loose-audio",
  ).length;

  return {
    snapshotId: bundle.acquisitionSnapshot.snapshotIdentity.snapshotId,
    schemaVersion: bundle.acquisitionSnapshot.snapshotIdentity.schemaVersion,
    capturedAt: bundle.acquisitionSnapshot.snapshotIdentity.capturedAt,
    sourcePath: bundle.acquisitionSnapshot.snapshotIdentity.sourcePath,
    workspaceCount: workspaces.length,
    batchCount: batches.length,
    encodedLocationCount: encodedLocations.length,
    extractedLocationCount,
    supplementalLocationCount,
    totalDurationSeconds,
    totalStorageBytes,
    uuidLinkedCount,
    legacyNoIdCount,
    exactDuplicateGroupCount: duplicateRelationships.filter((r) => r.relationship === "exact-file-duplicate")
      .length,
    alternateEncodingGroupCount: duplicateRelationships.filter(
      (r) => r.relationship === "same-suno-asset-alternate-encoding",
    ).length,
    identityConflictCount: duplicateRelationships.filter((r) => r.relationship === "identity-conflict").length,
  };
}

/**
 * Parses and validates the five WOS-share authority manifests (as already-
 * read text — see module doc) and produces the full SunoLibraryImportResult.
 * Never touches the filesystem or the extracted mirror; archive availability
 * is checked separately (archiveAvailability.ts).
 */
export function importSunoLibraryManifests(sources: ManifestSourceTexts): SunoLibraryImportResult {
  const validation = validateManifestSourceTexts(sources);
  if (validation.status === "BLOCKED") {
    return { status: "BLOCKED", reasons: validation.reasons, messages: validation.messages };
  }

  const { bundle, warnings: validationWarnings } = validation;
  const importWarnings: SunoImportWarning[] = validationWarnings.map((message) => ({
    code: "collision-metadata-derived-only" as const,
    message,
  }));

  // Batches, keyed by ZIP sha256 for cross-referencing from audio assets.
  const batchBySha256 = new Map<string, RawZipBatch>();
  for (const zip of bundle.acquisitionSnapshot.zipBatches) batchBySha256.set(zip.sha256, zip);

  const batches: SunoBatch[] = bundle.acquisitionSnapshot.zipBatches
    .map((zip) => ({
      batchId: deriveBatchId(zip),
      snapshotId: bundle.acquisitionSnapshot.snapshotIdentity.snapshotId,
      workspaceSlug: zip.workspaceSlug,
      inferredBatchOrdinal: zip.inferredBatchOrdinal,
      batchInferenceMethod: "browser-filename-suffix" as const,
      chronologyConfidence: "local-download-order-only" as const,
      zipFilename: zip.filename,
      zipRelativeSourcePath: zip.relativeSourcePath,
      zipSha256: zip.sha256,
      zipByteSize: zip.byteSize,
      zipStatus: mapZipStatus(zip.status),
      totalMemberCount: zip.totalMemberCount,
      audioMemberCount: zip.audioMemberCount,
      nonAudioMemberCount: zip.nonAudioMemberCount,
      encryptedMemberCount: zip.encryptedMemberCount,
      unsafeMemberCount: zip.unsafeMemberCount,
      duplicateMemberPathCount: zip.duplicateMemberPathCount,
      warnings: zip.warnings,
    }))
    .sort((a, b) => a.batchId.localeCompare(b.batchId));

  // Workspaces, derived from distinct (workspaceSlug, workspaceNameOriginal)
  // pairs across batches — supplemental assets carry no workspace.
  const workspaceMap = new Map<string, SunoWorkspace>();
  for (const zip of bundle.acquisitionSnapshot.zipBatches) {
    const existing = workspaceMap.get(zip.workspaceSlug);
    if (existing) {
      existing.batchCount += 1;
      continue;
    }
    workspaceMap.set(zip.workspaceSlug, {
      workspaceSlug: zip.workspaceSlug,
      workspaceNameOriginal: zip.workspaceNameOriginal,
      snapshotId: bundle.acquisitionSnapshot.snapshotIdentity.snapshotId,
      batchCount: 1,
      encodedLocationCount: 0, // filled in below
    });
  }

  // Encoded locations.
  const encodedLocations: SunoEncodedLocation[] = bundle.audioInventory.audioAssets
    .map((asset): SunoEncodedLocation => {
      const zip = asset.sourceZipSha256 ? batchBySha256.get(asset.sourceZipSha256) : undefined;
      const workspace = asset.workspaceSlug ? workspaceMap.get(asset.workspaceSlug) : undefined;
      if (workspace) workspace.encodedLocationCount += 1;

      return {
        archiveAssetId: asset.assetId,
        snapshotId: asset.snapshotId,
        workspaceSlug: asset.workspaceSlug,
        workspaceNameOriginal: workspace?.workspaceNameOriginal ?? zip?.workspaceNameOriginal ?? null,
        batchId: zip ? deriveBatchId(zip) : null,
        inferredBatchOrdinal: asset.batchOrdinal,
        sourceClass: mapSourceClass(asset.sourceClass),
        originalMemberPath: asset.zipMemberPath,
        supplementalRelativePath: asset.supplementalRelativePath,
        extractedRelativePath: asset.extractedRelativePath,
        filename: asset.filename,
        collision: deriveCollisionAnnotation(asset),
        technical: {
          containerFormat: asset.containerFormat,
          audioCodec: asset.audioCodec,
          durationSeconds: asset.durationSeconds,
          sampleRate: asset.sampleRate,
          channelCount: asset.channelCount,
          channelLayout: asset.channelLayout,
          bitrate: asset.bitrate,
          byteSize: asset.byteSize,
          sha256: asset.sha256,
          mediaStatus: mapMediaStatus(asset.mediaStatus),
        },
        provider: {
          recoveryState: mapRecoveryState(asset.embeddedMetadata.recoveryState),
          sunoUuid: asset.embeddedMetadata.sunoUuid,
          sunoUrl: asset.embeddedMetadata.sunoUrl,
          embeddedTitle: asset.embeddedMetadata.title,
          embeddedAuthor: asset.embeddedMetadata.author,
          embeddedCreatedAt: asset.embeddedMetadata.createdAt,
          rawComment: asset.embeddedMetadata.rawComment,
        },
        duplicateGroupIds: [], // filled in below
        canonicalRecordingId: "", // filled in below
      };
    })
    .sort((a, b) => a.archiveAssetId.localeCompare(b.archiveAssetId));

  const workspaces = Array.from(workspaceMap.values()).sort((a, b) =>
    a.workspaceSlug.localeCompare(b.workspaceSlug),
  );

  // Duplicate relationships.
  const duplicateRelationships: SunoDuplicateRelationship[] = bundle.duplicateGroups.duplicateGroups
    .map((g) => ({
      groupId: g.groupId,
      relationship: mapDuplicateRelationshipKind(g.relationship),
      archiveAssetIds: g.assetIds,
      sha256: g.sha256,
      sunoUuid: g.sunoUuid,
      note: g.note,
    }))
    .sort((a, b) => a.groupId.localeCompare(b.groupId));

  const groupsByAssetId = new Map<string, string[]>();
  for (const rel of duplicateRelationships) {
    for (const assetId of rel.archiveAssetIds) {
      const existing = groupsByAssetId.get(assetId);
      if (existing) existing.push(rel.groupId);
      else groupsByAssetId.set(assetId, [rel.groupId]);
    }
  }
  for (const location of encodedLocations) {
    location.duplicateGroupIds = (groupsByAssetId.get(location.archiveAssetId) ?? []).sort();
  }

  // Canonical identity.
  const { canonicalRecordings, canonicalRecordingIdByAssetId } = buildCanonicalIdentities(
    bundle.acquisitionSnapshot.snapshotIdentity.snapshotId,
    encodedLocations,
    duplicateRelationships,
  );
  for (const location of encodedLocations) {
    location.canonicalRecordingId =
      canonicalRecordingIdByAssetId.get(location.archiveAssetId) ?? `asset:${location.archiveAssetId}`;
  }

  // Legacy-no-UUID and identity-conflict warnings (spec §7.2 — these never
  // block; they are always surfaced, never silently discarded).
  const legacyCount = encodedLocations.filter(
    (l) => l.provider.recoveryState === "legacy-no-embedded-id",
  ).length;
  if (legacyCount > 0) {
    importWarnings.push({
      code: "legacy-no-uuid",
      message: `${legacyCount} encoded location(s) have no embedded Suno UUID (legacy recordings).`,
    });
  }
  const conflictCount = canonicalRecordings.filter((r) => r.hasIdentityConflict).length;
  if (conflictCount > 0) {
    importWarnings.push({
      code: "collision-metadata-derived-only",
      message: `${conflictCount} canonical recording(s) carry an identity conflict — reviewed as PASS_WITH_LIMITATION.`,
    });
  }
  const notInMirrorCount = encodedLocations.filter((l) => l.extractedRelativePath === null).length;
  if (notInMirrorCount > 0) {
    importWarnings.push({
      code: "supplemental-not-in-extracted-mirror",
      message: `${notInMirrorCount} supplemental location(s) have no copy under 01_EXTRACTED_MIRROR/ — they exist only under the immutable acquisition source and cannot be played in this build.`,
    });
  }

  const snapshot = buildSnapshot(bundle, encodedLocations, batches, workspaces, duplicateRelationships);

  return {
    status: conflictCount > 0 ? "PASS_WITH_LIMITATION" : "PASS",
    snapshot,
    workspaces,
    batches,
    encodedLocations,
    canonicalRecordings,
    duplicateRelationships,
    warnings: importWarnings,
  };
}
