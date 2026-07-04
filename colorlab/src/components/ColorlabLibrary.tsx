import React, { useCallback, useEffect, useState } from 'react';
import type { ColorlabPalette } from '../types/colorlab';
import {
  loadAllPalettes,
  deletePalette,
  toggleFavorite,
  duplicatePalette,
  archivePaletteById,
} from '../lib/colorlabStorage';
import { exportSVG, exportPNG, exportASE, exportJSON } from '../lib/colorlabExports';
import ColorlabEditor from './ColorlabEditor';

interface Props {
  refreshKey: number;
  onCreateNew: () => void;
}

const SOURCE_LABELS: Record<string, string> = {
  generated: 'Random',
  image_extracted: 'Image',
  seed_color: 'Seed',
  harmony: 'Harmony',
  manual: 'Manual',
  imported: 'Import',
  duplicated: 'Copy',
};

export default function ColorlabLibrary({ refreshKey, onCreateNew }: Props) {
  const [palettes, setPalettes] = useState<ColorlabPalette[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ColorlabPalette | null>(null);
  const [exportMenu, setExportMenu] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    loadAllPalettes()
      .then(setPalettes)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [refreshKey, load]);

  const handleDelete = useCallback(async (id: string) => {
    await deletePalette(id);
    setPalettes(prev => prev.filter(p => p.id !== id));
  }, []);

  const handleFavorite = useCallback(async (id: string) => {
    await toggleFavorite(id);
    load();
  }, [load]);

  const handleDuplicate = useCallback(async (id: string) => {
    const copy = await duplicatePalette(id);
    setEditing(copy);
  }, []);

  const handleArchive = useCallback(async (id: string) => {
    await archivePaletteById(id);
    setPalettes(prev => prev.filter(p => p.id !== id));
  }, []);

  const handleExport = useCallback((palette: ColorlabPalette, fmt: 'svg' | 'png' | 'ase' | 'json') => {
    if (fmt === 'svg') exportSVG(palette);
    else if (fmt === 'png') exportPNG(palette);
    else if (fmt === 'ase') exportASE(palette);
    else exportJSON(palette);
    setExportMenu(null);
  }, []);

  if (editing) {
    return (
      <ColorlabEditor
        palette={editing}
        onSaved={updated => { setEditing(null); load(); }}
        onDiscard={() => setEditing(null)}
      />
    );
  }

  if (loading) return <p className="cl-lib__state">Loading…</p>;

  if (palettes.length === 0) {
    return (
      <div className="cl-lib__empty">
        <p className="cl-lib__empty-text">No palettes yet.</p>
        <button className="btn btn--primary" onClick={onCreateNew}>Create your first palette</button>
      </div>
    );
  }

  return (
    <div className="cl-lib">
      {palettes.map(palette => (
        <div key={palette.id} className="cl-card">
          {/* Swatch strip */}
          <div className="cl-card__strip">
            {palette.swatches.map(s => (
              <div key={s.id} className="cl-card__strip-swatch" style={{ background: s.hex }} title={s.hex} />
            ))}
          </div>

          {/* Card body */}
          <div className="cl-card__body">
            <div className="cl-card__meta">
              <span className="cl-card__name">{palette.name}</span>
              <div className="cl-card__meta-row">
                <span className="cl-card__source">{SOURCE_LABELS[palette.sourceType] ?? palette.sourceType}</span>
                {palette.tags.length > 0 && (
                  <span className="cl-card__tags">{palette.tags.join(', ')}</span>
                )}
                <span className="cl-card__date">
                  {new Date(palette.createdAt).toLocaleDateString()}
                </span>
              </div>
            </div>

            <div className="cl-card__actions">
              <button
                className={`icon-btn${palette.favorite ? ' icon-btn--fav' : ' icon-btn--muted'}`}
                onClick={() => handleFavorite(palette.id)}
                title={palette.favorite ? 'Unfavorite' : 'Favorite'}
              >
                {palette.favorite ? '★' : '☆'}
              </button>

              <button
                className="btn btn--primary btn--sm"
                onClick={() => setEditing(palette)}
              >
                Edit
              </button>

              <button
                className="btn btn--ghost btn--sm"
                onClick={() => handleDuplicate(palette.id)}
              >
                Duplicate
              </button>

              {/* Export dropdown */}
              <div className="cl-card__export-wrap">
                <button
                  className="btn btn--ghost btn--sm"
                  onClick={() => setExportMenu(exportMenu === palette.id ? null : palette.id)}
                >
                  Export ▾
                </button>
                {exportMenu === palette.id && (
                  <div className="cl-export-menu">
                    {(['svg', 'png', 'ase', 'json'] as const).map(fmt => (
                      <button
                        key={fmt}
                        className="cl-export-menu__item"
                        onClick={() => handleExport(palette, fmt)}
                      >
                        {fmt.toUpperCase()}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                className="btn btn--ghost btn--sm"
                onClick={() => handleArchive(palette.id)}
                title="Archive"
              >
                Archive
              </button>

              <button
                className="icon-btn icon-btn--danger"
                onClick={() => handleDelete(palette.id)}
                title="Delete"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
