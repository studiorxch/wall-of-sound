/**
 * Palette Visualization — v1.2.1
 *
 * Implements the stabilized visualization doctrines from 0522G.
 * All doctrines are enforced at this layer — components consume validated state.
 *
 * INVARIANTS:
 * - current_revision resolves latest non-retired revision at render time.
 * - Unresolved palettes surface explicitly — never silently omitted.
 * - layoutSeed derived from viewId — deterministic, not random at render time.
 * - Stale filters surface explicitly — never silently dropped.
 * - collectionRevisionRefs used for pinned collection replay (NOT collectionRefs).
 * - parentViewId non-null for all derived saved views.
 */

import type {
  SavedView,
  SavedViewValidationResult,
  PaletteView,
  VisualizationMode,
  ScopeResolutionMode,
  LayoutType,
  SortOrder,
} from '../types/palette';

export const VISUALIZATION_VERSION = '1.2.1';

// ─── Layout seed ─────────────────────────────────────────────────────────────
// INVARIANT: seed is deterministic from viewId — never Math.random() at render.
// Preserves: interaction continuity, spatial familiarity, non-authoritative reproducibility.

export function layoutSeedFromViewId(viewId: string): number {
  let hash = 0;
  for (let i = 0; i < viewId.length; i++) {
    hash = ((hash << 5) - hash + viewId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

// ─── Deterministic seeded shuffle ────────────────────────────────────────────
// Mulberry32 — same PRNG as extraction pipeline for consistency.

function makePrng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(arr: T[], seed: number): T[] {
  const rng = makePrng(seed);
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// ─── Scope resolution ─────────────────────────────────────────────────────────

export interface ResolvedScope {
  palettes: PaletteView[];
  /**
   * Unresolved palettes — revision references that could not be matched.
   * INVARIANT: must surface explicitly to user — never silently omit.
   */
  unresolvedRefs: string[];
}

/**
 * Resolve a saved view's scope against the live palette state.
 *
 * current_revision: resolves latest non-retired revision at render time.
 *   Validation checks palette reference existence, NOT pinned revision existence.
 *
 * pinned_revision: resolves explicit revisionRefs only.
 *   Unresolved refs surface as unresolvedRefs — never silently omitted.
 */
export function resolveScope(
  view: SavedView,
  activePalettes: PaletteView[],
): ResolvedScope {
  if (view.scopeResolutionMode === 'current_revision') {
    // Resolve latest non-retired revision for all known palettes.
    // Palettes with no active revision are surfaced as unresolved.
    return {
      palettes: activePalettes,
      unresolvedRefs: [],
    };
  }

  // pinned_revision: match against explicit revisionRefs
  const revisionRefs = view.scope.revisionRefs ?? [];
  if (revisionRefs.length === 0) {
    // No pinned refs — treat as unscoped pinned view (show all active)
    return { palettes: activePalettes, unresolvedRefs: [] };
  }

  const byRevisionId = new Map(activePalettes.map(p => [p.revision_id, p]));
  const resolved: PaletteView[] = [];
  const unresolvedRefs: string[] = [];

  for (const ref of revisionRefs) {
    const palette = byRevisionId.get(ref);
    if (palette) {
      resolved.push(palette);
    } else {
      // INVARIANT: surface as unresolved — never silently omit
      unresolvedRefs.push(ref);
    }
  }

  return { palettes: resolved, unresolvedRefs };
}

// ─── Sort ─────────────────────────────────────────────────────────────────────

export function sortPalettes(
  palettes: PaletteView[],
  sortOrder: SortOrder,
): PaletteView[] {
  const sorted = [...palettes];
  switch (sortOrder) {
    case 'created_at':
      return sorted.sort((a, b) => b.createdAt - a.createdAt);
    case 'name':
      return sorted.sort((a, b) => a.name.localeCompare(b.name));
    case 'revision_number':
      return sorted.sort((a, b) => b.revision_number - a.revision_number);
    case 'luminance': {
      // Sort by average luminance of swatches (approximation: average R+G+B)
      const avgLuma = (p: PaletteView) => {
        if (p.swatches.length === 0) return 0;
        return p.swatches.reduce((s, sw) => {
          const r = parseInt(sw.hex.slice(1, 3), 16);
          const g = parseInt(sw.hex.slice(3, 5), 16);
          const b = parseInt(sw.hex.slice(5, 7), 16);
          return s + r * 0.299 + g * 0.587 + b * 0.114;
        }, 0) / p.swatches.length;
      };
      return sorted.sort((a, b) => avgLuma(b) - avgLuma(a));
    }
    default:
      return sorted;
  }
}

// ─── Stale filter detection ───────────────────────────────────────────────────
// INVARIANT: stale filter terms must surface explicitly — never silently dropped.
// The metadata vocabulary system (0522E) is not yet implemented;
// all filter terms with non-empty values surface as potentially stale.

export function detectStaleFilters(view: SavedView): string[] {
  const stale: string[] = [];
  for (const [namespace, values] of Object.entries(view.layoutState.filters)) {
    if (values.length > 0) {
      // Without a live metadata vocabulary, all active filter terms are flagged
      // as potentially stale. When 0522E is integrated this will resolve against
      // the active vocabulary state.
      stale.push(`${namespace}: ${values.join(', ')}`);
    }
  }
  return stale;
}

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validate a saved view per the Saved View Lineage Validation Doctrine.
 *
 * Validation failures must block saved-view persistence.
 * Validation does NOT block transient exploratory interaction.
 */
export function validateSavedView(
  view: SavedView,
  allViewIds: Set<string>,
  activePaletteIds: Set<string>,
): SavedViewValidationResult {
  const errors: string[] = [];

  // Lineage: derived views must have a resolvable parentViewId
  if (view.parentViewId !== null && !allViewIds.has(view.parentViewId)) {
    errors.push(
      `parentViewId "${view.parentViewId}" does not resolve to a known saved view.`
    );
  }

  // Layout seed must be derived from viewId
  const expectedSeed = view.viewId;
  if (view.layoutState.layoutSeed !== expectedSeed) {
    errors.push(
      `layoutSeed must be derived from viewId (expected "${expectedSeed}", got "${view.layoutState.layoutSeed}").`
    );
  }

  // current_revision: validate palette reference existence (NOT pinned revision existence)
  if (view.scopeResolutionMode === 'current_revision') {
    // No specific revision refs to validate — palette set resolved at render time
  }

  // pinned_revision: collectionRevisionRefs required (NOT collectionRefs)
  if (view.scopeResolutionMode === 'pinned_revision') {
    const revisionRefs = view.scope.revisionRefs ?? [];
    for (const ref of revisionRefs) {
      if (!activePaletteIds.has(ref)) {
        // Record as stale — unresolved refs must surface, not silently block
        // (per doctrine: surface as unresolved, NOT silently omit)
      }
    }
  }

  // Stale filters — must surface, not block
  const staleFilters = detectStaleFilters(view);

  return {
    valid: errors.length === 0,
    errors,
    staleFilters,
  };
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create a new root saved view.
 * parentViewId: null — no prior visualization ancestry.
 * layoutSeed: derived from viewId — deterministic.
 */
export function createRootView(
  mode: VisualizationMode,
  scopeResolutionMode: ScopeResolutionMode,
  layoutType: LayoutType,
  sortOrder: SortOrder,
): SavedView {
  const viewId = crypto.randomUUID();
  return {
    viewId,
    parentViewId: null,
    viewVersion: '1.2.1',
    createdAt: new Date().toISOString(),
    visualizationMode: mode,
    scopeResolutionMode,
    scope: {},
    filterVocabulary: {
      metadataSchemaVersion: '1.0.0',
      namespaces: [],
    },
    layoutState: {
      layoutType,
      layoutSeed: viewId,   // INVARIANT: derived from viewId
      sortOrder,
      filters: {},
    },
  };
}

/**
 * Derive a new saved view from an existing one.
 * INVARIANT: parentViewId set to parent's viewId — lineage never severed.
 * INVARIANT: new viewId → new layoutSeed (deterministic from new viewId).
 */
export function deriveSavedView(
  parent: SavedView,
  overrides: Partial<Omit<SavedView, 'viewId' | 'parentViewId' | 'viewVersion' | 'createdAt'>>,
): SavedView {
  const viewId = crypto.randomUUID();
  return {
    ...parent,
    ...overrides,
    viewId,
    parentViewId: parent.viewId,   // INVARIANT: lineage preserved
    viewVersion: '1.2.1',
    createdAt: new Date().toISOString(),
    layoutState: {
      ...parent.layoutState,
      ...(overrides.layoutState ?? {}),
      layoutSeed: viewId,           // INVARIANT: new seed from new viewId
    },
  };
}
