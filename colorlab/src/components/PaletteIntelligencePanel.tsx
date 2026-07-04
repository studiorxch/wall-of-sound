/**
 * PaletteIntelligencePanel — advisory intelligence browsing (v1.1.0)
 *
 * Surfaces similarity analysis, lineage analysis, and trend analysis.
 * All outputs are advisory — no palette mutations occur here.
 * Cache freshness is visible. Revision bindings are explicit.
 * Role suggestions route through Palette Editor for acceptance.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { PaletteView, CleanupPayload } from '../types/palette';
import type {
  IntelligenceReport,
  SimilarityReport,
  LineageReport,
  TrendReport,
  ConfidenceLabel,
} from '../types/intelligence';
import {
  analyzeSimilarity,
  analyzeLineage,
  analyzeTrends,
} from '../lib/paletteIntelligence';
import {
  loadActivePalettes,
  loadCleanupPayloadForRevision,
  loadPaletteRevisions,
  saveIntelligenceReport,
  loadIntelligenceReports,
} from '../lib/paletteStorage';
import { validateIntelligenceReport as validateReport } from '../lib/paletteIntelligence';

interface Props {
  refreshKey: number;
  onEditPalette: (paletteId: string) => void;
}

// ─── Confidence badge ─────────────────────────────────────────────────────────
// Transparency doctrine: confidence must never suppress ambiguity or imply certainty.

function ConfidenceBadge({ label, numeric }: { label: ConfidenceLabel; numeric?: number }) {
  const cls =
    label === 'high'        ? 'intel-conf--high'
    : label === 'medium'    ? 'intel-conf--medium'
    : label === 'low'       ? 'intel-conf--low'
    : label === 'conflicting' ? 'intel-conf--conflicting'
    : 'intel-conf--unresolved';
  return (
    <span className={`intel-conf ${cls}`} title="Confidence is uncertainty communication — NOT truth probability">
      {label}{numeric !== undefined ? ` · ${(numeric * 100).toFixed(0)}%` : ''}
    </span>
  );
}

// ─── Cache freshness indicator ────────────────────────────────────────────────
// Intelligence Cache Doctrine: cached results must surface freshness visibly.

function CacheFreshnessIndicator({ meta }: { meta?: { cacheSource: string; cacheFreshness: string } }) {
  if (!meta) return null;
  return (
    <span className="intel-cache" title="Cached result — performance optimization, NOT authoritative">
      ⏱ {meta.cacheFreshness.replace(/_/g, ' ')} · {meta.cacheSource}
    </span>
  );
}

// ─── Advisory disclaimer ──────────────────────────────────────────────────────

function AdvisoryBanner() {
  return (
    <div className="intel-advisory">
      Intelligence is advisory interpretation — not canonical truth.
      Outputs do not mutate the archive. Accepting suggestions routes through governing systems.
    </div>
  );
}

// ─── Similarity tab ───────────────────────────────────────────────────────────

function SimilarityTab({
  palettes,
  cleanupMap,
}: {
  palettes: PaletteView[];
  cleanupMap: Map<string, CleanupPayload>;
}) {
  const [palA, setPalA] = useState<string>('');
  const [palB, setPalB] = useState<string>('');
  const [result, setResult] = useState<SimilarityReport | null>(null);
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    if (!palA || !palB || palA === palB) return;
    setRunning(true);
    try {
      const a = palettes.find(p => p.palette_id === palA)!;
      const b = palettes.find(p => p.palette_id === palB)!;

      const [revisionsA, revisionsB] = await Promise.all([
        loadPaletteRevisions(palA),
        loadPaletteRevisions(palB),
      ]);
      const revA = revisionsA.find(r => r.id === a.revision_id)!;
      const revB = revisionsB.find(r => r.id === b.revision_id)!;
      const cleanupA = cleanupMap.get(a.revision_id) ?? null;
      const cleanupB = cleanupMap.get(b.revision_id) ?? null;

      const report = analyzeSimilarity(revA, revB, cleanupA, cleanupB);
      setResult(report);
    } finally {
      setRunning(false);
    }
  }, [palA, palB, palettes, cleanupMap]);

  const saveReport = useCallback(async () => {
    if (!result) return;
    const activeIds = new Set(palettes.map(p => p.revision_id));
    const { valid, errors } = validateReport(result, activeIds);
    if (!valid) { alert(`Cannot save: ${errors.join('; ')}`); return; }
    await saveIntelligenceReport(result);
    alert('Report saved to intelligence archive.');
  }, [result, palettes]);

  const similarityPct = result ? Math.round((result.analysis as import('../types/intelligence').SimilarityAnalysisResult).similarity * 100) : 0;

  return (
    <div className="intel-tab">
      <p className="intel-tab__desc">
        Compare two palette revisions by LAB centroid distance and warmth axis.
        Metadata overlap signal is inactive until Metadata System (0522E) is implemented.
      </p>

      <div className="intel-select-row">
        <select
          className="role-select intel-select"
          value={palA}
          onChange={e => { setPalA(e.target.value); setResult(null); }}
        >
          <option value="">Select palette A</option>
          {palettes.map(p => (
            <option key={p.palette_id} value={p.palette_id}>{p.name}</option>
          ))}
        </select>
        <span className="intel-vs">vs</span>
        <select
          className="role-select intel-select"
          value={palB}
          onChange={e => { setPalB(e.target.value); setResult(null); }}
        >
          <option value="">Select palette B</option>
          {palettes.filter(p => p.palette_id !== palA).map(p => (
            <option key={p.palette_id} value={p.palette_id}>{p.name}</option>
          ))}
        </select>
        <button
          className="btn btn--primary btn--sm"
          onClick={run}
          disabled={!palA || !palB || palA === palB || running}
        >
          {running ? 'Analysing…' : 'Analyse'}
        </button>
      </div>

      {result && (() => {
        const a = result.analysis as import('../types/intelligence').SimilarityAnalysisResult;
        return (
          <div className="intel-result">
            <CacheFreshnessIndicator meta={result.cacheMetadata} />
            <div className="intel-result__score">
              <div className="intel-score-bar">
                <div className="intel-score-fill" style={{ width: `${similarityPct}%` }} />
              </div>
              <span className="intel-score-label">{similarityPct}% similar</span>
              <ConfidenceBadge label={a.confidence.label} numeric={a.confidence.numeric} />
            </div>

            <div className="intel-signals">
              <div className="intel-signal">
                <span className="intel-signal__name">LAB distance</span>
                <div className="intel-signal__bar"><div style={{ width: `${Math.round(a.signals.labDistance * 100)}%` }} /></div>
                <span className="intel-signal__val">{Math.round(a.signals.labDistance * 100)}%</span>
              </div>
              <div className="intel-signal">
                <span className="intel-signal__name">Warmth similarity</span>
                <div className="intel-signal__bar"><div style={{ width: `${Math.round(a.signals.warmthSimilarity * 100)}%` }} /></div>
                <span className="intel-signal__val">{Math.round(a.signals.warmthSimilarity * 100)}%</span>
              </div>
              <div className="intel-signal intel-signal--inactive">
                <span className="intel-signal__name">Metadata overlap</span>
                <div className="intel-signal__bar"><div style={{ width: '0%' }} /></div>
                <span className="intel-signal__val">inactive</span>
              </div>
            </div>

            {a.confidence.uncertaintyRationale && (
              <p className="intel-uncertainty">{a.confidence.uncertaintyRationale}</p>
            )}
            {a.confidence.conflictingMetrics && (
              <p className="intel-conflict">⚠ Conflicting signals: {a.confidence.conflictingMetrics.join(', ')}</p>
            )}

            <div className="intel-revision-binding">
              Bound to revisions: <code>{result.scope.revisionRefs?.map(r => r.slice(0, 8)).join(', ')}</code>
              <span className="intel-binding-note"> — analyses do not auto-upgrade to newer revisions.</span>
            </div>

            <button className="btn btn--ghost btn--sm intel-save-btn" onClick={saveReport}>
              Save report
            </button>
          </div>
        );
      })()}
    </div>
  );
}

// ─── Lineage tab ──────────────────────────────────────────────────────────────

function LineageTab({
  palettes,
  onEditPalette,
}: {
  palettes: PaletteView[];
  onEditPalette: (id: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string>('');
  const [result, setResult] = useState<LineageReport | null>(null);
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    if (!selectedId) return;
    setRunning(true);
    try {
      const revisions = await loadPaletteRevisions(selectedId);
      const report = analyzeLineage(selectedId, revisions);
      setResult(report);
    } finally {
      setRunning(false);
    }
  }, [selectedId]);

  return (
    <div className="intel-tab">
      <p className="intel-tab__desc">
        Inspect revision history and derivation patterns. Analysis may NEVER
        recommend pruning, promoting, or archiving revisions — governance transitions
        remain external to intelligence systems.
      </p>

      <div className="intel-select-row">
        <select
          className="role-select intel-select"
          value={selectedId}
          onChange={e => { setSelectedId(e.target.value); setResult(null); }}
        >
          <option value="">Select palette</option>
          {palettes.map(p => (
            <option key={p.palette_id} value={p.palette_id}>{p.name}</option>
          ))}
        </select>
        <button
          className="btn btn--primary btn--sm"
          onClick={run}
          disabled={!selectedId || running}
        >
          {running ? 'Analysing…' : 'Analyse lineage'}
        </button>
      </div>

      {result && (() => {
        const a = result.analysis as import('../types/intelligence').LineageAnalysisResult;
        return (
          <div className="intel-result">
            <CacheFreshnessIndicator meta={result.cacheMetadata} />

            <div className="intel-stat-row">
              <div className="intel-stat"><span className="intel-stat__val">{a.revisionCount}</span><span className="intel-stat__label">revisions</span></div>
              <div className="intel-stat"><span className="intel-stat__val">{a.depth}</span><span className="intel-stat__label">chain depth</span></div>
              <div className="intel-stat"><span className="intel-stat__val">{a.hasBranching ? 'Yes' : 'No'}</span><span className="intel-stat__label">branching</span></div>
            </div>

            <div className="intel-lifecycle-dist">
              {Object.entries(a.revisionsByLifecycle).map(([lc, count]) => (
                <div key={lc} className="intel-lc-row">
                  <span className="intel-lc-name">{lc.replace('_', ' ')}</span>
                  <span className="intel-lc-count">{count}</span>
                </div>
              ))}
            </div>

            {a.derivationChain.length > 0 && (
              <div className="intel-chain">
                <span className="intel-chain__label">Derivation chain (root → leaf)</span>
                <div className="intel-chain__list">
                  {a.derivationChain.map((id, i) => (
                    <span key={id} className="intel-chain__id">
                      {i > 0 && <span className="intel-chain__arrow">→</span>}
                      <code>{id.slice(0, 8)}…</code>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {a.notes.map((note, i) => (
              <p key={i} className="intel-note">{note}</p>
            ))}
          </div>
        );
      })()}
    </div>
  );
}

// ─── Trends tab ───────────────────────────────────────────────────────────────

function TrendsTab({
  palettes,
  cleanupMap,
}: {
  palettes: PaletteView[];
  cleanupMap: Map<string, CleanupPayload>;
}) {
  const [result, setResult] = useState<TrendReport | null>(null);
  const [running, setRunning] = useState(false);

  const run = useCallback(() => {
    setRunning(true);
    try {
      const report = analyzeTrends(palettes, cleanupMap);
      setResult(report);
    } finally {
      setRunning(false);
    }
  }, [palettes, cleanupMap]);

  return (
    <div className="intel-tab">
      <p className="intel-tab__desc">
        Archive-scale pattern inspection. Analysis may NEVER define canon, rank importance,
        suppress outliers, or become engagement analytics. All patterns are purely exploratory.
      </p>

      <button
        className="btn btn--primary btn--sm"
        onClick={run}
        disabled={palettes.length === 0 || running}
      >
        {running ? 'Analysing…' : `Analyse ${palettes.length} palette${palettes.length !== 1 ? 's' : ''}`}
      </button>

      {result && (() => {
        const a = result.analysis as import('../types/intelligence').TrendAnalysisResult;
        const totalInterpretive = Object.values(a.interpretiveRoleDistribution).reduce((s, v) => s + v, 0);
        const totalStructural = Object.values(a.structuralRoleDistribution).reduce((s, v) => s + v, 0);

        return (
          <div className="intel-result">
            <CacheFreshnessIndicator meta={result.cacheMetadata} />

            <div className="intel-stat-row">
              <div className="intel-stat">
                <span className="intel-stat__val">{a.paletteCount}</span>
                <span className="intel-stat__label">palettes</span>
              </div>
              <div className="intel-stat">
                <span className="intel-stat__val">{a.colorSpaceTendencies.avgL.toFixed(1)}</span>
                <span className="intel-stat__label">avg L*</span>
              </div>
              <div className="intel-stat">
                <span className="intel-stat__val">{a.colorSpaceTendencies.avgC.toFixed(1)}</span>
                <span className="intel-stat__label">avg chroma</span>
              </div>
            </div>

            {totalInterpretive > 0 && (
              <div className="intel-dist">
                <span className="intel-dist__label">Interpretive role distribution</span>
                {Object.entries(a.interpretiveRoleDistribution)
                  .sort((x, y) => y[1] - x[1])
                  .map(([role, count]) => (
                    <div key={role} className="intel-dist__row">
                      <span className="intel-dist__name">{role}</span>
                      <div className="intel-dist__bar">
                        <div style={{ width: `${Math.round((count / totalInterpretive) * 100)}%` }} />
                      </div>
                      <span className="intel-dist__pct">{Math.round((count / totalInterpretive) * 100)}%</span>
                    </div>
                  ))}
              </div>
            )}

            {totalStructural > 0 && (
              <div className="intel-dist">
                <span className="intel-dist__label">Structural role distribution</span>
                {Object.entries(a.structuralRoleDistribution)
                  .sort((x, y) => y[1] - x[1])
                  .map(([role, count]) => (
                    <div key={role} className="intel-dist__row">
                      <span className="intel-dist__name">{role}</span>
                      <div className="intel-dist__bar">
                        <div style={{ width: `${Math.round((count / totalStructural) * 100)}%` }} />
                      </div>
                      <span className="intel-dist__pct">{Math.round((count / totalStructural) * 100)}%</span>
                    </div>
                  ))}
              </div>
            )}

            <div className="intel-metrics">
              <span className="intel-metrics__label">Archive average metrics</span>
              {Object.entries(a.averageMetrics).map(([key, val]) => (
                <div key={key} className="intel-dist__row">
                  <span className="intel-dist__name">{key}</span>
                  <div className="intel-dist__bar">
                    <div style={{ width: `${Math.round(val * 100)}%` }} />
                  </div>
                  <span className="intel-dist__pct">{val.toFixed(2)}</span>
                </div>
              ))}
            </div>

            {a.notes.map((note, i) => (
              <p key={i} className="intel-note">{note}</p>
            ))}
          </div>
        );
      })()}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type IntelTab = 'similarity' | 'lineage' | 'trends' | 'saved';

export default function PaletteIntelligencePanel({ refreshKey, onEditPalette }: Props) {
  const [palettes, setPalettes] = useState<PaletteView[]>([]);
  const [cleanupMap, setCleanupMap] = useState<Map<string, CleanupPayload>>(new Map());
  const [savedReports, setSavedReports] = useState<IntelligenceReport[]>([]);
  const [activeTab, setActiveTab] = useState<IntelTab>('similarity');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const pals = await loadActivePalettes();
      setPalettes(pals);
      // Load cleanup payloads for all active revision IDs
      const entries = await Promise.all(
        pals.map(async p => {
          const payload = await loadCleanupPayloadForRevision(p.revision_id);
          return [p.revision_id, payload] as [string, CleanupPayload | undefined];
        })
      );
      setCleanupMap(new Map(entries.filter((e): e is [string, CleanupPayload] => Boolean(e[1]))));
      const reports = await loadIntelligenceReports();
      setSavedReports(reports);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [refreshKey, load]);

  if (loading) return <p className="vis__state">Loading intelligence…</p>;

  const tabs: { id: IntelTab; label: string }[] = [
    { id: 'similarity', label: 'Similarity' },
    { id: 'lineage',    label: 'Lineage' },
    { id: 'trends',     label: 'Trends' },
    { id: 'saved',      label: `Saved (${savedReports.length})` },
  ];

  return (
    <div className="intel-panel">
      <AdvisoryBanner />

      <div className="intel-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`intel-tab-btn${activeTab === tab.id ? ' intel-tab-btn--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'similarity' && (
        <SimilarityTab palettes={palettes} cleanupMap={cleanupMap} />
      )}
      {activeTab === 'lineage' && (
        <LineageTab palettes={palettes} onEditPalette={onEditPalette} />
      )}
      {activeTab === 'trends' && (
        <TrendsTab palettes={palettes} cleanupMap={cleanupMap} />
      )}
      {activeTab === 'saved' && (
        <div className="intel-tab">
          {savedReports.length === 0 ? (
            <p className="intel-empty">No saved intelligence reports. Run an analysis and save it.</p>
          ) : (
            savedReports.map(r => (
              <div key={r.analysisId} className="intel-saved-item">
                <div className="intel-saved-item__header">
                  <span className="intel-saved-item__type">{r.analysisType.replace('_', ' ')}</span>
                  <span className="intel-saved-item__date">{new Date(r.generatedAt).toLocaleString()}</span>
                  {r.parentAnalysisId && (
                    <span className="intel-saved-item__derived" title={`Derived from ${r.parentAnalysisId}`}>↳ derived</span>
                  )}
                </div>
                <div className="intel-saved-item__meta">
                  <span>model: {r.engineState.analysisModel}</span>
                  <span>v{r.engineState.intelligenceEngineVersion}</span>
                  <span className="intel-saved-item__authority">advisory_overlay · write-protected</span>
                </div>
                {r.scope.revisionRefs && r.scope.revisionRefs.length > 0 && (
                  <div className="intel-revision-binding">
                    Bound to: {r.scope.revisionRefs.map(id => <code key={id}>{id.slice(0, 8)}…</code>)}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
