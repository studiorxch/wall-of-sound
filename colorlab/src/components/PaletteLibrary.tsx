import React, { useCallback, useEffect, useState } from 'react';
import type { PaletteView, LifecycleState, PaletteRevision, CleanupPayload } from '../types/palette';
import {
  loadActivePalettes, retirePalette, archivePalette,
  loadLatestRevision, loadCleanupPayloadForRevision,
} from '../lib/paletteStorage';
import PaletteExportPanel from './PaletteExportPanel';

interface Props {
  refreshKey: number;
  onEditPalette: (paletteId: string) => void;
}

// Human-readable lifecycle badge labels
const LIFECYCLE_LABELS: Record<LifecycleState, string> = {
  SOURCE_CANDIDATES:  'Source',
  WORKING_PALETTE:    'Working',
  CURATED_PALETTE:    'Curated',
  ARCHIVAL_PALETTE:   'Archived',
  DERIVED_VARIANT:    'Variant',
  RETIRED_ARCHIVE:    'Retired',
};

const LIFECYCLE_CLASSES: Record<LifecycleState, string> = {
  SOURCE_CANDIDATES:  'badge--neutral',
  WORKING_PALETTE:    'badge--working',
  CURATED_PALETTE:    'badge--curated',
  ARCHIVAL_PALETTE:   'badge--archived',
  DERIVED_VARIANT:    'badge--variant',
  RETIRED_ARCHIVE:    'badge--retired',
};

interface ExportTarget {
  revision: PaletteRevision;
  cleanupPayload: CleanupPayload | null;
}

export default function PaletteLibrary({ refreshKey, onEditPalette }: Props) {
  const [palettes, setPalettes] = useState<PaletteView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportTarget, setExportTarget] = useState<ExportTarget | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    loadActivePalettes()
      .then(setPalettes)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load palettes.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { refresh(); }, [refreshKey, refresh]);

  // Governance: retire = RETIRED_ARCHIVE transition with tombstone.
  // Retention NOT deletion — lineage continuity preserved.
  const handleRetire = useCallback(async (palette_id: string) => {
    try {
      await retirePalette(palette_id);
      setPalettes(prev => prev.filter(p => p.palette_id !== palette_id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to retire palette.');
    }
  }, []);

  const handleExport = useCallback(async (palette_id: string) => {
    const revision = await loadLatestRevision(palette_id);
    if (!revision) return;
    const cleanupPayload = await loadCleanupPayloadForRevision(revision.id) ?? null;
    setExportTarget({ revision, cleanupPayload });
  }, []);

  // Governance: archive = CURATED_PALETTE → ARCHIVAL_PALETTE transition.
  // Frozen stable historical reference — immutable after archiving.
  const handleArchive = useCallback(async (palette_id: string) => {
    try {
      await archivePalette(palette_id);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to archive palette.');
    }
  }, [refresh]);

  if (loading) return <p className="library__state">Loading library…</p>;
  if (error)   return <p className="library__state library__state--error">{error}</p>;
  if (palettes.length === 0) return <p className="library__state">No saved palettes yet.</p>;

  return (
    <div className="library">
      {exportTarget && (
        <PaletteExportPanel
          revision={exportTarget.revision}
          cleanupPayload={exportTarget.cleanupPayload}
          onClose={() => setExportTarget(null)}
        />
      )}
      {palettes.map(palette => (
        <div key={palette.palette_id} className="library__card">
          <div className="library__card-header">
            {palette.thumbnail && (
              <img src={palette.thumbnail} alt={palette.name} className="library__thumb" />
            )}
            <div className="library__meta">
              <span className="library__name">{palette.name}</span>
              <div className="library__meta-row">
                <span className="library__date">
                  {new Date(palette.createdAt).toLocaleDateString()}
                </span>
                <span
                  className={`badge ${LIFECYCLE_CLASSES[palette.lifecycle]}`}
                  title={`Lifecycle state: ${palette.lifecycle} · rev ${palette.revision_number}`}
                >
                  {LIFECYCLE_LABELS[palette.lifecycle]}
                </span>
                <span className="library__rev" title="Revision number">
                  r{palette.revision_number}
                </span>
              </div>
            </div>
            <div className="library__actions">
              <button
                className="btn btn--ghost btn--sm"
                onClick={() => handleExport(palette.palette_id)}
                title="Export palette"
              >
                ↓ Export
              </button>
              {(palette.lifecycle === 'CURATED_PALETTE' || palette.lifecycle === 'DERIVED_VARIANT') && (
                <button
                  className="btn btn--primary btn--sm"
                  onClick={() => onEditPalette(palette.palette_id)}
                  title="Open in working palette editor"
                >
                  Edit
                </button>
              )}
              {palette.lifecycle === 'CURATED_PALETTE' && (
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={() => handleArchive(palette.palette_id)}
                  title="Freeze as archival snapshot (CURATED → ARCHIVAL)"
                >
                  Archive
                </button>
              )}
              <button
                className="btn btn--ghost btn--sm btn--danger"
                onClick={() => handleRetire(palette.palette_id)}
                title="Retire palette — retained, not deleted. Lineage preserved."
              >
                Retire
              </button>
            </div>
          </div>
          <div className="library__swatches">
            {palette.swatches.map(swatch => (
              <div
                key={swatch.id}
                className="library__swatch"
                style={{ background: swatch.hex }}
                title={swatch.hex.toUpperCase()}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
