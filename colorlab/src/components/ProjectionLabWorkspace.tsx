/**
 * ProjectionLabWorkspace — atmospheric observatory (v1.0.1)
 *
 * Projection Lab is an atmospheric observatory, not a deployment console.
 *
 * INVARIANTS:
 * - UX layer reveals governance state — may NOT create governance authority.
 * - Fiction mode badge survives all preview modes.
 * - "WOS RETAINS FINAL RUNTIME AUTHORITY" is always visible.
 * - Governance indicators may not merge or collapse across comparison surfaces.
 * - Intake intent may NOT be escalated from UX (review → activate).
 * - Governance visibility survives degradation.
 * - recommended ≠ approved
 */

import React, { useCallback, useEffect, useState } from 'react';
import type { PaletteRevision, CleanupPayload, PaletteView } from '../types/palette';
import type {
  ProjectionTimeOfDay,
  ProjectionWeatherState,
  ProjectionEnvironment,
} from '../types/projection';
import type { RuntimeDerivedColor, RuntimeIntakePayload } from '../types/wos';
import { generateWosPalettePackage } from '../lib/paletteExport';
import {
  loadPaletteRevisions,
  loadActivePalettes,
  loadCleanupPayloadForRevision,
} from '../lib/paletteStorage';
import { ingestWosPalettePackage, applyRuntimeAdaptation } from '../lib/wosRuntimeAdapter';
import type { RuntimeAdaptationParams } from '../types/wos';

interface Props {
  revision?: PaletteRevision;
  cleanupPayload?: CleanupPayload | null;
}

// ─── Environmental adaptation lookup ─────────────────────────────────────────

type EnvKey = `${ProjectionTimeOfDay}:${ProjectionWeatherState}`;

const ENV_PARAMS: Record<ProjectionTimeOfDay, RuntimeAdaptationParams> = {
  dawn:    { luminanceFactor: 0.78, warmthShift: 10, chromaFactor: 0.80 },
  morning: { luminanceFactor: 0.92, warmthShift: 7,  chromaFactor: 0.95 },
  noon:    { luminanceFactor: 1.00, warmthShift: 0,  chromaFactor: 1.00 },
  dusk:    { luminanceFactor: 0.72, warmthShift: 16, chromaFactor: 1.10 },
  night:   { luminanceFactor: 0.48, warmthShift: -6, chromaFactor: 0.65 },
};

const WEATHER_PARAMS: Record<ProjectionWeatherState, RuntimeAdaptationParams> = {
  clear:   { desaturationBlend: 0.00 },
  cloudy:  { luminanceFactor: 0.88, desaturationBlend: 0.15, warmthShift: -3 },
  rain:    { luminanceFactor: 0.78, desaturationBlend: 0.30, warmthShift: -8 },
  fog:     { luminanceFactor: 0.70, desaturationBlend: 0.55, warmthShift: -4 },
  storm:   { luminanceFactor: 0.55, desaturationBlend: 0.40, warmthShift: -12 },
  snow:    { luminanceFactor: 1.08, desaturationBlend: 0.50, warmthShift: -5 },
  haze:    { luminanceFactor: 0.85, desaturationBlend: 0.22, warmthShift: 8  },
};

function combineEnvParams(
  time: ProjectionTimeOfDay,
  weather: ProjectionWeatherState,
): RuntimeAdaptationParams {
  const t = ENV_PARAMS[time];
  const w = WEATHER_PARAMS[weather];
  return {
    luminanceFactor:   ((t.luminanceFactor ?? 1) * (w.luminanceFactor ?? 1)),
    warmthShift:       (t.warmthShift ?? 0) + (w.warmthShift ?? 0),
    chromaFactor:      (t.chromaFactor ?? 1) * (w.chromaFactor ?? 1),
    desaturationBlend: Math.min(1, (t.desaturationBlend ?? 0) + (w.desaturationBlend ?? 0)),
  };
}

// ─── Mode metadata ────────────────────────────────────────────────────────────

const MODE_META = {
  truth:     { label: 'Truth',     desc: 'plausibility assessment',       authorityClass: 'plausibility_assessment' },
  mood:      { label: 'Mood',      desc: 'emotional atmosphere',          authorityClass: 'emotional_atmosphere_assessment' },
  reference: { label: 'Reference', desc: 'cultural / media resonance',    authorityClass: 'cultural_reference_assessment' },
  fiction:   { label: 'Fiction',   desc: 'stylized environmental overlay', authorityClass: 'transient_stylization_overlay' },
} as const;

const TIME_LABELS: Record<ProjectionTimeOfDay, string> = {
  dawn: 'Dawn', morning: 'Morning', noon: 'Noon', dusk: 'Dusk', night: 'Night',
};
const WEATHER_LABELS: Record<ProjectionWeatherState, string> = {
  clear: 'Clear', cloudy: 'Cloudy', rain: 'Rain', fog: 'Fog',
  storm: 'Storm', snow: 'Snow', haze: 'Haze',
};

const DEFAULT_ENV: ProjectionEnvironment = { timeOfDay: 'noon', weatherState: 'clear' };

// ─── Swatch strip ─────────────────────────────────────────────────────────────

function AtmosphericSwatchStrip({ colors, label }: {
  colors: RuntimeDerivedColor[];
  label: string;
}) {
  return (
    <div className="proj-swatch-strip">
      <span className="proj-swatch-strip__label">{label}</span>
      <div className="proj-swatch-strip__swatches">
        {colors.map((c, i) => (
          <div
            key={i}
            className="proj-swatch"
            style={{ background: c.hex }}
            title={`${c.hex.toUpperCase()} · ${c.provenanceClass}`}
          >
            <span className="proj-swatch__hex">{c.hex.toUpperCase()}</span>
          </div>
        ))}
      </div>
      <span className="proj-swatch-strip__prov">RUNTIME_DERIVED — ephemeral</span>
    </div>
  );
}

// ─── Environment control ──────────────────────────────────────────────────────

function EnvControls({ env, onChange, id }: {
  env: ProjectionEnvironment;
  onChange: (env: ProjectionEnvironment) => void;
  id: string;
}) {
  const times: ProjectionTimeOfDay[] = ['dawn', 'morning', 'noon', 'dusk', 'night'];
  const weathers: ProjectionWeatherState[] = ['clear', 'cloudy', 'rain', 'fog', 'storm', 'snow', 'haze'];
  return (
    <div className="proj-env-controls" aria-label={`Environmental controls for ${id}`}>
      <div className="proj-env-row">
        <span className="proj-env-label">Time</span>
        <div className="proj-env-btns">
          {times.map(t => (
            <button
              key={t}
              className={`proj-env-btn${env.timeOfDay === t ? ' proj-env-btn--active' : ''}`}
              onClick={() => onChange({ ...env, timeOfDay: t })}
            >
              {TIME_LABELS[t]}
            </button>
          ))}
        </div>
      </div>
      <div className="proj-env-row">
        <span className="proj-env-label">Weather</span>
        <div className="proj-env-btns">
          {weathers.map(w => (
            <button
              key={w}
              className={`proj-env-btn${env.weatherState === w ? ' proj-env-btn--active' : ''}`}
              onClick={() => onChange({ ...env, weatherState: w })}
            >
              {WEATHER_LABELS[w]}
            </button>
          ))}
        </div>
      </div>
      <div className="proj-env-status" aria-live="polite">
        <span className="proj-env-status__badge">{TIME_LABELS[env.timeOfDay]}</span>
        <span className="proj-env-status__sep">·</span>
        <span className="proj-env-status__badge">{WEATHER_LABELS[env.weatherState]}</span>
      </div>
    </div>
  );
}

// ─── Governance surface ───────────────────────────────────────────────────────

function GovernanceSurface({
  mode,
  revision,
  intakePayload,
}: {
  mode: keyof typeof MODE_META;
  revision: PaletteRevision;
  intakePayload: RuntimeIntakePayload | null;
}) {
  const meta = MODE_META[mode];
  return (
    <div className="proj-gov" aria-label="Governance surface">
      <div className="proj-gov__header">Governance</div>

      {/* Advisory/runtime separation — §7 */}
      <div className="proj-gov__row">
        <span className="proj-gov__key">Authority</span>
        <span className="proj-gov__val proj-gov__val--advisory">advisory only</span>
      </div>
      <div className="proj-gov__row">
        <span className="proj-gov__key">Mode</span>
        <span className="proj-gov__val">{meta.label}</span>
        <span className="proj-gov__note">{meta.authorityClass}</span>
      </div>
      <div className="proj-gov__row">
        <span className="proj-gov__key">Intent</span>
        {/* Intake intent: always 'review' from UX — may not escalate */}
        <span className="proj-gov__val proj-gov__val--intent">review</span>
        <span className="proj-gov__note">UX may not escalate to activate</span>
      </div>
      <div className="proj-gov__row">
        <span className="proj-gov__key">Approval</span>
        <span className="proj-gov__val proj-gov__val--unapproved">unapproved</span>
        <span className="proj-gov__note">recommended ≠ approved</span>
      </div>
      <div className="proj-gov__row">
        <span className="proj-gov__key">Stale</span>
        <span className="proj-gov__val">no profile generated</span>
      </div>
      <div className="proj-gov__row">
        <span className="proj-gov__key">Lineage</span>
        <span className={`proj-gov__val${intakePayload ? ' proj-gov__val--ok' : ''}`}>
          {intakePayload ? `rev·${intakePayload.paletteReference.revisionId.slice(0,8)}` : '—'}
        </span>
        <span className="proj-gov__note">{intakePayload ? 'SOURCE_CANDIDATE' : 'not loaded'}</span>
      </div>
      <div className="proj-gov__row">
        <span className="proj-gov__key">Replay</span>
        <span className="proj-gov__val">ephemeral — not archival</span>
      </div>
      <div className="proj-gov__row">
        <span className="proj-gov__key">Export eligibility</span>
        <span className="proj-gov__val">review-intent only</span>
      </div>

      {mode === 'truth' && (
        <div className="proj-gov__truth-disclaimer" role="note">
          plausibility ≠ authenticity — geographic certification not claimed
        </div>
      )}
    </div>
  );
}

// ─── Source context surface ───────────────────────────────────────────────────

function SourceContextSurface({ revision }: { revision: PaletteRevision }) {
  return (
    <div className="proj-source" aria-label="Source context surface">
      <div className="proj-source__header">Source Context</div>
      <div className="proj-source__row">
        <span className="proj-source__key">Source ref</span>
        <span className="proj-source__val">{revision.source_candidates_ref.slice(0, 16)}…</span>
      </div>
      <div className="proj-source__row">
        <span className="proj-source__key">Type</span>
        <span className="proj-source__val">image extraction</span>
      </div>
      <div className="proj-source__row">
        <span className="proj-source__key">Count</span>
        <span className="proj-source__val">1</span>
      </div>
      <div className="proj-source__row">
        <span className="proj-source__key">Diversity</span>
        {/* Single-image extractions are always low diversity */}
        <span className="proj-source__val proj-source__val--low-diversity" aria-label="Low diversity — bias visible">
          low — single extraction
        </span>
      </div>
      <div className="proj-source__row">
        <span className="proj-source__key">Known biases</span>
        <span className="proj-source__val">single-source extraction</span>
      </div>
      <div className="proj-source__disclaimer" role="note">
        Low-diversity extraction is visible. Single sample may not imply authenticity.
      </div>
    </div>
  );
}

// ─── Main workspace ───────────────────────────────────────────────────────────

type ProjectionMode = keyof typeof MODE_META;
type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export default function ProjectionLabWorkspace({ revision: revisionProp, cleanupPayload: cleanupProp }: Props) {
  const [mode, setMode] = useState<ProjectionMode>('truth');
  const [primaryEnv, setPrimaryEnv] = useState<ProjectionEnvironment>(DEFAULT_ENV);
  const [comparisonEnv, setComparisonEnv] = useState<ProjectionEnvironment>({ timeOfDay: 'night', weatherState: 'rain' });
  const [showComparison, setShowComparison] = useState(false);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [intakePayload, setIntakePayload] = useState<RuntimeIntakePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Palette selection — used when no revision is provided as prop
  const [palettes, setPalettes] = useState<PaletteView[]>([]);
  const [selectedRevision, setSelectedRevision] = useState<PaletteRevision | null>(revisionProp ?? null);
  const [selectedCleanup, setSelectedCleanup] = useState<CleanupPayload | null>(cleanupProp ?? null);
  const [palettesLoaded, setPalettesLoaded] = useState(false);

  const revision = selectedRevision;
  const cleanupPayload = selectedCleanup;

  // Load palette list for selector if no prop revision
  useEffect(() => {
    if (revisionProp) return;
    loadActivePalettes().then(ps => {
      setPalettes(ps);
      setPalettesLoaded(true);
    }).catch(() => setPalettesLoaded(true));
  }, [revisionProp]);

  const selectPalette = useCallback(async (view: PaletteView) => {
    try {
      const revisions = await loadPaletteRevisions(view.palette_id);
      const rev = revisions[revisions.length - 1];
      if (!rev) return;
      const cleanup = await loadCleanupPayloadForRevision(rev.id) ?? null;
      setSelectedRevision(rev);
      setSelectedCleanup(cleanup);
      setIntakePayload(null);
      setLoadState('idle');
    } catch {
      setError('Failed to load palette.');
    }
  }, []);

  const loadIntake = useCallback(async () => {
    if (!revision) return;
    setLoadState('loading');
    setError(null);
    try {
      const allRevisions = await loadPaletteRevisions(revision.palette_id);
      const pkg = await generateWosPalettePackage(revision, allRevisions, cleanupPayload);
      const { payload } = ingestWosPalettePackage(pkg, {
        triggerType: 'manual_intake',
        initiatingSystem: 'WOS',
        runtimeContext: 'projection_lab',
      });
      setIntakePayload(payload);
      setLoadState('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Projection load failed.');
      setLoadState('error');
    }
  }, [revision, cleanupPayload]);

  // Auto-load when a revision becomes available
  useEffect(() => {
    if (revision && loadState === 'idle') loadIntake();
  }, [revision, loadState, loadIntake]);

  const primaryDerived = intakePayload
    ? applyRuntimeAdaptation(intakePayload, combineEnvParams(primaryEnv.timeOfDay, primaryEnv.weatherState))
    : [];
  const comparisonDerived = intakePayload && showComparison
    ? applyRuntimeAdaptation(intakePayload, combineEnvParams(comparisonEnv.timeOfDay, comparisonEnv.weatherState))
    : [];

  const isFiction = mode === 'fiction';

  // No revision available yet — show palette selector
  if (!revision) {
    return (
      <div className="proj-workspace proj-workspace--selector">
        <div className="proj-authority-notice" role="banner">
          WOS RETAINS FINAL RUNTIME AUTHORITY
        </div>
        <div className="proj-selector">
          <div className="proj-selector__header">Projection Lab</div>
          <p className="proj-selector__desc">
            Select a palette to open in the atmospheric observatory.
          </p>
          {!palettesLoaded && <p className="proj-loading">Loading palettes…</p>}
          {palettesLoaded && palettes.length === 0 && (
            <p className="proj-selector__empty">No palettes saved yet — create one in the Editor tab.</p>
          )}
          <div className="proj-selector__list">
            {palettes.map(p => (
              <button
                key={p.palette_id}
                className="proj-selector__item"
                onClick={() => selectPalette(p)}
              >
                <span className="proj-selector__name">{p.name}</span>
                <span className="proj-selector__meta">{p.palette_id.slice(0, 8)}…</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`proj-workspace${isFiction ? ' proj-workspace--fiction' : ''}`}>

      {/* ── WOS authority notice — always visible ── */}
      <div className="proj-authority-notice" role="banner" aria-label="Runtime authority notice">
        WOS RETAINS FINAL RUNTIME AUTHORITY
      </div>

      {/* ── Palette identity bar ── */}
      <div className="proj-identity-bar">
        <span className="proj-identity-bar__name">{revision.name}</span>
        <span className="proj-identity-bar__rev">rev·{revision.id.slice(0, 8)}…</span>
        {!revisionProp && (
          <button
            className="btn btn--ghost btn--sm"
            onClick={() => { setSelectedRevision(null); setIntakePayload(null); setLoadState('idle'); }}
          >
            ← Change palette
          </button>
        )}
      </div>

      {/* ── Fiction mode badge — survives all preview modes ── */}
      {isFiction && (
        <div className="proj-fiction-badge" role="alert" aria-live="assertive">
          <span className="proj-fiction-badge__headline">FICTION MODE ACTIVE</span>
          <span className="proj-fiction-badge__sub">Synthetic Atmospheric Overlay · Not Geographic Truth</span>
        </div>
      )}

      <div className="proj-workspace__inner">

        {/* ─── Control Surface ─── */}
        <section className="proj-control-surface" aria-label="Control surface">
          <div className="proj-control-surface__modes">
            {(Object.keys(MODE_META) as ProjectionMode[]).map(m => (
              <button
                key={m}
                className={`proj-mode-btn${mode === m ? ' proj-mode-btn--active' : ''}`}
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
              >
                {MODE_META[m].label}
              </button>
            ))}
          </div>
          <div className="proj-control-surface__mode-desc">
            <span className="proj-mode-desc__label">{MODE_META[mode].label} mode</span>
            <span className="proj-mode-desc__sub">{MODE_META[mode].desc}</span>
            {mode === 'truth' && (
              <span className="proj-mode-desc__disclaimer">plausibility ≠ authenticity</span>
            )}
          </div>
        </section>

        {error && (
          <div className="proj-error" role="alert">{error}</div>
        )}
        {loadState === 'loading' && (
          <div className="proj-loading">Loading palette into projection…</div>
        )}

        {/* ─── Projection Stage ─── */}
        <section className="proj-stage" aria-label="Projection stage">
          <div className="proj-stage__env-header">
            <EnvControls env={primaryEnv} onChange={setPrimaryEnv} id="primary" />
          </div>

          {loadState === 'ready' && primaryDerived.length > 0 && (
            <AtmosphericSwatchStrip
              colors={primaryDerived}
              label={`${TIME_LABELS[primaryEnv.timeOfDay]} · ${WEATHER_LABELS[primaryEnv.weatherState]}`}
            />
          )}
          {loadState === 'idle' && (
            <div className="proj-stage__prompt">
              <button className="btn btn--ghost btn--sm" onClick={loadIntake}>
                Reload
              </button>
            </div>
          )}

          {/* ─── Comparison Surface ─── */}
          <div className="proj-comparison-toggle">
            <button
              className={`btn btn--ghost btn--sm${showComparison ? ' btn--active' : ''}`}
              onClick={() => setShowComparison(v => !v)}
              aria-expanded={showComparison}
            >
              {showComparison ? '▾' : '▸'} Compare environment
            </button>
            <span className="proj-comparison-note">
              Governance indicators remain independent — may not merge across surfaces
            </span>
          </div>

          {showComparison && loadState === 'ready' && (
            <section className="proj-comparison-surface" aria-label="Comparison surface">
              <EnvControls env={comparisonEnv} onChange={setComparisonEnv} id="comparison" />
              {comparisonDerived.length > 0 && (
                <AtmosphericSwatchStrip
                  colors={comparisonDerived}
                  label={`${TIME_LABELS[comparisonEnv.timeOfDay]} · ${WEATHER_LABELS[comparisonEnv.weatherState]}`}
                />
              )}
              {/* Governance indicators are separate — never merged — §7 */}
              <div className="proj-comparison-gov-note" role="note" aria-label="Comparison governance note">
                Governance applies to source palette · derived colors are RUNTIME_DERIVED · ephemeral only
              </div>
            </section>
          )}
        </section>

        <div className="proj-lower-surfaces">
          {/* ─── Governance Surface ─── */}
          <GovernanceSurface
            mode={mode}
            revision={revision}
            intakePayload={intakePayload}
          />

          {/* ─── Source Context Surface ─── */}
          <SourceContextSurface revision={revision} />
        </div>

        {/* ── Advisory footer ── */}
        <div className="proj-advisory-footer" role="contentinfo">
          <span>Projection Lab outputs are advisory only.</span>
          <span className="proj-advisory-footer__sep">·</span>
          <span>RUNTIME_DERIVED colors may never re-enter SOURCE_CANDIDATE lineage.</span>
          <span className="proj-advisory-footer__sep">·</span>
          <span>Exports require WOS review.</span>
        </div>

      </div>
    </div>
  );
}
