// RadioLoop Library Workspace (0717A_MUSIC_RadioLoop_Library_Workspace_
// v1.0.0_BUILD) — UI/workspace-only types. Deliberately separate from
// radioLoopTypes.ts (the shared RADIO contract both the browser and the
// Node-only server layer import) — workspace state has no business in that
// file. Pure — no DOM, no Node.

import type {
  RadioArrangementRole,
  RadioLoopId,
  RadioPackageVersion,
  RadioPromotionState,
  RadioValidationIssue,
} from "./radioLoopTypes";

// §6.3 — one catalog-table row. Unresolved optional metadata is `undefined`,
// never an invented default (e.g. a fabricated 0 BPM or empty string).
export interface RadioLoopWorkspaceRow {
  radioLoopId: RadioLoopId;
  currentPackageVersion: RadioPackageVersion;
  availableVersions: RadioPackageVersion[];
  status: RadioPromotionState;
  // §5's decision 5 — presence in /radio-manifest, never used to decide
  // whether a row is shown, only whether it's flagged schedulable.
  isActiveInManifest: boolean;
  workingTitle?: string;
  sourceTrackId: string;
  sourceLoopId: string;
  source: RadioLoopSourceSummary;
  durationSeconds?: number;
  bpm?: number;
  key?: string;
  bars?: number;
  roles: string[];
  /** @deprecated Legacy read-compatibility only — never displayed or written. See RadioArrangementMetadata.familyIds. */
  familyIds?: string[];
  energy?: number;
  density?: number;
  stability?: number;
  stemStatus: "available" | "missing" | "omitted";
  publicUseApproved?: boolean;
  deliveryCodec?: string;
  deliveryContainer?: string;
  packageValidationState: "valid" | "unknown";
  issues: RadioLoopWorkspaceIssue[];
}

// §7.6/§12.1 — one version's portable summary, sourced from either
// /radio-package-versions (full history, retired included) or
// /radio-library-index (highest version only).
export interface RadioLoopVersionSummary {
  packageVersion: RadioPackageVersion;
  status: RadioPromotionState;
  createdAt?: string;
  approvedAt?: string;
  retirement?: { reason: string; retiredAt: string };
}

export interface RadioLoopSourceSummary {
  sourceTrackId: string;
  sourceLoopId: string;
  resolved: boolean;
  displayName?: string;
  unresolvedReason?: string;
}

export interface RadioLoopFilterState {
  search: string;
  role: RadioArrangementRole | "all";
  status: RadioPromotionState | "all";
  approval: "all" | "approved" | "unapproved";
  stemStatus: "all" | "available" | "missing" | "omitted";
}

export type RadioLoopSortKey = "radioLoopId" | "workingTitle" | "durationSeconds" | "bpm" | "energy" | "status";

export interface RadioLoopSortState {
  key: RadioLoopSortKey;
  direction: "asc" | "desc";
}

export type RadioLoopAuditionPhase = "idle" | "loading" | "playing" | "error";

export interface RadioLoopAuditionState {
  radioLoopId: RadioLoopId | null;
  packageVersion: RadioPackageVersion | null;
  phase: RadioLoopAuditionPhase;
  error?: string;
}

// §8.6/§9.6 — the edit form's request shape. `title` maps to a workspace
// working title, not part of the portable RADIO contract itself.
//
// `roles` is `string[]`, not `RadioArrangementRole[]` — the closed
// vocabulary is enforced at the VALIDATION boundary (radioMetadataEditValidator.ts
// client-side, radioMetadataRevisionOrchestrator.ts server-side), not the
// TypeScript type, so a runtime-invalid value (e.g. a manually-crafted
// payload, or a future loosening of the `<select>`) is still rejected with
// a clear issue rather than silently failing to compile against test/
// defense-in-depth code that intentionally exercises the invalid case.
export interface RadioLoopMetadataEditRequest {
  radioLoopId: RadioLoopId;
  sourcePackageVersion: RadioPackageVersion;
  title?: string;
  roles: string[];
  energy?: number;
  density?: number;
  stability?: number;
  maximumConsecutiveRepeats?: number;
  minimumRestCycles?: number;
  transitionIn?: string[];
  transitionOut?: string[];
  publicUseApproved: boolean;
  approvalChangeConfirmed: boolean;
}

export interface RadioLoopMetadataRevisionResult {
  ok: boolean;
  radioLoopId?: RadioLoopId;
  packageVersion?: RadioPackageVersion;
  assetHashMatch?: boolean;
  issues: RadioValidationIssue[];
}

// §7.7 correction — whole-RadioLoop scope only for this build.
export interface RadioLoopRetirementRequest {
  radioLoopId: RadioLoopId;
  reason: string;
}

export interface RadioLoopWorkspaceIssue {
  code: string;
  message: string;
  severity: "error" | "warning";
}

// Response shape for GET /radio-package-versions?radioLoopId= — the
// per-loop complete version history the manifest can no longer supply once
// a RadioLoop's highest version is retired (radioManifestBuilder.ts's
// decision-2 suppression).
export interface RadioLoopVersionIndexEntry {
  radioLoopId: RadioLoopId;
  packageVersion: RadioPackageVersion;
  status: RadioPromotionState;
  source: { trackId: string; loopId: string };
  workingTitle?: string;
  roles: string[];
  /** @deprecated Legacy read-compatibility only — never displayed or written. */
  familyIds?: string[];
  retirement?: { reason: string; retiredAt: string };
}

// Response shape for GET /radio-library-index — one entry per RadioLoop ID
// across the whole library, including fully-retired ones, session-
// independent. The workspace's baseline row population source (decision
// 5) — never gated by /radio-manifest.
export interface RadioLibraryIndexEntry {
  radioLoopId: RadioLoopId;
  packageVersion: RadioPackageVersion;
  status: RadioPromotionState;
  source: { trackId: string; loopId: string };
  workingTitle?: string;
  roles: string[];
  /** @deprecated Legacy read-compatibility only — never displayed or written. */
  familyIds?: string[];
}
