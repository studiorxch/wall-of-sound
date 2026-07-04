/**
 * WOS Color Runtime Integration types — v1.1.0
 *
 * Defines the runtime intake boundary between COLORLAB exports and WOS.
 * WOS receives advisory intake packages — NOT archival ownership.
 *
 * INVARIANTS:
 * - authorityClass: 'runtime_local_interpretation' on all runtime payloads.
 * - Runtime-derived palettes carry provenanceClass: 'RUNTIME_DERIVED' — never SOURCE_CANDIDATE.
 * - Runtime caches are discardable and non-archival — zero write-back authority.
 * - Advisory fields are optional signals — WOS must function without them.
 * - Intake always passes through export-boundary serialization (never direct DB access).
 */

import type { RGBColor, LABColor, StructuralRole, InterpretiveRole, CleanupMetrics } from './palette';
import type { EXPORT_SCHEMA_VERSION } from './export';

// ─── Provenance classification ────────────────────────────────────────────────

/**
 * Provenance classes for runtime palette states.
 * Runtime-derived palettes may NEVER re-enter SOURCE_CANDIDATE lineage.
 */
export type RuntimeProvenanceClass =
  | 'SOURCE_CANDIDATE'     // image-derived extraction — COLORLAB archival truth
  | 'RUNTIME_DERIVED'      // runtime adaptation layer output
  | 'ANALYTICAL_DERIVED';  // intelligence-generated interpretation

// ─── Primary payload ──────────────────────────────────────────────────────────

/**
 * Primary color payload — factual rendering input pool.
 * These define available runtime color input truth.
 * They are rendering material — NOT interpretive instructions.
 */
export interface RuntimePrimaryColor {
  candidateRef?: string;
  hex: string;
  rgb: RGBColor;
  lab: LABColor;
}

export interface RuntimePrimaryPayload {
  colors: RuntimePrimaryColor[];
}

// ─── Advisory payload ─────────────────────────────────────────────────────────

/**
 * Advisory metadata payload — interpretive guidance only.
 * WOS may ignore, reinterpret, or weight these dynamically.
 * These may NEVER dictate runtime behavior or enforce rendering logic.
 */
export interface RuntimeAdvisoryPayload {
  /** Advisory signal — NOT structural truth */
  structuralRole?: StructuralRole;
  /** Advisory signal — NOT emotional canon */
  interpretiveRole?: InterpretiveRole;
  /** Advisory signals — NOT environmental directives */
  atmosphereDescriptors?: string[];
  /** Advisory metrics — NOT world-state directives */
  cleanupMetrics?: Pick<CleanupMetrics, 'warmth' | 'harmony'>;
}

// ─── Intake causality ─────────────────────────────────────────────────────────

/**
 * Intake causality — preserves auditability and replay determinism.
 */
export interface IntakeCausality {
  triggerType: 'runtime_load' | 'cache_refresh' | 'district_transition' | 'manual_intake';
  initiatingSystem: 'WOS';
  runtimeContext?: string;
}

// ─── Runtime intake payload ───────────────────────────────────────────────────

/**
 * Canonical runtime intake payload.
 *
 * INVARIANTS:
 * - authorityClass always 'runtime_local_interpretation' — non-archival.
 * - exportReference carries hash for cache validation and replay-drift detection.
 * - provenanceClass declared — runtime-derived palettes never masquerade as extraction truth.
 * - advisory payload is optional — WOS must function without it.
 */
export interface RuntimeIntakePayload {
  runtimeIntakeId: string;
  /** Always 'runtime_local_interpretation' — discardable, non-archival, replay-dependent */
  authorityClass: 'runtime_local_interpretation';
  exportReference: {
    exportId: string;
    exportSchemaVersion: typeof EXPORT_SCHEMA_VERSION;
    /** Used for cache validation and replay-drift detection */
    exportContentHash: string;
  };
  paletteReference: {
    paletteId: string;
    revisionId: string;
    provenanceClass: RuntimeProvenanceClass;
  };
  primaryPayload: RuntimePrimaryPayload;
  /** Optional advisory signals — WOS must function without these */
  advisory?: RuntimeAdvisoryPayload;
  intakeCausality: IntakeCausality;
  intakeTimestamp: string;
}

// ─── Runtime cache ────────────────────────────────────────────────────────────

/**
 * Runtime-local cache entry.
 * Cache is discardable, non-archival, and invalidates on hash mismatch.
 * Stale caches must surface explicit diagnostics — never persist silently.
 */
export interface RuntimeCacheEntry {
  intakePayload: RuntimeIntakePayload;
  cachedAt: number;
  /** authorityClass: always 'runtime_local_interpretation' */
  authorityClass: 'runtime_local_interpretation';
  cacheState: 'fresh' | 'stale';
  staleReason?: string;
}

// ─── Runtime adaptation ───────────────────────────────────────────────────────

/**
 * Runtime adaptation parameters for ephemeral environmental interpretation.
 * Adaptation output carries provenanceClass: 'RUNTIME_DERIVED'.
 * Adaptation may NEVER persist into archive truth or mutate export payloads.
 */
export interface RuntimeAdaptationParams {
  /** 0.0–1.0: multiply L* — darkening/brightening */
  luminanceFactor?: number;
  /** 0.0–2.0: multiply chroma — saturation adjustment */
  chromaFactor?: number;
  /** -50 to +50: shift LAB b* axis — warm/cool */
  warmthShift?: number;
  /** 0.0–1.0: overall blend with neutral grey */
  desaturationBlend?: number;
}

/**
 * Output of a runtime adaptation pass.
 * provenanceClass always 'RUNTIME_DERIVED' — never SOURCE_CANDIDATE.
 */
export interface RuntimeDerivedColor {
  originalRef?: string;
  hex: string;
  rgb: RGBColor;
  lab: LABColor;
  /** Always 'RUNTIME_DERIVED' — adaptation output may never re-enter archival lineage */
  provenanceClass: 'RUNTIME_DERIVED';
  adaptationParams: RuntimeAdaptationParams;
}

// ─── Intake validation ────────────────────────────────────────────────────────

export interface IntakeValidationResult {
  valid: boolean;
  errors: string[];
  /** Stale cache diagnostics — must surface explicitly, never silently persist */
  cacheState?: 'fresh' | 'stale';
  staleReason?: string;
}
