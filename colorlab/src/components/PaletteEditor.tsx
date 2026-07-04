import React, { useCallback, useState } from 'react';
import type {
  ColorSelector,
  PaletteSwatch as PaletteSwatchType,
  CleanupPayload,
  CleanupMode,
} from '../types/palette';
import { rgbToHex } from '../lib/colorConversion';
import { createPalette, saveCleanupPayload } from '../lib/paletteStorage';
import PaletteSwatchCard from './PaletteSwatch';

const CLEANUP_MODES: { value: CleanupMode; label: string }[] = [
  { value: 'balanced',       label: 'Balanced'       },
  { value: 'cinematic',      label: 'Cinematic'      },
  { value: 'neon',           label: 'Neon'           },
  { value: 'lo_fi',          label: 'Lo-fi'          },
  { value: 'infrastructure', label: 'Infrastructure' },
];

interface Props {
  selectors: ColorSelector[];
  sourceCandidatesRef: string | null;
  cleanupPayload: CleanupPayload | null;
  cleanupMode: CleanupMode;
  onCleanupModeChange: (mode: CleanupMode) => void;
  onSaved: () => void;
}

export default function PaletteEditor({
  selectors,
  sourceCandidatesRef,
  cleanupPayload,
  cleanupMode,
  onCleanupModeChange,
  onSaved,
}: Props) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Build role lookup from cleanup payload (keyed by hex)
  const roleMap = new Map(
    cleanupPayload?.curatedColors.map(c => [c.hex.toLowerCase(), c]) ?? []
  );

  const handleSave = useCallback(async () => {
    if (!sourceCandidatesRef) {
      setError('No extraction record — cannot save without provenance anchor.');
      return;
    }
    if (selectors.length === 0) return;

    setSaving(true);
    setError(null);

    try {
      const swatches: PaletteSwatchType[] = selectors.map(s => ({
        id: s.id,
        color: s.color,
        hex: rgbToHex(s.color),
      }));

      const paletteName = name.trim() || `Palette ${new Date().toLocaleString()}`;
      const revision = await createPalette(sourceCandidatesRef, paletteName, swatches);

      // Store cleanup payload as a linked external record (not inline mutation)
      if (cleanupPayload) {
        await saveCleanupPayload({
          ...cleanupPayload,
          paletteId: revision.palette_id,
          revisionId: revision.id,
        });
      }

      setName('');
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save palette.');
    } finally {
      setSaving(false);
    }
  }, [selectors, sourceCandidatesRef, name, cleanupPayload, onSaved]);

  const canSave = selectors.length > 0 && sourceCandidatesRef !== null && !saving;
  const metrics = cleanupPayload?.metrics;
  const excluded = cleanupPayload?.excludedColors.length ?? 0;

  return (
    <div className="palette-editor">
      {/* Cleanup mode selector */}
      <div className="cleanup-controls">
        <span className="cleanup-controls__label">Cleanup mode</span>
        <div className="cleanup-controls__modes">
          {CLEANUP_MODES.map(m => (
            <button
              key={m.value}
              className={`mode-btn${cleanupMode === m.value ? ' mode-btn--active' : ''}`}
              onClick={() => onCleanupModeChange(m.value)}
              title={m.label}
            >
              {m.label}
            </button>
          ))}
        </div>
        {excluded > 0 && (
          <span className="cleanup-controls__suppressed">
            {excluded} suppressed
          </span>
        )}
      </div>

      {/* Swatches with roles */}
      <div className="palette-editor__swatches">
        {selectors.map((sel, i) => {
          const role = roleMap.get(rgbToHex(sel.color).toLowerCase());
          return (
            <PaletteSwatchCard
              key={sel.id}
              selector={sel}
              index={i}
              structuralRole={role?.structuralRole}
              interpretiveRole={role?.interpretiveRole}
            />
          );
        })}
      </div>

      {/* Cleanup metrics */}
      {metrics && (
        <div className="metrics">
          <span className="metrics__label">Metrics</span>
          <div className="metrics__grid">
            {(Object.entries(metrics) as [string, number][]).map(([key, val]) => (
              <div key={key} className="metrics__item">
                <span className="metrics__name">{key}</span>
                <div className="metrics__bar-track">
                  <div className="metrics__bar" style={{ width: `${Math.round(val * 100)}%` }} />
                </div>
                <span className="metrics__val">{val.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Save controls */}
      <div className="palette-editor__actions">
        <input
          className="palette-editor__name-input"
          type="text"
          placeholder="Palette name (optional)"
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={80}
        />
        <button
          className="btn btn--primary"
          onClick={handleSave}
          disabled={!canSave}
          title={!sourceCandidatesRef ? 'Waiting for extraction…' : undefined}
        >
          {saving ? 'Saving…' : 'Save palette'}
        </button>
      </div>
      {error && <p className="palette-editor__error">{error}</p>}
    </div>
  );
}
