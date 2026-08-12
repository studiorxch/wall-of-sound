// Suno Library Manifest Integration — raw manifest parsing and validation.
//
// Raw*/* types below mirror the on-disk JSON shape of the five WOS-share
// authority manifests exactly (verified field-by-field against the real
// suno-snapshot-2026-08-11-full manifests during the integration preflight
// — see the 0812 completion report for the cross-check). This module never
// interprets the data beyond structural validation; domain mapping lives in
// manifestAdapter.ts.
//
// Reports (suno-acquisition-audit.md, suno-build-summary.json) are
// deliberately never read here — spec §4: "Reports... must not be parsed as
// application data." All counts are independently recomputed from the five
// authority JSON files.

import type { SunoImportBlockReason } from "../../data/sunoLibraryTypes";

export const SUPPORTED_MANIFEST_SCHEMA_VERSION = "1.0.0";

export interface RawEmbeddedMetadata {
  author: string | null;
  createdAt: string | null;
  rawComment: string | null;
  recoveryState: string;
  sunoUrl: string | null;
  sunoUuid: string | null;
  title: string | null;
}

export interface RawAudioAsset {
  assetId: string;
  audioCodec: string;
  batchOrdinal: number | null;
  bitrate: number | null;
  byteSize: number;
  channelCount: number | null;
  channelLayout: string | null;
  containerFormat: string;
  durationSeconds: number;
  embeddedMetadata: RawEmbeddedMetadata;
  // Raw container-level tags (ID3/BWF/etc.) — not mapped into
  // SunoEncodedLocation by manifestAdapter.ts (0812B's domain model
  // deliberately never needed it); read directly here by
  // trainingEligibility.ts (0812C) for provenance-classification evidence
  // (e.g. a field-recorder's embedded coding_history/encoded_by tags, or an
  // ID3 genre/copyright/artist set from a third-party sample library).
  embeddedTags: Record<string, string> | null;
  // Null for supplemental-loose-audio locations — see sunoLibraryTypes.ts's
  // SunoEncodedLocation.extractedRelativePath doc comment.
  extractedRelativePath: string | null;
  filename: string;
  mediaStatus: string;
  sampleRate: number | null;
  sha256: string;
  snapshotId: string;
  sourceClass: string;
  sourceZipRelativePath: string | null;
  sourceZipSha256: string | null;
  supplementalRelativePath: string | null;
  workspaceSlug: string | null;
  zipMemberPath: string | null;
}

export interface RawAudioInventory {
  audioAssets: RawAudioAsset[];
  schemaVersion: string;
  snapshotId: string;
}

export interface RawDuplicateGroup {
  assetIds: string[];
  groupId: string;
  note: string | null;
  relationship: string;
  sha256: string | null;
  sunoUuid: string | null;
}

export interface RawDuplicateGroups {
  duplicateGroups: RawDuplicateGroup[];
  schemaVersion: string;
  snapshotId: string;
}

export interface RawSupplementalAsset {
  assetId: string;
  matchedAssetIds: string[];
  note: string | null;
  resolution: string;
}

export interface RawSupplementalAssets {
  schemaVersion: string;
  snapshotId: string;
  supplementalAssets: RawSupplementalAsset[];
}

export interface RawSyncCheckpoint {
  boundary: {
    createdAt: string | null;
    firstUnarchivedSunoUuid: string | null;
    firstUnarchivedTitle: string | null;
    lastArchivedSunoUuid: string | null;
    lastArchivedTitle: string | null;
    method: string;
    note: string;
    workspace: string | null;
  };
  capturedAt: string;
  schemaVersion: string;
  scope: string;
  snapshotId: string;
}

export interface RawZipBatch {
  audioMemberCount: number;
  batchInferenceMethod: string;
  byteSize: number;
  chronologyConfidence: string;
  duplicateMemberPathCount: number;
  encryptedMemberCount: number;
  filename: string;
  inferredBatchOrdinal: number;
  nonAudioMemberCount: number;
  relativeSourcePath: string;
  sha256: string;
  status: string;
  totalMemberCount: number;
  unsafeMemberCount: number;
  warnings: string[];
  workspaceNameOriginal: string;
  workspaceSlug: string;
}

export interface RawAcquisitionSnapshot {
  audioAssets: RawAudioAsset[];
  duplicateGroups: RawDuplicateGroup[];
  schemaVersion: string;
  snapshotIdentity: {
    capturedAt: string;
    schemaVersion: string;
    snapshotId: string;
    sourcePath: string;
  };
  supplementalAssets: RawSupplementalAsset[];
  syncCheckpoint: RawSyncCheckpoint;
  zipBatches: RawZipBatch[];
}

export interface RawManifestBundle {
  acquisitionSnapshot: RawAcquisitionSnapshot;
  audioInventory: RawAudioInventory;
  duplicateGroups: RawDuplicateGroups;
  supplementalAssets: RawSupplementalAssets;
  syncCheckpoint: RawSyncCheckpoint;
}

export interface ManifestSourceTexts {
  acquisitionSnapshot: string | null;
  audioInventory: string | null;
  duplicateGroups: string | null;
  supplementalAssets: string | null;
  syncCheckpoint: string | null;
}

export interface ManifestValidationBlocked {
  status: "BLOCKED";
  reasons: SunoImportBlockReason[];
  messages: string[];
}

export interface ManifestValidationOk {
  status: "OK";
  bundle: RawManifestBundle;
  warnings: string[];
}

export type ManifestValidationResult = ManifestValidationBlocked | ManifestValidationOk;

function isUnsafeRelativePath(relativePath: string): boolean {
  if (relativePath.startsWith("/")) return true;
  if (/^[a-zA-Z]:[\\/]/.test(relativePath)) return true; // Windows absolute
  const segments = relativePath.split(/[\\/]/);
  return segments.some((seg) => seg === "..");
}

function parseJson<T>(text: string): { ok: true; value: T } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as T };
  } catch {
    return { ok: false };
  }
}

/**
 * Validates the five required WOS-share authority manifests. Pure function
 * over already-read file contents (never touches the filesystem itself —
 * callers, e.g. the vite server route or a Node import script, own I/O) so
 * this can run identically in tests against synthetic fixtures.
 */
export function validateManifestSourceTexts(
  sources: ManifestSourceTexts,
): ManifestValidationResult {
  const reasons: SunoImportBlockReason[] = [];
  const messages: string[] = [];

  const missing: string[] = [];
  if (sources.acquisitionSnapshot == null) missing.push("suno-acquisition-snapshot.json");
  if (sources.audioInventory == null) missing.push("suno-audio-inventory.json");
  if (sources.duplicateGroups == null) missing.push("suno-duplicate-groups.json");
  if (sources.supplementalAssets == null) missing.push("suno-supplemental-assets.json");
  if (sources.syncCheckpoint == null) missing.push("suno-sync-checkpoint.json");
  if (missing.length > 0) {
    return {
      status: "BLOCKED",
      reasons: ["manifest-missing"],
      messages: [`Missing required manifest(s): ${missing.join(", ")}`],
    };
  }

  const acquisitionParsed = parseJson<RawAcquisitionSnapshot>(sources.acquisitionSnapshot as string);
  const audioParsed = parseJson<RawAudioInventory>(sources.audioInventory as string);
  const duplicatesParsed = parseJson<RawDuplicateGroups>(sources.duplicateGroups as string);
  const supplementalParsed = parseJson<RawSupplementalAssets>(sources.supplementalAssets as string);
  const checkpointParsed = parseJson<RawSyncCheckpoint>(sources.syncCheckpoint as string);

  const invalidNames: string[] = [];
  if (!acquisitionParsed.ok) invalidNames.push("suno-acquisition-snapshot.json");
  if (!audioParsed.ok) invalidNames.push("suno-audio-inventory.json");
  if (!duplicatesParsed.ok) invalidNames.push("suno-duplicate-groups.json");
  if (!supplementalParsed.ok) invalidNames.push("suno-supplemental-assets.json");
  if (!checkpointParsed.ok) invalidNames.push("suno-sync-checkpoint.json");
  if (invalidNames.length > 0) {
    return {
      status: "BLOCKED",
      reasons: ["manifest-invalid-json"],
      messages: [`Invalid JSON in: ${invalidNames.join(", ")}`],
    };
  }

  const bundle: RawManifestBundle = {
    acquisitionSnapshot: (acquisitionParsed as { ok: true; value: RawAcquisitionSnapshot }).value,
    audioInventory: (audioParsed as { ok: true; value: RawAudioInventory }).value,
    duplicateGroups: (duplicatesParsed as { ok: true; value: RawDuplicateGroups }).value,
    supplementalAssets: (supplementalParsed as { ok: true; value: RawSupplementalAssets }).value,
    syncCheckpoint: (checkpointParsed as { ok: true; value: RawSyncCheckpoint }).value,
  };

  // Schema version — only the verified version is accepted; an unsupported
  // version cannot be safely adapted (spec §7.2).
  const schemaVersions = [
    bundle.acquisitionSnapshot.schemaVersion,
    bundle.audioInventory.schemaVersion,
    bundle.duplicateGroups.schemaVersion,
    bundle.supplementalAssets.schemaVersion,
    bundle.syncCheckpoint.schemaVersion,
  ];
  const unsupported = schemaVersions.filter((v) => v !== SUPPORTED_MANIFEST_SCHEMA_VERSION);
  if (unsupported.length > 0) {
    reasons.push("unsupported-schema-version");
    messages.push(
      `Unsupported manifest schema version(s): ${Array.from(new Set(unsupported)).join(", ")} (expected ${SUPPORTED_MANIFEST_SCHEMA_VERSION})`,
    );
  }

  // Snapshot ID cross-check. suno-acquisition-snapshot.json's own top-level
  // .snapshotId is null by design — its real ID lives nested at
  // .snapshotIdentity.snapshotId (confirmed during preflight against the
  // real manifest); every other file carries a flat .snapshotId.
  const snapshotIds = new Set([
    bundle.acquisitionSnapshot.snapshotIdentity.snapshotId,
    bundle.audioInventory.snapshotId,
    bundle.duplicateGroups.snapshotId,
    bundle.supplementalAssets.snapshotId,
    bundle.syncCheckpoint.snapshotId,
  ]);
  if (snapshotIds.size > 1) {
    reasons.push("snapshot-id-conflict");
    messages.push(`Conflicting snapshot IDs across manifests: ${Array.from(snapshotIds).join(", ")}`);
  }

  // Material count reconciliation — the acquisition snapshot embeds its own
  // copies of audioAssets/duplicateGroups/supplementalAssets; these must
  // agree with the standalone files they're duplicated from.
  if (bundle.acquisitionSnapshot.audioAssets.length !== bundle.audioInventory.audioAssets.length) {
    reasons.push("material-count-conflict");
    messages.push(
      `Audio asset count mismatch: acquisition snapshot has ${bundle.acquisitionSnapshot.audioAssets.length}, audio-inventory has ${bundle.audioInventory.audioAssets.length}`,
    );
  }
  if (bundle.acquisitionSnapshot.duplicateGroups.length !== bundle.duplicateGroups.duplicateGroups.length) {
    reasons.push("material-count-conflict");
    messages.push(
      `Duplicate group count mismatch: acquisition snapshot has ${bundle.acquisitionSnapshot.duplicateGroups.length}, duplicate-groups has ${bundle.duplicateGroups.duplicateGroups.length}`,
    );
  }
  if (bundle.acquisitionSnapshot.supplementalAssets.length !== bundle.supplementalAssets.supplementalAssets.length) {
    reasons.push("material-count-conflict");
    messages.push(
      `Supplemental asset count mismatch: acquisition snapshot has ${bundle.acquisitionSnapshot.supplementalAssets.length}, supplemental-assets has ${bundle.supplementalAssets.supplementalAssets.length}`,
    );
  }

  // Duplicate internal IDs — every archive asset ID must be unique.
  const seenAssetIds = new Set<string>();
  const duplicateAssetIds = new Set<string>();
  for (const asset of bundle.audioInventory.audioAssets) {
    if (seenAssetIds.has(asset.assetId)) duplicateAssetIds.add(asset.assetId);
    seenAssetIds.add(asset.assetId);
  }
  if (duplicateAssetIds.size > 0) {
    // No dedicated reason code exists for this; it is a count-reconciliation
    // failure in substance (unique-asset-ID count no longer matches record
    // count), so it reuses "material-count-conflict" rather than adding a
    // reason code with only one caller.
    reasons.push("material-count-conflict");
    messages.push(`Duplicate archive asset ID(s) found: ${Array.from(duplicateAssetIds).slice(0, 10).join(", ")}`);
  }

  // Unsafe relative paths — reject absolute paths and upward traversal in
  // every path the app will later resolve against the extracted mirror.
  // A null extractedRelativePath (supplemental-loose-audio locations) is
  // not itself unsafe — it means "not resolvable from the extracted
  // mirror in this build", handled downstream as unplayable, never as a
  // validation failure.
  const unsafePaths: string[] = [];
  for (const asset of bundle.audioInventory.audioAssets) {
    if (asset.extractedRelativePath != null && isUnsafeRelativePath(asset.extractedRelativePath)) {
      unsafePaths.push(asset.extractedRelativePath);
    }
  }
  if (unsafePaths.length > 0) {
    reasons.push("unsafe-relative-path");
    messages.push(`Unsafe relative path(s) rejected: ${unsafePaths.slice(0, 10).join(", ")}`);
  }

  const warnings: string[] = [];
  const identityConflictCount = bundle.duplicateGroups.duplicateGroups.filter(
    (g) => g.relationship === "identity-conflict",
  ).length;
  if (identityConflictCount > 0) {
    warnings.push(`${identityConflictCount} identity-conflict group(s) present — reviewed as PASS_WITH_LIMITATION.`);
  }

  if (reasons.length > 0) {
    return { status: "BLOCKED", reasons: Array.from(new Set(reasons)), messages };
  }

  return { status: "OK", bundle, warnings };
}
