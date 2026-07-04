/**
 * WOS Color Runtime Integration Adapter — v1.1.0
 *
 * Implements the runtime intake boundary between COLORLAB export artifacts
 * and WOS runtime interpretation systems.
 *
 * CRITICAL INVARIANTS:
 * - All intake passes through export-boundary serialization — NEVER direct DB access.
 * - Runtime cache is in-memory only (volatile) — NEVER persists to IndexedDB.
 * - Runtime-derived colors carry provenanceClass: 'RUNTIME_DERIVED' — never SOURCE_CANDIDATE.
 * - Stale caches surface explicit diagnostics — never persist silently.
 * - Advisory signals are optional — runtime must degrade gracefully without them.
 * - Zero archival write authority at any point in this module.
 */

import type { ExportPayload } from '../types/export';
import type { WosPaletteContent } from '../types/export';
import type {
  RuntimeIntakePayload,
  RuntimeCacheEntry,
  RuntimeAdaptationParams,
  RuntimeDerivedColor,
  IntakeValidationResult,
  IntakeCausality,
} from '../types/wos';
import { EXPORT_SCHEMA_VERSION } from '../types/export';
import { rgbToLab, labToRgb, rgbToHex, chroma } from './colorConversion';

export const WOS_RUNTIME_VERSION = '1.1.0';

// ─── Runtime-local cache ──────────────────────────────────────────────────────
// Volatile memory ONLY — zero persistence.
// INVARIANT: cache may NEVER be written to IndexedDB or any persistent storage.

const runtimeCache = new Map<string, RuntimeCacheEntry>();

function cacheKeyFor(exportId: string): string {
  return `wos:intake:${exportId}`;
}

/**
 * Check runtime cache and validate against current export hash.
 * Returns null if cache miss or stale.
 *
 * INVARIANT: stale caches surface explicit diagnostics — never silently persist.
 */
export function checkRuntimeCache(
  exportId: string,
  currentHash: string,
  currentSchemaVersion: string,
): RuntimeCacheEntry | null {
  const entry = runtimeCache.get(cacheKeyFor(exportId));
  if (!entry) return null;

  const { exportReference } = entry.intakePayload;

  // Validate hash — replay drift prevention
  if (exportReference.exportContentHash !== currentHash) {
    const stale: RuntimeCacheEntry = {
      ...entry,
      cacheState: 'stale',
      staleReason: 'exportContentHash mismatch',
    };
    runtimeCache.set(cacheKeyFor(exportId), stale);
    return stale;
  }

  // Validate schema version
  if (exportReference.exportSchemaVersion !== currentSchemaVersion) {
    const stale: RuntimeCacheEntry = {
      ...entry,
      cacheState: 'stale',
      staleReason: 'exportSchemaVersion changed',
    };
    runtimeCache.set(cacheKeyFor(exportId), stale);
    return stale;
  }

  return entry;
}

function writeRuntimeCache(intakePayload: RuntimeIntakePayload): void {
  runtimeCache.set(cacheKeyFor(intakePayload.exportReference.exportId), {
    intakePayload,
    cachedAt: Date.now(),
    authorityClass: 'runtime_local_interpretation',
    cacheState: 'fresh',
  });
}

export function clearRuntimeCache(): void {
  runtimeCache.clear();
}

export function getRuntimeCacheSize(): number {
  return runtimeCache.size;
}

// ─── Consumer verification ────────────────────────────────────────────────────

/**
 * Validate a wos_palette_package export payload before intake.
 * Validation failures fail closed — invalid exports are never silently downgraded.
 */
export function validateIntakePackage(
  pkg: ExportPayload<WosPaletteContent>,
): IntakeValidationResult {
  const errors: string[] = [];
  const { header, content } = pkg;

  if (header.exportType !== 'wos_palette_package') {
    errors.push(`exportType must be 'wos_palette_package', got '${header.exportType}'`);
  }
  if (!header.exportSchemaVersion) {
    errors.push('exportSchemaVersion missing');
  }
  if (!header.identity?.exportContentHash) {
    errors.push('exportContentHash missing — cannot validate replay integrity');
  }
  if (!header.provenance?.revisionId) {
    errors.push('revisionId missing — cannot establish palette reference');
  }
  if (!header.provenance?.paletteId) {
    errors.push('paletteId missing');
  }
  if (!content?.advisory) {
    errors.push('advisory wrapper missing — wos_palette_package must have advisory block');
  }
  if (!content?.advisory?.colors?.length) {
    errors.push('primary colors empty — no rendering material available');
  }

  return { valid: errors.length === 0, errors };
}

// ─── Intake adapter ───────────────────────────────────────────────────────────

/**
 * Ingest a wos_palette_package export into a RuntimeIntakePayload.
 *
 * This is the only legal entry point for WOS palette intake.
 * INVARIANT: intake ALWAYS passes through export-boundary serialization.
 * INVARIANT: direct Colorlab DB access from WOS systems is NEVER permitted.
 *
 * Development acceleration note: local auto-generated export packages are
 * permitted per the Development Boundary Isolation Doctrine. This adapter
 * accepts those packages exactly as it would production exports.
 */
export function ingestWosPalettePackage(
  pkg: ExportPayload<WosPaletteContent>,
  causality: IntakeCausality = {
    triggerType: 'runtime_load',
    initiatingSystem: 'WOS',
    runtimeContext: 'development_preview',
  },
): { payload: RuntimeIntakePayload; cacheEntry: RuntimeCacheEntry; validation: IntakeValidationResult } {
  const validation = validateIntakePackage(pkg);
  if (!validation.valid) {
    throw new Error(
      `WOS intake validation failed (fail closed): ${validation.errors.join('; ')}`
    );
  }

  const { header, content } = pkg;

  // Check runtime cache before building new intake
  const cached = checkRuntimeCache(
    header.identity.exportId,
    header.identity.exportContentHash,
    header.exportSchemaVersion,
  );
  if (cached && cached.cacheState === 'fresh') {
    return { payload: cached.intakePayload, cacheEntry: cached, validation };
  }

  // Build runtime intake payload
  // Primary payload: factual rendering input — hex/rgb/lab/candidateRef
  // Advisory payload: optional interpretation signals
  const intakePayload: RuntimeIntakePayload = {
    runtimeIntakeId: crypto.randomUUID(),
    authorityClass: 'runtime_local_interpretation',
    exportReference: {
      exportId: header.identity.exportId,
      exportSchemaVersion: header.exportSchemaVersion as typeof EXPORT_SCHEMA_VERSION,
      exportContentHash: header.identity.exportContentHash,
    },
    paletteReference: {
      paletteId: header.provenance.paletteId,
      revisionId: header.provenance.revisionId,
      provenanceClass: 'SOURCE_CANDIDATE',
    },
    primaryPayload: {
      colors: content.advisory.colors.map(c => ({
        candidateRef: c.candidateRef,
        hex: c.hex,
        rgb: c.rgb,
        lab: c.lab,
      })),
    },
    advisory: content.advisory.colors.length > 0 ? {
      // Surface the first/dominant role as palette-level advisory hint
      // Individual color roles are in primaryPayload
      atmosphereDescriptors: content.advisory.atmosphereDescriptors,
      cleanupMetrics: content.advisory.cleanupMetrics
        ? { warmth: content.advisory.cleanupMetrics.warmth, harmony: content.advisory.cleanupMetrics.harmony }
        : undefined,
    } : undefined,
    intakeCausality: causality,
    intakeTimestamp: new Date().toISOString(),
  };

  writeRuntimeCache(intakePayload);
  const cacheEntry = runtimeCache.get(cacheKeyFor(header.identity.exportId))!;

  return { payload: intakePayload, cacheEntry, validation };
}

// ─── Runtime adaptation ───────────────────────────────────────────────────────

/**
 * Apply ephemeral runtime adaptation to an intake payload's primary colors.
 *
 * Adaptation is local transient runtime behavior — NOT archival transformation.
 * All output carries provenanceClass: 'RUNTIME_DERIVED'.
 *
 * INVARIANTS:
 * - Output may NEVER be written back to COLORLAB archive.
 * - Output may NEVER re-enter SOURCE_CANDIDATE lineage.
 * - Adaptation does NOT overwrite the intake payload — returns new derived colors.
 */
export function applyRuntimeAdaptation(
  intakePayload: RuntimeIntakePayload,
  params: RuntimeAdaptationParams,
): RuntimeDerivedColor[] {
  const {
    luminanceFactor = 1.0,
    chromaFactor = 1.0,
    warmthShift = 0,
    desaturationBlend = 0,
  } = params;

  return intakePayload.primaryPayload.colors.map(color => {
    const { lab } = color;

    // Apply luminance adjustment
    const newL = Math.max(0, Math.min(100, lab.l * luminanceFactor));

    // Apply chroma adjustment (scale a* and b* toward/away from grey axis)
    const currentChroma = chroma(lab);
    const newChroma = currentChroma > 0
      ? Math.max(0, currentChroma * chromaFactor)
      : 0;
    const chromaScale = currentChroma > 0 ? newChroma / currentChroma : 1;
    const newA = lab.a * chromaScale;
    const newB = lab.b * chromaScale + warmthShift;

    // Desaturation blend toward neutral
    const blendedA = newA * (1 - desaturationBlend);
    const blendedB = newB * (1 - desaturationBlend);

    const adaptedLab = { l: newL, a: blendedA, b: blendedB };
    const adaptedRgb = labToRgb(adaptedLab);
    const adaptedHex = rgbToHex(adaptedRgb);

    return {
      originalRef: color.candidateRef,
      hex: adaptedHex,
      rgb: adaptedRgb,
      lab: adaptedLab,
      provenanceClass: 'RUNTIME_DERIVED' as const,
      adaptationParams: params,
    };
  });
}

// ─── Runtime cache diagnostics ────────────────────────────────────────────────

export interface RuntimeDiagnostics {
  cacheSize: number;
  entries: Array<{
    exportId: string;
    cacheState: 'fresh' | 'stale';
    staleReason?: string;
    cachedAt: string;
    authorityClass: 'runtime_local_interpretation';
    paletteId: string;
    revisionId: string;
  }>;
}

export function getRuntimeDiagnostics(): RuntimeDiagnostics {
  const entries = [...runtimeCache.entries()].map(([, entry]) => ({
    exportId: entry.intakePayload.exportReference.exportId,
    cacheState: entry.cacheState,
    staleReason: entry.staleReason,
    cachedAt: new Date(entry.cachedAt).toISOString(),
    authorityClass: 'runtime_local_interpretation' as const,
    paletteId: entry.intakePayload.paletteReference.paletteId,
    revisionId: entry.intakePayload.paletteReference.revisionId,
  }));
  return { cacheSize: runtimeCache.size, entries };
}
