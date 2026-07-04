/**
 * Export System types — v1.1.0
 *
 * Exports are portable representation artifacts.
 * Exports may NEVER mutate palette revisions or gain write authority back into Colorlab.
 * Export data flow is one-way: Colorlab Archive → Export Artifact → External Consumer.
 */

import type { RGBColor, LABColor, StructuralRole, InterpretiveRole, CleanupMetrics, VisualizationMode, ScopeResolutionMode, LayoutType, SortOrder } from './palette';
import type { HSLColor } from '../lib/colorConversion';

export const EXPORT_SCHEMA_VERSION = '1.1.0' as const;

// ─── Intent and type enumerations ────────────────────────────────────────────

export type ExportType =
  | 'palette_json'
  | 'metadata_bundle'
  | 'collection_bundle'
  | 'visualization_snapshot'
  | 'image_strip'
  | 'css_tokens'
  | 'wos_palette_package'
  | 'palette_runtime_profile'
  | 'archive_bundle';

/**
 * Export intent clarifies expected portability behavior.
 * Export intent is export-context metadata — NOT runtime authority.
 */
export type ExportIntent = 'archival' | 'interchange' | 'publishing' | 'replay' | 'integration';

// ─── Two-layer payload ────────────────────────────────────────────────────────

/**
 * ExportHeader — provenance, compatibility, lineage, validation.
 * Every export payload must carry a fully populated header.
 * exportedAt is NOT part of semantic export equivalence.
 */
export interface ExportHeader {
  exportSchemaVersion: typeof EXPORT_SCHEMA_VERSION;
  exportType: ExportType;
  exportIntent: ExportIntent;
  exportedAt: string;   // ISO 8601 — chronological marker, excluded from content hash
  identity: {
    exportId: string;
    /**
     * SHA-256 of: exportType + exportSchemaVersion + revisionIds + lineageAncestry + content
     * exportedAt is explicitly excluded — two exports with identical content but different
     * timestamps are semantically equivalent but chronologically distinct.
     */
    exportContentHash: string;
  };
  provenance: {
    paletteId: string;
    revisionId: string;
    lineageRootId: string;
    /** Ordered revision ID chain from lineage root to exported revision */
    lineageAncestry: string[];
    /** SHA-256 of stable revision content — excludes timestamps */
    revisionHash: string;
    source_candidates_ref: string;
  };
  compatibility: {
    metadataSchemaVersion: string;
    cleanupHeuristicVersion: string;
    visualizationSchemaVersion: string;
  };
  /**
   * Immutable engine state at export time.
   * Allows downstream consumers to verify algorithmic provenance.
   */
  immutableEngineState: {
    deltaEStandard: 'CIEDE2000';
    cleanupMode?: string;
    cleanupDeltaE?: number;
    extractionEngineVersion: string;
  };
}

/**
 * Canonical two-layer export payload.
 * header: what is this export and where did it come from?
 * content: what portable data does this export contain?
 */
export interface ExportPayload<T = unknown> {
  header: ExportHeader;
  content: T;
}

// ─── Content types by export type ────────────────────────────────────────────

/** palette_json — portable revision-safe palette interchange */
export interface PaletteJsonContent {
  palette: {
    name: string;
    colors: Array<{
      candidateRef?: string;
      hex: string;
      rgb: RGBColor;
      lab: LABColor;
      structuralRole?: StructuralRole;
      interpretiveRole?: InterpretiveRole;
    }>;
  };
  cleanupMetrics?: CleanupMetrics;
}

/**
 * css_tokens — web design integration
 * HSL values are export-derived ONLY from canonical RGB/LAB archival values.
 * CSS token names are downstream adaptation labels — NOT canonical palette semantics.
 */
export interface CssTokensContent {
  tokens: Array<{
    name: string;
    hex: string;
    rgb: RGBColor;
    /** HSL derived at export time from RGB — never stored as archival truth */
    hsl: HSLColor;
    structuralRole?: StructuralRole;
    interpretiveRole?: InterpretiveRole;
  }>;
}

/**
 * visualization_snapshot — exploratory replay portability
 * Resolves immutable revision arrays at export time.
 * current_revision scope is converted to explicit revisionRefs at export.
 * Dynamic retrieval queries are NEVER preserved as replay truth.
 */
export interface VisualizationSnapshotContent {
  visualizationMode: VisualizationMode;
  /** Always 'pinned_revision' in exports — current_revision resolved at generation time */
  scopeResolutionMode: 'pinned_revision';
  scope: {
    /** Resolved at export time — immutable revision array */
    revisionRefs: string[];
    collectionRevisionRefs: string[];
  };
  layoutState: {
    layoutType: LayoutType;
    layoutSeed: string;
    sortOrder: SortOrder;
    filters: Record<string, string[]>;
  };
  filterVocabulary: {
    metadataSchemaVersion: string;
    namespaces: string[];
  };
}

/**
 * wos_palette_package — WOS-facing advisory integration payload
 * ALL fields are advisory metadata — NOT runtime authority.
 * Structural roles, interpretive roles, metrics, and atmosphere descriptors
 * are advisory signals. Consumption authority belongs to WOS runtime spec.
 */
export interface WosPaletteContent {
  advisory: {
    colors: Array<{
      candidateRef?: string;
      hex: string;
      rgb: RGBColor;
      lab: LABColor;
      /** Advisory signal — NOT simulation rule */
      structuralRole?: StructuralRole;
      /** Advisory signal — NOT simulation rule */
      interpretiveRole?: InterpretiveRole;
    }>;
    /** Advisory atmosphere descriptors — NOT runtime environmental truth */
    atmosphereDescriptors: string[];
    /** Advisory metrics — NOT world-state directives */
    cleanupMetrics?: CleanupMetrics;
  };
}

/**
 * archive_bundle — long-term preservation portability
 * Prioritizes intelligibility over compactness.
 * Shared records appear once, referenced through explicit reference tables.
 */
export interface ArchiveBundleContent {
  manifest: {
    bundleVersion: typeof EXPORT_SCHEMA_VERSION;
    createdAt: string;
    paletteCount: number;
    revisionCount: number;
  };
  palettes: Array<ExportPayload<PaletteJsonContent>>;
  /** Reference table — shared records appear once, referenced by ID */
  referenceTable: {
    sourceCandidatesRefs: string[];
    revisionIds: string[];
  };
}

/**
 * palette_runtime_profile — governed runtime advisory export
 * Wraps the PaletteRuntimeProfile artifact inside the two-layer export payload.
 * authorityLevel: 'advisory_only' — WOS retains final runtime sovereignty.
 * intakeIntent defaults to 'review' — 'activate' requires explicit declaration + approval.
 */
export interface PaletteRuntimeProfileContent {
  /** Canonical artifact payload — §16 of ProjectionOutputGovernance v1.3.0 */
  runtimeProfile: import('./projection').PaletteRuntimeProfile;
}

// ─── Validation ───────────────────────────────────────────────────────────────

export interface ExportValidationResult {
  valid: boolean;
  errors: string[];
}
