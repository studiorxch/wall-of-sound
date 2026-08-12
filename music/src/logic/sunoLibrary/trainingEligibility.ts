// Suno Training Eligibility Exclusions
// (0812C_MUSIC_Suno-Training-Eligibility-Exclusions_v1.0.1)
//
// Pure — no filesystem, no network. Operates on the already-parsed output of
// the existing manifest adapter/validator (0812B), never re-implements
// manifest parsing. Reuses buildCanonicalIdentities()'s output unmodified —
// this module reads canonical.workspaceSlugs, it never creates a new
// identity relationship between locations.

import type {
  SunoArchiveAssetId,
  SunoBatch,
  SunoCanonicalRecording,
  SunoCanonicalRecordingId,
  SunoDuplicateRelationship,
  SunoEncodedLocation,
} from "../../data/sunoLibraryTypes";
import type { RawAudioAsset } from "./manifestValidation";
import type {
  SunoCanonicalExclusionSummary,
  SunoLocationExclusionRecord,
  SunoProvenanceClassification,
  SunoProvenanceClassificationCount,
  SunoProvenanceConfidence,
  SunoProvenanceEvidence,
  SunoTrainingExclusionBuildResult,
  SunoTrainingExclusionCode,
  SunoWorkspaceExclusionEntry,
} from "../../data/sunoTrainingExclusionTypes";

// ---------------------------------------------------------------------------
// Human exclusion authority — v1.0.1 (supersedes v1.0.0's 403 claim). See
// the governing spec's per-workspace verification table for the evidence
// behind both columns.
// ---------------------------------------------------------------------------

export const SUNO_TRAINING_EXCLUSION_CODE: SunoTrainingExclusionCode =
  "suno_subscription_status_uncertain";

export const SUNO_TRAINING_EXCLUSION_REASON =
  "Generated within a workspace associated with the potentially pre-paid-plan period.";

export const EXCLUDED_WORKSPACE_AUTHORITY: readonly SunoWorkspaceExclusionEntry[] = [
  { workspaceSlug: "percussion-room", workspaceNameOriginal: "Percussion Room", supersededPlanningEstimate: 40, verifiedEncodedLocationCount: 54 },
  { workspaceSlug: "word-play", workspaceNameOriginal: "Word Play", supersededPlanningEstimate: 9, verifiedEncodedLocationCount: 8 },
  { workspaceSlug: "wookie", workspaceNameOriginal: "Wookie", supersededPlanningEstimate: 19, verifiedEncodedLocationCount: 18 },
  { workspaceSlug: "red-dot", workspaceNameOriginal: "Red Dot", supersededPlanningEstimate: 38, verifiedEncodedLocationCount: 44 },
  { workspaceSlug: "lofi-sundays-jan-26", workspaceNameOriginal: "Lofi Sundays Jan 26", supersededPlanningEstimate: 83, verifiedEncodedLocationCount: 102 },
  { workspaceSlug: "kungfu-soundtrack", workspaceNameOriginal: "KungFu Soundtrack", supersededPlanningEstimate: 76, verifiedEncodedLocationCount: 60 },
  { workspaceSlug: "new-lofi-wo-you", workspaceNameOriginal: "New Lofi WO you", supersededPlanningEstimate: 49, verifiedEncodedLocationCount: 64 },
  { workspaceSlug: "lofi-jazz", workspaceNameOriginal: "Lofi Jazz", supersededPlanningEstimate: 12, verifiedEncodedLocationCount: 12 },
  { workspaceSlug: "new-lofi", workspaceNameOriginal: "New Lofi", supersededPlanningEstimate: 60, verifiedEncodedLocationCount: 154 },
  { workspaceSlug: "sleep-mode", workspaceNameOriginal: "Sleep Mode", supersededPlanningEstimate: 7, verifiedEncodedLocationCount: 5 },
  { workspaceSlug: "lofi-lo-fi", workspaceNameOriginal: "LoFi Lo-Fi", supersededPlanningEstimate: 10, verifiedEncodedLocationCount: 10 },
];

export const EXCLUDED_WORKSPACE_SLUGS: ReadonlySet<string> = new Set(
  EXCLUDED_WORKSPACE_AUTHORITY.map((w) => w.workspaceSlug),
);

export const SUPERSEDED_PLANNING_TOTAL = EXCLUDED_WORKSPACE_AUTHORITY.reduce(
  (sum, w) => sum + w.supersededPlanningEstimate,
  0,
); // 403 — retained only as a superseded planning estimate.

export const VERIFIED_DIRECT_LOCATION_TOTAL = EXCLUDED_WORKSPACE_AUTHORITY.reduce(
  (sum, w) => sum + w.verifiedEncodedLocationCount,
  0,
); // 531 — the authoritative, manifest-verified count.

// ---------------------------------------------------------------------------
// Workspace/count verification — the required preflight gate, re-run before
// any exclusion record is built.
// ---------------------------------------------------------------------------

export interface WorkspaceExclusionVerification {
  ok: boolean;
  matchedWorkspaceSlugs: string[];
  missingWorkspaceSlugs: string[];
  verifiedDirectLocationCount: number;
  messages: string[];
}

export function verifyWorkspaceExclusionAuthority(
  encodedLocations: SunoEncodedLocation[],
): WorkspaceExclusionVerification {
  const countBySlug = new Map<string, number>();
  for (const loc of encodedLocations) {
    if (loc.workspaceSlug && EXCLUDED_WORKSPACE_SLUGS.has(loc.workspaceSlug)) {
      countBySlug.set(loc.workspaceSlug, (countBySlug.get(loc.workspaceSlug) ?? 0) + 1);
    }
  }

  const matched: string[] = [];
  const missing: string[] = [];
  const messages: string[] = [];
  let verifiedTotal = 0;

  for (const entry of EXCLUDED_WORKSPACE_AUTHORITY) {
    const actual = countBySlug.get(entry.workspaceSlug) ?? 0;
    if (actual === 0) {
      missing.push(entry.workspaceSlug);
      messages.push(`Workspace "${entry.workspaceNameOriginal}" (${entry.workspaceSlug}) has zero encoded locations in the current manifests.`);
      continue;
    }
    matched.push(entry.workspaceSlug);
    verifiedTotal += actual;
    if (actual !== entry.verifiedEncodedLocationCount) {
      messages.push(
        `Workspace "${entry.workspaceNameOriginal}" (${entry.workspaceSlug}): expected ${entry.verifiedEncodedLocationCount} verified encoded locations, found ${actual} in the current manifests — the exclusion authority table may be stale against a newer snapshot.`,
      );
    }
  }

  const ok = missing.length === 0 && verifiedTotal === VERIFIED_DIRECT_LOCATION_TOTAL;
  if (ok) messages.push(`Verified: ${matched.length}/${EXCLUDED_WORKSPACE_AUTHORITY.length} workspaces matched, ${verifiedTotal} direct encoded locations (authoritative; supersedes the ${SUPERSEDED_PLANNING_TOTAL}-location planning estimate).`);

  return { ok, matchedWorkspaceSlugs: matched, missingWorkspaceSlugs: missing, verifiedDirectLocationCount: verifiedTotal, messages };
}

// ---------------------------------------------------------------------------
// Duplicate-capture detection — generalized structurally across every
// batch, not hardcoded to New Lofi. A (workspaceSlug, zipFilename) pair with
// two or more distinct SHA-256 values is two genuine, separate acquisition
// captures sharing a name; batchId (derived from sha256 — see
// manifestAdapter.ts's deriveBatchId) will differ between them, so we key on
// batchId here to know exactly which encoded locations to flag.
// ---------------------------------------------------------------------------

export function detectDuplicateCaptureBatchIds(batches: SunoBatch[]): Set<string> {
  const idsByKey = new Map<string, Set<string>>();
  for (const batch of batches) {
    const key = `${batch.workspaceSlug} ${batch.zipFilename}`;
    const existing = idsByKey.get(key);
    if (existing) existing.add(batch.batchId);
    else idsByKey.set(key, new Set([batch.batchId]));
  }
  const duplicateBatchIds = new Set<string>();
  for (const ids of idsByKey.values()) {
    if (ids.size > 1) for (const id of ids) duplicateBatchIds.add(id);
  }
  return duplicateBatchIds;
}

// ---------------------------------------------------------------------------
// Provenance classification — precedence: duplicate_capture >
// generated_output > uploaded_reference > alternate_encoding >
// derived_output > unresolved_audio. See the governing spec for why
// structural/acquisition-explanatory signals outrank content-origin ones.
//
// Every signal here cites a concrete, real manifest field:
//  - generated_output: embeddedMetadata.rawComment carries Suno's own
//    "made with/by suno; ...; id=<uuid>" generation stamp (the same field
//    recoveryState:"embedded-id" is itself derived from).
//  - uploaded_reference: either an explicit third-party attribution comment
//    ("Downloaded from Samplefocus.com"), a Freesound-style
//    "NNNNNN__user__description.ext" filename corroborated by ID3
//    genre/copyright tags, or physical field-recorder BWF metadata
//    (coding_history/encoded_by, e.g. a TASCAM recorder) — the last of
//    these is the only signal that can set reviewableForClearance, since it
//    is the only evidence class that plausibly indicates StudioRich's own
//    recording rather than a third-party asset.
//  - alternate_encoding: real same-suno-asset-alternate-encoding
//    duplicate-groups membership.
//  - derived_output: no manifest field currently carries source→derived
//    lineage; never assigned in this build (defined for forward
//    compatibility only — do not fabricate a positive match).
//  - unresolved_audio: no positive evidence either way. Per instruction,
//    NEVER inferred as uploaded_reference from a missing UUID alone.
// ---------------------------------------------------------------------------

const SUNO_GENERATION_STAMP_PATTERN = /made\s+(with|by)\s+suno;.*id=/i;
const THIRD_PARTY_DOWNLOAD_COMMENT_PATTERN = /downloaded from [a-z0-9.-]+\.[a-z]{2,}/i;
// Freesound.org's own download-filename convention: "<numeric id>__<user>__<description>.<ext>".
const FREESOUND_STYLE_FILENAME_PATTERN = /^\d{4,}__[^_]+__.+\.[a-z0-9]+$/i;
// Physical field-recorder embedded BWF tags (coding_history/encoded_by are
// the two fields observed in the real archive; the pattern generalizes to
// any recorder brand/model string, not just the one currently present).
const FIELD_RECORDER_TAG_KEYS = ["coding_history", "encoded_by"] as const;

export function classifyLocationProvenance(
  location: SunoEncodedLocation,
  rawTagsByAssetId: ReadonlyMap<SunoArchiveAssetId, Record<string, string> | null>,
  duplicateCaptureBatchIds: ReadonlySet<string>,
  alternateEncodingLocationIds: ReadonlySet<SunoArchiveAssetId>,
): SunoProvenanceEvidence {
  if (location.batchId && duplicateCaptureBatchIds.has(location.batchId)) {
    return {
      classification: "duplicate_capture",
      confidence: "high",
      evidenceNote: `Batch ${location.batchId} shares its workspace and ZIP filename with another batch of a different SHA-256 — two distinct acquisition captures of the same-named workspace export.`,
      reviewableForClearance: false,
    };
  }

  const rawComment = location.provider.rawComment;
  if (rawComment && SUNO_GENERATION_STAMP_PATTERN.test(rawComment)) {
    return {
      classification: "generated_output",
      confidence: "high",
      evidenceNote: `embeddedMetadata.rawComment carries Suno's own generation stamp: "${rawComment}".`,
      reviewableForClearance: false,
    };
  }

  const tags = rawTagsByAssetId.get(location.archiveAssetId) ?? null;

  if (rawComment && THIRD_PARTY_DOWNLOAD_COMMENT_PATTERN.test(rawComment)) {
    return {
      classification: "uploaded_reference",
      confidence: "high",
      evidenceNote: `embeddedMetadata.rawComment explicitly attributes a third-party download: "${rawComment}".`,
      reviewableForClearance: false,
    };
  }

  if (FREESOUND_STYLE_FILENAME_PATTERN.test(location.filename) && tags && (tags.genre || tags.copyright || tags.track)) {
    return {
      classification: "uploaded_reference",
      confidence: "high",
      evidenceNote: `Filename matches Freesound.org's download-naming convention and carries third-party ID3 tags (genre/copyright/track present).`,
      reviewableForClearance: false,
    };
  }

  if (tags && FIELD_RECORDER_TAG_KEYS.some((k) => tags[k])) {
    const encoder = tags.encoded_by?.trim() ?? "unknown recorder";
    return {
      classification: "uploaded_reference",
      confidence: "high",
      evidenceNote: `Embedded BWF field-recorder metadata (encoded_by: "${encoder}") indicates a physical hardware recording, not a Suno generation or a known third-party library.`,
      // The only evidence class in this build strong enough to plausibly
      // indicate StudioRich's own recording (as opposed to Suno output or a
      // third-party library) — still excluded by default; only flagged for
      // a future explicit human clearance decision.
      reviewableForClearance: true,
    };
  }

  if (alternateEncodingLocationIds.has(location.archiveAssetId)) {
    return {
      classification: "alternate_encoding",
      confidence: "high",
      evidenceNote: "Member of a real same-suno-asset-alternate-encoding duplicate-groups relationship.",
      reviewableForClearance: false,
    };
  }

  return {
    classification: "unresolved_audio",
    confidence: "insufficient-evidence",
    evidenceNote: `No positive provenance evidence found (recoveryState: "${location.provider.recoveryState}" alone is not used as uploaded-reference evidence, per instruction).`,
    reviewableForClearance: false,
  };
}

// A classification forces exclusion regardless of workspace membership.
// uploaded_reference is deliberately absent here — its eligibility is
// governed by the workspace boundary (and, in a future build, by an
// explicit clearance decision), not forced-excluded purely by
// classification.
const CLASSIFICATION_FORCES_EXCLUSION: ReadonlySet<SunoProvenanceClassification> = new Set([
  "generated_output",
  "derived_output",
  "unresolved_audio",
]);

/**
 * General-purpose eligibility rule, usable beyond this build's 11-workspace
 * scope: excluded if the workspace boundary already excludes it, OR if its
 * classification forces exclusion regardless of workspace (generated_output/
 * derived_output/unresolved_audio). uploaded_reference is deliberately never
 * force-excluded by classification alone — its eligibility is workspace- and
 * (in a future build) clearance-decision-driven.
 */
export function deriveEligibilityStatus(
  isWorkspaceExcluded: boolean,
  classification: SunoProvenanceClassification,
): "eligible" | "excluded" {
  if (isWorkspaceExcluded) return "excluded";
  if (CLASSIFICATION_FORCES_EXCLUSION.has(classification)) return "excluded";
  return "eligible";
}

// ---------------------------------------------------------------------------
// Build the full exclusion record set: exclude-on-any-source over the real
// canonical groups (no new relationship invented — reads
// SunoCanonicalRecording.workspaceSlugs, which buildCanonicalIdentities()
// already derives purely from real exact-file-duplicate/
// same-suno-asset-alternate-encoding relationships), plus provenance
// classification for the 531 direct locations.
// ---------------------------------------------------------------------------

export function buildTrainingExclusionRecords(
  encodedLocations: SunoEncodedLocation[],
  canonicalRecordings: SunoCanonicalRecording[],
  batches: SunoBatch[],
  duplicateRelationships: SunoDuplicateRelationship[],
  rawAudioAssets: RawAudioAsset[],
  nowIso: string,
): SunoTrainingExclusionBuildResult {
  const verification = verifyWorkspaceExclusionAuthority(encodedLocations);
  if (!verification.ok) {
    return {
      status: "BLOCKED",
      reasons: verification.missingWorkspaceSlugs.length > 0 ? ["workspace-not-found"] : ["location-count-mismatch"],
      messages: verification.messages,
    };
  }

  const duplicateCaptureBatchIds = detectDuplicateCaptureBatchIds(batches);

  const alternateEncodingLocationIds = new Set<SunoArchiveAssetId>();
  for (const rel of duplicateRelationships) {
    if (rel.relationship === "same-suno-asset-alternate-encoding") {
      for (const id of rel.archiveAssetIds) alternateEncodingLocationIds.add(id);
    }
  }

  const rawTagsByAssetId = new Map<SunoArchiveAssetId, Record<string, string> | null>();
  for (const asset of rawAudioAssets) rawTagsByAssetId.set(asset.assetId, asset.embeddedTags);

  const locationsById = new Map(encodedLocations.map((loc) => [loc.archiveAssetId, loc]));
  const workspaceNameBySlug = new Map(EXCLUDED_WORKSPACE_AUTHORITY.map((w) => [w.workspaceSlug, w.workspaceNameOriginal]));

  // Which canonical recordings are excluded (any member's workspaceSlug is
  // in the 11), and which specific member(s) directly triggered it.
  const excludedCanonicalIds = new Set<SunoCanonicalRecordingId>();
  const triggeringLocationsByCanonicalId = new Map<SunoCanonicalRecordingId, SunoArchiveAssetId[]>();
  for (const canonical of canonicalRecordings) {
    const triggers = canonical.encodedLocationIds.filter((id) => {
      const loc = locationsById.get(id);
      return loc?.workspaceSlug != null && EXCLUDED_WORKSPACE_SLUGS.has(loc.workspaceSlug);
    });
    if (triggers.length > 0) {
      excludedCanonicalIds.add(canonical.canonicalRecordingId);
      triggeringLocationsByCanonicalId.set(canonical.canonicalRecordingId, triggers.sort());
    }
  }

  const canonicalByAssetId = new Map<SunoArchiveAssetId, SunoCanonicalRecording>();
  for (const canonical of canonicalRecordings) {
    for (const id of canonical.encodedLocationIds) canonicalByAssetId.set(id, canonical);
  }

  const classificationCountMap = new Map<SunoProvenanceClassification, { count: number; confidence: SunoProvenanceConfidence }>();
  const locationRecords: SunoLocationExclusionRecord[] = [];

  for (const canonicalId of Array.from(excludedCanonicalIds).sort()) {
    const canonical = canonicalRecordings.find((c) => c.canonicalRecordingId === canonicalId);
    if (!canonical) continue;
    for (const locationId of [...canonical.encodedLocationIds].sort()) {
      const location = locationsById.get(locationId);
      if (!location) continue;

      const isDirectWorkspaceMember = location.workspaceSlug != null && EXCLUDED_WORKSPACE_SLUGS.has(location.workspaceSlug);
      const provenance = classifyLocationProvenance(location, rawTagsByAssetId, duplicateCaptureBatchIds, alternateEncodingLocationIds);

      const existing = classificationCountMap.get(provenance.classification);
      classificationCountMap.set(provenance.classification, { count: (existing?.count ?? 0) + 1, confidence: provenance.confidence });

      locationRecords.push({
        canonicalRecordingId: canonicalId,
        encodedLocationId: locationId,
        workspaceSlug: location.workspaceSlug,
        workspaceNameOriginal: location.workspaceSlug ? (workspaceNameBySlug.get(location.workspaceSlug) ?? location.workspaceNameOriginal) : null,
        archiveStatus: location.extractedRelativePath !== null ? "direct" : canonical.playableEncodedLocationId !== null ? "fallback" : "unavailable",
        commercialStatus: "unknown",
        provenance,
        eligibilityStatus: deriveEligibilityStatus(true, provenance.classification),
        exclusionCode: SUNO_TRAINING_EXCLUSION_CODE,
        exclusionReason: SUNO_TRAINING_EXCLUSION_REASON,
        decisionAuthority: "human",
        decidedAt: nowIso,
        isDirectWorkspaceMember,
        supersessionHistory: [],
      });
    }
  }

  const canonicalSummaries: SunoCanonicalExclusionSummary[] = Array.from(excludedCanonicalIds)
    .sort()
    .map((canonicalId) => {
      const canonical = canonicalRecordings.find((c) => c.canonicalRecordingId === canonicalId) as SunoCanonicalRecording;
      return {
        canonicalRecordingId: canonicalId,
        eligibilityStatus: "excluded" as const,
        triggeringLocationIds: triggeringLocationsByCanonicalId.get(canonicalId) ?? [],
        workspaceSlugsInvolved: canonical.workspaceSlugs,
      };
    });

  const classificationCounts: SunoProvenanceClassificationCount[] = Array.from(classificationCountMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([classification, { count, confidence }]) => ({ classification, count, confidence }));

  return {
    status: "PASS",
    workspaceAuthority: [...EXCLUDED_WORKSPACE_AUTHORITY],
    verifiedDirectLocationCount: verification.verifiedDirectLocationCount,
    locationRecords,
    canonicalSummaries,
    classificationCounts,
    excludedEncodedLocationCount: locationRecords.length,
    excludedCanonicalRecordingCount: excludedCanonicalIds.size,
  };
}

/** True only when the given canonicalRecordingId is excluded per this build's authority — used by the eligible-only export/filter to guarantee zero excluded IDs ever appear there. */
export function isCanonicalRecordingExcluded(
  result: SunoTrainingExclusionBuildResult,
  canonicalRecordingId: SunoCanonicalRecordingId,
): boolean {
  if (result.status !== "PASS") return false;
  return result.canonicalSummaries.some((s) => s.canonicalRecordingId === canonicalRecordingId);
}
