/**
 * Projection Output Governance — v1.3.0
 *
 * Implements artifact governance, intake validation, stale detection,
 * activation scope checking, and canonical payload construction for
 * Projection Lab outputs.
 *
 * INVARIANTS:
 * - Projection Lab may NOT self-authorize approval.
 * - Missing intakeIntent defaults to 'review' — fail closed.
 * - Activation requires: explicit 'activate' intent + valid approval token + matching scope.
 * - Scope mismatch must fail closed, quarantine activation, generate audit diagnostics.
 * - Stale artifacts must visibly surface state — never persist silently.
 * - WOS retains final runtime sovereignty.
 */

import type {
  PaletteRuntimeProfile,
  ProjectionArtifact,
  ProjectionRevisionBinding,
  ProjectionStaleState,
  ProjectionModeContext,
  ProjectionSourceBias,
  ProjectionLineage,
  ProjectionGovernanceValidationResult,
  IntakeIntent,
  ApprovalScope,
  RecommendationLevel,
  ReplayFidelityClass,
  RuntimeRoleRecommendation,
} from '../types/projection';
import {
  DEFAULT_INTAKE_INTENT,
  INITIAL_STALE_STATE,
  PROJECTION_EXPORT_GOVERNANCE,
} from '../types/projection';

export const PROJECTION_GOVERNANCE_VERSION = '1.3.0';

// ─── Intake intent ────────────────────────────────────────────────────────────

/**
 * Resolve intake intent with fail-safe default.
 * Missing or undefined intakeIntent always resolves to 'review'.
 * Activation requires explicit 'activate' — never assumed.
 */
export function resolveIntakeIntent(intent: IntakeIntent | undefined | null): IntakeIntent {
  if (intent === 'activate') return 'activate';
  return DEFAULT_INTAKE_INTENT;
}

// ─── Stale artifact detection ─────────────────────────────────────────────────

export interface CurrentDependencyHashes {
  revisionHash?: string;
  rendererSignature?: string;
  shaderSignature?: string;
  deterministicParameterHash?: string;
  stageTemplateRef?: string;
}

/**
 * Detect stale artifact by comparing stored binding to current dependency hashes.
 * Returns updated stale state — never mutates the artifact in-place.
 *
 * Stale conditions (§6):
 * - revision hash mismatch
 * - renderer signature mismatch
 * - shader signature mismatch
 * - deterministic parameter hash mismatch
 * - stage template reference mismatch
 */
export function detectStaleState(
  binding: ProjectionRevisionBinding,
  current: CurrentDependencyHashes,
): ProjectionStaleState {
  const now = new Date().toISOString();

  if (current.revisionHash !== undefined && binding.revisionHash !== current.revisionHash) {
    return { isStale: true, staleReason: 'revisionHash mismatch', staleDetectedAt: now };
  }
  if (current.rendererSignature !== undefined && binding.rendererSignature !== current.rendererSignature) {
    return { isStale: true, staleReason: 'rendererSignature mismatch', staleDetectedAt: now };
  }
  if (current.shaderSignature !== undefined && binding.shaderSignature !== current.shaderSignature) {
    return { isStale: true, staleReason: 'shaderSignature mismatch', staleDetectedAt: now };
  }
  if (current.deterministicParameterHash !== undefined && binding.deterministicParameterHash !== current.deterministicParameterHash) {
    return { isStale: true, staleReason: 'deterministicParameterHash mismatch', staleDetectedAt: now };
  }
  if (current.stageTemplateRef !== undefined && binding.stageTemplateRef !== current.stageTemplateRef) {
    return { isStale: true, staleReason: 'stageTemplateRef mismatch', staleDetectedAt: now };
  }

  return INITIAL_STALE_STATE;
}

// ─── Approval validation ──────────────────────────────────────────────────────

export interface ActivationRequest {
  requestedScope: ApprovalScope;
  approvalToken: string | null;
  profile: PaletteRuntimeProfile;
}

/**
 * Validate an activation request.
 * Fails closed when:
 * - approval token is missing
 * - approval scope mismatches requested scope
 * - approval status is not 'approved'
 * - artifact is stale
 * - intakeIntent is not 'activate'
 *
 * Returns audit diagnostics on any failure.
 */
export function validateActivationRequest(
  req: ActivationRequest,
): ProjectionGovernanceValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const { profile, requestedScope, approvalToken } = req;

  // Must have explicit 'activate' intent
  if (resolveIntakeIntent(profile.intakeIntent) !== 'activate') {
    errors.push(`intakeIntent is '${profile.intakeIntent ?? 'missing'}' — activation requires explicit 'activate' declaration`);
  }

  // Must have approval token
  if (!approvalToken || !profile.approvalAuthorization.governedAuthorizationToken) {
    errors.push('approval token missing — activation is fail-closed without governed authorization token');
  }

  // Approval status must be 'approved'
  if (profile.approvalAuthorization.approvalStatus !== 'approved') {
    errors.push(`approvalStatus is '${profile.approvalAuthorization.approvalStatus}' — must be 'approved'`);
  }

  // Scope must match
  const grantedScope = profile.approvalAuthorization.approvalScope;
  if (grantedScope !== undefined && grantedScope !== requestedScope) {
    errors.push(
      `approval scope mismatch — granted '${grantedScope}', requested '${requestedScope}' — activation quarantined`
    );
  }

  // Stale artifacts must be blocked
  if (profile.staleState.isStale) {
    errors.push(`artifact is stale: ${profile.staleState.staleReason ?? 'unknown reason'} — stale artifacts may not activate`);
  }

  const quarantined = errors.length > 0;
  return {
    valid: !quarantined,
    errors,
    warnings,
    activationQuarantined: quarantined || undefined,
    quarantineReason: quarantined ? errors[0] : undefined,
  };
}

// ─── Intake package validation ────────────────────────────────────────────────

/**
 * Validate any projection artifact package before intake.
 * Fails closed on: missing required fields, fiction without declaration,
 * truth without disclaimer, stale artifacts on activation path.
 */
export function validateProjectionArtifact(
  artifact: ProjectionArtifact,
): ProjectionGovernanceValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!artifact.artifactClassification) {
    errors.push('artifactClassification missing — undefined intermediate states are prohibited');
  }
  if (!artifact.persistenceClass) {
    errors.push('persistenceClass missing');
  }

  if (artifact.artifactClassification === 'PALETTE_RUNTIME_PROFILE') {
    const profile = artifact as PaletteRuntimeProfile;

    if (!profile.revisionBinding?.revisionHash) {
      errors.push('revisionBinding.revisionHash missing');
    }
    if (!profile.revisionBinding?.deterministicParameterHash) {
      errors.push('revisionBinding.deterministicParameterHash missing — replay determinism compromised');
    }
    if (!profile.modeContext?.evaluationMode) {
      errors.push('modeContext missing — truth/fiction declaration required');
    }
    if (profile.modeContext?.evaluationMode === 'fiction') {
      const fc = profile.modeContext as import('../types/projection').FictionModeContext;
      if (!fc.fictionModeActive) {
        errors.push('fictionModeActive must be true in fiction mode — fiction must be visibly declared');
      }
    }
    if (profile.modeContext?.evaluationMode === 'truth') {
      const tc = profile.modeContext as import('../types/projection').TruthModeContext;
      if (tc.geographicAuthenticityCertified) {
        errors.push('geographicAuthenticityCertified must be false — truth mode is plausibility only');
      }
      if (tc.culturalAuthorityClaimed) {
        errors.push('culturalAuthorityClaimed must be false — truth mode may not claim cultural authority');
      }
    }
    if (!profile.sourceBias) {
      errors.push('sourceBias missing — source bias must remain machine-readable');
    }
    if (!profile.exportGovernance?.wosRetainsFinalAuthority) {
      errors.push('exportGovernance.wosRetainsFinalAuthority must be true');
    }
    if (profile.staleState?.isStale) {
      warnings.push(`artifact is stale: ${profile.staleState.staleReason ?? 'unknown reason'}`);
    }
  }

  if (artifact.artifactClassification === 'SAVED_PROJECTION_REPORT' ||
      artifact.artifactClassification === 'PALETTE_RUNTIME_PROFILE' ||
      artifact.artifactClassification === 'REPLAY_SNAPSHOT') {
    const withLineage = artifact as { lineage?: ProjectionLineage };
    if (withLineage.lineage?.parentArtifactId && withLineage.lineage.parentValid === false) {
      warnings.push(`parent artifact '${withLineage.lineage.parentArtifactId}' could not be resolved — parentValid: false`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ─── Canonical payload builders ───────────────────────────────────────────────

/**
 * Build a new PALETTE_RUNTIME_PROFILE artifact.
 * intakeIntent defaults to 'review' when not supplied.
 * exportGovernance is always the canonical invariant block.
 */
export function buildPaletteRuntimeProfile(params: {
  revisionBinding: ProjectionRevisionBinding;
  runtimeRoleRecommendation: RuntimeRoleRecommendation;
  modeContext: ProjectionModeContext;
  sourceBias: ProjectionSourceBias;
  lineage: ProjectionLineage;
  intakeIntent?: IntakeIntent;
}): PaletteRuntimeProfile {
  return {
    artifactClassification: 'PALETTE_RUNTIME_PROFILE',
    artifactId: crypto.randomUUID(),
    generatedAt: new Date().toISOString(),
    persistenceClass: 'archival',
    intakeIntent: resolveIntakeIntent(params.intakeIntent),
    revisionBinding: params.revisionBinding,
    runtimeRoleRecommendation: params.runtimeRoleRecommendation,
    modeContext: params.modeContext,
    sourceBias: params.sourceBias,
    staleState: INITIAL_STALE_STATE,
    exportGovernance: PROJECTION_EXPORT_GOVERNANCE,
    approvalAuthorization: {
      governedAuthorizationToken: null,
      approvalStatus: 'unapproved',
    },
    lineage: params.lineage,
  };
}

/**
 * Produce canonical truth mode context.
 * Authority is plausibility assessment only — never authenticity certification.
 */
export function buildTruthModeContext(): import('../types/projection').TruthModeContext {
  return {
    evaluationMode: 'truth',
    authorityClass: 'plausibility_assessment',
    geographicAuthenticityCertified: false,
    culturalAuthorityClaimed: false,
  };
}

/**
 * Produce canonical fiction mode context.
 * Fiction mode must remain visibly declared across all export paths.
 */
export function buildFictionModeContext(): import('../types/projection').FictionModeContext {
  return {
    evaluationMode: 'fiction',
    authorityClass: 'transient_stylization_overlay',
    fictionModeActive: true,
  };
}

/**
 * Produce canonical mood mode context.
 * May influence recommendations but may not assert geographic or cultural truth.
 */
export function buildMoodModeContext(): import('../types/projection').MoodModeContext {
  return {
    evaluationMode: 'mood',
    authorityClass: 'emotional_atmosphere_assessment',
    geographicAuthenticityCertified: false,
    culturalAuthorityClaimed: false,
  };
}

/**
 * Produce canonical reference mode context.
 * May cite source style but may not claim cultural authority.
 */
export function buildReferenceModeContext(): import('../types/projection').ReferenceModeContext {
  return {
    evaluationMode: 'reference',
    authorityClass: 'cultural_reference_assessment',
    geographicAuthenticityCertified: false,
    culturalAuthorityClaimed: false,
  };
}

// ─── Deterministic parameter hash ─────────────────────────────────────────────

/**
 * Serialize evaluation parameters to a stable string for SHA-256 hashing.
 * All float values are normalized to fixed-point integers before hashing
 * to prevent platform drift and hardware variance across replay cycles (§5.2).
 */
export function serializeEvaluationParameters(params: {
  projectionMode: string;
  weatherState: string;
  timeOfDayState: string;
  rendererState: string;
  shaderState: string;
  atmosphericParams: Record<string, number>;
}): string {
  const normalized: Record<string, unknown> = {
    projectionMode: params.projectionMode,
    weatherState: params.weatherState,
    timeOfDayState: params.timeOfDayState,
    rendererState: params.rendererState,
    shaderState: params.shaderState,
    // Normalize floats → fixed-point integers (6 decimal places)
    atmosphericParams: Object.fromEntries(
      Object.entries(params.atmosphericParams)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, Math.round(v * 1_000_000)])
    ),
  };
  return JSON.stringify(normalized);
}

export async function computeDeterministicParameterHash(params: {
  projectionMode: string;
  weatherState: string;
  timeOfDayState: string;
  rendererState: string;
  shaderState: string;
  atmosphericParams: Record<string, number>;
}): Promise<string> {
  const serialized = serializeEvaluationParameters(params);
  const encoded = new TextEncoder().encode(serialized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Revocation ───────────────────────────────────────────────────────────────

/**
 * Apply revocation to a runtime profile.
 * Returns updated profile with revoked status appended into authorization.
 * Colorlab may NOT force direct WOS runtime mutation — revocation is advisory signal only.
 */
export function applyRevocation(
  profile: PaletteRuntimeProfile,
  reason: string,
): PaletteRuntimeProfile {
  return {
    ...profile,
    approvalAuthorization: {
      ...profile.approvalAuthorization,
      approvalStatus: 'revoked',
    },
    staleState: {
      isStale: true,
      staleReason: `revoked: ${reason}`,
      staleDetectedAt: new Date().toISOString(),
    },
  };
}
