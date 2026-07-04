/**
 * WosRuntimePreview — development preview of WOS runtime intake (v1.1.0)
 *
 * Demonstrates the runtime boundary: palette exports flow through
 * wos_palette_package → WOS Intake Adapter → Runtime Cache → Local Interpretation.
 *
 * CRITICAL: This component NEVER accesses Colorlab storage directly.
 * All data flows through export serialization, enforcing the Development
 * Boundary Isolation Doctrine even in the preview context.
 */

import React, { useCallback, useState } from 'react';
import type { PaletteRevision, CleanupPayload } from '../types/palette';
import type { RuntimeIntakePayload, RuntimeDerivedColor, RuntimeAdaptationParams } from '../types/wos';
import { generateWosPalettePackage } from '../lib/paletteExport';
import {
  ingestWosPalettePackage,
  applyRuntimeAdaptation,
  getRuntimeDiagnostics,
  clearRuntimeCache,
} from '../lib/wosRuntimeAdapter';
import { loadPaletteRevisions } from '../lib/paletteStorage';

interface Props {
  revision: PaletteRevision;
  cleanupPayload: CleanupPayload | null;
  onClose: () => void;
}

// ─── Runtime color swatch ─────────────────────────────────────────────────────

function RuntimeSwatch({ hex, label, provenance }: {
  hex: string;
  label?: string;
  provenance?: string;
}) {
  return (
    <div className="wos-swatch" title={`${hex.toUpperCase()}${provenance ? ` · ${provenance}` : ''}`}>
      <div className="wos-swatch__color" style={{ background: hex }} />
      <span className="wos-swatch__hex">{hex.toUpperCase()}</span>
      {provenance && <span className="wos-swatch__prov">{provenance.replace('_', ' ')}</span>}
      {label && <span className="wos-swatch__label">{label}</span>}
    </div>
  );
}

// ─── Advisory signal display ──────────────────────────────────────────────────
// Labels advisory fields explicitly — WOS may ignore, reinterpret, or weight them.

function AdvisoryPanel({ advisory }: { advisory: RuntimeIntakePayload['advisory'] }) {
  if (!advisory) {
    return (
      <div className="wos-advisory wos-advisory--empty">
        No advisory payload — WOS functions correctly without advisory signals.
      </div>
    );
  }
  return (
    <div className="wos-advisory">
      <div className="wos-advisory__header">
        Advisory signals
        <span className="wos-advisory__note">WOS may ignore, reinterpret, or dynamically weight these</span>
      </div>
      {advisory.atmosphereDescriptors && advisory.atmosphereDescriptors.length > 0 && (
        <div className="wos-advisory__row">
          <span className="wos-advisory__key">Atmosphere hints</span>
          <div className="wos-advisory__tags">
            {advisory.atmosphereDescriptors.map(d => (
              <span key={d} className="wos-advisory__tag">{d}</span>
            ))}
          </div>
          <span className="wos-advisory__qualifier">advisory only</span>
        </div>
      )}
      {advisory.cleanupMetrics && (
        <>
          {advisory.cleanupMetrics.warmth !== undefined && (
            <div className="wos-advisory__row">
              <span className="wos-advisory__key">Warmth hint</span>
              <div className="wos-advisory__bar">
                <div style={{ width: `${Math.round(advisory.cleanupMetrics.warmth * 100)}%` }} />
              </div>
              <span className="wos-advisory__val">{advisory.cleanupMetrics.warmth.toFixed(2)}</span>
              <span className="wos-advisory__qualifier">advisory only</span>
            </div>
          )}
          {advisory.cleanupMetrics.harmony !== undefined && (
            <div className="wos-advisory__row">
              <span className="wos-advisory__key">Harmony hint</span>
              <div className="wos-advisory__bar">
                <div style={{ width: `${Math.round(advisory.cleanupMetrics.harmony * 100)}%` }} />
              </div>
              <span className="wos-advisory__val">{advisory.cleanupMetrics.harmony.toFixed(2)}</span>
              <span className="wos-advisory__qualifier">advisory only</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Adaptation controls ──────────────────────────────────────────────────────

const PRESETS: Array<{ label: string; params: RuntimeAdaptationParams; context: string }> = [
  { label: 'Identity',     params: {},                                                          context: 'no adaptation' },
  { label: 'Nocturnal',    params: { luminanceFactor: 0.55, chromaFactor: 0.6, warmthShift: -8 },  context: 'late-night district' },
  { label: 'Overcast',     params: { luminanceFactor: 0.85, desaturationBlend: 0.3, warmthShift: -5 }, context: 'weather: overcast' },
  { label: 'Golden hour',  params: { luminanceFactor: 1.05, warmthShift: 14, chromaFactor: 1.2 },  context: 'temporal: evening' },
  { label: 'Industrial',   params: { desaturationBlend: 0.45, luminanceFactor: 0.75 },             context: 'district: industrial' },
];

// ─── Main component ───────────────────────────────────────────────────────────

export default function WosRuntimePreview({ revision, cleanupPayload, onClose }: Props) {
  const [intake, setIntake] = useState<RuntimeIntakePayload | null>(null);
  const [derived, setDerived] = useState<RuntimeDerivedColor[] | null>(null);
  const [activePreset, setActivePreset] = useState<string>('Identity');
  const [cacheState, setCacheState] = useState<string>('—');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  /**
   * Generate WOS package and ingest through the adapter.
   * INVARIANT: intake always goes through export serialization — never direct DB.
   */
  const loadIntake = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Step 1: Load revision lineage for provenance headers
      const allRevisions = await loadPaletteRevisions(revision.palette_id);

      // Step 2: Generate wos_palette_package through export boundary
      const pkg = await generateWosPalettePackage(revision, allRevisions, cleanupPayload);

      // Step 3: Ingest through WOS intake adapter (validates, caches, builds intake payload)
      const { payload, cacheEntry } = ingestWosPalettePackage(pkg, {
        triggerType: 'manual_intake',
        initiatingSystem: 'WOS',
        runtimeContext: 'development_preview',
      });

      setIntake(payload);
      setCacheState(`${cacheEntry.cacheState} · ${new Date(cacheEntry.cachedAt).toLocaleTimeString()}`);

      // Apply identity adaptation (no changes) as initial state
      setDerived(applyRuntimeAdaptation(payload, {}));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Intake failed.');
    } finally {
      setLoading(false);
    }
  }, [revision, cleanupPayload]);

  const applyPreset = useCallback((preset: typeof PRESETS[0]) => {
    if (!intake) return;
    setActivePreset(preset.label);
    const result = applyRuntimeAdaptation(intake, preset.params);
    setDerived(result);
  }, [intake]);

  const diagnostics = showDiagnostics ? getRuntimeDiagnostics() : null;

  return (
    <div className="wos-preview">
      <div className="wos-preview__header">
        <div className="wos-preview__title">
          <span className="wos-preview__badge">WOS</span>
          <span className="wos-preview__name">Runtime Intake Preview</span>
        </div>
        <button className="btn btn--ghost btn--sm" onClick={onClose}>✕</button>
      </div>

      {/* Boundary doctrine notice */}
      <div className="wos-boundary-notice">
        All intake passes through <code>wos_palette_package</code> export serialization.
        Direct Colorlab storage access is never permitted — runtime boundary enforced.
      </div>

      {error && <p className="wos-error">{error}</p>}

      {!intake ? (
        <div className="wos-preview__load">
          <p className="wos-preview__desc">
            Generates a <code>wos_palette_package</code>, validates it, and ingests it through
            the WOS intake adapter. Runtime cache is volatile memory — never persisted.
          </p>
          <button className="btn btn--primary" onClick={loadIntake} disabled={loading}>
            {loading ? 'Generating export + ingesting…' : 'Load into WOS runtime'}
          </button>
        </div>
      ) : (
        <div className="wos-preview__body">
          {/* Export reference + cache state */}
          <div className="wos-ref-bar">
            <span className="wos-ref-bar__label">Export ref</span>
            <code className="wos-ref-bar__id">{intake.exportReference.exportId.slice(0, 16)}…</code>
            <span className="wos-ref-bar__hash" title={intake.exportReference.exportContentHash}>
              {intake.exportReference.exportContentHash.slice(0, 20)}…
            </span>
            <span className={`wos-cache-state wos-cache-state--${cacheState.startsWith('fresh') ? 'fresh' : 'stale'}`}>
              cache: {cacheState}
            </span>
            <span className="wos-ref-bar__authority">{intake.authorityClass}</span>
          </div>

          {/* Provenance + causality */}
          <div className="wos-meta-row">
            <span className="wos-meta__label">Provenance</span>
            <span className="wos-meta__val wos-meta__val--prov">{intake.paletteReference.provenanceClass}</span>
            <span className="wos-meta__sep">·</span>
            <span className="wos-meta__label">Causality</span>
            <span className="wos-meta__val">{intake.intakeCausality.triggerType}</span>
            <span className="wos-meta__sep">·</span>
            <span className="wos-meta__val">{intake.intakeCausality.runtimeContext}</span>
          </div>

          {/* Primary payload */}
          <div className="wos-section">
            <div className="wos-section__header">
              Primary payload
              <span className="wos-section__note">factual rendering input — hex / rgb / lab / candidateRef</span>
            </div>
            <div className="wos-swatches">
              {intake.primaryPayload.colors.map((c, i) => (
                <RuntimeSwatch key={i} hex={c.hex} provenance="SOURCE_CANDIDATE" />
              ))}
            </div>
          </div>

          {/* Advisory payload */}
          <AdvisoryPanel advisory={intake.advisory} />

          {/* Runtime adaptation */}
          <div className="wos-section">
            <div className="wos-section__header">
              Runtime adaptation
              <span className="wos-section__note">ephemeral local interpretation — RUNTIME_DERIVED, never archival</span>
            </div>
            <div className="wos-presets">
              {PRESETS.map(preset => (
                <button
                  key={preset.label}
                  className={`wos-preset-btn${activePreset === preset.label ? ' wos-preset-btn--active' : ''}`}
                  onClick={() => applyPreset(preset)}
                  title={preset.context}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            {derived && (
              <>
                <div className="wos-swatches">
                  {derived.map((c, i) => (
                    <RuntimeSwatch key={i} hex={c.hex} provenance={c.provenanceClass} />
                  ))}
                </div>
                <p className="wos-derived-note">
                  provenanceClass: RUNTIME_DERIVED — these colors may NEVER re-enter
                  SOURCE_CANDIDATE lineage or be written back to the archive.
                </p>
              </>
            )}
          </div>

          {/* Diagnostics */}
          <div className="wos-diagnostics">
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => setShowDiagnostics(v => !v)}
            >
              {showDiagnostics ? '▾' : '▸'} Runtime cache diagnostics
            </button>
            <button
              className="btn btn--ghost btn--sm"
              onClick={() => { clearRuntimeCache(); setCacheState('cleared'); setIntake(null); setDerived(null); }}
            >
              Clear cache
            </button>
          </div>

          {showDiagnostics && diagnostics && (
            <div className="wos-diagnostics__panel">
              <div className="wos-diagnostics__stat">
                Cache entries: {diagnostics.cacheSize} · authorityClass: runtime_local_interpretation
              </div>
              {diagnostics.entries.map(e => (
                <div key={e.exportId} className="wos-diagnostics__entry">
                  <span className={`wos-cache-state wos-cache-state--${e.cacheState}`}>{e.cacheState}</span>
                  {e.staleReason && <span className="wos-diagnostics__stale-reason">{e.staleReason}</span>}
                  <code>{e.exportId.slice(0, 16)}…</code>
                  <span>{e.cachedAt}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
