import React, { useCallback, useRef, useState } from 'react';
import type { ColorlabPalette, ColorlabSwatch } from '../types/colorlab';
import { savePalette } from '../lib/colorlabStorage';
import { exportSVG, exportPNG, exportASE, exportJSON } from '../lib/colorlabExports';

interface Props {
  palette: ColorlabPalette;
  onSaved: (palette: ColorlabPalette) => void;
  onDiscard: () => void;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function hexIsValid(hex: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(hex);
}

export default function ColorlabEditor({ palette: initial, onSaved, onDiscard }: Props) {
  const [palette, setPalette] = useState<ColorlabPalette>(initial);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [hexInputs, setHexInputs] = useState<Record<string, string>>({});
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);
  const pickerRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const update = useCallback((fn: (p: ColorlabPalette) => ColorlabPalette) => {
    setPalette(prev => fn(prev));
    setDirty(true);
  }, []);

  const updateSwatch = useCallback((id: string, changes: Partial<ColorlabSwatch>) => {
    update(p => ({
      ...p,
      swatches: p.swatches.map(s => s.id === id ? { ...s, ...changes } : s),
    }));
  }, [update]);

  const addSwatch = useCallback(() => {
    update(p => ({
      ...p,
      swatches: [...p.swatches, { id: crypto.randomUUID(), hex: '#888888', locked: false }],
    }));
  }, [update]);

  const removeSwatch = useCallback((id: string) => {
    update(p => ({ ...p, swatches: p.swatches.filter(s => s.id !== id) }));
  }, [update]);

  const moveSwatch = useCallback((id: string, dir: -1 | 1) => {
    update(p => {
      const idx = p.swatches.findIndex(s => s.id === id);
      if (idx < 0) return p;
      const next = idx + dir;
      if (next < 0 || next >= p.swatches.length) return p;
      const arr = [...p.swatches];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return { ...p, swatches: arr };
    });
  }, [update]);

  const handleHexBlur = useCallback((id: string) => {
    const raw = hexInputs[id];
    if (!raw) return;
    const normalized = raw.startsWith('#') ? raw : `#${raw}`;
    if (hexIsValid(normalized)) {
      updateSwatch(id, { hex: normalized.toLowerCase() });
    }
    setHexInputs(prev => { const n = { ...prev }; delete n[id]; return n; });
  }, [hexInputs, updateSwatch]);

  const handleSave = useCallback(async () => {
    setSaveState('saving');
    try {
      const updated = { ...palette, updatedAt: new Date().toISOString() };
      await savePalette(updated);
      setPalette(updated);
      setDirty(false);
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 1800);
      onSaved(updated);
    } catch {
      setSaveState('error');
    }
  }, [palette, onSaved]);

  const runExport = useCallback((format: 'svg' | 'png' | 'ase' | 'json') => {
    try {
      if (format === 'svg') exportSVG(palette);
      else if (format === 'png') exportPNG(palette);
      else if (format === 'ase') exportASE(palette);
      else exportJSON(palette);
      setExportFeedback(`${format.toUpperCase()} exported`);
      setTimeout(() => setExportFeedback(null), 2000);
    } catch {
      setExportFeedback('Export failed');
      setTimeout(() => setExportFeedback(null), 3000);
    }
  }, [palette]);

  const saveLabel =
    saveState === 'saving' ? 'Saving…' :
    saveState === 'saved'  ? 'Saved' :
    saveState === 'error'  ? 'Error' :
    dirty ? 'Save' : 'Saved';

  return (
    <div className="cl-editor">
      <div className="cl-editor__header">
        <input
          className="cl-editor__name"
          value={palette.name}
          onChange={e => update(p => ({ ...p, name: e.target.value }))}
          placeholder="Palette name"
        />
        <div className="cl-editor__header-actions">
          <button className="btn btn--ghost btn--sm" onClick={onDiscard}>Discard</button>
          <button
            className={`btn btn--sm ${saveState === 'error' ? 'btn--danger' : 'btn--primary'}`}
            onClick={handleSave}
            disabled={saveState === 'saving'}
          >
            {saveLabel}
          </button>
        </div>
      </div>

      {dirty && saveState === 'idle' && (
        <div className="cl-editor__dirty-bar">Unsaved changes</div>
      )}

      <div className="cl-editor__body">
        {/* Swatch list */}
        <div className="cl-editor__swatches">
          {palette.swatches.map((swatch, i) => {
            const hexVal = hexInputs[swatch.id] ?? swatch.hex;
            return (
              <div key={swatch.id} className="cl-swatch-row">
                <div className="cl-swatch-row__order">
                  <button
                    className="order-btn"
                    onClick={() => moveSwatch(swatch.id, -1)}
                    disabled={i === 0}
                    title="Move up"
                  >↑</button>
                  <button
                    className="order-btn"
                    onClick={() => moveSwatch(swatch.id, 1)}
                    disabled={i === palette.swatches.length - 1}
                    title="Move down"
                  >↓</button>
                </div>

                {/* Color block — click to open native picker */}
                <div
                  className="cl-swatch-row__color"
                  style={{ background: swatch.hex }}
                  title="Click to change color"
                  onClick={() => pickerRefs.current[swatch.id]?.click()}
                >
                  <input
                    ref={el => { pickerRefs.current[swatch.id] = el; }}
                    type="color"
                    value={swatch.hex}
                    className="cl-swatch-row__picker"
                    onChange={e => updateSwatch(swatch.id, { hex: e.target.value })}
                  />
                </div>

                {/* Hex text input */}
                <input
                  className="cl-swatch-row__hex"
                  value={hexVal.toUpperCase()}
                  onChange={e => setHexInputs(prev => ({ ...prev, [swatch.id]: e.target.value }))}
                  onBlur={() => handleHexBlur(swatch.id)}
                  onKeyDown={e => { if (e.key === 'Enter') handleHexBlur(swatch.id); }}
                  spellCheck={false}
                />

                {/* Lock */}
                <button
                  className={`icon-btn${swatch.locked ? '' : ' icon-btn--muted'}`}
                  onClick={() => updateSwatch(swatch.id, { locked: !swatch.locked })}
                  title={swatch.locked ? 'Unlock' : 'Lock'}
                >
                  {swatch.locked ? '🔒' : '🔓'}
                </button>

                {/* Copy hex */}
                <button
                  className="icon-btn icon-btn--muted"
                  onClick={() => navigator.clipboard.writeText(swatch.hex.toUpperCase())}
                  title="Copy hex"
                >⎘</button>

                {/* Remove */}
                <button
                  className="icon-btn icon-btn--danger"
                  onClick={() => removeSwatch(swatch.id)}
                  title="Remove swatch"
                  disabled={palette.swatches.length <= 1}
                >✕</button>
              </div>
            );
          })}
        </div>

        <button className="btn btn--ghost btn--sm cl-editor__add-btn" onClick={addSwatch}>
          + Add swatch
        </button>

        {/* Tags */}
        <div className="cl-editor__field">
          <label className="cl-editor__label">Tags</label>
          <input
            className="cl-editor__input"
            value={palette.tags.join(', ')}
            onChange={e => update(p => ({
              ...p,
              tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean),
            }))}
            placeholder="e.g. map, night, water"
          />
        </div>

        {/* Notes */}
        <div className="cl-editor__field">
          <label className="cl-editor__label">Notes</label>
          <textarea
            className="cl-editor__input cl-editor__notes"
            value={palette.notes ?? ''}
            onChange={e => update(p => ({ ...p, notes: e.target.value }))}
            placeholder="Optional notes…"
            rows={2}
          />
        </div>

        {/* Export */}
        <div className="cl-editor__section-label">Export</div>
        {exportFeedback && <div className="cl-editor__export-feedback">{exportFeedback}</div>}
        <div className="cl-editor__export-row">
          {(['svg', 'png', 'ase', 'json'] as const).map(fmt => (
            <button
              key={fmt}
              className="btn btn--ghost btn--sm"
              onClick={() => runExport(fmt)}
            >
              {fmt.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
