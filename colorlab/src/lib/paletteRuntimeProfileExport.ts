/**
 * Palette Runtime Profile Export — v1.0.0
 *
 * Serializes PaletteRuntimeProfile artifacts into governed advisory export payloads
 * for downstream WOS review.
 *
 * INVARIANTS:
 * - Exports are advisory payloads — NEVER runtime commands.
 * - intakeIntent defaults to 'review' when unset.
 * - 'activate' intent requires valid approval payload — fail closed otherwise.
 * - Export governance block is invariant — cannot be disabled or overridden.
 * - Source bias, lineage, stale state survive all export paths.
 * - Colorlab may NOT fabricate approval tokens, approver identity, or timestamps.
 * - WOS retains final runtime sovereignty.
 */

import type { ExportPayload, ExportHeader } from '../types/export';
import { EXPORT_SCHEMA_VERSION } from '../types/export';
import type {
  PaletteRuntimeProfile,
  RuntimeRoleRecommendation,
  RuntimeRoleKey,
  ProjectionGovernanceValidationResult,
} from '../types/projection';
import {
  CANONICAL_RUNTIME_ROLE_KEYS,
  PROJECTION_EXPORT_GOVERNANCE,
} from '../types/projection';
import { resolveIntakeIntent } from './projectionGovernance';
import type { PaletteRuntimeProfileContent } from '../types/export';

export const RUNTIME_PROFILE_EXPORT_VERSION = '1.0.0';

// ─── Canonical role key guard ─────────────────────────────────────────────────

/**
 * Assert that all keys in a recommendation map are canonical runtime role keys.
 * Returns array of invalid keys — empty means valid.
 */
export function validateRoleKeys(recommendation: RuntimeRoleRecommendation): string[] {
  const invalid: string[] = [];
  for (const key of Object.keys(recommendation)) {
    if (!CANONICAL_RUNTIME_ROLE_KEYS.includes(key as RuntimeRoleKey)) {
      invalid.push(key);
    }
  }
  return invalid;
}

const CANONICAL_RECOMMENDATION_VALUES = new Set(['high', 'medium', 'low', 'blocked', 'unknown']);

/**
 * Assert that all values in a recommendation map are canonical recommendation values.
 * Returns array of { key, value } pairs with invalid values.
 */
export function validateRecommendationValues(
  recommendation: RuntimeRoleRecommendation,
): Array<{ key: string; value: string }> {
  const invalid: Array<{ key: string; value: string }> = [];
  for (const [key, value] of Object.entries(recommendation)) {
    if (value !== undefined && !CANONICAL_RECOMMENDATION_VALUES.has(value)) {
      invalid.push({ key, value });
    }
  }
  return invalid;
}

// ─── Export validation ────────────────────────────────────────────────────────

/**
 * Full pre-export validation per §15–16.
 * Returns a GovernanceValidationResult including activation quarantine state.
 *
 * Blocking conditions (§16) — fail the export entirely:
 * - exportGovernance invariant fields violated
 * - activation requested without approval token
 * - activation requested with stale blocking state
 * - activation scope absent
 * - Fiction mode declaration missing when evaluationMode is 'fiction'
 * - Truth non-certification fields missing when evaluationMode is 'truth'
 * - source bias payload missing
 * - lineage missing for activation intent
 *
 * Non-blocking for review intent but logged as warnings:
 * - stale state present (allowed for review, blocked for activate)
 * - invalid parent reference (parentValid: false) — blocks activate, allows review
 */
export function validateRuntimeProfileForExport(
  profile: PaletteRuntimeProfile,
): ProjectionGovernanceValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const intent = resolveIntakeIntent(profile.intakeIntent);
  const isActivate = intent === 'activate';

  // §16 — invariant export governance block
  if (!profile.exportGovernance) {
    errors.push('exportGovernance block missing — required invariant');
  } else {
    if (profile.exportGovernance.authorityLevel !== 'advisory_only') {
      errors.push('exportGovernance.authorityLevel must be "advisory_only"');
    }
    if (!profile.exportGovernance.wosRetainsFinalAuthority) {
      errors.push('exportGovernance.wosRetainsFinalAuthority must be true');
    }
    if (!profile.exportGovernance.requiresWosReview) {
      errors.push('exportGovernance.requiresWosReview must be true');
    }
    if (!profile.exportGovernance.notARuntimeCommand) {
      errors.push('exportGovernance.notARuntimeCommand must be true');
    }
  }

  // §5 — required blocks
  if (!profile.artifactClassification || profile.artifactClassification !== 'PALETTE_RUNTIME_PROFILE') {
    errors.push('artifactClassification must be PALETTE_RUNTIME_PROFILE');
  }
  if (!profile.persistenceClass) {
    errors.push('persistenceClass missing');
  }
  if (!profile.revisionBinding) {
    errors.push('revisionBinding missing');
  } else {
    for (const field of ['paletteId', 'revisionId', 'revisionHash', 'rendererSignature',
                          'shaderSignature', 'stageTemplateRef', 'deterministicParameterHash'] as const) {
      if (!profile.revisionBinding[field]) {
        errors.push(`revisionBinding.${field} missing`);
      }
    }
  }
  if (!profile.sourceBias) {
    errors.push('sourceBias missing — source bias must remain machine-readable');
  }
  if (!profile.staleState) {
    errors.push('staleState missing');
  }
  if (!profile.approvalAuthorization) {
    errors.push('approvalAuthorization block missing');
  }
  if (!profile.lineage) {
    errors.push('lineage block missing');
  }

  // §8 — mode context validation
  if (!profile.modeContext?.evaluationMode) {
    errors.push('modeContext missing — truth/fiction/mood/reference declaration required');
  } else {
    const mode = profile.modeContext;
    if (mode.evaluationMode === 'fiction') {
      if (!(mode as import('../types/projection').FictionModeContext).fictionModeActive) {
        errors.push('fictionModeActive must be true — fiction declaration must survive all export paths');
      }
    }
    if (mode.evaluationMode === 'truth') {
      const tc = mode as import('../types/projection').TruthModeContext;
      if (tc.geographicAuthenticityCertified) {
        errors.push('geographicAuthenticityCertified must be false — truth mode is plausibility only');
      }
      if (tc.culturalAuthorityClaimed) {
        errors.push('culturalAuthorityClaimed must be false — truth mode may not claim cultural authority');
      }
    }
  }

  // §7 — role key and value validation
  if (profile.runtimeRoleRecommendation) {
    const badKeys = validateRoleKeys(profile.runtimeRoleRecommendation);
    if (badKeys.length > 0) {
      errors.push(`runtimeRoleRecommendation contains non-canonical role keys: ${badKeys.join(', ')}`);
    }
    const badValues = validateRecommendationValues(profile.runtimeRoleRecommendation);
    if (badValues.length > 0) {
      errors.push(`runtimeRoleRecommendation contains invalid values: ${badValues.map(b => `${b.key}=${b.value}`).join(', ')}`);
    }
  }

  // ─── Activation-specific blocking rules (§16) ─────────────────────────────
  if (isActivate) {
    if (!profile.approvalAuthorization?.governedAuthorizationToken) {
      errors.push('activation blocked — approval token missing');
    }
    if (profile.approvalAuthorization?.approvalStatus !== 'approved') {
      errors.push(`activation blocked — approvalStatus is '${profile.approvalAuthorization?.approvalStatus ?? 'missing'}', must be 'approved'`);
    }
    if (!profile.approvalAuthorization?.approvalScope) {
      errors.push('activation blocked — approvalScope absent');
    }
    if (profile.staleState?.isStale) {
      errors.push(`activation blocked — artifact is stale: ${profile.staleState.staleReason ?? 'unknown reason'}`);
    }
    if (profile.lineage?.parentValid === false) {
      errors.push('activation blocked — parentValid is false, lineage unresolvable');
    }
  } else {
    // review intent — stale is a warning, not a blocker
    if (profile.staleState?.isStale) {
      warnings.push(`artifact is stale (${profile.staleState.staleReason ?? 'unknown reason'}) — allowed for review intent`);
    }
    if (profile.lineage?.parentValid === false) {
      warnings.push('parentValid is false — parent reference unresolvable, allowed for review intent');
    }
  }

  const quarantined = isActivate && errors.length > 0;
  return {
    valid: errors.length === 0,
    errors,
    warnings,
    activationQuarantined: quarantined || undefined,
    quarantineReason: quarantined ? errors[0] : undefined,
  };
}

// ─── Export header for runtime profile ───────────────────────────────────────

/**
 * Build a minimal ExportHeader for a PALETTE_RUNTIME_PROFILE export.
 * provenance fields come from the revision binding.
 * exportContentHash is computed from content, excluding exportedAt.
 */
async function buildRuntimeProfileHeader(
  profile: PaletteRuntimeProfile,
  contentHash: string,
): Promise<ExportHeader> {
  const binding = profile.revisionBinding;
  return {
    exportSchemaVersion: EXPORT_SCHEMA_VERSION,
    exportType: 'palette_runtime_profile',
    exportIntent: 'integration',
    exportedAt: new Date().toISOString(),
    identity: {
      exportId: crypto.randomUUID(),
      exportContentHash: contentHash,
    },
    provenance: {
      paletteId: binding.paletteId,
      revisionId: binding.revisionId,
      lineageRootId: profile.lineage.parentArtifactId ?? profile.artifactId,
      lineageAncestry: profile.lineage.parentArtifactId
        ? [profile.lineage.parentArtifactId, profile.artifactId]
        : [profile.artifactId],
      revisionHash: binding.revisionHash,
      source_candidates_ref: profile.lineage.sourceCandidatesRef ?? '',
    },
    compatibility: {
      metadataSchemaVersion: '0.0.0',
      cleanupHeuristicVersion: '0.0.0',
      visualizationSchemaVersion: '0.0.0',
    },
    immutableEngineState: {
      deltaEStandard: 'CIEDE2000',
      extractionEngineVersion: RUNTIME_PROFILE_EXPORT_VERSION,
    },
  };
}

async function computeRuntimeProfileContentHash(profile: PaletteRuntimeProfile): Promise<string> {
  // Exclude generatedAt/exportedAt from hash — two exports with identical content
  // but different timestamps are semantically equivalent.
  const hashInput = JSON.stringify({
    artifactClassification: profile.artifactClassification,
    persistenceClass: profile.persistenceClass,
    intakeIntent: resolveIntakeIntent(profile.intakeIntent),
    revisionBinding: profile.revisionBinding,
    runtimeRoleRecommendation: profile.runtimeRoleRecommendation,
    modeContext: profile.modeContext,
    sourceBias: profile.sourceBias,
    staleState: profile.staleState,
    exportGovernance: profile.exportGovernance,
    approvalAuthorization: profile.approvalAuthorization,
    lineage: profile.lineage,
  });
  const encoded = new TextEncoder().encode(hashInput);
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Primary export function ──────────────────────────────────────────────────

export interface RuntimeProfileExportResult {
  payload: ExportPayload<PaletteRuntimeProfileContent>;
  validation: ProjectionGovernanceValidationResult;
}

/**
 * Generate a governed PALETTE_RUNTIME_PROFILE export payload.
 *
 * Fails closed when:
 * - validation fails for activate-intent exports
 * - export governance invariant is violated
 *
 * Review-intent exports with warnings proceed — stale flag and lineage warnings
 * are preserved in the payload rather than blocking.
 *
 * INVARIANT: Colorlab does not activate runtime behavior.
 *            This export is advisory — WOS retains final runtime authority.
 */
export async function generatePaletteRuntimeProfileExport(
  profile: PaletteRuntimeProfile,
): Promise<RuntimeProfileExportResult> {
  // Enforce intakeIntent default before validation
  const resolved: PaletteRuntimeProfile = {
    ...profile,
    intakeIntent: resolveIntakeIntent(profile.intakeIntent),
    exportGovernance: PROJECTION_EXPORT_GOVERNANCE, // invariant — always overwrite
  };

  const validation = validateRuntimeProfileForExport(resolved);

  // Fail closed: activate-intent exports must be valid
  if (!validation.valid && resolved.intakeIntent === 'activate') {
    throw new Error(
      `Palette runtime profile export blocked (fail closed): ${validation.errors.join('; ')}`
    );
  }

  // Hard errors that block even review exports
  const hardErrors = validation.errors.filter(e =>
    e.includes('exportGovernance') ||
    e.includes('artifactClassification') ||
    e.includes('revisionBinding') ||
    e.includes('sourceBias missing') ||
    e.includes('modeContext missing')
  );
  if (hardErrors.length > 0) {
    throw new Error(
      `Palette runtime profile export blocked: ${hardErrors.join('; ')}`
    );
  }

  const contentHash = await computeRuntimeProfileContentHash(resolved);
  const header = await buildRuntimeProfileHeader(resolved, contentHash);

  const payload: ExportPayload<PaletteRuntimeProfileContent> = {
    header,
    content: { runtimeProfile: resolved },
  };

  return { payload, validation };
}

// ─── Download helper ──────────────────────────────────────────────────────────

/**
 * Trigger browser download of a runtime profile export payload.
 * Filename follows the canonical export naming convention.
 */
export function downloadRuntimeProfileExport(
  result: RuntimeProfileExportResult,
): void {
  const { payload } = result;
  const { paletteId, revisionId } = payload.header.provenance;
  const palShort = paletteId.slice(0, 8);
  const revShort = revisionId.slice(0, 8);
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `pal_${palShort}_rev_${revShort}_palette_runtime_profile_${ts}.json`;

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
