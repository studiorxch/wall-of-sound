/**
 * Palette Intelligence Engine — v1.1.0
 *
 * Advisory-only interpretive analysis. Zero write authority over the archive.
 * All analyses are revision-bound. Auto-upgrade to newer revisions is forbidden.
 * Transient analysis runs in volatile memory — never persists silently.
 *
 * INVARIANTS:
 * - Analyses bind to explicit revision IDs — never resolve "latest" silently.
 * - Saved reports are append-only — prior reports are never overwritten.
 * - New analyses may NEVER ingest prior reports as analytical truth.
 * - All outputs are advisory — governing systems own acceptance routing.
 * - Cache entries include timestamp, engine version, revision IDs, freshness.
 * - Cached results surface cacheSource + cacheFreshness — never invisible.
 */

import type {
  PaletteRevision,
  PaletteView,
  CleanupPayload,
  SavedView,
  StructuralRole,
  InterpretiveRole,
  LABColor,
} from '../types/palette';
import type {
  IntelligenceReport,
  SimilarityReport,
  LineageReport,
  TrendReport,
  VisualizationReport,
  IntelligenceEngineState,
  AnalysisCausality,
  AnalysisScope,
  ConfidenceValue,
  RoleSuggestion,
  IntelligenceValidationResult,
  SimilarityAnalysisResult,
  LineageAnalysisResult,
  TrendAnalysisResult,
  VisualizationAnalysisResult,
} from '../types/intelligence';
import { confidenceLabel } from '../types/intelligence';
import { deltaE2000, rgbToLab, chroma } from './colorConversion';

export const INTELLIGENCE_ENGINE_VERSION = '1.1.0';
export const CONFIDENCE_SCALE_VERSION = '1.0.0' as const;
export const METADATA_SCHEMA_VERSION = '1.0.0';

// ─── Engine state snapshot ────────────────────────────────────────────────────
// Snapshotted into every report — enables historical analytical determinism.

const SIMILARITY_WEIGHTS = {
  labDistanceWeight: 0.50,
  warmthWeight: 0.25,
  metadataOverlapWeight: 0.25,
} as const;

const LINEAGE_WEIGHTS = {
  depthWeight: 1.0,
} as const;

const TREND_WEIGHTS = {
  roleDistributionWeight: 1.0,
} as const;

function buildEngineState(model: string, weights: Record<string, number>): IntelligenceEngineState {
  return {
    intelligenceEngineVersion: INTELLIGENCE_ENGINE_VERSION,
    analysisModel: model,
    metadataSchemaVersion: METADATA_SCHEMA_VERSION,
    confidenceScaleVersion: CONFIDENCE_SCALE_VERSION,
    mathematicalWeights: weights,
  };
}

const BASE_CAUSALITY: AnalysisCausality = {
  triggerType: 'user_initiated',
  analysisIntent: 'exploratory',
  initiatingActor: 'user',
};

// ─── In-memory cache ──────────────────────────────────────────────────────────
// Performance optimization ONLY — cached intelligence is NOT authoritative.
// Cache entries expire on revision change, engine version change, or manual clear.

interface CacheEntry {
  report: IntelligenceReport;
  cachedAt: number;
  revisionIds: string[];
  engineVersion: string;
}

const cache = new Map<string, CacheEntry>();

function cacheKey(analysisType: string, revisionIds: string[]): string {
  return `${analysisType}:${[...revisionIds].sort().join(',')}:${INTELLIGENCE_ENGINE_VERSION}`;
}

function formatFreshness(cachedAt: number): string {
  const ageMs = Date.now() - cachedAt;
  const days = Math.floor(ageMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor(ageMs / (1000 * 60 * 60));
  if (days === 0 && hours === 0) return 'fresh';
  if (days === 0) return `${hours}_hours_old`;
  return `${days}_day${days === 1 ? '' : 's'}_old`;
}

/**
 * Check cache. Returns report with cacheMetadata populated if hit.
 * INVARIANT: cache miss on engine version change.
 */
function checkCache(analysisType: string, revisionIds: string[]): IntelligenceReport | null {
  const key = cacheKey(analysisType, revisionIds);
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.engineVersion !== INTELLIGENCE_ENGINE_VERSION) {
    cache.delete(key);
    return null;
  }
  const freshness = formatFreshness(entry.cachedAt);
  return {
    ...entry.report,
    cacheMetadata: {
      cacheSource: `precomputed_${new Date(entry.cachedAt).toISOString().slice(0, 10)}`,
      cacheFreshness: freshness,
    },
  };
}

function writeCache(analysisType: string, revisionIds: string[], report: IntelligenceReport): void {
  const key = cacheKey(analysisType, revisionIds);
  cache.set(key, {
    report,
    cachedAt: Date.now(),
    revisionIds,
    engineVersion: INTELLIGENCE_ENGINE_VERSION,
  });
}

export function clearIntelligenceCache(): void {
  cache.clear();
}

// ─── LAB centroid helpers ─────────────────────────────────────────────────────

function paletteCentroid(revision: PaletteRevision): LABColor {
  if (revision.swatches.length === 0) return { l: 50, a: 0, b: 0 };
  const labs = revision.swatches.map(s => rgbToLab(s.color));
  const n = labs.length;
  return {
    l: labs.reduce((s, c) => s + c.l, 0) / n,
    a: labs.reduce((s, c) => s + c.a, 0) / n,
    b: labs.reduce((s, c) => s + c.b, 0) / n,
  };
}

function paletteWarmth(revision: PaletteRevision, cleanupPayload: CleanupPayload | null): number {
  // Prefer cleanup metrics warmth (already computed canonically)
  if (cleanupPayload?.metrics.warmth !== undefined) return cleanupPayload.metrics.warmth;
  // Derive from swatch LAB b* axis
  if (revision.swatches.length === 0) return 0.5;
  const labs = revision.swatches.map(s => rgbToLab(s.color));
  const avgB = labs.reduce((s, c) => s + c.b, 0) / labs.length;
  return Math.max(0, Math.min(1, (avgB + 50) / 100));
}

// ─── Similarity analysis ──────────────────────────────────────────────────────

/**
 * Compare two palette revisions by LAB distance, warmth, and metadata overlap.
 *
 * INVARIANT: analyses bind to explicit revisionId — never auto-resolve.
 * Mathematical weights are snapshotted into the report for historical determinism.
 * Metadata overlap is 0 until Metadata System (0522E) is implemented.
 */
export function analyzeSimilarity(
  revisionA: PaletteRevision,
  revisionB: PaletteRevision,
  cleanupA: CleanupPayload | null,
  cleanupB: CleanupPayload | null,
): SimilarityReport {
  const revisionIds = [revisionA.id, revisionB.id];
  const cached = checkCache('similarity_analysis', revisionIds);
  if (cached) return cached as SimilarityReport;

  const centroidA = paletteCentroid(revisionA);
  const centroidB = paletteCentroid(revisionB);

  // LAB distance signal: 1 - (ΔE / 100) clamped to [0, 1]
  const de = deltaE2000(centroidA, centroidB);
  const labSignal = Math.max(0, Math.min(1, 1 - de / 80));

  // Warmth similarity signal
  const warmthA = paletteWarmth(revisionA, cleanupA);
  const warmthB = paletteWarmth(revisionB, cleanupB);
  const warmthSignal = 1 - Math.abs(warmthA - warmthB);

  // Metadata overlap: 0 — Metadata System (0522E) not yet implemented
  const metadataSignal = 0;

  const { labDistanceWeight, warmthWeight, metadataOverlapWeight } = SIMILARITY_WEIGHTS;
  const similarity = Math.round((
    labDistanceWeight * labSignal +
    warmthWeight * warmthSignal +
    metadataOverlapWeight * metadataSignal
  ) * 100) / 100;

  // Confidence: high if signals agree, conflicting if they diverge significantly
  const signalDivergence = Math.abs(labSignal - warmthSignal);
  let confidenceNumeric: number;
  let conflictingMetrics: string[] | undefined;

  if (signalDivergence > 0.4) {
    confidenceNumeric = 0.35;
    conflictingMetrics = ['labDistance', 'warmthSimilarity'];
  } else {
    confidenceNumeric = 0.4 + (1 - signalDivergence) * 0.55;
  }
  confidenceNumeric = Math.round(confidenceNumeric * 100) / 100;

  const confidence: ConfidenceValue = {
    label: signalDivergence > 0.4 ? 'conflicting' : confidenceLabel(confidenceNumeric),
    numeric: confidenceNumeric,
    determinantSignals: ['labDistance', 'warmthSimilarity'],
    conflictingMetrics,
    uncertaintyRationale: metadataSignal === 0
      ? 'Metadata overlap unavailable (Metadata System not yet active). Score based on LAB + warmth only.'
      : undefined,
    confidenceScaleVersion: CONFIDENCE_SCALE_VERSION,
  };

  const analysis: SimilarityAnalysisResult = {
    similarity,
    confidence,
    signals: {
      labDistance: Math.round(labSignal * 100) / 100,
      warmthSimilarity: Math.round(warmthSignal * 100) / 100,
      metadataOverlap: 0,
    },
    revisionAName: revisionA.name,
    revisionBName: revisionB.name,
  };

  const scope: AnalysisScope = {
    scopeType: 'revision_scope',
    revisionRefs: revisionIds,
    reproducibilityClass: 'deterministic',
  };

  const report: SimilarityReport = {
    analysisId: crypto.randomUUID(),
    parentAnalysisId: null,
    analysisType: 'similarity_analysis',
    analysisVersion: INTELLIGENCE_ENGINE_VERSION,
    generatedAt: new Date().toISOString(),
    engineState: buildEngineState('palette_similarity_v1', SIMILARITY_WEIGHTS),
    analysisCausality: { ...BASE_CAUSALITY, analysisIntent: 'comparative' },
    scope,
    analysis,
    governance: {
      authorityClass: 'advisory_overlay',
      writeProtection: true,
      isHistoricalArtifact: false, // becomes true on save
    },
  };

  writeCache('similarity_analysis', revisionIds, report);
  return report;
}

// ─── Lineage analysis ─────────────────────────────────────────────────────────

/**
 * Analyze the revision history of a palette.
 * Surfaces branching history, depth, revision lifecycle distribution.
 *
 * INVARIANT: lineage analysis may NEVER recommend pruning, promoting, or archiving revisions.
 * Governance transitions remain external to Palette Intelligence.
 */
export function analyzeLineage(
  palette_id: string,
  allRevisions: PaletteRevision[],
): LineageReport {
  const revisionIds = allRevisions.map(r => r.id);
  const cached = checkCache('lineage_analysis', revisionIds);
  if (cached) return cached as LineageReport;

  const revisions = allRevisions.filter(r => r.palette_id === palette_id);

  // Count by lifecycle
  const byLifecycle: Record<string, number> = {};
  for (const r of revisions) {
    byLifecycle[r.lifecycle] = (byLifecycle[r.lifecycle] ?? 0) + 1;
  }

  // Build derivation chain from root to leaf
  const byId = new Map(revisions.map(r => [r.id, r]));
  const roots = revisions.filter(r => !r.derived_from_revision || !byId.has(r.derived_from_revision));
  const chain: string[] = [];
  let current = roots[0];
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    chain.push(current.id);
    // Follow the longest chain
    const children = revisions.filter(r => r.derived_from_revision === current.id);
    current = children[children.length - 1];
  }

  // Branching: any revision that has multiple children
  const childCount = new Map<string, number>();
  for (const r of revisions) {
    if (r.derived_from_revision) {
      childCount.set(r.derived_from_revision, (childCount.get(r.derived_from_revision) ?? 0) + 1);
    }
  }
  const hasBranching = [...childCount.values()].some(c => c > 1);

  const notes: string[] = [];
  if (byLifecycle['RETIRED_ARCHIVE']) notes.push(`${byLifecycle['RETIRED_ARCHIVE']} retired revision(s) in lineage.`);
  if (hasBranching) notes.push('Revision branching detected — multiple derivatives share a common parent.');
  if (revisions.length === 1) notes.push('Single revision — no lineage history yet.');

  const analysis: LineageAnalysisResult = {
    revisionCount: revisions.length,
    depth: chain.length,
    hasBranching,
    revisionsByLifecycle: byLifecycle,
    derivationChain: chain,
    notes,
  };

  const scope: AnalysisScope = {
    scopeType: 'revision_scope',
    revisionRefs: revisionIds,
    reproducibilityClass: 'deterministic',
  };

  const report: LineageReport = {
    analysisId: crypto.randomUUID(),
    parentAnalysisId: null,
    analysisType: 'lineage_analysis',
    analysisVersion: INTELLIGENCE_ENGINE_VERSION,
    generatedAt: new Date().toISOString(),
    engineState: buildEngineState('palette_lineage_v1', LINEAGE_WEIGHTS),
    analysisCausality: BASE_CAUSALITY,
    scope,
    analysis,
    governance: {
      authorityClass: 'advisory_overlay',
      writeProtection: true,
      isHistoricalArtifact: false,
    },
  };

  writeCache('lineage_analysis', revisionIds, report);
  return report;
}

// ─── Trend analysis ───────────────────────────────────────────────────────────

/**
 * Archive-scale pattern inspection across all active palettes.
 *
 * INVARIANT: may NEVER define canon, rank importance, suppress outliers,
 * optimize creative direction, or become engagement analytics.
 */
export function analyzeTrends(
  activePalettes: PaletteView[],
  cleanupPayloads: Map<string, CleanupPayload>,
): TrendReport {
  const revisionIds = activePalettes.map(p => p.revision_id);
  const cached = checkCache('trend_analysis', revisionIds);
  if (cached) return cached as TrendReport;

  const interpretiveRoleDist: Record<string, number> = {};
  const structuralRoleDist: Record<string, number> = {};
  const metricsAccum = { warmth: 0, saturation: 0, contrast: 0, energy: 0, harmony: 0 };
  let metricsCount = 0;
  const labAccum = { l: 0, c: 0, b: 0 };
  let labCount = 0;

  for (const palette of activePalettes) {
    const payload = cleanupPayloads.get(palette.revision_id);

    if (payload) {
      // Role distributions from cleanup payload
      for (const c of payload.curatedColors) {
        interpretiveRoleDist[c.interpretiveRole] = (interpretiveRoleDist[c.interpretiveRole] ?? 0) + 1;
        structuralRoleDist[c.structuralRole] = (structuralRoleDist[c.structuralRole] ?? 0) + 1;
        labAccum.l += c.lab.l;
        labAccum.c += chroma(c.lab);
        labAccum.b += c.lab.b;
        labCount++;
      }
      // Metrics accumulation
      const m = payload.metrics;
      metricsAccum.warmth     += m.warmth;
      metricsAccum.saturation += m.saturation;
      metricsAccum.contrast   += m.contrast;
      metricsAccum.energy     += m.energy;
      metricsAccum.harmony    += m.harmony;
      metricsCount++;
    } else {
      // Derive from swatches
      for (const swatch of palette.swatches) {
        const lab = rgbToLab(swatch.color);
        labAccum.l += lab.l;
        labAccum.c += chroma(lab);
        labAccum.b += lab.b;
        labCount++;
      }
    }
  }

  const n = Math.max(1, metricsCount);
  const averageMetrics = {
    warmth:     Math.round((metricsAccum.warmth     / n) * 100) / 100,
    saturation: Math.round((metricsAccum.saturation / n) * 100) / 100,
    contrast:   Math.round((metricsAccum.contrast   / n) * 100) / 100,
    energy:     Math.round((metricsAccum.energy     / n) * 100) / 100,
    harmony:    Math.round((metricsAccum.harmony    / n) * 100) / 100,
  };

  const lc = Math.max(1, labCount);
  const colorSpaceTendencies = {
    avgL: Math.round((labAccum.l / lc) * 10) / 10,
    avgC: Math.round((labAccum.c / lc) * 10) / 10,
    avgB: Math.round((labAccum.b / lc) * 10) / 10,
  };

  const notes: string[] = [];
  if (metricsCount < activePalettes.length) {
    notes.push(`${activePalettes.length - metricsCount} palette(s) lack cleanup payloads — role distributions are partial.`);
  }
  const topRole = Object.entries(interpretiveRoleDist).sort((a, b) => b[1] - a[1])[0];
  if (topRole) notes.push(`Most common interpretive role: "${topRole[0]}" (${topRole[1]} colors).`);

  const analysis: TrendAnalysisResult = {
    paletteCount: activePalettes.length,
    interpretiveRoleDistribution: interpretiveRoleDist,
    structuralRoleDistribution: structuralRoleDist,
    averageMetrics,
    colorSpaceTendencies,
    notes,
  };

  const scope: AnalysisScope = {
    scopeType: 'revision_scope',
    revisionRefs: revisionIds,
    reproducibilityClass: 'deterministic',
  };

  const report: TrendReport = {
    analysisId: crypto.randomUUID(),
    parentAnalysisId: null,
    analysisType: 'trend_analysis',
    analysisVersion: INTELLIGENCE_ENGINE_VERSION,
    generatedAt: new Date().toISOString(),
    engineState: buildEngineState('palette_trend_v1', TREND_WEIGHTS),
    analysisCausality: { ...BASE_CAUSALITY, analysisIntent: 'archival' },
    scope,
    analysis,
    governance: {
      authorityClass: 'advisory_overlay',
      writeProtection: true,
      isHistoricalArtifact: false,
    },
  };

  writeCache('trend_analysis', revisionIds, report);
  return report;
}

// ─── Visualization analysis ───────────────────────────────────────────────────

/**
 * Inspect a saved view's structural properties.
 * May NEVER redefine visualization truth or mutate saved views.
 */
export function analyzeVisualization(
  view: SavedView,
  resolvedPaletteCount: number,
  staleFilters: string[],
): VisualizationReport {
  const revisionIds = view.scope.revisionRefs ?? [];

  const layoutSeedValid = view.layoutState.layoutSeed === view.viewId;

  const notes: string[] = [];
  if (!layoutSeedValid) notes.push('Layout seed does not match viewId — determinism constraint violated.');
  if (staleFilters.length > 0) notes.push(`${staleFilters.length} stale filter term(s) detected.`);
  if (view.scopeResolutionMode === 'current_revision') {
    notes.push('Scope uses current_revision — results will vary at different render times (non-deterministic replay).');
  }

  const analysis: VisualizationAnalysisResult = {
    viewId: view.viewId,
    visualizationMode: view.visualizationMode,
    scopeResolutionMode: view.scopeResolutionMode,
    paletteCount: resolvedPaletteCount,
    hasStaleFilters: staleFilters.length > 0,
    staleFilterTerms: staleFilters,
    layoutSeedValid,
    notes,
  };

  const scope: AnalysisScope = {
    scopeType: revisionIds.length > 0 ? 'revision_scope' : 'filter_scope',
    revisionRefs: revisionIds.length > 0 ? revisionIds : undefined,
    reproducibilityClass:
      view.scopeResolutionMode === 'pinned_revision' ? 'deterministic' : 'non_deterministic',
  };

  return {
    analysisId: crypto.randomUUID(),
    parentAnalysisId: null,
    analysisType: 'visualization_analysis',
    analysisVersion: INTELLIGENCE_ENGINE_VERSION,
    generatedAt: new Date().toISOString(),
    engineState: buildEngineState('visualization_analysis_v1', {}),
    analysisCausality: BASE_CAUSALITY,
    scope,
    analysis,
    governance: {
      authorityClass: 'advisory_overlay',
      writeProtection: true,
      isHistoricalArtifact: false,
    },
  } as VisualizationReport;
}

// ─── Role suggestions ─────────────────────────────────────────────────────────

/**
 * Generate advisory role suggestions for a palette's working colors.
 * Routes through Palette Editor for acceptance — intelligence may NEVER commit directly.
 *
 * INVARIANT: suggestions carry origin: 'inferred_suggestion' so governing systems
 * can mark committed changes accordingly, preventing metadata feedback loops.
 */
export function generateRoleSuggestions(
  revision: PaletteRevision,
  cleanupPayload: CleanupPayload | null,
): RoleSuggestion[] {
  if (!cleanupPayload) return [];

  // Re-evaluate roles based on current LAB analysis
  // Compare cleanup pipeline's original suggestions against current role assignments
  const roleByRef = new Map(cleanupPayload.curatedColors.map(c => [c.candidateRef, c]));
  const suggestions: RoleSuggestion[] = [];

  for (const swatch of revision.swatches) {
    if (!swatch.candidateRef) continue;
    const curated = roleByRef.get(swatch.candidateRef);
    if (!curated) continue;

    // Roles match — no suggestion needed
    // (In a richer implementation, this would re-run the role assignment
    //  pipeline and compare. For now we surface roles that differ from
    //  cleanup defaults as potential manual overrides worth reviewing.)
    // This is intentionally minimal — no autonomous role rewriting.
  }

  return suggestions;
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validate a report before saving.
 * Failures block saved intelligence persistence — NOT transient analysis.
 */
export function validateIntelligenceReport(
  report: IntelligenceReport,
  activeRevisionIds: Set<string>,
): ReturnType<typeof Object.create> & { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!report.analysisId)                        errors.push('analysisId missing');
  if (!report.analysisType)                      errors.push('analysisType missing');
  if (!report.engineState.intelligenceEngineVersion) errors.push('intelligenceEngineVersion missing');
  if (!report.analysisCausality.triggerType)     errors.push('causality.triggerType missing');
  if (!report.scope.scopeType)                   errors.push('scope.scopeType missing');
  if (!report.engineState.mathematicalWeights)   errors.push('mathematicalWeights missing');

  // Verify referenced revisions resolve
  if (report.scope.revisionRefs) {
    for (const ref of report.scope.revisionRefs) {
      if (!activeRevisionIds.has(ref)) {
        errors.push(`Referenced revision "${ref.slice(0, 8)}…" does not resolve.`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
