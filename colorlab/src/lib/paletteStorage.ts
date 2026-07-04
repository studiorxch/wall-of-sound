import Dexie, { type Table } from 'dexie';
import type {
  SourceCandidatesRecord,
  PaletteRevision,
  PaletteSwatch,
  LifecycleState,
  PaletteView,
  CleanupPayload,
  WorkingPaletteState,
  CommitReason,
  SavedView,
} from '../types/palette';
import type { IntelligenceReport } from '../types/intelligence';

// ─── Lifecycle Transition Matrix ──────────────────────────────────────────────
// All unspecified transitions are forbidden by default (governance invariant).

const ALLOWED_TRANSITIONS: Partial<Record<LifecycleState, LifecycleState[]>> = {
  SOURCE_CANDIDATES:  ['WORKING_PALETTE'],
  WORKING_PALETTE:    ['CURATED_PALETTE', 'RETIRED_ARCHIVE'],
  CURATED_PALETTE:    ['DERIVED_VARIANT', 'ARCHIVAL_PALETTE'],
  DERIVED_VARIANT:    ['CURATED_PALETTE', 'ARCHIVAL_PALETTE'],
  ARCHIVAL_PALETTE:   ['RETIRED_ARCHIVE'],
  RETIRED_ARCHIVE:    ['DERIVED_VARIANT'],
};

function assertTransitionAllowed(from: LifecycleState, to: LifecycleState): void {
  if (!(ALLOWED_TRANSITIONS[from] ?? []).includes(to)) {
    throw new Error(
      `GOVERNANCE INVARIANT VIOLATION: Lifecycle transition ${from} → ${to} is forbidden.`
    );
  }
}

// ─── Database ─────────────────────────────────────────────────────────────────

class ColorlabDB extends Dexie {
  // INVARIANT: source_candidates records are write-once after creation.
  source_candidates!: Table<SourceCandidatesRecord, string>;
  // INVARIANT: palette_revisions are append-only — never updated after creation.
  palette_revisions!: Table<PaletteRevision, string>;
  // Cleanup payloads — linked external records, NOT inline mutation.
  cleanup_payloads!: Table<CleanupPayload, string>;
  // WORKING_PALETTE drafts — governed editable infrastructure, NOT archive truth.
  // INVARIANT: must never be confused with committed revision truth.
  working_palettes!: Table<WorkingPaletteState, string>;
  // Saved exploratory views — append-only lineage (parentViewId preserved).
  // INVARIANT: saved views may NEVER mutate prior saved view semantics.
  saved_views!: Table<SavedView, string>;
  // Saved intelligence reports — append-only advisory overlays.
  // INVARIANT: exempt from source_candidates_ref governance (references governed artifacts).
  // INVARIANT: new analyses may NEVER ingest prior reports as analytical truth.
  intelligence_reports!: Table<IntelligenceReport, string>;

  constructor() {
    super('colorlab_gov');
    this.version(4).stores({
      source_candidates: 'id, dedupKey, extractedAt',
      palette_revisions: 'id, palette_id, source_candidates_ref, revision_number, lifecycle, createdAt',
      cleanup_payloads:  'id, paletteId, revisionId, source_candidates_ref',
      working_palettes:  'id, paletteId, savedAt',
    });
    this.version(5).stores({
      source_candidates: 'id, dedupKey, extractedAt',
      palette_revisions: 'id, palette_id, source_candidates_ref, revision_number, lifecycle, createdAt',
      cleanup_payloads:  'id, paletteId, revisionId, source_candidates_ref',
      working_palettes:  'id, paletteId, savedAt',
      saved_views:       'viewId, parentViewId, createdAt',
    });
    this.version(6).stores({
      source_candidates:    'id, dedupKey, extractedAt',
      palette_revisions:    'id, palette_id, source_candidates_ref, revision_number, lifecycle, createdAt',
      cleanup_payloads:     'id, paletteId, revisionId, source_candidates_ref',
      working_palettes:     'id, paletteId, savedAt',
      saved_views:          'viewId, parentViewId, createdAt',
      intelligence_reports: 'analysisId, parentAnalysisId, analysisType, generatedAt',
    });
  }
}

const db = new ColorlabDB();

// ─── Source Candidates ────────────────────────────────────────────────────────

/**
 * Create a SOURCE_CANDIDATES record. Write-once sealed archival telemetry.
 *
 * Deduplication doctrine: if source image content + extraction settings are
 * identical to an existing record, the existing payload is reused rather than
 * generating a duplicate archival record.
 *
 * INVARIANT: source_candidates_ref resolves to self.
 * INVARIANT: SOURCE_CANDIDATES records are sealed after creation.
 */
export async function createSourceCandidates(
  record: SourceCandidatesRecord
): Promise<{ record: SourceCandidatesRecord; deduplicated: boolean }> {
  // Content-based deduplication: same hash + settings = reuse existing record
  const existing = await db.source_candidates
    .where('dedupKey').equals(record.dedupKey)
    .first();

  if (existing) {
    return { record: existing, deduplicated: true };
  }

  // Enforce self-reference invariant before writing
  if (record.source_candidates_ref !== record.id) {
    throw new Error(
      `GOVERNANCE INVARIANT VIOLATION: source_candidates_ref must resolve to self (id=${record.id}).`
    );
  }

  await db.source_candidates.add(record);
  return { record, deduplicated: false };
}

// ─── Revision helpers ─────────────────────────────────────────────────────────

async function getLatestRevision(palette_id: string): Promise<PaletteRevision | undefined> {
  const all = await db.palette_revisions
    .where('palette_id').equals(palette_id)
    .sortBy('revision_number');
  return all[all.length - 1];
}

async function nextRevisionNumber(palette_id: string): Promise<number> {
  return (await db.palette_revisions.where('palette_id').equals(palette_id).count()) + 1;
}

/**
 * Append a new immutable revision. Validates transition matrix.
 * INVARIANT: Historical revisions may never mutate.
 * INVARIANT: source_candidates_ref propagates to every downstream revision.
 *
 * Exported as appendRevisionRaw for use by the editor infrastructure.
 * Callers outside this module must have a validated lifecycle transition.
 */
export async function appendRevisionRaw(
  palette_id: string,
  source_candidates_ref: string,
  name: string,
  swatches: PaletteSwatch[],
  lifecycle: LifecycleState,
  derived_from_revision?: string,
  parent_palette_id?: string,
  tombstone?: boolean,
  _validate = true,
  commitProvenance?: PaletteRevision['commitProvenance'],
  editSummary?: PaletteRevision['editSummary'],
): Promise<PaletteRevision> {
  const revision: PaletteRevision = {
    id: crypto.randomUUID(),
    palette_id,
    source_candidates_ref,
    revision_number: await nextRevisionNumber(palette_id),
    lifecycle,
    name,
    swatches,
    createdAt: Date.now(),
    ...(derived_from_revision ? { derived_from_revision } : {}),
    ...(parent_palette_id     ? { parent_palette_id }     : {}),
    ...(tombstone             ? { tombstone: true }       : {}),
    ...(commitProvenance      ? { commitProvenance }      : {}),
    ...(editSummary           ? { editSummary }           : {}),
  };
  await db.palette_revisions.add(revision);
  return revision;
}

// Internal alias for module-local use
const appendRevision = appendRevisionRaw;

// ─── Public palette API ───────────────────────────────────────────────────────

/**
 * Create a new palette from a SOURCE_CANDIDATES record.
 * Emits two append-only revisions:
 *   rev 1 — WORKING_PALETTE
 *   rev 2 — CURATED_PALETTE
 *
 * INVARIANT: Every governed artifact must carry a non-nullable source_candidates_ref.
 */
export async function createPalette(
  source_candidates_ref: string,
  name: string,
  swatches: PaletteSwatch[],
): Promise<PaletteRevision> {
  const source = await db.source_candidates.get(source_candidates_ref);
  if (!source) {
    throw new Error(
      `GOVERNANCE INVARIANT VIOLATION: source_candidates_ref "${source_candidates_ref}" not found.`
    );
  }

  const palette_id = crypto.randomUUID();

  assertTransitionAllowed('SOURCE_CANDIDATES', 'WORKING_PALETTE');
  const working = await appendRevision(
    palette_id, source_candidates_ref, name, swatches, 'WORKING_PALETTE'
  );

  assertTransitionAllowed('WORKING_PALETTE', 'CURATED_PALETTE');
  return appendRevision(
    palette_id, source_candidates_ref, name, swatches, 'CURATED_PALETTE', working.id
  );
}

/**
 * Append an edit as a new CURATED_PALETTE revision.
 * INVARIANT: Prior revisions are immutable.
 */
export async function updatePalette(
  palette_id: string,
  name: string,
  swatches: PaletteSwatch[],
): Promise<PaletteRevision> {
  const latest = await getLatestRevision(palette_id);
  if (!latest) throw new Error(`Palette ${palette_id} not found.`);
  assertTransitionAllowed(latest.lifecycle, 'CURATED_PALETTE');
  return appendRevision(
    palette_id, latest.source_candidates_ref, name, swatches, 'CURATED_PALETTE', latest.id
  );
}

/**
 * Archive: CURATED_PALETTE → ARCHIVAL_PALETTE.
 * Frozen stable historical reference. Immutable after transition.
 */
export async function archivePalette(palette_id: string): Promise<PaletteRevision> {
  const latest = await getLatestRevision(palette_id);
  if (!latest) throw new Error(`Palette ${palette_id} not found.`);
  assertTransitionAllowed(latest.lifecycle, 'ARCHIVAL_PALETTE');
  return appendRevision(
    palette_id, latest.source_candidates_ref, latest.name, latest.swatches,
    'ARCHIVAL_PALETTE', latest.id
  );
}

/**
 * Retire: → RETIRED_ARCHIVE with tombstone revision.
 * INVARIANT: Retirement is retention, NOT deletion.
 * INVARIANT: Tombstone preserves lineage for traversal continuity.
 */
export async function retirePalette(palette_id: string): Promise<void> {
  const latest = await getLatestRevision(palette_id);
  if (!latest) throw new Error(`Palette ${palette_id} not found.`);
  if (latest.lifecycle === 'RETIRED_ARCHIVE') return;
  assertTransitionAllowed(latest.lifecycle, 'RETIRED_ARCHIVE');
  await appendRevision(
    palette_id, latest.source_candidates_ref, latest.name, latest.swatches,
    'RETIRED_ARCHIVE', latest.id, undefined, true
  );
}

/**
 * Branch a DERIVED_VARIANT from a CURATED/DERIVED palette.
 * INVARIANT: source_candidates_ref propagates. Variant may NEVER sever provenance.
 */
export async function derivePalette(
  parent_palette_id: string,
  name: string,
): Promise<PaletteRevision> {
  const parent = await getLatestRevision(parent_palette_id);
  if (!parent) throw new Error(`Parent palette ${parent_palette_id} not found.`);
  assertTransitionAllowed(parent.lifecycle, 'DERIVED_VARIANT');
  const palette_id = crypto.randomUUID();
  return appendRevision(
    palette_id, parent.source_candidates_ref, name, parent.swatches,
    'DERIVED_VARIANT', parent.id, parent_palette_id
  );
}

/**
 * Rollback: new derived revision referencing a prior historical state.
 * INVARIANT: Rollback is interpretation, NOT time travel. History is never erased.
 */
export async function rollbackPalette(
  palette_id: string,
  target_revision_id: string,
): Promise<PaletteRevision> {
  const target = await db.palette_revisions.get(target_revision_id);
  if (!target || target.palette_id !== palette_id) {
    throw new Error(`Revision ${target_revision_id} not found for palette ${palette_id}.`);
  }
  const latest = await getLatestRevision(palette_id);
  if (!latest) throw new Error(`Palette ${palette_id} not found.`);
  assertTransitionAllowed(latest.lifecycle, 'CURATED_PALETTE');
  return appendRevision(
    palette_id, target.source_candidates_ref, target.name, target.swatches,
    'CURATED_PALETTE', target_revision_id
  );
}

// ─── Read API (read-only consumers) ───────────────────────────────────────────

/**
 * Load all active (non-retired) palettes as view models.
 * Visualization systems are read-only consumers.
 */
export async function loadActivePalettes(): Promise<PaletteView[]> {
  const allRevisions = await db.palette_revisions.toArray();

  const latestMap = new Map<string, PaletteRevision>();
  for (const rev of allRevisions) {
    const existing = latestMap.get(rev.palette_id);
    if (!existing || rev.revision_number > existing.revision_number) {
      latestMap.set(rev.palette_id, rev);
    }
  }

  const active = [...latestMap.values()]
    .filter(r => r.lifecycle !== 'RETIRED_ARCHIVE')
    .sort((a, b) => b.createdAt - a.createdAt);

  return Promise.all(
    active.map(async rev => {
      const source = await db.source_candidates.get(rev.source_candidates_ref);
      return {
        palette_id: rev.palette_id,
        source_candidates_ref: rev.source_candidates_ref,
        name: rev.name,
        thumbnail: source?.thumbnail ?? '',
        swatches: rev.swatches,
        lifecycle: rev.lifecycle,
        revision_number: rev.revision_number,
        revision_id: rev.id,
        createdAt: rev.createdAt,
      } satisfies PaletteView;
    })
  );
}

export async function loadPaletteRevisions(palette_id: string): Promise<PaletteRevision[]> {
  return db.palette_revisions
    .where('palette_id').equals(palette_id)
    .sortBy('revision_number');
}

// ─── Cleanup payload storage ───────────────────────────────────────────────────
// Cleanup payloads are linked external records — NOT inline mutation of revisions.
// INVARIANT: cleanup payloads may NEVER overwrite SOURCE_CANDIDATES telemetry.

/**
 * Save a cleanup payload linked to a specific revision.
 * Multiple cleanup payloads may exist per revision (different modes = different runs).
 */
export async function saveCleanupPayload(payload: CleanupPayload): Promise<void> {
  await db.cleanup_payloads.put(payload);
}

/**
 * Load the most recent cleanup payload for a given revision.
 */
export async function loadCleanupPayloadForRevision(
  revisionId: string
): Promise<CleanupPayload | undefined> {
  const all = await db.cleanup_payloads
    .where('revisionId').equals(revisionId)
    .toArray();
  return all[all.length - 1];
}

/**
 * Load all cleanup payloads for a palette (all revisions, all modes).
 * Supports A/B comparison and cleanup chronology review.
 */
export async function loadCleanupHistoryForPalette(
  paletteId: string
): Promise<CleanupPayload[]> {
  return db.cleanup_payloads
    .where('paletteId').equals(paletteId)
    .toArray();
}

// ─── Latest revision convenience ─────────────────────────────────────────────

export async function loadLatestRevision(
  palette_id: string
): Promise<PaletteRevision | undefined> {
  const all = await db.palette_revisions
    .where('palette_id').equals(palette_id)
    .sortBy('revision_number');
  return all[all.length - 1];
}

export async function loadSourceCandidates(
  source_candidates_ref: string
): Promise<SourceCandidatesRecord | undefined> {
  return db.source_candidates.get(source_candidates_ref);
}

// ─── Working palette storage ──────────────────────────────────────────────────
// WORKING_PALETTE drafts persist for session continuity.
// INVARIANT: drafts must NEVER be confused with committed revision truth.

export async function saveWorkingPalette(state: WorkingPaletteState): Promise<void> {
  await db.working_palettes.put({ ...state, savedAt: Date.now() });
}

export async function loadWorkingPaletteForPalette(
  paletteId: string
): Promise<WorkingPaletteState | undefined> {
  const all = await db.working_palettes
    .where('paletteId').equals(paletteId)
    .sortBy('savedAt');
  return all[all.length - 1];
}

export async function discardWorkingPalette(id: string): Promise<void> {
  await db.working_palettes.delete(id);
}

// ─── Saved views storage ───────────────────────────────────────────────────────
// Append-only exploratory views with parentViewId lineage.
// INVARIANT: saved views may NEVER overwrite prior saved view records.
// INVARIANT: parentViewId lineage must never be severed on save.

/**
 * Persist a validated saved view.
 * Uses put semantics for idempotent replay — saves are write-once by convention
 * (callers must derive a new viewId for any update, not reuse existing viewId).
 */
export async function persistSavedView(view: SavedView): Promise<void> {
  await db.saved_views.put(view);
}

/**
 * Load all saved views, newest first.
 * Returns the full append-only lineage — callers must filter by parentViewId
 * if they need lineage traversal.
 */
export async function loadAllSavedViews(): Promise<SavedView[]> {
  const all = await db.saved_views.toArray();
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function loadSavedView(viewId: string): Promise<SavedView | undefined> {
  return db.saved_views.get(viewId);
}

/**
 * Load the lineage chain for a saved view (inclusive of the view itself),
 * ordered from root to leaf.
 */
export async function loadSavedViewLineage(viewId: string): Promise<SavedView[]> {
  const all = await db.saved_views.toArray();
  const byId = new Map(all.map(v => [v.viewId, v]));
  const chain: SavedView[] = [];
  let current = byId.get(viewId);
  while (current) {
    chain.unshift(current);
    current = current.parentViewId ? byId.get(current.parentViewId) : undefined;
  }
  return chain;
}

// ─── Intelligence reports storage ─────────────────────────────────────────────
// Append-only advisory overlay artifacts.
// INVARIANT: reports are exempt from source_candidates_ref governance.
// INVARIANT: saved reports are never overwritten — parentAnalysisId preserves lineage.

/**
 * Persist a validated saved intelligence report.
 * Uses put semantics for idempotent replay — but callers must never reuse analysisId
 * for a new analysis (derive a new analysisId and set parentAnalysisId instead).
 */
export async function saveIntelligenceReport(
  report: IntelligenceReport,
): Promise<void> {
  // Mark as historical artifact on save
  await db.intelligence_reports.put({
    ...report,
    governance: { ...report.governance, isHistoricalArtifact: true },
  });
}

/**
 * Load all saved intelligence reports of a given type, newest first.
 */
export async function loadIntelligenceReports(
  analysisType?: string,
): Promise<IntelligenceReport[]> {
  const all = await db.intelligence_reports.toArray();
  const filtered = analysisType ? all.filter(r => r.analysisType === analysisType) : all;
  return filtered.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
}

/**
 * Load the lineage chain for a saved report (root → leaf), inclusive.
 */
export async function loadIntelligenceReportLineage(
  analysisId: string,
): Promise<IntelligenceReport[]> {
  const all = await db.intelligence_reports.toArray();
  const byId = new Map(all.map(r => [r.analysisId, r]));
  const chain: IntelligenceReport[] = [];
  let current = byId.get(analysisId);
  while (current) {
    chain.unshift(current);
    current = current.parentAnalysisId ? byId.get(current.parentAnalysisId) : undefined;
  }
  return chain;
}
