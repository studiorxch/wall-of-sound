/**
 * PaletteExportPanel — export UI for a single palette revision.
 *
 * Surfaces all available export types with their intent.
 * Validation failures are shown — exports fail closed.
 * Image strip uses canvas rendering in-browser.
 */

import React, { useCallback, useState } from 'react';
import type { PaletteRevision, CleanupPayload } from '../types/palette';
import type { ExportType } from '../types/export';
import {
  generatePaletteJson,
  generateCssTokens,
  generateWosPalettePackage,
  computeRevisionHash,
  downloadJsonExport,
  downloadImageStrip,
} from '../lib/paletteExport';
import { loadPaletteRevisions } from '../lib/paletteStorage';
import WosRuntimePreview from './WosRuntimePreview';

interface Props {
  revision: PaletteRevision;
  cleanupPayload: CleanupPayload | null;
  onClose: () => void;
}

interface ExportOption {
  type: ExportType;
  label: string;
  description: string;
  intent: string;
  available: boolean;
  unavailableReason?: string;
}

const EXPORT_OPTIONS: ExportOption[] = [
  {
    type: 'palette_json',
    label: 'Palette JSON',
    description: 'Portable revision-safe palette with roles, lab values, and lineage.',
    intent: 'interchange',
    available: true,
  },
  {
    type: 'css_tokens',
    label: 'CSS Tokens',
    description: 'Web design tokens with HEX, RGB, and export-derived HSL values.',
    intent: 'integration',
    available: true,
  },
  {
    type: 'image_strip',
    label: 'Image Strip',
    description: 'Rendered PNG swatch strip with provenance sidecar manifest.',
    intent: 'publishing',
    available: true,
  },
  {
    type: 'wos_palette_package',
    label: 'WOS Package',
    description: 'Advisory-only WOS integration payload. All fields are signals, not runtime authority.',
    intent: 'integration',
    available: true,
  },
  {
    type: 'visualization_snapshot',
    label: 'Visualization Snapshot',
    description: 'Exploratory replay package with pinned revision refs.',
    intent: 'replay',
    available: false,
    unavailableReason: 'Requires a saved visualization view. Open a view in the Visualize tab first.',
  },
  {
    type: 'metadata_bundle',
    label: 'Metadata Bundle',
    description: 'Metadata overlay interchange with revision hash verification.',
    intent: 'archival',
    available: false,
    unavailableReason: 'Requires Metadata System (0522E) — not yet implemented.',
  },
  {
    type: 'collection_bundle',
    label: 'Collection Bundle',
    description: 'Organizational archive with collection revision lineage.',
    intent: 'archival',
    available: false,
    unavailableReason: 'Requires Collections System (0522F) — not yet implemented.',
  },
  {
    type: 'archive_bundle',
    label: 'Archive Bundle',
    description: 'Long-term preservation bundle with manifest and reference table.',
    intent: 'archival',
    available: false,
    unavailableReason: 'Requires multiple palettes — use the Library export to bundle all.',
  },
];

type ExportStatus = 'idle' | 'generating' | 'done' | 'error';

export default function PaletteExportPanel({ revision, cleanupPayload, onClose }: Props) {
  const [status, setStatus] = useState<ExportStatus>('idle');
  const [activeType, setActiveType] = useState<ExportType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showWosPreview, setShowWosPreview] = useState(false);

  const runExport = useCallback(async (exportType: ExportType) => {
    setStatus('generating');
    setActiveType(exportType);
    setError(null);

    try {
      // Load full revision lineage for provenance ancestry
      const allRevisions = await loadPaletteRevisions(revision.palette_id);

      if (exportType === 'palette_json') {
        const payload = await generatePaletteJson(revision, allRevisions, cleanupPayload);
        downloadJsonExport(payload);

      } else if (exportType === 'css_tokens') {
        const payload = await generateCssTokens(revision, allRevisions, cleanupPayload);
        downloadJsonExport(payload);

      } else if (exportType === 'wos_palette_package') {
        const payload = await generateWosPalettePackage(revision, allRevisions, cleanupPayload);
        downloadJsonExport(payload);

      } else if (exportType === 'image_strip') {
        const revisionHash = await computeRevisionHash(revision);
        const exportId = crypto.randomUUID();
        downloadImageStrip(revision, revisionHash, exportId);
      }

      setStatus('done');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : 'Export failed.');
    } finally {
      setActiveType(null);
    }
  }, [revision, cleanupPayload]);

  return (
    <div className="export-panel">
      <div className="export-panel__header">
        <div className="export-panel__title">
          <span className="export-panel__name">{revision.name}</span>
          <span className="export-panel__rev">r{revision.palette_id.slice(0, 6)}…</span>
        </div>
        <button className="btn btn--ghost btn--sm" onClick={onClose}>✕</button>
      </div>

      {status === 'error' && error && (
        <p className="export-panel__error">{error}</p>
      )}
      {status === 'done' && (
        <p className="export-panel__success">Export downloaded.</p>
      )}

      <div className="export-panel__options">
        {EXPORT_OPTIONS.map(opt => (
          <div
            key={opt.type}
            className={`export-option${!opt.available ? ' export-option--unavailable' : ''}`}
          >
            <div className="export-option__info">
              <span className="export-option__label">{opt.label}</span>
              <span className="export-option__intent">{opt.intent}</span>
              <p className="export-option__desc">
                {opt.available ? opt.description : opt.unavailableReason}
              </p>
            </div>
            <button
              className="btn btn--ghost btn--sm"
              disabled={!opt.available || status === 'generating'}
              onClick={() => runExport(opt.type)}
            >
              {status === 'generating' && activeType === opt.type
                ? 'Generating…'
                : opt.available ? '↓ Export' : 'Unavailable'}
            </button>
          </div>
        ))}
      </div>

      <div className="export-panel__wos">
        <button
          className={`btn btn--ghost btn--sm${showWosPreview ? ' btn--active' : ''}`}
          onClick={() => setShowWosPreview(v => !v)}
        >
          {showWosPreview ? '▾' : '▸'} WOS Runtime Preview
        </button>
        <span className="export-panel__wos-note">
          Simulate intake through the WOS runtime boundary
        </span>
      </div>

      {showWosPreview && (
        <WosRuntimePreview
          revision={revision}
          cleanupPayload={cleanupPayload}
          onClose={() => setShowWosPreview(false)}
        />
      )}

      <p className="export-panel__footnote">
        Exports are portable representations — they do not mutate the archive.
      </p>
    </div>
  );
}
