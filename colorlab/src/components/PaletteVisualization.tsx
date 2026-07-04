/**
 * PaletteVisualization — exploratory palette browsing (v1.2.1)
 *
 * Implements current_revision scope resolution and deterministic layout seeding.
 * Unresolved palettes surface explicitly. Stale filters surface as visible indicators.
 *
 * Supported modes: cluster (seeded grid), timeline (chronological)
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { PaletteView, SavedView, VisualizationMode, SortOrder } from '../types/palette';
import { loadActivePalettes, loadAllSavedViews, persistSavedView } from '../lib/paletteStorage';
import {
  createRootView,
  deriveSavedView,
  resolveScope,
  sortPalettes,
  seededShuffle,
  layoutSeedFromViewId,
  detectStaleFilters,
  validateSavedView,
} from '../lib/paletteVisualization';

interface Props {
  refreshKey: number;
  onEditPalette: (paletteId: string) => void;
}

// ─── Palette card (read-only visualization consumer) ─────────────────────────

function PaletteCard({
  palette,
  onEdit,
}: {
  palette: PaletteView;
  onEdit: () => void;
}) {
  return (
    <div className="vis-card">
      <div className="vis-card__swatches">
        {palette.swatches.map(s => (
          <div key={s.id} className="vis-card__swatch" style={{ background: s.hex }} />
        ))}
        {palette.swatches.length === 0 && (
          <div className="vis-card__empty-swatches">No swatches</div>
        )}
      </div>
      {palette.thumbnail && (
        <img src={palette.thumbnail} alt={palette.name} className="vis-card__thumb" />
      )}
      <div className="vis-card__meta">
        <span className="vis-card__name">{palette.name}</span>
        <div className="vis-card__meta-row">
          <span className="vis-card__lifecycle">{palette.lifecycle.replace('_', ' ')}</span>
          <span className="vis-card__rev">r{palette.revision_number}</span>
        </div>
      </div>
      {(palette.lifecycle === 'CURATED_PALETTE' || palette.lifecycle === 'DERIVED_VARIANT') && (
        <button className="vis-card__edit btn btn--ghost btn--sm" onClick={onEdit}>
          Edit
        </button>
      )}
    </div>
  );
}

// ─── Unresolved palette indicator ─────────────────────────────────────────────
// INVARIANT: unresolved palettes must surface explicitly — never silently omit.

function UnresolvedPaletteIndicator({ refs }: { refs: string[] }) {
  if (refs.length === 0) return null;
  return (
    <div className="vis-unresolved">
      <span className="vis-unresolved__label">⚠ Unresolved palette references</span>
      <ul className="vis-unresolved__list">
        {refs.map(ref => (
          <li key={ref} className="vis-unresolved__ref">{ref}</li>
        ))}
      </ul>
      <p className="vis-unresolved__note">
        These revision references could not be resolved against the active palette state.
        They may have been retired or deleted.
      </p>
    </div>
  );
}

// ─── Stale filter indicator ───────────────────────────────────────────────────
// INVARIANT: stale filters must surface as visible indicators — never silently dropped.

function StaleFilterIndicator({ staleFilters }: { staleFilters: string[] }) {
  if (staleFilters.length === 0) return null;
  return (
    <div className="vis-stale-filters">
      <span className="vis-stale-filters__label">⚠ Stale filter terms</span>
      <span className="vis-stale-filters__note">
        The following filters cannot be resolved against the active metadata vocabulary:
      </span>
      <ul className="vis-stale-filters__list">
        {staleFilters.map(f => (
          <li key={f} className="vis-stale-filters__term">{f}</li>
        ))}
      </ul>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PaletteVisualization({ refreshKey, onEditPalette }: Props) {
  const [allPalettes, setAllPalettes] = useState<PaletteView[]>([]);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [activeView, setActiveView] = useState<SavedView>(() =>
    createRootView('cluster', 'current_revision', 'grid', 'created_at')
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSavedViews, setShowSavedViews] = useState(false);

  // Load active palettes and saved views
  const load = useCallback(() => {
    setLoading(true);
    Promise.all([loadActivePalettes(), loadAllSavedViews()])
      .then(([palettes, views]) => {
        setAllPalettes(palettes);
        setSavedViews(views);
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [refreshKey, load]);

  // Resolve scope per current_revision doctrine
  const { palettes: scopedPalettes, unresolvedRefs } = useMemo(
    () => resolveScope(activeView, allPalettes),
    [activeView, allPalettes]
  );

  // Apply sort
  const sortedPalettes = useMemo(
    () => sortPalettes(scopedPalettes, activeView.layoutState.sortOrder),
    [scopedPalettes, activeView.layoutState.sortOrder]
  );

  // Apply deterministic seeded layout (cluster mode shuffles, timeline stays sorted)
  const displayPalettes = useMemo(() => {
    if (activeView.visualizationMode === 'cluster') {
      const seed = layoutSeedFromViewId(activeView.viewId);
      return seededShuffle(sortedPalettes, seed);
    }
    return sortedPalettes; // timeline: chronological order
  }, [sortedPalettes, activeView.visualizationMode, activeView.viewId]);

  // Stale filter detection — surfaces all active filter terms
  const staleFilters = useMemo(
    () => detectStaleFilters(activeView),
    [activeView]
  );

  // Switch visualization mode — derives a new view preserving lineage
  const switchMode = useCallback((mode: VisualizationMode) => {
    setActiveView(prev => deriveSavedView(prev, {
      visualizationMode: mode,
      layoutState: {
        ...prev.layoutState,
        layoutType: mode === 'cluster' ? 'grid' : 'chronological',
        sortOrder: mode === 'timeline' ? 'created_at' : prev.layoutState.sortOrder,
      },
    }));
  }, []);

  // Change sort order — derives new view
  const changeSortOrder = useCallback((sortOrder: SortOrder) => {
    setActiveView(prev => deriveSavedView(prev, {
      layoutState: { ...prev.layoutState, sortOrder },
    }));
  }, []);

  // Save current view
  const saveCurrentView = useCallback(async () => {
    const allViewIds = new Set(savedViews.map(v => v.viewId));
    const activeRevIds = new Set(allPalettes.map(p => p.revision_id));
    const { valid, errors } = validateSavedView(activeView, allViewIds, activeRevIds);
    if (!valid) {
      setError(`Cannot save view: ${errors.join('; ')}`);
      return;
    }
    try {
      await persistSavedView(activeView);
      const views = await loadAllSavedViews();
      setSavedViews(views);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save view.');
    }
  }, [activeView, savedViews, allPalettes]);

  // Load a saved view
  const loadView = useCallback((view: SavedView) => {
    setActiveView(view);
    setShowSavedViews(false);
  }, []);

  if (loading) return <p className="vis__state">Loading…</p>;
  if (error)   return <p className="vis__state vis__state--error">{error}</p>;

  return (
    <div className="vis">
      {/* ── Toolbar ── */}
      <div className="vis__toolbar">
        <div className="vis__mode-btns">
          <button
            className={`vis__mode-btn${activeView.visualizationMode === 'cluster' ? ' vis__mode-btn--active' : ''}`}
            onClick={() => switchMode('cluster')}
            title="Cluster — seeded grid layout"
          >⬡ Cluster</button>
          <button
            className={`vis__mode-btn${activeView.visualizationMode === 'timeline' ? ' vis__mode-btn--active' : ''}`}
            onClick={() => switchMode('timeline')}
            title="Timeline — chronological browsing"
          >↕ Timeline</button>
        </div>

        <div className="vis__sort">
          <label className="vis__sort-label">Sort</label>
          <select
            className="role-select"
            value={activeView.layoutState.sortOrder}
            onChange={e => changeSortOrder(e.target.value as SortOrder)}
          >
            <option value="created_at">Newest first</option>
            <option value="name">Name</option>
            <option value="luminance">Luminance</option>
            <option value="revision_number">Revision</option>
          </select>
        </div>

        <div className="vis__toolbar-actions">
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => setShowSavedViews(v => !v)}
            title="Browse saved views"
          >
            {showSavedViews ? '▾' : '▸'} Saved views ({savedViews.length})
          </button>
          <button className="btn btn--ghost btn--sm" onClick={saveCurrentView}>
            Save view
          </button>
        </div>
      </div>

      {/* ── Saved views panel ── */}
      {showSavedViews && (
        <div className="vis__saved-panel">
          {savedViews.length === 0 ? (
            <p className="vis__saved-empty">No saved views yet.</p>
          ) : (
            savedViews.map(view => (
              <button
                key={view.viewId}
                className={`vis__saved-item${view.viewId === activeView.viewId ? ' vis__saved-item--active' : ''}`}
                onClick={() => loadView(view)}
              >
                <span className="vis__saved-mode">{view.visualizationMode}</span>
                <span className="vis__saved-date">
                  {new Date(view.createdAt).toLocaleString()}
                </span>
                {view.parentViewId && (
                  <span className="vis__saved-derived" title={`Derived from ${view.parentViewId}`}>↳</span>
                )}
              </button>
            ))
          )}
        </div>
      )}

      {/* ── Scope info bar ── */}
      <div className="vis__scope-bar">
        <span className="vis__scope-label">
          {activeView.scopeResolutionMode === 'current_revision'
            ? `current_revision · ${displayPalettes.length} palettes`
            : `pinned_revision · ${displayPalettes.length} resolved`}
        </span>
        <span className="vis__seed-label" title="Layout seed — derived from viewId">
          seed:{activeView.viewId.slice(0, 8)}
        </span>
      </div>

      {/* ── Indicators ── */}
      <UnresolvedPaletteIndicator refs={unresolvedRefs} />
      <StaleFilterIndicator staleFilters={staleFilters} />

      {/* ── Main view ── */}
      {displayPalettes.length === 0 ? (
        <p className="vis__state">No palettes to display.</p>
      ) : activeView.visualizationMode === 'cluster' ? (
        <div className="vis__cluster">
          {displayPalettes.map(p => (
            <PaletteCard
              key={p.palette_id}
              palette={p}
              onEdit={() => onEditPalette(p.palette_id)}
            />
          ))}
        </div>
      ) : (
        <div className="vis__timeline">
          {displayPalettes.map((p, i) => (
            <div key={p.palette_id} className="vis__timeline-row">
              <div className="vis__timeline-index">{i + 1}</div>
              <div className="vis__timeline-swatches">
                {p.swatches.slice(0, 8).map(s => (
                  <div key={s.id} className="vis__timeline-swatch" style={{ background: s.hex }} />
                ))}
              </div>
              <div className="vis__timeline-meta">
                <span className="vis__timeline-name">{p.name}</span>
                <span className="vis__timeline-detail">
                  {p.lifecycle.replace('_', ' ')} · r{p.revision_number} ·{' '}
                  {new Date(p.createdAt).toLocaleDateString()}
                </span>
              </div>
              {(p.lifecycle === 'CURATED_PALETTE' || p.lifecycle === 'DERIVED_VARIANT') && (
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={() => onEditPalette(p.palette_id)}
                >Edit</button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
