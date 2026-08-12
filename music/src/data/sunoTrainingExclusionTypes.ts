// Suno Training Eligibility Exclusions
// (0812C_MUSIC_Suno-Training-Eligibility-Exclusions_v1.0.1)
//
// A separate, additive exclusion-authority layer over the existing Suno
// Library Manifest Integration (0812B). Distinct from
// SunoListeningRecord.trainingEligibility ("excluded-suno-terms", fixed,
// blanket Suno-ToS marker on every human review record) — this module
// tracks a workspace/provenance-driven exclusion authority that applies
// independently of whether a recording has ever been reviewed.
//
// Nothing here is persisted to PlayProject/IndexedDB: the 11-workspace
// exclusion authority and the provenance classifier are both pure and
// recomputed each session from the already-reused manifest adapter output,
// matching 0812B's "avoid storing redundant data" precedent. No clearance
// action ships in this build, so there is no supersession state to persist
// yet — SunoTrainingExclusionSupersessionEntry exists for forward
// compatibility only.

import type {
  SunoArchiveAssetId,
  SunoCanonicalRecordingId,
} from "./sunoLibraryTypes";

// ---------------------------------------------------------------------------
// Human exclusion authority — the 11 named workspaces (spec §Human exclusion
// authority). supersededPlanningEstimate is Suno's own displayed *song*
// count at authoring time; verifiedEncodedLocationCount is the archive-
// derived *encoded location* count this build actually verified against the
// real manifests. The two are different units (song vs. encoded location),
// not two measurements of the same thing — 531 is not a correction of 403,
// it is the correct count for a more granular unit.
// ---------------------------------------------------------------------------

export interface SunoWorkspaceExclusionEntry {
  workspaceSlug: string;
  workspaceNameOriginal: string;
  supersededPlanningEstimate: number;
  verifiedEncodedLocationCount: number;
}

// ---------------------------------------------------------------------------
// Provenance classification (spec: "classify each location where evidence
// permits"). Precedence when more than one signal could apply:
// duplicate_capture > generated_output > uploaded_reference >
// alternate_encoding > derived_output > unresolved_audio. Structural/
// acquisition-explanatory signals outrank content-origin signals because
// this classification exists to reconcile the 403-vs-531 gap, not to build
// a permanent multi-axis content taxonomy.
// ---------------------------------------------------------------------------

export type SunoProvenanceClassification =
  | "generated_output"
  | "uploaded_reference"
  | "derived_output"
  | "alternate_encoding"
  | "duplicate_capture"
  | "unresolved_audio";

export type SunoProvenanceConfidence = "high" | "insufficient-evidence";

export interface SunoProvenanceEvidence {
  classification: SunoProvenanceClassification;
  confidence: SunoProvenanceConfidence;
  // Cites the concrete manifest field/pattern that produced this
  // classification (e.g. "embeddedMetadata.rawComment matches Suno
  // generation stamp") — never a fabricated or inferred rationale.
  evidenceNote: string;
  // True only for a positively-evidenced, StudioRich-owned uploaded
  // reference (e.g. TASCAM field-recorder embedded metadata). Never true
  // for generated_output/derived_output/unresolved_audio, and never true
  // for a third-party-attributed uploaded_reference (e.g. Freesound/
  // Samplefocus). Flagging this never changes eligibilityStatus in this
  // build — it only surfaces the location for a future explicit human
  // clearance decision.
  reviewableForClearance: boolean;
}

// ---------------------------------------------------------------------------
// Archive/commercial status — reserved fields per spec's Data layer
// requirement. archiveStatus mirrors SunoPlaybackResolution.kind and is
// computed on demand, never stored independently of the playback resolver.
// commercialStatus is fixed "unknown" in this build: no manifest field
// establishes Suno subscription/commercial tier per location or workspace.
// ---------------------------------------------------------------------------

export type SunoArchiveStatus = "direct" | "fallback" | "unavailable";

export type SunoCommercialStatus = "unknown";

// ---------------------------------------------------------------------------
// Exclusion decision
// ---------------------------------------------------------------------------

export type SunoTrainingExclusionCode = "suno_subscription_status_uncertain";

export type SunoTrainingExclusionDecisionAuthority = "human" | "machine";

// "unreviewed" applies only to a canonical recording with zero workspace
// attribution on every member (cannot even be assessed against the
// exclusion boundary) — it is never a synonym for "assumed eligible".
export type SunoTrainingEligibilityStatus = "eligible" | "excluded" | "unreviewed";

export interface SunoTrainingExclusionSupersessionEntry {
  decidedAt: string;
  decidedByAuthority: SunoTrainingExclusionDecisionAuthority;
  eligibilityStatus: SunoTrainingEligibilityStatus;
  reasonCode: SunoTrainingExclusionCode | null;
  reasonNote: string;
}

// One record per encoded location touched by this build's exclusion
// boundary — either a direct member of one of the 11 workspaces, or pulled
// in via exclude-on-any-source canonical propagation (ripple).
export interface SunoLocationExclusionRecord {
  canonicalRecordingId: SunoCanonicalRecordingId;
  encodedLocationId: SunoArchiveAssetId;
  workspaceSlug: string | null;
  workspaceNameOriginal: string | null;
  archiveStatus: SunoArchiveStatus;
  commercialStatus: SunoCommercialStatus;
  provenance: SunoProvenanceEvidence;
  eligibilityStatus: SunoTrainingEligibilityStatus;
  exclusionCode: SunoTrainingExclusionCode | null;
  exclusionReason: string | null;
  decisionAuthority: SunoTrainingExclusionDecisionAuthority;
  decidedAt: string;
  // True when this specific location's own workspaceSlug is one of the 11
  // excluded workspaces; false when it was pulled in only via a shared
  // canonical recording with a directly-excluded member (a "ripple" case,
  // e.g. the real 18-location Wookie supplemental example).
  isDirectWorkspaceMember: boolean;
  supersessionHistory: SunoTrainingExclusionSupersessionEntry[];
}

// One summary per excluded canonical recording, explaining which specific
// member location(s) actually carry the excluded-workspace attribution —
// the "canonical-propagation explanation" the interface must surface.
export interface SunoCanonicalExclusionSummary {
  canonicalRecordingId: SunoCanonicalRecordingId;
  eligibilityStatus: SunoTrainingEligibilityStatus;
  triggeringLocationIds: SunoArchiveAssetId[];
  workspaceSlugsInvolved: string[];
}

export interface SunoProvenanceClassificationCount {
  classification: SunoProvenanceClassification;
  count: number;
  confidence: SunoProvenanceConfidence | null;
}

export type SunoTrainingExclusionBlockReason =
  | "workspace-not-found"
  | "location-count-mismatch"
  | "unsafe-canonical-propagation"
  | "material-authority-conflict";

export type SunoTrainingExclusionBuildResult =
  | {
      status: "BLOCKED";
      reasons: SunoTrainingExclusionBlockReason[];
      messages: string[];
    }
  | {
      status: "PASS";
      workspaceAuthority: SunoWorkspaceExclusionEntry[];
      verifiedDirectLocationCount: number;
      locationRecords: SunoLocationExclusionRecord[];
      canonicalSummaries: SunoCanonicalExclusionSummary[];
      classificationCounts: SunoProvenanceClassificationCount[];
      excludedEncodedLocationCount: number;
      excludedCanonicalRecordingCount: number;
    };

// ---------------------------------------------------------------------------
// Export — deterministic JSON/CSV listing of the exclusion authority.
// ---------------------------------------------------------------------------

export const SUNO_TRAINING_EXCLUSION_EXPORT_KIND = "SUNO_TRAINING_EXCLUSION_REPORT" as const;
export const SUNO_TRAINING_EXCLUSION_EXPORT_VERSION = "1.0.1" as const;

export interface SunoTrainingExclusionExport {
  exportKind: typeof SUNO_TRAINING_EXCLUSION_EXPORT_KIND;
  exportVersion: typeof SUNO_TRAINING_EXCLUSION_EXPORT_VERSION;
  exportedAt: string;
  workspaceAuthority: SunoWorkspaceExclusionEntry[];
  classificationCounts: SunoProvenanceClassificationCount[];
  locationRecords: SunoLocationExclusionRecord[];
  canonicalSummaries: SunoCanonicalExclusionSummary[];
}
