// ─── Primitive color types ─────────────────────────────────────────────────────

export interface RGBColor { r: number; g: number; b: number; }
export interface LABColor { l: number; a: number; b: number; }

export interface PaletteSwatch {
  id: string;
  color: RGBColor;
  hex: string;
  candidateRef?: string; // stable extraction lineage ref — optional for manually placed colors
}

export interface ColorSelector {
  id: string;
  x: number;
  y: number;
  color: RGBColor;
}

// ─── Extraction types ──────────────────────────────────────────────────────────

export type ExtractionMethod =
  | 'dominant_cluster' | 'uniform_grid' | 'weighted_frequency'
  | 'edge_bias' | 'luminance_stratified';

export type CandidateTier = 'small' | 'medium' | 'large';
export const CANDIDATE_TIER_COUNTS: Record<CandidateTier, number> = {
  small: 32, medium: 64, large: 128,
} as const;

export interface ExtractionSettings {
  method: ExtractionMethod;
  candidateCount: number;
  samplingMode: 'step';
  samplingCount: number;
  targetResolution: number;
  colorSpace: 'RGBA_8BIT';
  alphaHandling: 'EXCLUDE_ALPHA_LT_255';
  deterministicSeed: number;
  engineVersion: string;
}

export interface CandidateColor {
  candidateIndex: number;    // stable identity anchor — used in candidateRef (sc_id:candidate_N)
  hex: string;
  rgb: RGBColor;
  lab: LABColor;             // perceptual reference — HSL intentionally excluded
  frequency: number;
}

export interface SourceImageMeta {
  filename: string;
  width: number;
  height: number;
  mimeType: string;
  contentHash: string;       // sha256:hex — content-based identity, NOT filename
  frameIndex: 0;
}

export interface ExtractionProvenance {
  extractedAt: string;
  engine: { version: string; hashAlgorithm: 'sha256' };
  deterministicSeed: number;
  normalization: {
    targetResolution: number;
    colorSpace: 'RGBA_8BIT';
    alphaHandling: 'EXCLUDE_ALPHA_LT_255';
  };
  sampling: { samplingMode: string; samplingCount: number };
}

export interface SourceCandidatesRecord {
  id: string;
  source_candidates_ref: string;
  lifecycleState: 'SOURCE_CANDIDATES';
  dedupKey: string;
  sourceImage: SourceImageMeta;
  provenance: ExtractionProvenance;
  extraction: { method: ExtractionMethod; candidateCount: number };
  candidateColors: CandidateColor[];
  extractedAt: number;
  thumbnail: string;
}

// ─── Cleanup types ─────────────────────────────────────────────────────────────

export type CleanupMode = 'balanced' | 'cinematic' | 'neon' | 'lo_fi' | 'infrastructure';

export interface CleanupModeParams {
  deltaE: number;
  accentBias: 'low' | 'medium' | 'high' | 'extreme' | 'neutral';
  saturationBias: 'muted' | 'neutral' | 'medium' | 'extreme';
  contrastBias: 'low' | 'neutral' | 'medium' | 'high' | 'extreme';
}

export const CLEANUP_MODE_PARAMS: Record<CleanupMode, CleanupModeParams> = {
  balanced:       { deltaE: 8,  accentBias: 'medium',  saturationBias: 'neutral', contrastBias: 'neutral'  },
  cinematic:      { deltaE: 10, accentBias: 'high',    saturationBias: 'medium',  contrastBias: 'high'     },
  neon:           { deltaE: 12, accentBias: 'extreme', saturationBias: 'extreme', contrastBias: 'medium'   },
  lo_fi:          { deltaE: 6,  accentBias: 'low',     saturationBias: 'muted',   contrastBias: 'low'      },
  infrastructure: { deltaE: 4,  accentBias: 'neutral', saturationBias: 'neutral', contrastBias: 'extreme'  },
} as const;

export type StructuralRole = 'base' | 'support' | 'accent' | 'separator' | 'signal';

export type InterpretiveRole =
  | 'warm' | 'cool' | 'nocturnal' | 'synthetic'
  | 'environmental' | 'muted' | 'vibrant' | 'industrial' | 'neutral';

export interface CuratedColor {
  candidateRef: string;      // stable: sc_id:candidate_N
  hex: string;
  rgb: RGBColor;
  lab: LABColor;
  structuralRole: StructuralRole;
  interpretiveRole: InterpretiveRole;
  frequency: number;
}

export interface ExcludedColor {
  candidateRef: string;      // stable: sc_id:candidate_N
  suppressionReason: 'perceptual_duplicate' | 'noise' | 'sub_threshold';
  deltaE?: number;
  suppressedBy?: string;
}

export interface CleanupMetrics {
  warmth: number; saturation: number; contrast: number;
  luminanceSpread: number; tonalDensity: number; energy: number; harmony: number;
}

export interface CleanupPayload {
  id: string;
  paletteId: string;
  revisionId: string;
  lifecycleState: 'CURATED_PALETTE';
  source_candidates_ref: string;
  provenance: { cleanedAt: string; engineVersion: string; deterministicSeed: number };
  cleanup: { mode: CleanupMode; thresholds: { deltaE: number } };
  curatedColors: CuratedColor[];
  excludedColors: ExcludedColor[];
  metrics: CleanupMetrics;
}

// ─── Editor types ──────────────────────────────────────────────────────────────

export type CommitReason =
  | 'manual_refinement' | 'role_adjustment' | 'reorder'
  | 'variant_derivation' | 'rollback';

/**
 * WorkingColor — mutable per-color state in WORKING_PALETTE.
 * authoredHex/authoredLab are null until the user manually adjusts the color.
 * Manual adjustments are stored separately from SOURCE_CANDIDATES telemetry.
 */
export interface WorkingColor {
  candidateRef: string;          // stable: sc_id:candidate_N or sc_id:manual_id
  hex: string;                   // source or cleanup hex
  authoredHex: string | null;    // manual override — null if unmodified
  authoredLab: LABColor | null;  // computed at edit time via canonical conversion pipeline
  rgb: RGBColor;
  lab: LABColor;
  structuralRole: StructuralRole;
  interpretiveRole: InterpretiveRole;
  visible: boolean;
  order: number;                 // 0-indexed display order
}

/**
 * WorkingPaletteState — governed editable infrastructure (NOT ephemeral UI state).
 * Must preserve source_candidates_ref, parentRevisionId, and editor provenance.
 * INVARIANT: must never be confused with committed revision truth.
 */
export interface WorkingPaletteState {
  id: string;                    // workingPaletteId
  paletteId: string;
  source_candidates_ref: string;
  parentRevisionId: string;
  lifecycleState: 'WORKING_PALETTE';
  provenance: {
    openedAt: string;            // ISO 8601
    editorVersion: string;
    createdFromRevisionId: string;
  };
  name: string;
  workingColors: WorkingColor[];
  savedAt: number;               // unix ms — last auto-save
}

// ─── Governance lifecycle ──────────────────────────────────────────────────────

export type LifecycleState =
  | 'SOURCE_CANDIDATES' | 'WORKING_PALETTE' | 'CURATED_PALETTE'
  | 'ARCHIVAL_PALETTE' | 'DERIVED_VARIANT' | 'RETIRED_ARCHIVE';

export interface PaletteRevision {
  id: string;
  palette_id: string;
  source_candidates_ref: string;
  revision_number: number;
  lifecycle: LifecycleState;
  name: string;
  swatches: PaletteSwatch[];
  createdAt: number;
  derived_from_revision?: string;
  parent_palette_id?: string;
  tombstone?: boolean;
  // Commit provenance (set on editor-originated revisions)
  commitProvenance?: {
    committedAt: string;
    editorVersion: string;
    commitReason: CommitReason;
  };
  editSummary?: { note?: string };
}

export interface PaletteView {
  palette_id: string;
  source_candidates_ref: string;
  name: string;
  thumbnail: string;
  swatches: PaletteSwatch[];
  lifecycle: LifecycleState;
  revision_number: number;
  revision_id: string;
  createdAt: number;
}

// ─── Visualization types (v1.2.1) ─────────────────────────────────────────────

export type VisualizationMode = 'cluster' | 'timeline';

export type ScopeResolutionMode = 'current_revision' | 'pinned_revision';

export type LayoutType = 'force_cluster' | 'grid' | 'chronological';

export type SortOrder = 'luminance' | 'created_at' | 'name' | 'revision_number';

/**
 * ViewScope carries explicit palette revision references.
 * pinned_revision: revisionRefs required for deterministic replay.
 * current_revision: refs ignored — resolved at render time against active state.
 * INVARIANT: collectionRevisionRefs used for collection replay (NOT collectionRefs).
 */
export interface ViewScope {
  collectionRevisionRefs?: string[];  // pinned collection replay — NOT collectionRefs
  revisionRefs?: string[];            // pinned palette revision refs
}

/**
 * FilterVocabulary — metadata namespace + schema version alignment.
 * Stale filters must surface explicit user-visible indicators.
 * Visualization systems may NEVER silently drop unresolved filter terms.
 */
export interface FilterVocabulary {
  metadataSchemaVersion: string;
  namespaces: string[];
}

export interface LayoutState {
  layoutType: LayoutType;
  /**
   * INVARIANT: layoutSeed is derived from viewId — deterministic and stable.
   * Preserves interaction continuity and exploratory spatial familiarity.
   */
  layoutSeed: string;
  sortOrder: SortOrder;
  /**
   * Active filters keyed by metadata namespace.
   * Stale filter terms must remain visible, not silently dropped.
   */
  filters: Record<string, string[]>;
}

/**
 * SavedView — append-only exploratory view state (v1.2.1).
 *
 * INVARIANTS:
 * - parentViewId: null for root views; non-null and resolving for derived views.
 * - layoutSeed derived from viewId — never random at render time.
 * - collectionRevisionRefs used in pinned_revision (NOT collectionRefs).
 * - Stale filter terms remain visible — never silently dropped.
 * - Visualization systems may NEVER silently omit unresolved palettes.
 */
export interface SavedView {
  viewId: string;
  parentViewId: string | null;
  viewVersion: '1.2.1';
  createdAt: string;              // ISO 8601
  visualizationMode: VisualizationMode;
  scopeResolutionMode: ScopeResolutionMode;
  scope: ViewScope;
  filterVocabulary: FilterVocabulary;
  layoutState: LayoutState;
}

export interface SavedViewValidationResult {
  valid: boolean;
  errors: string[];
  staleFilters: string[];         // filter terms that couldn't resolve — must surface to user
}
