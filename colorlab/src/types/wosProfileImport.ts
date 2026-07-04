/**
 * WOS Color Runtime Profile Import types — v1.0.2
 *
 * Defines the WOS-side intake lifecycle, validation results, quarantine states,
 * rollback doctrine, and canonical import result schema.
 *
 * INVARIANTS:
 * - All profiles are untrusted until validated.
 * - Runtime intake fails closed.
 * - WOS retains final runtime authority.
 * - Lifecycle stages may not be skipped.
 * - Partial activation is prohibited — activation is atomic.
 * - Revoked profiles may not remain silently active.
 * - Import systems may not mutate canonical export data (lineage, source bias, revision binding).
 * - Review stage requires human reviewer — may not be automated.
 */

import type { ApprovalScope } from './projection';

// ─── Intake lifecycle ─────────────────────────────────────────────────────────

/**
 * Eight-stage intake lifecycle — §3.
 * Stages may not be skipped. Transitions are governed by the transition matrix.
 */
export type IntakeStage =
  | 'received'      // payload received
  | 'validated'     // schema verified
  | 'reviewed'      // advisory inspection state (requires human reviewer)
  | 'quarantined'   // blocked pending failure resolution
  | 'approved'      // governance-approved
  | 'activated'     // admitted into runtime
  | 'revoked'       // authorization invalidated
  | 'archived';     // inactive retained record

/**
 * Legal intake lifecycle transitions — §4.
 * All unlisted transitions are forbidden.
 */
export const INTAKE_TRANSITION_MATRIX: ReadonlyArray<readonly [IntakeStage, IntakeStage]> = [
  ['received',    'validated'],
  ['received',    'quarantined'],
  ['validated',   'reviewed'],
  ['validated',   'quarantined'],
  ['reviewed',    'approved'],
  ['reviewed',    'quarantined'],
  ['approved',    'activated'],
  ['approved',    'archived'],
  ['activated',   'revoked'],
  ['activated',   'archived'],
  ['revoked',     'archived'],
  ['quarantined', 'received'],    // remediation restart
  ['quarantined', 'archived'],    // authorized irremediable failure
] as const;

// ─── Quarantine ───────────────────────────────────────────────────────────────

export type QuarantineReason =
  | 'schema_validation_failure'
  | 'revision_binding_incomplete'
  | 'stale_artifact_blocked'
  | 'approval_token_missing'
  | 'approval_revoked'
  | 'approval_scope_mismatch'
  | 'lineage_unresolvable'
  | 'export_governance_violated'
  | 'fiction_declaration_missing'
  | 'truth_disclaimer_missing'
  | 'source_bias_missing'
  | 'runtime_compatibility_mismatch'
  | 'partial_activation_prevented'
  | 'irremediable_failure';

// ─── Validation ───────────────────────────────────────────────────────────────

export interface ValidationDetail {
  validationRule: string;
  passed: boolean;
  expected?: string;
  actual?: string;
  message?: string;
}

/**
 * Canonical intake validation matrix — §25.
 * Each domain carries different enforcement levels per intent.
 */
export type ValidationDomain =
  | 'schema_validation'
  | 'stale_validation'
  | 'lineage_validation'
  | 'approval_validation'
  | 'export_governance_validation'
  | 'runtime_compatibility'
  | 'fiction_declaration'
  | 'truth_disclaimer';

/**
 * Per-domain validation result.
 * blocker: failure prevents activation.
 * warning: failure surfaces diagnostics but allows review.
 */
export interface DomainValidationResult {
  domain: ValidationDomain;
  passed: boolean;
  severity: 'blocker' | 'warning' | 'skipped';
  details: ValidationDetail[];
}

// ─── Runtime compatibility context ───────────────────────────────────────────

/**
 * Runtime compatibility context supplied by WOS at intake time.
 * Used to validate renderer/shader/stage compatibility.
 */
export interface RuntimeCompatibilityContext {
  /** Current renderer version — compared against revisionBinding.rendererSignature */
  currentRendererSignature: string;
  /** Current shader version */
  currentShaderSignature: string;
  /** Current stage template */
  currentStageTemplateRef: string;
  /** Activation scope being requested */
  requestedActivationScope?: ApprovalScope;
  /** Whether revalidation is forced (e.g. reconnect or cache refresh) */
  forceRevalidation?: boolean;
}

// ─── Stale override ───────────────────────────────────────────────────────────

/**
 * Governed stale override — allows stale artifacts through activation with explicit authorization.
 * Maximum duration: 7 days. Overrides may not clear stale status or suppress diagnostics.
 */
export interface StaleOverride {
  /** Governed authorization token — same token as approval authorization */
  overrideToken: string;
  grantedAt: string;
  /** Must not exceed 7 days from grantedAt */
  expiresAt: string;
  grantedBy: string;
}

// ─── Runtime cache entry ──────────────────────────────────────────────────────

/**
 * WOS-side runtime cache entry for an imported profile.
 * Volatile in-memory only — NEVER persisted to IndexedDB.
 * Must revalidate on: activation, reconnect, cache refresh, runtime reload.
 * Minimum revalidation interval: 24 hours.
 */
export interface RuntimeProfileCacheEntry {
  intakeId: string;
  profileRef: string;
  paletteId: string;
  revisionId: string;
  activationScope?: ApprovalScope;
  cachedAt: number;
  lastRevalidatedAt: number;
  /** 24-hour minimum revalidation interval (ms) */
  revalidationIntervalMs: number;
  cacheState: 'fresh' | 'stale' | 'revoked';
  staleReason?: string;
}

export const REVALIDATION_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

// ─── Rollback baseline ────────────────────────────────────────────────────────

/**
 * Rollback baseline — last successfully activated, non-revoked profile for a given scope.
 * If none exists, runtime falls back to default state.
 * Rollback scope must match revoked scope — activation safety > visual continuity.
 */
export interface RollbackBaseline {
  intakeId: string;
  paletteId: string;
  revisionId: string;
  activatedAt: string;
  activationScope?: ApprovalScope;
}

// ─── Intake record ────────────────────────────────────────────────────────────

/**
 * Lifecycle record for a single profile intake session.
 * Diagnostic retention minimum: 90 days (§27).
 */
export interface IntakeRecord {
  intakeId: string;
  profileRef: string;
  paletteId: string;
  revisionId: string;
  receivedAt: string;
  currentStage: IntakeStage;
  stageHistory: Array<{ stage: IntakeStage; at: string; reason?: string }>;
  validationResults: DomainValidationResult[];
  diagnostics: string[];
  quarantineReasons: QuarantineReason[];
  /** Set when stage reaches 'activated' */
  activatedAt?: string;
  activationScope?: ApprovalScope;
  /** Set when stage reaches 'revoked' */
  revokedAt?: string;
  revocationReason?: string;
  /** Set on irremediable failure archive */
  archivedAt?: string;
  archiveReason?: string;
}

// ─── Import result ────────────────────────────────────────────────────────────

/**
 * Canonical intake result schema — §26.
 * runtimeStateMutated must always be false unless activation fully succeeded.
 */
export interface RuntimeImportResult {
  intakeId: string;
  profileRef: string;
  timestamp: string;
  intakeStage: IntakeStage;
  intakeAccepted: boolean;
  activationGranted: boolean;
  quarantined: boolean;
  quarantineReasons: QuarantineReason[];
  validationDetails: ValidationDetail[];
  diagnostics: string[];
  /** Must be false for review, quarantine, or any partial state */
  runtimeStateMutated: boolean;
  /** Present when a rollback occurred */
  rollbackApplied?: boolean;
  rollbackBaseline?: RollbackBaseline;
}
