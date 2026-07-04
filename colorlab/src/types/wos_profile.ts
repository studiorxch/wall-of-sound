/**
 * WOS Color Runtime Profile Import types — v1.0.1
 *
 * Governs the intake lifecycle for PALETTE_RUNTIME_PROFILE artifacts
 * from COLORLAB Projection Lab into WOS runtime.
 *
 * INVARIANTS:
 * - All intake is untrusted until validated.
 * - Lifecycle transitions may not skip stages.
 * - Activation is atomic — partial activation is prohibited.
 * - Revocation propagates into runtime cache.
 * - Rollback restores verified baseline state.
 * - WOS retains final runtime authority.
 * - runtimeStateMutated is always false in import results — sovereignty preserved.
 *
 * Relationship to 0522J:
 * - 0522J governs wos_palette_package runtime integration.
 * - This spec governs PALETTE_RUNTIME_PROFILE intake.
 * - When a PALETTE_RUNTIME_PROFILE exists for a given paletteId, this spec takes precedence.
 */

import type { PaletteRuntimeProfile } from './projection';

// ─── Intake lifecycle ─────────────────────────────────────────────────────────

/**
 * All imported profiles must pass through this lifecycle in order.
 * Profiles may not skip stages.
 */
export type RuntimeProfileIntakeStage =
  | 'received'      // payload received
  | 'validated'     // schema verified
  | 'reviewed'      // advisory inspection state
  | 'quarantined'   // blocked pending failure resolution
  | 'approved'      // governance-approved
  | 'activated'     // admitted into runtime
  | 'revoked'       // authorization invalidated
  | 'archived';     // inactive retained record

/**
 * Permitted lifecycle transitions — §4.
 * All others are forbidden.
 */
export const PERMITTED_INTAKE_TRANSITIONS: Readonly<
  Record<RuntimeProfileIntakeStage, RuntimeProfileIntakeStage[]>
> = {
  received:     ['validated', 'quarantined'],
  validated:    ['reviewed', 'quarantined'],
  reviewed:     ['approved', 'quarantined'],
  quarantined:  ['received'],              // remediation restart only
  approved:     ['activated', 'archived'],
  activated:    ['revoked', 'archived'],
  revoked:      ['archived'],
  archived:     [],
} as const;

// ─── Validation diagnostics ───────────────────────────────────────────────────

export interface ValidationDetail {
  validationRule: string;
  expected?: string;
  actual?: string;
}

// ─── Governed stale override ──────────────────────────────────────────────────

/**
 * Exceptional stale override — §12.1.
 * Requires explicit operator action, reason, identity, audit entry.
 * Maximum duration 7 days. May bypass stale blocking only.
 * May NOT clear stale status, modify lineage, suppress diagnostics,
 * or bypass approval validation.
 */
export interface GovernedStaleOverride {
  overrideReason: string;
  operatorIdentity: string;
  grantedAt: string;
  /** Must not exceed grantedAt + 7 days */
  expiresAt: string;
  scope: string;
}

export const STALE_OVERRIDE_MAX_DAYS = 7;

// ─── Intake record ────────────────────────────────────────────────────────────

/**
 * Full intake lifecycle record for a single PALETTE_RUNTIME_PROFILE.
 * Preserves original payload, validation diagnostics, stage history.
 * Import systems may not mutate canonical export data (profile field is read-only).
 */
export interface RuntimeProfileIntakeRecord {
  intakeId: string;
  profileArtifactId: string;
  /** paletteId from revisionBinding */
  paletteId: string;
  /** Original export payload — must not be mutated by import systems */
  readonly profile: PaletteRuntimeProfile;
  stage: RuntimeProfileIntakeStage;
  intakeTimestamp: string;
  stageHistory: Array<{
    stage: RuntimeProfileIntakeStage;
    at: string;
    reason?: string;
    operatorIdentity?: string;
  }>;
  /** Machine-readable and human-readable diagnostics — append-only */
  diagnostics: string[];
  validationDetails: ValidationDetail[];
  quarantineReasons?: string[];
  /** Populated when advanced to reviewed/approved */
  reviewNotes?: string;
  reviewedBy?: string;
  /** Exceptional override for stale activation — 7 day max */
  governedStaleOverride?: GovernedStaleOverride;
}

// ─── Quarantine ───────────────────────────────────────────────────────────────

/**
 * Quarantine entry — §19.
 * Isolates invalid profiles while preserving diagnostics and review survivability.
 * Quarantine may not mutate live runtime state.
 */
export interface QuarantineEntry {
  intakeRecord: RuntimeProfileIntakeRecord;
  quarantinedAt: string;
  reasons: string[];
  remediationNotes?: string;
  remediatedBy?: string;
  remediatedAt?: string;
}

// ─── Activated profile cache ──────────────────────────────────────────────────

/**
 * Runtime cache entry for an activated profile.
 * Authorization must be continuously revalidated — hash validity alone is insufficient.
 * Minimum revalidation interval: 24 hours.
 */
export interface ActivatedProfileCacheEntry {
  profileArtifactId: string;
  paletteId: string;
  activatedAt: string;
  lastRevalidatedAt: string;
  activationScope: string;
  /** Preserved — may not be mutated */
  readonly profile: PaletteRuntimeProfile;
  authorizationStatus: 'active' | 'revoked';
  revocationReason?: string;
}

// ─── Rollback baseline ────────────────────────────────────────────────────────

/**
 * Rollback baseline — §22.
 * Tracks last successfully activated non-revoked profile per scope.
 * If no valid prior activation exists, null profileArtifactId triggers default runtime state.
 */
export interface RollbackBaseline {
  paletteId: string;
  activationScope: string;
  /** null = no prior activation — restore default runtime state */
  profileArtifactId: string | null;
  establishedAt: string;
}

// ─── Canonical import result ──────────────────────────────────────────────────

/**
 * Canonical intake result — §26.
 * runtimeStateMutated is always false — WOS sovereignty is preserved.
 * The import result is diagnostic/advisory only.
 */
export interface RuntimeImportResult {
  intakeId: string;
  profileRef: string;
  timestamp: string;
  intakeStage: RuntimeProfileIntakeStage;
  intakeAccepted: boolean;
  activationGranted: boolean;
  quarantined: boolean;
  quarantineReason?: string[];
  validationDetails?: ValidationDetail[];
  diagnostics?: string[];
  /** Always false — import systems may not mutate runtime state */
  readonly runtimeStateMutated: false;
}

// ─── Activation request ───────────────────────────────────────────────────────

export interface ActivationRequest {
  intakeId: string;
  requestedScope: string;
  operatorIdentity: string;
}

// ─── Review action ────────────────────────────────────────────────────────────

export interface ReviewAction {
  intakeId: string;
  reviewerIdentity: string;
  reviewNotes?: string;
  /** true to advance to approved, false to quarantine */
  approved: boolean;
  quarantineReason?: string;
}

// ─── Revocation event ────────────────────────────────────────────────────────

export interface RevocationEvent {
  profileArtifactId: string;
  paletteId: string;
  revokedAt: string;
  reason: string;
  affectedScope: string;
}
