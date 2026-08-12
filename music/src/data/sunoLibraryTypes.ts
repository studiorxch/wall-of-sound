// Suno Library Manifest Integration
// (0812_MUSIC_Suno-Library-Manifest-Integration_v1.0.0)
//
// Two data classes, mirroring the machineLifeTypes.ts immutable-import vs.
// editable-review split:
//   - Archive-authority types (through SunoLibraryImportResult) are rebuilt
//     each session by the manifest adapter (logic/sunoLibrary/) from
//     WOS-share/SUNO_LIBRARY/MANIFESTS/*.json — never persisted to
//     PlayProject in bulk (spec §7.3/§8: "avoid storing redundant full
//     manifest copies... when a stable lightweight reference suffices").
//   - Human-authored types (SunoListeningRecord, SunoInterestMarker) plus
//     the small SunoLibraryImportPointer DO persist on PlayProject.
//
// Encoded locations and canonical recordings are never conflated: a
// canonical recording groups one or more encoded locations by Suno UUID or
// exact checksum only — filename/title/workspace/duration similarity never
// implies identity (spec §6.3).

// ---------------------------------------------------------------------------
// Identity aliases
// ---------------------------------------------------------------------------

export type SunoSnapshotId = string;
export type SunoArchiveAssetId = string;
export type SunoCanonicalRecordingId = string;
export type SunoDuplicateGroupId = string;

// ---------------------------------------------------------------------------
// Provider identity (embedded Suno UUID / URL / metadata)
// ---------------------------------------------------------------------------

export type SunoEmbeddedIdRecoveryState =
  | "embedded-id"
  | "legacy-no-embedded-id"
  | "invalid-embedded-id"
  | "conflicting-embedded-ids";

export interface SunoProviderIdentity {
  recoveryState: SunoEmbeddedIdRecoveryState;
  sunoUuid: string | null;
  sunoUrl: string | null;
  embeddedTitle: string | null;
  embeddedAuthor: string | null;
  embeddedCreatedAt: string | null;
  rawComment: string | null;
}

// ---------------------------------------------------------------------------
// Audio technical identity
// ---------------------------------------------------------------------------

export type SunoMediaStatus =
  | "valid"
  | "valid-with-metadata-warning"
  | "decode-failed"
  | "probe-failed"
  | "zero-duration"
  | "unsupported-codec";

export interface SunoAudioTechnicalIdentity {
  containerFormat: string;
  audioCodec: string;
  durationSeconds: number;
  sampleRate: number | null;
  channelCount: number | null;
  channelLayout: string | null;
  bitrate: number | null;
  byteSize: number;
  sha256: string;
  mediaStatus: SunoMediaStatus;
}

// ---------------------------------------------------------------------------
// Structural hierarchy: Snapshot -> Workspace -> Batch -> Encoded Location
// ---------------------------------------------------------------------------

export interface SunoLibrarySnapshot {
  snapshotId: SunoSnapshotId;
  schemaVersion: string;
  capturedAt: string;
  sourcePath: string;
  workspaceCount: number;
  batchCount: number;
  encodedLocationCount: number;
  extractedLocationCount: number;
  supplementalLocationCount: number;
  totalDurationSeconds: number;
  totalStorageBytes: number;
  uuidLinkedCount: number;
  legacyNoIdCount: number;
  exactDuplicateGroupCount: number;
  alternateEncodingGroupCount: number;
  identityConflictCount: number;
}

export interface SunoWorkspace {
  workspaceSlug: string;
  workspaceNameOriginal: string;
  snapshotId: SunoSnapshotId;
  batchCount: number;
  encodedLocationCount: number;
}

export type SunoZipStatus =
  | "valid"
  | "valid-with-unexpected-files"
  | "empty"
  | "corrupt"
  | "encrypted"
  | "unsafe-paths"
  | "unreadable";

export interface SunoBatch {
  // Deterministic: derived from the source ZIP's own sha256, never from
  // filename/ordinal alone (those can collide across workspaces).
  batchId: string;
  snapshotId: SunoSnapshotId;
  workspaceSlug: string;
  inferredBatchOrdinal: number;
  batchInferenceMethod: "browser-filename-suffix";
  chronologyConfidence: "local-download-order-only";
  zipFilename: string;
  zipRelativeSourcePath: string;
  zipSha256: string;
  zipByteSize: number;
  zipStatus: SunoZipStatus;
  totalMemberCount: number;
  audioMemberCount: number;
  nonAudioMemberCount: number;
  encryptedMemberCount: number;
  unsafeMemberCount: number;
  duplicateMemberPathCount: number;
  warnings: string[];
}

export type SunoEncodedLocationSourceClass =
  | "zip-batch-member"
  | "supplemental-loose-audio";

// §6.4 — the upstream schema makes filesystem-collision identity derivable
// rather than first-class. This annotation is computed by the adapter from
// original member path / derived path / batch warnings / ZIP identity; it
// is never written back to the upstream manifests.
export interface SunoCollisionAnnotation {
  isCollisionRenamed: boolean;
  originalMemberBasename: string | null;
  derivedBasename: string;
  note: string | null;
}

export interface SunoEncodedLocation {
  archiveAssetId: SunoArchiveAssetId;
  snapshotId: SunoSnapshotId;
  workspaceSlug: string | null;
  workspaceNameOriginal: string | null;
  batchId: string | null;
  inferredBatchOrdinal: number | null;
  sourceClass: SunoEncodedLocationSourceClass;
  // Populated when sourceClass === "zip-batch-member".
  originalMemberPath: string | null;
  // Populated when sourceClass === "supplemental-loose-audio".
  supplementalRelativePath: string | null;
  // Null for every current supplemental-loose-audio location (confirmed
  // against the real suno-snapshot-2026-08-11-full manifest: all 60
  // supplemental assets exist only under the immutable 00_ACQUISITION/
  // source tree, never copied into 01_EXTRACTED_MIRROR/). A null value
  // means this location cannot be served by the playback route in this
  // build — 00_ACQUISITION/ must never be exposed (spec §5.1/§15) — and
  // must be treated as "not available for playback", distinct from the
  // archive-root online/offline state.
  extractedRelativePath: string | null;
  filename: string;
  collision: SunoCollisionAnnotation;
  technical: SunoAudioTechnicalIdentity;
  provider: SunoProviderIdentity;
  duplicateGroupIds: SunoDuplicateGroupId[];
  canonicalRecordingId: SunoCanonicalRecordingId;
}

// ---------------------------------------------------------------------------
// Duplicate reconciliation
// ---------------------------------------------------------------------------

export type SunoDuplicateRelationshipKind =
  | "exact-file-duplicate"
  | "same-suno-asset-alternate-encoding"
  | "identity-conflict";

export interface SunoDuplicateRelationship {
  groupId: SunoDuplicateGroupId;
  relationship: SunoDuplicateRelationshipKind;
  archiveAssetIds: SunoArchiveAssetId[];
  sha256: string | null;
  sunoUuid: string | null;
  note: string | null;
}

export type SunoSupplementalResolution =
  | "represented-by-zip-exact"
  | "represented-by-zip-same-uuid"
  | "supplemental-unique"
  | "supplemental-conflict";

export interface SunoSupplementalAssetResolution {
  archiveAssetId: SunoArchiveAssetId;
  matchedArchiveAssetIds: SunoArchiveAssetId[];
  resolution: SunoSupplementalResolution;
  note: string | null;
}

// ---------------------------------------------------------------------------
// Canonical identity (spec §6.3 precedence: UUID > exact checksum > archive
// asset ID). canonicalRecordingId reuses the duplicate-group's own groupId
// verbatim when one applies ("alt-uuid-<uuid>" / "dup-sha-<hash-prefix>"),
// falling back to "asset:<archiveAssetId>" for a location with no group.
// ---------------------------------------------------------------------------

export type SunoCanonicalIdentityBasis =
  | "suno-uuid"
  | "exact-checksum"
  | "archive-asset-id";

export interface SunoCanonicalRecording {
  canonicalRecordingId: SunoCanonicalRecordingId;
  identityBasis: SunoCanonicalIdentityBasis;
  snapshotId: SunoSnapshotId;
  // Best-effort display title derived from filename/embedded metadata —
  // never authoritative, never used for identity/grouping.
  primaryTitleGuess: string | null;
  sunoUuid: string | null;
  sunoUrl: string | null;
  encodedLocationIds: SunoArchiveAssetId[];
  // Duration of the primary (first) encoded location, for list display only.
  totalDurationSeconds: number;
  workspaceSlugs: string[];
  hasIdentityConflict: boolean;
  // Canonical-recording-level playback availability — deliberately distinct
  // from any single encoded location's own extractedRelativePath (spec
  // instruction: "Preserve encoded-location availability separately from
  // canonical-recording playback availability"). Deterministically the
  // archiveAssetId, among this recording's own encodedLocationIds, with the
  // lexicographically smallest ID among those whose SunoEncodedLocation has
  // a non-null extractedRelativePath — or null when no member location is
  // extracted (e.g. the one genuinely supplemental-unique recording).
  // Never derived from or pointing at 00_ACQUISITION/ — only ever an
  // archiveAssetId whose own extractedRelativePath already resolves inside
  // 01_EXTRACTED_MIRROR/.
  playableEncodedLocationId: SunoArchiveAssetId | null;
}

// Result of resolving a requested encoded location to something actually
// playable. "fallback" means the requested location itself has no extracted
// copy but its canonical recording has an equivalent extracted location —
// the UI must disclose this (spec instruction: "The UI must disclose when
// playback uses an equivalent encoded location"). Every archiveAssetId this
// type can ever carry already has a non-null extractedRelativePath rooted
// under 01_EXTRACTED_MIRROR/ — this type can never reference 00_ACQUISITION/.
export type SunoPlaybackResolution =
  | { kind: "direct"; archiveAssetId: SunoArchiveAssetId; extractedRelativePath: string }
  | {
      kind: "fallback";
      archiveAssetId: SunoArchiveAssetId;
      extractedRelativePath: string;
      requestedArchiveAssetId: SunoArchiveAssetId;
    }
  | { kind: "unavailable"; requestedArchiveAssetId: SunoArchiveAssetId };

// ---------------------------------------------------------------------------
// Archive availability (external drive online/offline) — in-memory only,
// never persisted; archiveRoot is server-resolved and used once per check.
// ---------------------------------------------------------------------------

export type SunoArchiveAvailabilityState = "online" | "offline" | "unknown";

export interface SunoArchiveAvailability {
  state: SunoArchiveAvailabilityState;
  checkedAt: string;
  archiveRoot: string | null;
}

// ---------------------------------------------------------------------------
// Human metadata — persisted on PlayProject (spec §6.5/§6.6)
// ---------------------------------------------------------------------------

export type SunoListeningStatus =
  | "unheard"
  | "heard"
  | "favorite"
  | "revisit"
  | "reject";

export type SunoAssetKind =
  | "unknown"
  | "song"
  | "sound"
  | "loop"
  | "environment"
  | "transition"
  | "voice"
  | "stem";

export type SunoSuggestedUse =
  | "radio"
  | "podcast"
  | "video"
  | "maps"
  | "glyph"
  | "resident-reference"
  | "loop-source"
  | "editing-source"
  | "release-candidate"
  | "research"
  | "none";

// Fixed for this build — no interface action may change it (spec §6.6).
export type SunoTrainingEligibility = "excluded-suno-terms";

export interface SunoListeningRecord {
  canonicalRecordingId: SunoCanonicalRecordingId;
  snapshotId: SunoSnapshotId;
  listeningStatus: SunoListeningStatus;
  assetKind: SunoAssetKind;
  suggestedUses: SunoSuggestedUse[];
  notes: string;
  trainingEligibility: SunoTrainingEligibility;
  createdAt: string;
  updatedAt: string;
}

export type SunoInterestMarkerLabel =
  | "hook"
  | "drop"
  | "breakdown"
  | "transition"
  | "vocal-moment"
  | "texture"
  | "other";

export interface SunoInterestMarker {
  markerId: string;
  canonicalRecordingId: SunoCanonicalRecordingId;
  startSeconds: number;
  endSeconds: number | null;
  label: SunoInterestMarkerLabel;
  note: string;
  suggestedUses: SunoSuggestedUse[];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Import pointer — persisted on PlayProject. Small and stable by design: the
// full archive-authority data is rebuilt in memory each session from
// WOS-share, never duplicated into project state (spec §8).
// ---------------------------------------------------------------------------

export type SunoLibraryImportStatus = "not-imported" | "imported" | "blocked";

export interface SunoLibraryImportPointer {
  snapshotId: SunoSnapshotId;
  schemaVersion: string;
  importedAt: string;
  status: SunoLibraryImportStatus;
  encodedLocationCount: number;
  canonicalRecordingCount: number;
}

// ---------------------------------------------------------------------------
// Import gate result (spec §7.2 — discriminated union, BLOCKED never carries
// partial archive data through to the interface).
// ---------------------------------------------------------------------------

export type SunoImportBlockReason =
  | "manifest-missing"
  | "manifest-invalid-json"
  | "snapshot-id-conflict"
  | "material-count-conflict"
  | "unsafe-relative-path"
  | "unexpected-identity-conflict"
  | "unsupported-schema-version";

export type SunoImportWarningCode =
  | "archive-root-offline"
  | "legacy-no-uuid"
  | "optional-metadata-absent"
  | "collision-metadata-derived-only"
  | "supplemental-not-in-extracted-mirror";

export interface SunoImportWarning {
  code: SunoImportWarningCode;
  message: string;
}

export type SunoLibraryImportResult =
  | {
      status: "BLOCKED";
      reasons: SunoImportBlockReason[];
      messages: string[];
    }
  | {
      status: "PASS" | "PASS_WITH_LIMITATION";
      snapshot: SunoLibrarySnapshot;
      workspaces: SunoWorkspace[];
      batches: SunoBatch[];
      encodedLocations: SunoEncodedLocation[];
      canonicalRecordings: SunoCanonicalRecording[];
      duplicateRelationships: SunoDuplicateRelationship[];
      warnings: SunoImportWarning[];
    };

// ---------------------------------------------------------------------------
// Review export — small, scoped, mirrors machineLifeExport.ts's envelope.
// Human metadata only; never archive-authority data or audio.
// ---------------------------------------------------------------------------

export const SUNO_LIBRARY_REVIEW_EXPORT_KIND = "SUNO_LIBRARY_REVIEWS" as const;
export const SUNO_LIBRARY_REVIEW_EXPORT_VERSION = "1.0.0" as const;

export interface SunoLibraryReviewExport {
  exportKind: typeof SUNO_LIBRARY_REVIEW_EXPORT_KIND;
  exportVersion: typeof SUNO_LIBRARY_REVIEW_EXPORT_VERSION;
  snapshotId: SunoSnapshotId;
  exportedAt: string;
  listeningRecords: SunoListeningRecord[];
  interestMarkers: SunoInterestMarker[];
}
