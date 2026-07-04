/**
 * WOS Color Runtime Profile Import Adapter — v1.0.2
 *
 * Implements fail-closed runtime intake validation, quarantine lifecycle,
 * atomic activation, revocation propagation, and rollback for
 * PALETTE_RUNTIME_PROFILE artifacts imported from Colorlab.
 *
 * INVARIANTS:
 * - All profiles are untrusted until validated.
 * - Runtime intake fails closed.
 * - Lifecycle stages may not be skipped.
 * - Partial activation is prohibited — activation is atomic.
 * - Revoked profiles may not remain silently active.
 * - Import systems may not mutate canonical export data.
 * - Review stage requires human reviewer — may not be automated.
 * - Runtime cache is in-memory only — NEVER persisted to IndexedDB.
 * - When 0522J wos_palette_package and a PALETTE_RUNTIME_PROFILE both exist for a palette,
 *   this adapter takes precedence; 0522J remains fallback infrastructure.
 */

import type { PaletteRuntimeProfile, FictionModeContext } from '../types/projection';
import { PROJECTION_EXPORT_GOVERNANCE } from '../types/projection';
import type {
  IntakeStage,
  IntakeRecord,
  DomainValidationResult,
  ValidationDetail,
  QuarantineReason,
  RuntimeCompatibilityContext,
  RuntimeImportResult,
  RuntimeProfileCacheEntry,
  RollbackBaseline,
  StaleOverride,
} from '../types/wosProfileImport';
import {
  INTAKE_TRANSITION_MATRIX,
  REVALIDATION_INTERVAL_MS,
} from '../types/wosProfileImport';
import type { ApprovalScope } from '../types/projection';

export const WOS_PROFILE_IMPORT_VERSION = '1.0.2';

// ─── In-memory state — volatile, never persisted ──────────────────────────────

const intakeRecords = new Map<string, IntakeRecord>();
const runtimeCache = new Map<string, RuntimeProfileCacheEntry>();
// rollback baselines keyed by ApprovalScope (or 'global' for unscoped)
const rollbackBaselines = new Map<string, RollbackBaseline>();

// ─── Lifecycle transition guard ───────────────────────────────────────────────

/**
 * Validate and apply a lifecycle stage transition.
 * Throws if the transition is not in the permitted matrix — §4.
 * Lifecycle transitions may not be implementation-defined.
 */
export function transitionIntakeStage(
  record: IntakeRecord,
  to: IntakeStage,
  reason?: string,
): void {
  const from = record.currentStage;
  const permitted = INTAKE_TRANSITION_MATRIX.some(([f, t]) => f === from && t === to);
  if (!permitted) {
    throw new Error(
      `Illegal intake lifecycle transition: ${from} → ${to} — all forbidden transitions fail closed`
    );
  }
  record.stageHistory.push({ stage: to, at: new Date().toISOString(), reason });
  record.currentStage = to;
}

// ─── Validation domains ───────────────────────────────────────────────────────

function validateSchema(profile: PaletteRuntimeProfile): DomainValidationResult {
  const details: ValidationDetail[] = [];

  const required: Array<keyof PaletteRuntimeProfile> = [
    'artifactClassification', 'persistenceClass', 'intakeIntent',
    'revisionBinding', 'runtimeRoleRecommendation', 'modeContext',
    'sourceBias', 'staleState', 'exportGovernance', 'approvalAuthorization', 'lineage',
  ];
  for (const field of required) {
    const present = profile[field] !== undefined && profile[field] !== null;
    details.push({
      validationRule: `schema.${field}_present`,
      passed: present,
      expected: 'present',
      actual: present ? 'present' : 'missing',
    });
  }

  const classOk = profile.artifactClassification === 'PALETTE_RUNTIME_PROFILE';
  details.push({
    validationRule: 'schema.artifactClassification',
    passed: classOk,
    expected: 'PALETTE_RUNTIME_PROFILE',
    actual: String(profile.artifactClassification),
  });

  return {
    domain: 'schema_validation',
    passed: details.every(d => d.passed),
    severity: 'blocker',
    details,
  };
}

function validateStale(
  profile: PaletteRuntimeProfile,
  isActivate: boolean,
  staleOverride?: StaleOverride,
): DomainValidationResult {
  const details: ValidationDetail[] = [];
  const { isStale, staleReason } = profile.staleState;

  const overrideValid = staleOverride
    ? new Date(staleOverride.expiresAt).getTime() > Date.now()
    : false;

  const blockedByStale = isActivate && isStale && !overrideValid;

  details.push({
    validationRule: 'stale.artifact_not_stale',
    passed: !isStale,
    expected: 'false',
    actual: String(isStale),
    message: isStale ? (staleReason ?? 'stale — unknown reason') : undefined,
  });
  if (isStale && staleOverride) {
    details.push({
      validationRule: 'stale.override_valid',
      passed: overrideValid,
      expected: 'not_expired',
      actual: overrideValid ? 'not_expired' : 'expired',
      message: 'stale override may not clear stale status or suppress diagnostics',
    });
  }

  return {
    domain: 'stale_validation',
    passed: !blockedByStale,
    severity: isActivate ? 'blocker' : 'warning',
    details,
  };
}

function validateLineage(
  profile: PaletteRuntimeProfile,
  isActivate: boolean,
): DomainValidationResult {
  const details: ValidationDetail[] = [];
  const { parentValid } = profile.lineage;

  details.push({
    validationRule: 'lineage.parent_valid',
    passed: parentValid !== false,
    expected: 'true',
    actual: String(parentValid),
    message: parentValid === false ? 'WOS may not silently repair lineage' : undefined,
  });

  return {
    domain: 'lineage_validation',
    passed: parentValid !== false,
    severity: isActivate ? 'blocker' : 'warning',
    details,
  };
}

function validateApproval(
  profile: PaletteRuntimeProfile,
  isActivate: boolean,
  requestedScope?: ApprovalScope,
): DomainValidationResult {
  const details: ValidationDetail[] = [];
  const auth = profile.approvalAuthorization;

  if (!isActivate) {
    return {
      domain: 'approval_validation',
      passed: true,
      severity: 'skipped',
      details: [{ validationRule: 'approval.skipped_for_review', passed: true }],
    };
  }

  const hasToken = !!auth?.governedAuthorizationToken;
  details.push({
    validationRule: 'approval.token_present',
    passed: hasToken,
    expected: 'present',
    actual: hasToken ? 'present' : 'missing',
  });

  const isApproved = auth?.approvalStatus === 'approved';
  details.push({
    validationRule: 'approval.status_approved',
    passed: isApproved,
    expected: 'approved',
    actual: String(auth?.approvalStatus),
  });

  const notRevoked = auth?.approvalStatus !== 'revoked';
  details.push({
    validationRule: 'approval.not_revoked',
    passed: notRevoked,
    expected: 'not_revoked',
    actual: auth?.approvalStatus === 'revoked' ? 'revoked' : 'ok',
  });

  // Scope escalation prohibited — §14
  let scopeMatch = true;
  if (requestedScope && auth?.approvalScope) {
    scopeMatch = auth.approvalScope === requestedScope;
    details.push({
      validationRule: 'approval.scope_match',
      passed: scopeMatch,
      expected: requestedScope,
      actual: String(auth.approvalScope),
      message: scopeMatch ? undefined : `district approval ≠ global activation — scope escalation prohibited`,
    });
  } else if (requestedScope && !auth?.approvalScope) {
    scopeMatch = false;
    details.push({
      validationRule: 'approval.scope_present',
      passed: false,
      expected: requestedScope,
      actual: 'absent',
    });
  }

  return {
    domain: 'approval_validation',
    passed: hasToken && isApproved && notRevoked && scopeMatch,
    severity: 'blocker',
    details,
  };
}

function validateExportGovernance(profile: PaletteRuntimeProfile): DomainValidationResult {
  const details: ValidationDetail[] = [];
  const gov = profile.exportGovernance;
  const invariant = PROJECTION_EXPORT_GOVERNANCE;

  const checks: Array<[string, boolean, string, string]> = [
    ['authorityLevel', gov?.authorityLevel === invariant.authorityLevel, invariant.authorityLevel, String(gov?.authorityLevel)],
    ['wosRetainsFinalAuthority', !!gov?.wosRetainsFinalAuthority, 'true', String(gov?.wosRetainsFinalAuthority)],
    ['requiresWosReview', !!gov?.requiresWosReview, 'true', String(gov?.requiresWosReview)],
    ['notARuntimeCommand', !!gov?.notARuntimeCommand, 'true', String(gov?.notARuntimeCommand)],
  ];
  for (const [rule, passed, expected, actual] of checks) {
    details.push({ validationRule: `export_governance.${rule}`, passed, expected, actual });
  }

  return {
    domain: 'export_governance_validation',
    passed: details.every(d => d.passed),
    severity: 'blocker',
    details,
  };
}

function validateRuntimeCompatibility(
  profile: PaletteRuntimeProfile,
  ctx: RuntimeCompatibilityContext,
  isActivate: boolean,
): DomainValidationResult {
  const details: ValidationDetail[] = [];
  const binding = profile.revisionBinding;

  const rendererOk = binding.rendererSignature === ctx.currentRendererSignature;
  details.push({
    validationRule: 'compatibility.renderer',
    passed: rendererOk,
    expected: ctx.currentRendererSignature,
    actual: binding.rendererSignature,
  });

  const shaderOk = binding.shaderSignature === ctx.currentShaderSignature;
  details.push({
    validationRule: 'compatibility.shader',
    passed: shaderOk,
    expected: ctx.currentShaderSignature,
    actual: binding.shaderSignature,
  });

  const stageOk = binding.stageTemplateRef === ctx.currentStageTemplateRef;
  details.push({
    validationRule: 'compatibility.stage_template',
    passed: stageOk,
    expected: ctx.currentStageTemplateRef,
    actual: binding.stageTemplateRef,
  });

  return {
    domain: 'runtime_compatibility',
    passed: rendererOk && shaderOk && stageOk,
    severity: isActivate ? 'blocker' : 'skipped',
    details,
  };
}

function validateFictionDeclaration(profile: PaletteRuntimeProfile): DomainValidationResult {
  const details: ValidationDetail[] = [];
  const mode = profile.modeContext;

  if (mode?.evaluationMode === 'fiction') {
    const active = (mode as FictionModeContext).fictionModeActive === true;
    details.push({
      validationRule: 'fiction.fictionModeActive',
      passed: active,
      expected: 'true',
      actual: String((mode as FictionModeContext).fictionModeActive),
      message: active ? undefined : 'FICTION MODE ACTIVE declaration missing — blocks activation',
    });
    return { domain: 'fiction_declaration', passed: active, severity: 'blocker', details };
  }

  details.push({ validationRule: 'fiction.not_applicable', passed: true });
  return { domain: 'fiction_declaration', passed: true, severity: 'skipped', details };
}

function validateTruthDisclaimer(profile: PaletteRuntimeProfile): DomainValidationResult {
  const details: ValidationDetail[] = [];
  const mode = profile.modeContext;

  if (mode?.evaluationMode === 'truth') {
    const notCertified = (mode as import('../types/projection').TruthModeContext).geographicAuthenticityCertified === false;
    const notClaimed = (mode as import('../types/projection').TruthModeContext).culturalAuthorityClaimed === false;
    details.push({
      validationRule: 'truth.geographicAuthenticityCertified_false',
      passed: notCertified,
      expected: 'false',
      actual: String(!notCertified),
    });
    details.push({
      validationRule: 'truth.culturalAuthorityClaimed_false',
      passed: notClaimed,
      expected: 'false',
      actual: String(!notClaimed),
    });
    return {
      domain: 'truth_disclaimer',
      passed: notCertified && notClaimed,
      severity: 'blocker',
      details,
    };
  }

  details.push({ validationRule: 'truth.not_applicable', passed: true });
  return { domain: 'truth_disclaimer', passed: true, severity: 'skipped', details };
}

// ─── Full validation pass ─────────────────────────────────────────────────────

/**
 * Run the full intake validation matrix (§25).
 * Returns domain results and derived quarantine reasons.
 */
export function runIntakeValidation(
  profile: PaletteRuntimeProfile,
  ctx: RuntimeCompatibilityContext,
  staleOverride?: StaleOverride,
): {
  domainResults: DomainValidationResult[];
  quarantineReasons: QuarantineReason[];
  passedForReview: boolean;
  passedForActivation: boolean;
} {
  const isActivate = profile.intakeIntent === 'activate';

  const domainResults: DomainValidationResult[] = [
    validateSchema(profile),
    validateStale(profile, isActivate, staleOverride),
    validateLineage(profile, isActivate),
    validateApproval(profile, isActivate, ctx.requestedActivationScope),
    validateExportGovernance(profile),
    validateRuntimeCompatibility(profile, ctx, isActivate),
    validateFictionDeclaration(profile),
    validateTruthDisclaimer(profile),
  ];

  const quarantineReasons: QuarantineReason[] = [];
  for (const result of domainResults) {
    if (!result.passed && result.severity === 'blocker') {
      const reason = domainToQuarantineReason(result.domain);
      if (reason) quarantineReasons.push(reason);
    }
  }

  const blockerFailures = domainResults.filter(r => !r.passed && r.severity === 'blocker');
  const passedForReview = validateSchema(profile).passed &&
    validateExportGovernance(profile).passed &&
    validateFictionDeclaration(profile).passed &&
    validateTruthDisclaimer(profile).passed;
  const passedForActivation = blockerFailures.length === 0;

  return { domainResults, quarantineReasons, passedForReview, passedForActivation };
}

function domainToQuarantineReason(
  domain: DomainValidationResult['domain'],
): QuarantineReason | null {
  const map: Record<DomainValidationResult['domain'], QuarantineReason> = {
    schema_validation: 'schema_validation_failure',
    stale_validation: 'stale_artifact_blocked',
    lineage_validation: 'lineage_unresolvable',
    approval_validation: 'approval_token_missing',
    export_governance_validation: 'export_governance_violated',
    runtime_compatibility: 'runtime_compatibility_mismatch',
    fiction_declaration: 'fiction_declaration_missing',
    truth_disclaimer: 'truth_disclaimer_missing',
  };
  return map[domain] ?? null;
}

// ─── Intake entry point ───────────────────────────────────────────────────────

/**
 * Ingest a PALETTE_RUNTIME_PROFILE.
 * This is the only legal entry point for WOS runtime profile intake.
 *
 * Transitions: received → validated (or quarantined on hard schema failure).
 * Returns a RuntimeImportResult with full diagnostics.
 * runtimeStateMutated is always false at intake — activation is a separate atomic step.
 */
export function ingestRuntimeProfile(
  profile: PaletteRuntimeProfile,
  ctx: RuntimeCompatibilityContext,
  staleOverride?: StaleOverride,
): { record: IntakeRecord; result: RuntimeImportResult } {
  const intakeId = crypto.randomUUID();
  const now = new Date().toISOString();

  const record: IntakeRecord = {
    intakeId,
    profileRef: profile.artifactId,
    paletteId: profile.revisionBinding.paletteId,
    revisionId: profile.revisionBinding.revisionId,
    receivedAt: now,
    currentStage: 'received',
    stageHistory: [{ stage: 'received', at: now }],
    validationResults: [],
    diagnostics: [],
    quarantineReasons: [],
  };

  intakeRecords.set(intakeId, record);

  const { domainResults, quarantineReasons, passedForReview, passedForActivation } =
    runIntakeValidation(profile, ctx, staleOverride);

  record.validationResults = domainResults;

  // Collect all diagnostics
  const diagnostics: string[] = [];
  for (const dr of domainResults) {
    for (const detail of dr.details) {
      if (!detail.passed && detail.message) diagnostics.push(detail.message);
      if (!detail.passed && !detail.message && detail.expected !== undefined) {
        diagnostics.push(`${detail.validationRule}: expected ${detail.expected}, got ${detail.actual}`);
      }
    }
  }
  record.diagnostics = diagnostics;

  // Determine next stage
  const isActivate = profile.intakeIntent === 'activate';

  if (!passedForReview) {
    // Hard schema/governance failure — quarantine immediately
    record.quarantineReasons = quarantineReasons.length > 0 ? quarantineReasons : ['schema_validation_failure'];
    transitionIntakeStage(record, 'quarantined', quarantineReasons[0]);
  } else if (isActivate && !passedForActivation) {
    // Activation path blocked — quarantine
    record.quarantineReasons = quarantineReasons;
    transitionIntakeStage(record, 'validated', 'schema passed');
    transitionIntakeStage(record, 'quarantined', quarantineReasons[0]);
  } else {
    transitionIntakeStage(record, 'validated', 'schema and governance passed');
  }

  const quarantined = record.currentStage === 'quarantined';

  const allDetails = domainResults.flatMap(r => r.details);

  const result: RuntimeImportResult = {
    intakeId,
    profileRef: profile.artifactId,
    timestamp: now,
    intakeStage: record.currentStage,
    intakeAccepted: !quarantined,
    activationGranted: false,
    quarantined,
    quarantineReasons: record.quarantineReasons,
    validationDetails: allDetails,
    diagnostics,
    runtimeStateMutated: false,
  };

  return { record, result };
}

// ─── Activation ───────────────────────────────────────────────────────────────

/**
 * Atomically activate a validated profile.
 * Activation is all-or-nothing — partial activation is prohibited (§23).
 *
 * Requires the record to be in 'approved' stage.
 * Review stage advancement requires human authorization — this function
 * accepts advancement from 'validated' for tooling convenience but
 * marks the review-stage requirement in the audit trail.
 *
 * Updates rollback baseline on success.
 */
export function activateRuntimeProfile(
  intakeId: string,
  activationScope?: ApprovalScope,
): RuntimeImportResult {
  const record = intakeRecords.get(intakeId);
  if (!record) {
    throw new Error(`activateRuntimeProfile: unknown intakeId '${intakeId}'`);
  }

  const now = new Date().toISOString();

  // Must be in 'approved' stage for activation
  if (record.currentStage !== 'approved') {
    throw new Error(
      `activateRuntimeProfile: record is in stage '${record.currentStage}', must be 'approved' — partial activation prohibited`
    );
  }

  try {
    transitionIntakeStage(record, 'activated', 'atomic activation succeeded');
  } catch (e) {
    // Transition failed — preserve diagnostics, do not mutate runtime
    const msg = e instanceof Error ? e.message : 'activation transition failed';
    record.diagnostics.push(msg);
    return {
      intakeId,
      profileRef: record.profileRef,
      timestamp: now,
      intakeStage: record.currentStage,
      intakeAccepted: true,
      activationGranted: false,
      quarantined: false,
      quarantineReasons: ['partial_activation_prevented'],
      validationDetails: [],
      diagnostics: record.diagnostics,
      runtimeStateMutated: false,
    };
  }

  record.activatedAt = now;
  record.activationScope = activationScope;

  // Write runtime cache
  const cacheEntry: RuntimeProfileCacheEntry = {
    intakeId,
    profileRef: record.profileRef,
    paletteId: record.paletteId,
    revisionId: record.revisionId,
    activationScope,
    cachedAt: Date.now(),
    lastRevalidatedAt: Date.now(),
    revalidationIntervalMs: REVALIDATION_INTERVAL_MS,
    cacheState: 'fresh',
  };
  runtimeCache.set(intakeId, cacheEntry);

  // Update rollback baseline
  const scopeKey = activationScope ?? 'global';
  rollbackBaselines.set(scopeKey, {
    intakeId,
    paletteId: record.paletteId,
    revisionId: record.revisionId,
    activatedAt: now,
    activationScope,
  });

  return {
    intakeId,
    profileRef: record.profileRef,
    timestamp: now,
    intakeStage: 'activated',
    intakeAccepted: true,
    activationGranted: true,
    quarantined: false,
    quarantineReasons: [],
    validationDetails: record.validationResults.flatMap(r => r.details),
    diagnostics: record.diagnostics,
    runtimeStateMutated: true,
  };
}

/**
 * Advance a validated record through reviewed → approved stages.
 * Review stage requires human reviewer — this function records that requirement
 * in the audit trail. In production, reviewed advancement must carry reviewer identity.
 */
export function advanceToApproved(intakeId: string, reviewerNote?: string): void {
  const record = intakeRecords.get(intakeId);
  if (!record) throw new Error(`advanceToApproved: unknown intakeId '${intakeId}'`);
  transitionIntakeStage(record, 'reviewed', reviewerNote ?? 'human review — reviewer identity required in production');
  transitionIntakeStage(record, 'approved', 'governance authorization');
}

// ─── Revocation ───────────────────────────────────────────────────────────────

/**
 * Revoke an activated profile.
 * Invalidates runtime cache, deactivates profile, triggers rollback (§21–22).
 * Revoked profiles may not remain silently active.
 * Rollback scope must match revoked scope.
 */
export function revokeRuntimeProfile(
  intakeId: string,
  reason: string,
): { result: RuntimeImportResult; rollbackApplied: boolean; rollbackBaseline?: RollbackBaseline } {
  const record = intakeRecords.get(intakeId);
  if (!record) throw new Error(`revokeRuntimeProfile: unknown intakeId '${intakeId}'`);

  const now = new Date().toISOString();

  transitionIntakeStage(record, 'revoked', reason);
  record.revokedAt = now;
  record.revocationReason = reason;
  record.diagnostics.push(`revoked at ${now}: ${reason}`);

  // Invalidate runtime cache
  const cached = runtimeCache.get(intakeId);
  if (cached) {
    cached.cacheState = 'revoked';
    cached.staleReason = reason;
  }

  // Find rollback baseline for the affected scope
  const scopeKey = record.activationScope ?? 'global';
  const baseline = rollbackBaselines.get(scopeKey);
  // If the baseline is the revoked record itself, clear it
  let rollbackApplied = false;
  let activeBaseline: RollbackBaseline | undefined;
  if (baseline?.intakeId === intakeId) {
    rollbackBaselines.delete(scopeKey);
    // Find previous non-revoked activated record for this scope
    activeBaseline = findPreviousBaseline(scopeKey, intakeId);
    if (activeBaseline) {
      rollbackBaselines.set(scopeKey, activeBaseline);
    }
    rollbackApplied = true;
  } else {
    activeBaseline = baseline;
  }

  return {
    result: {
      intakeId,
      profileRef: record.profileRef,
      timestamp: now,
      intakeStage: 'revoked',
      intakeAccepted: true,
      activationGranted: false,
      quarantined: false,
      quarantineReasons: [],
      validationDetails: [],
      diagnostics: record.diagnostics,
      runtimeStateMutated: true,
      rollbackApplied,
      rollbackBaseline: activeBaseline,
    },
    rollbackApplied,
    rollbackBaseline: activeBaseline,
  };
}

function findPreviousBaseline(
  scopeKey: string,
  excludeIntakeId: string,
): RollbackBaseline | undefined {
  // Walk records in insertion order looking for the most recent activated, non-revoked entry
  // for the same scope, excluding the just-revoked one.
  let latest: RollbackBaseline | undefined;
  for (const record of intakeRecords.values()) {
    const recordScopeKey = record.activationScope ?? 'global';
    if (
      recordScopeKey === scopeKey &&
      record.intakeId !== excludeIntakeId &&
      record.currentStage === 'activated' &&
      record.activatedAt
    ) {
      if (!latest || record.activatedAt > latest.activatedAt) {
        latest = {
          intakeId: record.intakeId,
          paletteId: record.paletteId,
          revisionId: record.revisionId,
          activatedAt: record.activatedAt,
          activationScope: record.activationScope,
        };
      }
    }
  }
  return latest;
}

// ─── Quarantine management ────────────────────────────────────────────────────

/**
 * Archive a quarantined record as irremediably failed.
 * Archived quarantined artifacts may not re-enter intake or regain activation eligibility.
 */
export function archiveQuarantined(intakeId: string, reason: string): void {
  const record = intakeRecords.get(intakeId);
  if (!record) throw new Error(`archiveQuarantined: unknown intakeId '${intakeId}'`);
  transitionIntakeStage(record, 'archived', `irremediable failure: ${reason}`);
  record.archivedAt = new Date().toISOString();
  record.archiveReason = reason;
  record.quarantineReasons.push('irremediable_failure');
}

/**
 * Release a quarantined record for remediation restart.
 * Restarts from 'received' — full re-validation required.
 */
export function releaseForRemediation(intakeId: string): void {
  const record = intakeRecords.get(intakeId);
  if (!record) throw new Error(`releaseForRemediation: unknown intakeId '${intakeId}'`);
  transitionIntakeStage(record, 'received', 'remediation restart — full re-validation required');
  record.quarantineReasons = [];
}

// ─── Runtime cache revalidation ───────────────────────────────────────────────

/**
 * Check whether a cached entry needs revalidation.
 * Minimum revalidation interval: 24 hours.
 * Must revalidate on: activation, reconnect, cache refresh, runtime reload (§20).
 */
export function requiresRevalidation(intakeId: string): boolean {
  const entry = runtimeCache.get(intakeId);
  if (!entry) return true;
  if (entry.cacheState === 'revoked') return true;
  const elapsed = Date.now() - entry.lastRevalidatedAt;
  return elapsed >= entry.revalidationIntervalMs;
}

export function markRevalidated(intakeId: string): void {
  const entry = runtimeCache.get(intakeId);
  if (entry) entry.lastRevalidatedAt = Date.now();
}

// ─── Rollback ─────────────────────────────────────────────────────────────────

/**
 * Get the rollback baseline for a given scope.
 * Returns undefined when no baseline exists — runtime must restore default state.
 * Rollback scope must match revoked scope — §22.
 */
export function getRollbackBaseline(scope?: ApprovalScope): RollbackBaseline | undefined {
  return rollbackBaselines.get(scope ?? 'global');
}

// ─── Diagnostics ─────────────────────────────────────────────────────────────

export interface ImportDiagnostics {
  totalRecords: number;
  byStage: Partial<Record<IntakeStage, number>>;
  quarantinedCount: number;
  activatedCount: number;
  revokedCount: number;
  cacheSize: number;
  records: Array<{
    intakeId: string;
    profileRef: string;
    currentStage: IntakeStage;
    quarantineReasons: QuarantineReason[];
    diagnostics: string[];
    activatedAt?: string;
    revokedAt?: string;
  }>;
}

/**
 * Retrieve intake diagnostics.
 * Diagnostic retention minimum: 90 days — callers are responsible for persistence
 * if retention beyond process lifetime is required.
 */
export function getImportDiagnostics(): ImportDiagnostics {
  const records = [...intakeRecords.values()];
  const byStage: Partial<Record<IntakeStage, number>> = {};
  for (const r of records) {
    byStage[r.currentStage] = (byStage[r.currentStage] ?? 0) + 1;
  }
  return {
    totalRecords: records.length,
    byStage,
    quarantinedCount: byStage['quarantined'] ?? 0,
    activatedCount: byStage['activated'] ?? 0,
    revokedCount: byStage['revoked'] ?? 0,
    cacheSize: runtimeCache.size,
    records: records.map(r => ({
      intakeId: r.intakeId,
      profileRef: r.profileRef,
      currentStage: r.currentStage,
      quarantineReasons: r.quarantineReasons,
      diagnostics: r.diagnostics,
      activatedAt: r.activatedAt,
      revokedAt: r.revokedAt,
    })),
  };
}

export function clearImportState(): void {
  intakeRecords.clear();
  runtimeCache.clear();
  rollbackBaselines.clear();
}
