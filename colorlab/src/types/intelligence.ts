/**
 * Palette Intelligence types — v1.1.0
 *
 * Intelligence is interpretive advisory infrastructure — NOT canonical truth.
 * All outputs are advisory, contextual, probabilistic, and revision-bound.
 * Intelligence systems may NEVER mutate palette revisions or metadata.
 *
 * Saved reports are explicitly exempt from source_candidates_ref governance
 * invariants (they reference governed artifacts, not become them).
 */

// ─── Analysis types ───────────────────────────────────────────────────────────

export type AnalysisType =
  | 'similarity_analysis'
  | 'lineage_analysis'
  | 'trend_analysis'
  | 'visualization_analysis'
  | 'export_analysis';

/**
 * Scope classes and their reproducibility guarantees.
 * revision_scope: deterministic
 * collection_scope: conditionally deterministic
 * filter_scope: intentionally non-deterministic
 */
export type ScopeType = 'revision_scope' | 'collection_scope' | 'filter_scope';

export type ReproducibilityClass =
  | 'deterministic'
  | 'conditionally_deterministic'
  | 'non_deterministic';

/**
 * AnalysisScope — explicit scope binding.
 * INVARIANT: analyses bind to explicit revision identities — never auto-resolve "latest".
 */
export interface AnalysisScope {
  scopeType: ScopeType;
  revisionRefs?: string[];
  collectionRevisionRef?: string;
  filterExpression?: Record<string, string[]>;
  reproducibilityClass: ReproducibilityClass;
}

// ─── Confidence ───────────────────────────────────────────────────────────────

/**
 * Confidence labels with semantic ranges.
 * Confidence is uncertainty communication — NOT truth probability.
 *
 * low       0.00–0.39  weak or contradictory support
 * medium    0.40–0.69  mixed but usable support
 * high      0.70–1.00  strong but still advisory support
 * unresolved n/a       insufficient analysis data
 * conflicting n/a      determinant signals disagree
 */
export type ConfidenceLabel = 'low' | 'medium' | 'high' | 'unresolved' | 'conflicting';

export interface ConfidenceValue {
  label: ConfidenceLabel;
  numeric?: number;
  /** Signals that drove confidence — transparency doctrine requires exposure */
  determinantSignals?: string[];
  conflictingMetrics?: string[];
  uncertaintyRationale?: string;
  confidenceScaleVersion: '1.0.0';
}

export function confidenceLabel(numeric: number): ConfidenceLabel {
  if (numeric < 0.40) return 'low';
  if (numeric < 0.70) return 'medium';
  return 'high';
}

// ─── Engine state ─────────────────────────────────────────────────────────────

/**
 * Snapshotted engine state — required for historical analytical determinism.
 * Analyses bind to the engine version that produced them.
 * Historical analyses may NEVER auto-migrate to newer model versions.
 */
export interface IntelligenceEngineState {
  intelligenceEngineVersion: string;
  /** Model name + version — cross-version scores are NOT comparable */
  analysisModel: string;
  metadataSchemaVersion: string;
  confidenceScaleVersion: '1.0.0';
  /** Preserved weights enable full replay of analytical logic */
  mathematicalWeights: Record<string, number>;
}

// ─── Causality ────────────────────────────────────────────────────────────────

/**
 * Causality metadata — required for auditability and governance inspection.
 * INVARIANT: all intelligence is user_initiated (no autonomous analysis).
 */
export interface AnalysisCausality {
  triggerType: 'user_initiated';
  analysisIntent: 'exploratory' | 'comparative' | 'archival';
  initiatingActor: 'user';
  userQueryParameters?: Record<string, unknown>;
}

// ─── Governance marker ────────────────────────────────────────────────────────

/**
 * Governance block present on every saved report.
 * authorityClass: always 'advisory_overlay' — intelligence is never canonical.
 * writeProtection: always true — reports are append-only, never mutated.
 */
export interface IntelligenceGovernance {
  authorityClass: 'advisory_overlay';
  writeProtection: true;
  isHistoricalArtifact: boolean;
}

// ─── Analysis result shapes ───────────────────────────────────────────────────

export interface SimilarityAnalysisResult {
  similarity: number;
  confidence: ConfidenceValue;
  signals: {
    labDistance: number;
    warmthSimilarity: number;
    /** 0 until Metadata System (0522E) is implemented */
    metadataOverlap: number;
  };
  revisionAName: string;
  revisionBName: string;
}

export interface LineageAnalysisResult {
  revisionCount: number;
  /** Longest derived_from chain depth */
  depth: number;
  /** True if multiple revisions share the same derived_from parent */
  hasBranching: boolean;
  revisionsByLifecycle: Record<string, number>;
  /** Root-to-leaf chain of revision IDs */
  derivationChain: string[];
  notes: string[];
}

export interface TrendAnalysisResult {
  paletteCount: number;
  interpretiveRoleDistribution: Record<string, number>;
  structuralRoleDistribution: Record<string, number>;
  averageMetrics: {
    warmth: number;
    saturation: number;
    contrast: number;
    energy: number;
    harmony: number;
  };
  colorSpaceTendencies: {
    avgL: number;
    avgC: number;   // average chroma
    avgB: number;   // warm/cool axis
  };
  notes: string[];
}

export interface VisualizationAnalysisResult {
  viewId: string;
  visualizationMode: string;
  scopeResolutionMode: string;
  paletteCount: number;
  hasStaleFilters: boolean;
  staleFilterTerms: string[];
  layoutSeedValid: boolean;
  notes: string[];
}

export interface ExportAnalysisResult {
  schemaVersionCompatible: boolean;
  lineageAnchorsValid: boolean;
  staleSchemaWarnings: string[];
  replayReadiness: 'ready' | 'degraded' | 'unresolvable';
  notes: string[];
}

// ─── Intelligence report ──────────────────────────────────────────────────────

/**
 * Saved intelligence report — append-only overlay artifact.
 *
 * INVARIANTS:
 * - parentAnalysisId: null for root analyses; non-null for derived analyses.
 * - isHistoricalArtifact: true once saved — never reinterpreted.
 * - Exempt from source_candidates_ref governance (references governed artifacts).
 * - New analyses may NEVER ingest prior reports as analytical truth.
 */
export interface IntelligenceReport {
  analysisId: string;
  parentAnalysisId: string | null;
  analysisType: AnalysisType;
  analysisVersion: string;
  generatedAt: string;                    // ISO 8601
  engineState: IntelligenceEngineState;
  analysisCausality: AnalysisCausality;
  scope: AnalysisScope;
  analysis:
    | SimilarityAnalysisResult
    | LineageAnalysisResult
    | TrendAnalysisResult
    | VisualizationAnalysisResult
    | ExportAnalysisResult;
  governance: IntelligenceGovernance;
  /**
   * Cache metadata — surfaces freshness per Intelligence Cache Doctrine.
   * Cached intelligence may NEVER silently influence ranking.
   */
  cacheMetadata?: {
    cacheSource: string;
    cacheFreshness: string;
  };
}

// Typed narrowed variants for components
export interface SimilarityReport extends IntelligenceReport {
  analysisType: 'similarity_analysis';
  analysis: SimilarityAnalysisResult;
}

export interface LineageReport extends IntelligenceReport {
  analysisType: 'lineage_analysis';
  analysis: LineageAnalysisResult;
}

export interface TrendReport extends IntelligenceReport {
  analysisType: 'trend_analysis';
  analysis: TrendAnalysisResult;
}

export interface VisualizationReport extends IntelligenceReport {
  analysisType: 'visualization_analysis';
  analysis: VisualizationAnalysisResult;
}

// ─── Role suggestions ─────────────────────────────────────────────────────────

/**
 * Role suggestion — routes through Palette Editor for acceptance.
 * INVARIANT: origin must be 'inferred_suggestion' when committed by governing system.
 * Intelligence may NEVER directly process acceptance or commit changes.
 */
export interface RoleSuggestion {
  candidateRef: string;
  hex: string;
  currentStructuralRole?: string;
  currentInterpretiveRole?: string;
  suggestedStructuralRole: string;
  suggestedInterpretiveRole: string;
  confidence: ConfidenceValue;
  basis: string;
  /** INVARIANT: must carry this marker when committed — prevents metadata feedback loops */
  origin: 'inferred_suggestion';
}

// ─── Validation ───────────────────────────────────────────────────────────────

export interface IntelligenceValidationResult {
  valid: boolean;
  errors: string[];
}
