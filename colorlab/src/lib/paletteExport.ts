/**
 * Palette Export System — v1.1.0
 *
 * Transforms lineage-safe palette infrastructure into portable interchange artifacts.
 * Export data flow is one-way: Colorlab Archive → Export Artifact → External Consumer.
 *
 * INVARIANTS:
 * - Exports may NEVER mutate palette revisions or archive structures.
 * - exportedAt is excluded from content hash (semantic equivalence doctrine).
 * - Lineage ancestry propagates to every export.
 * - HSL values are derived at export time — never stored as archival truth.
 * - visualization_snapshot resolves current_revision to immutable revisionRefs at export time.
 * - WOS package fields are advisory-only — no runtime authority.
 * - Validation failures block export generation.
 */

import type { PaletteRevision, CleanupPayload, PaletteView, SavedView } from '../types/palette';
import type {
  ExportType,
  ExportIntent,
  ExportHeader,
  ExportPayload,
  PaletteJsonContent,
  CssTokensContent,
  VisualizationSnapshotContent,
  WosPaletteContent,
  ArchiveBundleContent,
  ExportValidationResult,
} from '../types/export';
import { EXPORT_SCHEMA_VERSION } from '../types/export';
import { rgbToLab, rgbToHsl } from './colorConversion';
import { ENGINE_VERSION } from './colorExtraction';
import { CLEANUP_ENGINE_VERSION } from './paletteCleanup';
import { VISUALIZATION_VERSION } from './paletteVisualization';

// ─── Hashing ──────────────────────────────────────────────────────────────────

async function sha256hex(data: string): Promise<string> {
  const buffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(data)
  );
  return 'sha256:' + Array.from(new Uint8Array(buffer))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Compute a stable hash of a revision's semantic content.
 * Excludes timestamps — hash represents structural identity.
 */
export async function computeRevisionHash(revision: PaletteRevision): Promise<string> {
  return sha256hex(JSON.stringify({
    id: revision.id,
    palette_id: revision.palette_id,
    revision_number: revision.revision_number,
    lifecycle: revision.lifecycle,
    name: revision.name,
    swatches: revision.swatches,
    source_candidates_ref: revision.source_candidates_ref,
  }));
}

/**
 * Compute export content hash.
 * INVARIANT: exportedAt is excluded — semantic equivalence is content-only.
 * Two exports with identical content but different timestamps are semantically equivalent.
 */
export async function computeExportContentHash(
  exportType: ExportType,
  revisionIds: string[],
  lineageAncestry: string[],
  content: unknown,
): Promise<string> {
  return sha256hex(JSON.stringify({
    exportType,
    exportSchemaVersion: EXPORT_SCHEMA_VERSION,
    revisionIds,
    lineageAncestry,
    content,
  }));
}

// ─── Lineage helpers ──────────────────────────────────────────────────────────

/**
 * Build ordered lineage ancestry from root to the given revision.
 * Uses derived_from_revision chain to walk ancestry.
 */
export function buildLineageAncestry(
  revision: PaletteRevision,
  allRevisions: PaletteRevision[],
): string[] {
  const byId = new Map(allRevisions.map(r => [r.id, r]));
  const chain: string[] = [];
  let current: PaletteRevision | undefined = revision;
  const visited = new Set<string>();

  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    chain.unshift(current.id);
    current = current.derived_from_revision
      ? byId.get(current.derived_from_revision)
      : undefined;
  }

  return chain;
}

// ─── Shared header builder ────────────────────────────────────────────────────

async function buildHeader(
  exportType: ExportType,
  exportIntent: ExportIntent,
  revision: PaletteRevision,
  allRevisions: PaletteRevision[],
  cleanupPayload: CleanupPayload | null,
  content: unknown,
): Promise<ExportHeader> {
  const lineageAncestry = buildLineageAncestry(revision, allRevisions);
  const lineageRootId = lineageAncestry[0] ?? revision.id;
  const revisionHash = await computeRevisionHash(revision);
  const exportContentHash = await computeExportContentHash(
    exportType,
    [revision.id],
    lineageAncestry,
    content,
  );

  return {
    exportSchemaVersion: EXPORT_SCHEMA_VERSION,
    exportType,
    exportIntent,
    exportedAt: new Date().toISOString(),
    identity: {
      exportId: crypto.randomUUID(),
      exportContentHash,
    },
    provenance: {
      paletteId: revision.palette_id,
      revisionId: revision.id,
      lineageRootId,
      lineageAncestry,
      revisionHash,
      source_candidates_ref: revision.source_candidates_ref,
    },
    compatibility: {
      metadataSchemaVersion: '1.0.0',
      cleanupHeuristicVersion: CLEANUP_ENGINE_VERSION,
      visualizationSchemaVersion: VISUALIZATION_VERSION,
    },
    immutableEngineState: {
      deltaEStandard: 'CIEDE2000',
      cleanupMode: cleanupPayload?.cleanup.mode,
      cleanupDeltaE: cleanupPayload?.cleanup.thresholds.deltaE,
      extractionEngineVersion: ENGINE_VERSION,
    },
  };
}

// ─── palette_json ─────────────────────────────────────────────────────────────

/**
 * Generate a palette_json export — portable revision-safe palette interchange.
 *
 * INVARIANT: candidateRefs preserved — lineage telemetry must not be stripped.
 * INVARIANT: provenance references included — must not require archive re-query.
 */
export async function generatePaletteJson(
  revision: PaletteRevision,
  allRevisions: PaletteRevision[],
  cleanupPayload: CleanupPayload | null,
): Promise<ExportPayload<PaletteJsonContent>> {
  const roleByRef = new Map(
    cleanupPayload?.curatedColors.map(c => [c.candidateRef, c]) ?? []
  );

  const content: PaletteJsonContent = {
    palette: {
      name: revision.name,
      colors: revision.swatches.map(swatch => {
        const role = swatch.candidateRef ? roleByRef.get(swatch.candidateRef) : undefined;
        const rgb = swatch.color;
        return {
          candidateRef: swatch.candidateRef,
          hex: swatch.hex,
          rgb,
          lab: role?.lab ?? rgbToLab(rgb),
          structuralRole: role?.structuralRole,
          interpretiveRole: role?.interpretiveRole,
        };
      }),
    },
    cleanupMetrics: cleanupPayload?.metrics,
  };

  const header = await buildHeader('palette_json', 'interchange', revision, allRevisions, cleanupPayload, content);
  return { header, content };
}

// ─── css_tokens ───────────────────────────────────────────────────────────────

/**
 * Generate a css_tokens export — web design integration.
 *
 * INVARIANT: HSL values are derived at export time from canonical RGB.
 * They are NOT stored archival truth.
 * CSS token names are downstream adaptation labels — NOT canonical palette semantics.
 */
export async function generateCssTokens(
  revision: PaletteRevision,
  allRevisions: PaletteRevision[],
  cleanupPayload: CleanupPayload | null,
): Promise<ExportPayload<CssTokensContent>> {
  const roleByRef = new Map(
    cleanupPayload?.curatedColors.map(c => [c.candidateRef, c]) ?? []
  );

  const content: CssTokensContent = {
    tokens: revision.swatches.map((swatch, i) => {
      const role = swatch.candidateRef ? roleByRef.get(swatch.candidateRef) : undefined;
      const rgb = swatch.color;
      // Token name: structural role prefix if available, otherwise positional
      const roleLabel = role?.structuralRole ?? 'color';
      const name = `--palette-${roleLabel}-${i + 1}`;
      return {
        name,
        hex: swatch.hex,
        rgb,
        hsl: rgbToHsl(rgb),   // export-derived only
        structuralRole: role?.structuralRole,
        interpretiveRole: role?.interpretiveRole,
      };
    }),
  };

  const header = await buildHeader('css_tokens', 'integration', revision, allRevisions, cleanupPayload, content);
  return { header, content };
}

// ─── wos_palette_package ─────────────────────────────────────────────────────

/**
 * Generate a wos_palette_package — WOS-facing advisory integration payload.
 *
 * INVARIANT: ALL fields are advisory metadata — NOT runtime authority.
 * Consumption authority belongs to 0522I_WOS_ColorRuntimeIntegration.
 * The export system does NOT define how WOS interprets these values.
 */
export async function generateWosPalettePackage(
  revision: PaletteRevision,
  allRevisions: PaletteRevision[],
  cleanupPayload: CleanupPayload | null,
): Promise<ExportPayload<WosPaletteContent>> {
  const roleByRef = new Map(
    cleanupPayload?.curatedColors.map(c => [c.candidateRef, c]) ?? []
  );

  // Atmosphere descriptors derived from interpretive roles — advisory signals only
  const interpretiveRoles = revision.swatches
    .map(s => s.candidateRef ? roleByRef.get(s.candidateRef)?.interpretiveRole : undefined)
    .filter((r): r is string => Boolean(r));
  const uniqueRoles = [...new Set(interpretiveRoles)];

  const content: WosPaletteContent = {
    advisory: {
      colors: revision.swatches.map(swatch => {
        const role = swatch.candidateRef ? roleByRef.get(swatch.candidateRef) : undefined;
        const rgb = swatch.color;
        return {
          candidateRef: swatch.candidateRef,
          hex: swatch.hex,
          rgb,
          lab: role?.lab ?? rgbToLab(rgb),
          structuralRole: role?.structuralRole,
          interpretiveRole: role?.interpretiveRole,
        };
      }),
      atmosphereDescriptors: uniqueRoles,
      cleanupMetrics: cleanupPayload?.metrics,
    },
  };

  const header = await buildHeader('wos_palette_package', 'integration', revision, allRevisions, cleanupPayload, content);
  return { header, content };
}

// ─── visualization_snapshot ───────────────────────────────────────────────────

/**
 * Generate a visualization_snapshot export.
 *
 * INVARIANT: current_revision scope resolved to immutable revisionRefs at generation time.
 * Dynamic retrieval queries are NEVER preserved as replay truth.
 * The exported scopeResolutionMode is always 'pinned_revision'.
 */
export async function generateVisualizationSnapshot(
  savedView: SavedView,
  resolvedPalettes: PaletteView[],
  anchorRevision: PaletteRevision,
  allRevisions: PaletteRevision[],
): Promise<ExportPayload<VisualizationSnapshotContent>> {
  // Resolve current_revision scope to explicit revision refs at generation time
  const revisionRefs = resolvedPalettes.map(p => p.revision_id);

  const content: VisualizationSnapshotContent = {
    visualizationMode: savedView.visualizationMode,
    scopeResolutionMode: 'pinned_revision', // always pinned in exports
    scope: {
      revisionRefs,                          // resolved at generation — immutable
      collectionRevisionRefs: savedView.scope.collectionRevisionRefs ?? [],
    },
    layoutState: savedView.layoutState,
    filterVocabulary: savedView.filterVocabulary,
  };

  const header = await buildHeader(
    'visualization_snapshot', 'replay',
    anchorRevision, allRevisions, null, content
  );
  return { header, content };
}

// ─── archive_bundle ───────────────────────────────────────────────────────────

/**
 * Generate an archive_bundle — long-term preservation portability.
 *
 * INVARIANT: shared records appear once, referenced via referenceTable.
 * INVARIANT: intelligibility over compactness.
 * Minimum structure: manifest + palettes + reference_table.
 */
export async function generateArchiveBundle(
  palettes: Array<{
    revision: PaletteRevision;
    allRevisions: PaletteRevision[];
    cleanupPayload: CleanupPayload | null;
  }>,
): Promise<ExportPayload<ArchiveBundleContent>> {
  // Build all palette_json payloads
  const palettePayloads = await Promise.all(
    palettes.map(({ revision, allRevisions, cleanupPayload }) =>
      generatePaletteJson(revision, allRevisions, cleanupPayload)
    )
  );

  // Collect shared references (appear once per doctrine)
  const sourceCandidatesRefs = [...new Set(
    palettes.map(p => p.revision.source_candidates_ref)
  )];
  const revisionIds = [...new Set(
    palettes.flatMap(p => p.allRevisions.map(r => r.id))
  )];

  const content: ArchiveBundleContent = {
    manifest: {
      bundleVersion: EXPORT_SCHEMA_VERSION,
      createdAt: new Date().toISOString(),
      paletteCount: palettes.length,
      revisionCount: revisionIds.length,
    },
    palettes: palettePayloads,
    referenceTable: { sourceCandidatesRefs, revisionIds },
  };

  // Use first palette revision as anchor for the bundle header
  const anchor = palettes[0].revision;
  const allBundleRevisions = palettes.flatMap(p => p.allRevisions);
  const header = await buildHeader(
    'archive_bundle', 'archival',
    anchor, allBundleRevisions, null, content
  );
  return { header, content };
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validate an export payload before generation or acceptance.
 * Validation failures must block export generation.
 * Invalid exports must fail closed.
 */
export function validateExportPayload(payload: ExportPayload<unknown>): ExportValidationResult {
  const errors: string[] = [];
  const { header } = payload;

  if (!header.exportSchemaVersion) errors.push('exportSchemaVersion missing');
  if (!header.exportType)          errors.push('exportType missing');
  if (!header.exportIntent)        errors.push('exportIntent missing');
  if (!header.identity?.exportContentHash) errors.push('exportContentHash missing');
  if (!header.provenance?.lineageAncestry?.length)
    errors.push('lineageAncestry empty or missing');
  if (!header.provenance?.revisionId) errors.push('revisionId missing');
  if (!header.provenance?.source_candidates_ref)
    errors.push('source_candidates_ref missing');

  // Type-specific validation
  if (header.exportType === 'palette_json') {
    const content = payload.content as PaletteJsonContent | undefined;
    if (!content?.palette?.colors?.length)
      errors.push('palette_json: curated colors must be present');
  }
  if (header.exportType === 'visualization_snapshot') {
    const content = payload.content as VisualizationSnapshotContent | undefined;
    if (!Array.isArray(content?.scope?.revisionRefs))
      errors.push('visualization_snapshot: revisionRefs must be an immutable array');
    if (content?.scopeResolutionMode !== 'pinned_revision')
      errors.push('visualization_snapshot: scopeResolutionMode must be pinned_revision in exports');
  }
  if (header.exportType === 'css_tokens') {
    const content = payload.content as CssTokensContent | undefined;
    const hasInvalidHsl = content?.tokens.some(t => !t.hsl);
    if (hasInvalidHsl)
      errors.push('css_tokens: all tokens must have export-derived HSL values');
  }
  if (header.exportType === 'wos_palette_package') {
    const content = payload.content as WosPaletteContent | undefined;
    if (!content?.advisory)
      errors.push('wos_palette_package: advisory wrapper required');
  }
  if (header.exportType === 'archive_bundle') {
    const content = payload.content as ArchiveBundleContent | undefined;
    if (!content?.manifest) errors.push('archive_bundle: manifest missing');
    if (!content?.referenceTable) errors.push('archive_bundle: referenceTable missing');
  }

  return { valid: errors.length === 0, errors };
}

// ─── Filename and download ────────────────────────────────────────────────────

/**
 * Generate a canonical export filename.
 * Pattern: pal_{paletteId}_rev_{revisionId}_{exportType}_{timestamp}.json
 * Human-readable names may NEVER replace paletteId, revisionId, exportType, or timestamp.
 */
export function generateExportFilename(payload: ExportPayload<unknown>): string {
  const { provenance, exportType, exportedAt } = payload.header;
  const ts = exportedAt.replace(/[:.]/g, '').replace('T', 'T').slice(0, 17) + 'Z';
  const palShort = provenance.paletteId.slice(0, 8);
  const revShort = provenance.revisionId.slice(0, 8);
  return `pal_${palShort}_rev_${revShort}_${exportType}_${ts}.json`;
}

/**
 * Trigger a browser download for a JSON export payload.
 */
export function downloadJsonExport(payload: ExportPayload<unknown>): void {
  const validation = validateExportPayload(payload);
  if (!validation.valid) {
    throw new Error(`Export validation failed: ${validation.errors.join('; ')}`);
  }

  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = generateExportFilename(payload);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generate and download a PNG image strip of the palette swatches.
 *
 * INVARIANT: image strips are derivative rendered assets — NOT governed archival payloads.
 * Sidecar JSON metadata accompanies the strip to satisfy the provenance embedding doctrine.
 */
export function downloadImageStrip(
  revision: PaletteRevision,
  revisionHash: string,
  exportId: string,
): void {
  const swatches = revision.swatches;
  const swatchW = 80;
  const swatchH = 80;
  const canvas = document.createElement('canvas');
  canvas.width = swatchW * swatches.length;
  canvas.height = swatchH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not acquire 2D context for image strip.');

  swatches.forEach((swatch, i) => {
    ctx.fillStyle = swatch.hex;
    ctx.fillRect(i * swatchW, 0, swatchW, swatchH);
  });

  canvas.toBlob(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const ts = new Date().toISOString().replace(/[:.]/g, '').slice(0, 17) + 'Z';
    const palShort = revision.palette_id.slice(0, 8);
    const revShort = revision.id.slice(0, 8);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pal_${palShort}_rev_${revShort}_image_strip_${ts}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Download sidecar metadata (image strip provenance embedding doctrine)
    const sidecar = {
      exportSchemaVersion: EXPORT_SCHEMA_VERSION,
      exportType: 'image_strip',
      paletteId: revision.palette_id,
      revisionId: revision.id,
      revisionHash,
      exportId,
      exportedAt: new Date().toISOString(),
      source_candidates_ref: revision.source_candidates_ref,
    };
    const sidecarBlob = new Blob([JSON.stringify(sidecar, null, 2)], { type: 'application/json' });
    const sidecarUrl = URL.createObjectURL(sidecarBlob);
    const b = document.createElement('a');
    b.href = sidecarUrl;
    b.download = `pal_${palShort}_rev_${revShort}_image_strip_${ts}.manifest.json`;
    document.body.appendChild(b);
    b.click();
    document.body.removeChild(b);
    URL.revokeObjectURL(sidecarUrl);
  }, 'image/png');
}
