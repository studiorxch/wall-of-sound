import { useState, useMemo, useCallback } from "react";
import type { Track } from "../data/trackTypes";
import {
  getMoodAnalysisReviewRows,
  getMoodCalibrationSummary,
  sourceKindLabel,
  type MoodAnalysisReviewRow,
  type CalibrationFlag,
  type ReviewFilter,
} from "../logic/moodAnalysisReview";
import { getMoodColorToken } from "../logic/moodTaxonomy";
import { requiresCanonicalAnalysis } from "../logic/dspFeatureExtraction";

// ── Types ─────────────────────────────────────────────────────────────────────

type DspBatchProgress = {
  missing: number; queued: number; running: number; complete: number; failed: number; remaining: number;
};

type Props = {
  tracks: Track[];
  onAnalyzeDsp: (trackId: string) => void;
  onRerunMood: (trackId: string) => void;
  onForceRerunMood: (trackId: string) => void;
  onAnalyzeBatchDsp: (trackIds: string[]) => void;
  onRerunBatchMood: (trackIds: string[]) => void;
  // Canonical analysis orchestration (0712_MUSIC_Catalog_Analysis_Orchestration)
  onAnalyzeAllMissing?: (includeExternal?: boolean) => void;
  onRetryFailed?: () => void;
  batchProgress?: DspBatchProgress | null;
};

// ── Filter labels ─────────────────────────────────────────────────────────────

const FILTER_LABELS: Record<ReviewFilter, string> = {
  all: "All",
  needs_dsp: "Needs DSP",
  has_dsp: "Has DSP",
  no_audio_source: "No Source",
  warnings: "Has Warnings",
  low_confidence: "Low Confidence",
  reference: "Sounds",
  external: "External",
  catalog: "Catalog",
};

// ── Calibration flag badges ───────────────────────────────────────────────────

const FLAG_LABELS: Record<CalibrationFlag, string> = {
  zcr_high: "ZCR↑",
  onset_high: "Onset↑",
  rms_saturated: "RMS!",
  low_confidence: "Low conf",
  metadata_fallback: "Meta fallback",
  missing_dsp: "No DSP",
  possible_overfrantic: "?Frantic",
  possible_overtense: "?Tense",
  no_audio_source: "No audio",
  invalid_bpm: "No BPM",
  invalid_key: "No Key",
  stale_mood_assignment: "Stale mood",
  weak_live_mood_mismatch: "Weak mismatch",
};

const FLAG_SEVERITY: Record<CalibrationFlag, "warn" | "info" | "ok"> = {
  zcr_high: "warn",
  onset_high: "warn",
  rms_saturated: "warn",
  low_confidence: "info",
  metadata_fallback: "info",
  missing_dsp: "warn",
  possible_overfrantic: "warn",
  possible_overtense: "info",
  no_audio_source: "warn",
  invalid_bpm: "info",
  invalid_key: "info",
  stale_mood_assignment: "warn",
  weak_live_mood_mismatch: "info",
};

// ── Feature cell ──────────────────────────────────────────────────────────────

// 0712_MUSIC_BPM_Key_Persistence_Repair: "bpmDensity" is a normalized 0-1
// tempo/pacing feature fed to the mood scorer — never the real BPM (that's
// the separate `bpm`/`camelotKey` columns below, sourced from track.bpm).
// Label it distinctly so a 0.37 here is never mistaken for 37 BPM.
const FEATURE_KEYS: Array<[string, keyof import("../logic/MoodAnalyzer").AudioFeatureVector]> = [
  ["TempoDens", "bpmDensity"],
  ["RMS",   "rmsEnergy"],
  ["Bright","brightness"],
  ["Band",  "bandwidth"],
  ["Tex",   "texture"],
  ["Val",   "valence"],
];

function FeatureCell({ features, featureSources }: {
  features: MoodAnalysisReviewRow["features"];
  featureSources: MoodAnalysisReviewRow["featureSources"];
}) {
  if (!features) return <span className="mar-empty">—</span>;
  return (
    <div className="mar-feature-grid">
      {FEATURE_KEYS.map(([label, key]) => (
        <span key={key} className="mar-feature-chip" title={featureSources[key] ?? "unknown source"}>
          <span className="mar-feature-label">{label}</span>
          <span className="mar-feature-val">{features[key].toFixed(2)}</span>
        </span>
      ))}
    </div>
  );
}

// ── Top scores cell ───────────────────────────────────────────────────────────

function TopScoresCell({ scores }: { scores: MoodAnalysisReviewRow["topScores"] }) {
  if (!scores.length) return <span className="mar-empty">—</span>;
  return (
    <div className="mar-scores">
      {scores.map((s) => {
        const token = getMoodColorToken(s.mood);
        return (
          <span
            key={s.mood}
            className="mar-score-chip"
            style={{ "--mc-token": `var(${token})` } as React.CSSProperties}
            title={`distance: ${s.distance}`}
          >
            <span className="mar-score-mood">{s.mood}</span>
            <span className="mar-score-pct">{Math.round(s.confidence * 100)}%</span>
          </span>
        );
      })}
    </div>
  );
}

// ── DSP status cell ───────────────────────────────────────────────────────────

// State label per 0712_MUSIC_Catalog_Analysis_Orchestration §10.1 — reflects
// real persisted analysisStatus/isStale, never a fallback value dressed up
// as canonical.
function analysisStateLabel(row: MoodAnalysisReviewRow): { label: string; cls: string } {
  if (!row.hasAudioSource) return { label: "No Source", cls: "mar-dsp--none" };
  if (row.analysisStatus === "queued" || row.analysisStatus === "analyzing") return { label: "Analyzing", cls: "mar-dsp--pending" };
  if (row.analysisStatus === "failed") return { label: "Failed", cls: "mar-dsp--failed" };
  if (!row.hasDspAnalysis) return { label: "Not Analyzed", cls: "mar-dsp--missing" };
  if (row.isStale) return { label: "Stale", cls: "mar-dsp--stale" };
  if (row.analysisStatus === "partial") return { label: "Partial", cls: "mar-dsp--stale" };
  // 0712_MUSIC_BPM_Key_Detection_Engine — DSP + moods existing is not
  // "Complete" if BPM or key detection came back missing/invalid/low-
  // confidence (real beat-tracking/key detection now runs — see
  // bpmDetection.ts/keyDetection.ts — but a legitimate track can still fail
  // to resolve a confident tempo or key, e.g. weak-percussion ambient audio).
  if (!row.hasValidBpm || !row.hasValidKey) return { label: "Partial", cls: "mar-dsp--stale" };
  return { label: "Complete", cls: "mar-dsp--ok" };
}

function DspCell({ row }: { row: MoodAnalysisReviewRow }) {
  const state = analysisStateLabel(row);
  if (!row.hasAudioSource) return <span className={`mar-dsp-badge ${state.cls}`}>{state.label}</span>;
  if (!row.hasDspAnalysis) return <span className={`mar-dsp-badge ${state.cls}`}>{state.label}</span>;
  const aa = row.audioAnalysis;
  const covered = [
    aa?.rmsMean != null || aa?.rmsEnergy != null,
    aa?.spectralCentroid != null,
    aa?.spectralRolloff != null || aa?.spectralBandwidth != null,
    aa?.zeroCrossingRate != null,
    aa?.onsetDensity != null,
  ];
  const labels = ["RMS", "Cen", "Roll", "ZCR", "Onset"];
  return (
    <div className="mar-dsp-ok">
      <span className={`mar-dsp-badge ${state.cls}`}>{state.label}</span>
      <div className="mar-dsp-fields">
        {labels.map((l, i) => (
          <span key={l} className={`mar-dsp-field${covered[i] ? " mar-dsp-field--ok" : " mar-dsp-field--miss"}`}>
            {l}
          </span>
        ))}
      </div>
      <BpmKeyLine row={row} />
    </div>
  );
}

// 0712_MUSIC_BPM_Key_Detection_Engine §13 — "BPM 92 · 0.84 · detected" /
// "BPM — · low confidence"; TempoDens (the mood-pacing feature) is a
// separate column and must never be relabeled as BPM here. Calibration §20:
// default row stays compact (single overall number); the 4-dimension
// breakdown is expandable, not shown by default.
function BpmKeyLine({ row }: { row: MoodAnalysisReviewRow }) {
  const [expanded, setExpanded] = useState(false);

  const bpmLine = row.hasValidBpm
    ? `BPM ${row.bpm} · ${row.bpmConfidence != null ? row.bpmConfidence.toFixed(2) : "—"} · ${row.bpmSource ?? "unknown"}`
    : row.bpmConfidence != null
    ? "BPM — · low confidence"
    : null;
  const keyLine = row.hasValidKey
    ? `Key ${row.tonic ?? ""} ${row.mode ?? ""} · ${row.camelotKey} · ${row.keyConfidence != null ? row.keyConfidence.toFixed(2) : "—"} · ${row.keySource ?? "unknown"}`
    : row.keyConfidence != null
    ? "Key — · low confidence"
    : null;
  if (!bpmLine && !keyLine) return null;

  const hasDetail = !!(row.bpmConfidenceDetail || row.keyConfidenceDetail);

  return (
    <div className="mar-bpmkey-line">
      {bpmLine && <div className="mar-bpmkey-row">{bpmLine}</div>}
      {keyLine && <div className="mar-bpmkey-row">{keyLine}</div>}
      {hasDetail && (
        <button className="mar-bpmkey-toggle" onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}>
          {expanded ? "▾ hide confidence detail" : "▸ confidence detail"}
        </button>
      )}
      {expanded && (
        <div className="mar-bpmkey-detail">
          {row.bpmConfidenceDetail && (
            <div className="mar-bpmkey-detail-row">
              signal {row.bpmConfidenceDetail.signalConfidence.toFixed(2)} · candidate {row.bpmConfidenceDetail.candidateConfidence.toFixed(2)} · metrical {row.bpmConfidenceDetail.metricalConfidence.toFixed(2)}
            </div>
          )}
          {row.keyConfidenceDetail && (
            <div className="mar-bpmkey-detail-row">
              tonal {row.keyConfidenceDetail.tonalSignalConfidence.toFixed(2)} · tonic {row.keyConfidenceDetail.tonicConfidence.toFixed(2)} · mode {row.keyConfidenceDetail.modeConfidence.toFixed(2)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

type RowProps = {
  row: MoodAnalysisReviewRow;
  onAnalyzeDsp: (id: string) => void;
  onRerunMood: (id: string) => void;
  onForceRerunMood: (id: string) => void;
};

function ReviewRow({ row, onAnalyzeDsp, onRerunMood, onForceRerunMood }: RowProps) {
  const [expanded, setExpanded] = useState(false);

  const copyDebug = useCallback(() => {
    const text = JSON.stringify({
      id: row.id,
      title: row.title,
      features: row.features,
      moodTags: row.moodTags,
      topScores: row.topScores,
      calibrationFlags: row.calibrationFlags,
      analysisWarnings: row.analysisWarnings,
    }, null, 2);
    navigator.clipboard?.writeText(text);
  }, [row]);

  return (
    <>
      <tr className="mar-row">
        {/* Track */}
        <td className="mar-col-track">
          <div className="mar-track-title">{row.title}</div>
          {row.artist && <div className="mar-track-artist">{row.artist}</div>}
          <div className="mar-track-meta">
            {row.bpm != null && row.bpm > 0 && <span>{row.bpm} BPM</span>}
            {row.camelotKey && <span>{row.camelotKey}</span>}
          </div>
        </td>

        {/* Source */}
        <td className="mar-col-source">
          <span className={`mar-source-badge mar-source--${(row.sourceKind ?? "?").toLowerCase()}`}>
            {row.sourceKind ?? "?"}
          </span>
        </td>

        {/* DSP */}
        <td className="mar-col-dsp">
          <DspCell row={row} />
        </td>

        {/* Features */}
        <td className="mar-col-features">
          <FeatureCell features={row.features} featureSources={row.featureSources} />
        </td>

        {/* Mood Tags */}
        <td className="mar-col-moods">
          {row.moodTags.length === 0 ? (
            <span className="mar-empty">—</span>
          ) : (
            <div className="mar-chip-row">
              {row.moodTags.map((m) => {
                const token = getMoodColorToken(m);
                return (
                  <span
                    key={m}
                    className="msa-chip msa-chip--approved"
                    style={{ "--mc-token": `var(${token})` } as React.CSSProperties}
                  >
                    {m}
                  </span>
                );
              })}
            </div>
          )}
        </td>

        {/* Top Scores */}
        <td className="mar-col-scores">
          <TopScoresCell scores={row.topScores} />
        </td>

        {/* Warnings / Flags */}
        <td className="mar-col-warnings">
          {row.calibrationFlags.length > 0 && (
            <div className="mar-flags">
              {row.calibrationFlags.map((f) => (
                <span key={f} className={`mar-flag mar-flag--${FLAG_SEVERITY[f]}`}>
                  {FLAG_LABELS[f]}
                </span>
              ))}
            </div>
          )}
          {row.analysisWarnings.length > 0 && (
            <button
              className="mar-warn-toggle"
              onClick={() => setExpanded((e) => !e)}
              title="Toggle warnings"
            >
              {row.analysisWarnings.length} warning{row.analysisWarnings.length !== 1 ? "s" : ""}{" "}
              {expanded ? "▴" : "▾"}
            </button>
          )}
          {row.analysisConfidence != null && (
            <div className={`mar-conf${row.analysisConfidence < 0.65 ? " mar-conf--low" : ""}`}>
              feat {Math.round(row.analysisConfidence * 100)}%
            </div>
          )}
        </td>

        {/* Actions */}
        <td className="mar-col-actions">
          <div className="mar-actions">
            {!row.hasDspAnalysis && row.hasAudioSource && (
              <button className="mar-action-btn" onClick={() => onAnalyzeDsp(row.id)}>
                DSP
              </button>
            )}
            <button className="mar-action-btn" onClick={() => onRerunMood(row.id)}>
              Mood
            </button>
            <button className="mar-action-btn mar-action-btn--force" onClick={() => onForceRerunMood(row.id)}>
              Force
            </button>
            <button className="mar-action-btn mar-action-btn--copy" onClick={copyDebug}>
              Copy
            </button>
          </div>
        </td>
      </tr>

      {/* Expanded warnings */}
      {expanded && row.analysisWarnings.length > 0 && (
        <tr className="mar-row-expanded">
          <td colSpan={8}>
            <ul className="mar-warnings-list">
              {row.analysisWarnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Summary bar ───────────────────────────────────────────────────────────────

function SummaryBar({ tracks }: { tracks: Track[] }) {
  const summary = useMemo(() => getMoodCalibrationSummary(tracks), [tracks]);
  // MoodCalibrationSummary has no topMoodCounts field (that only exists on
  // MoodCalibrationSnapshot) — reading it crashed with "Cannot convert
  // undefined or null to object" on every render. primaryMoodCounts is the
  // correct field: committed moodTags[0] per track.
  const topMoods = Object.entries(summary.primaryMoodCounts ?? {}).slice(0, 6);

  return (
    <div className="mar-summary">
      <span className="mar-stat">Total <b>{summary.total}</b></span>
      <span className="mar-sep">·</span>
      <span className="mar-stat">DSP <b>{summary.hasDsp}</b></span>
      <span className="mar-stat mar-stat--warn">Needs DSP <b>{summary.needsDsp}</b></span>
      <span className="mar-stat mar-stat--warn">No source <b>{summary.noAudioSource}</b></span>
      <span className="mar-stat">Warnings <b>{summary.withWarnings}</b></span>
      <span className="mar-stat">Low conf <b>{summary.lowConfidence}</b></span>
      {topMoods.length > 0 && (
        <>
          <span className="mar-sep">·</span>
          <span className="mar-stat mar-stat--label">Top moods:</span>
          {topMoods.map(([mood, n]) => (
            <span key={mood} className="mar-stat mar-stat--mood">{mood} {n}</span>
          ))}
        </>
      )}
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function MoodAnalysisReviewView({
  tracks,
  onAnalyzeDsp,
  onRerunMood,
  onForceRerunMood,
  onAnalyzeBatchDsp,
  onRerunBatchMood,
  onAnalyzeAllMissing,
  onRetryFailed,
  batchProgress,
}: Props) {
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [skipReference, setSkipReference] = useState(true);
  const [pageSize] = useState(50);
  const [page, setPage] = useState(0);
  const [batchPending, setBatchPending] = useState<string | null>(null);

  const rows = useMemo(
    () => getMoodAnalysisReviewRows(tracks, { limit: pageSize, offset: page * pageSize, skipReference, filter }),
    [tracks, filter, skipReference, page, pageSize],
  );

  const totalRows = useMemo(
    () => getMoodAnalysisReviewRows(tracks, { limit: 99999, skipReference, filter }).length,
    [tracks, filter, skipReference],
  );

  const totalPages = Math.ceil(totalRows / pageSize);

  // Batch DSP — limited to 25 by default
  const handleBatchDsp = () => {
    const candidates = rows.filter((r) => !r.hasDspAnalysis && r.hasAudioSource).slice(0, 25);
    if (!candidates.length) return;
    if (batchPending?.startsWith("dsp")) {
      setBatchPending(null);
      onAnalyzeBatchDsp(candidates.map((r) => r.id));
    } else {
      setBatchPending(`dsp:${candidates.length}`);
    }
  };

  const handleBatchMood = () => {
    const candidates = rows.filter((r) => r.moodTags.length < 3).slice(0, 25);
    if (!candidates.length) return;
    if (batchPending?.startsWith("mood")) {
      setBatchPending(null);
      onRerunBatchMood(candidates.map((r) => r.id));
    } else {
      setBatchPending(`mood:${candidates.length}`);
    }
  };

  const missingDspCount = rows.filter((r) => !r.hasDspAnalysis && r.hasAudioSource).length;
  const moodNeededCount = rows.filter((r) => r.moodTags.length < 3).length;

  // Library-wide (not just this page) Catalog-missing count for "Analyze All
  // Missing" — reuses the same canonical predicate as the batch runner, not
  // a re-derived one.
  const catalogMissingCount = tracks.filter((t) => sourceKindLabel(t) === "CAT" && requiresCanonicalAnalysis(t)).length;
  const failedCount = tracks.filter((t) => t.analysisStatus === "failed").length;

  return (
    <div className="mar-root">
      <SummaryBar tracks={tracks} />

      {/* Filters */}
      <div className="mar-toolbar">
        <div className="mar-filters">
          {(Object.keys(FILTER_LABELS) as ReviewFilter[]).map((f) => (
            <button
              key={f}
              className={`mar-filter-btn${filter === f ? " mar-filter-btn--active" : ""}`}
              onClick={() => { setFilter(f); setPage(0); }}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
        <div className="mar-toolbar-right">
          <label className="mar-skip-ref">
            <input
              type="checkbox"
              checked={skipReference}
              onChange={(e) => { setSkipReference(e.target.checked); setPage(0); }}
            />
            {" "}Skip REF
          </label>

          {missingDspCount > 0 && (
            <button
              className={`mar-batch-btn${batchPending?.startsWith("dsp") ? " mar-batch-btn--confirm" : ""}`}
              onClick={handleBatchDsp}
            >
              {batchPending?.startsWith("dsp")
                ? `Run DSP on ${batchPending.split(":")[1]} tracks?`
                : `Analyze missing DSP (${Math.min(missingDspCount, 25)})`}
            </button>
          )}
          {moodNeededCount > 0 && (
            <button
              className={`mar-batch-btn${batchPending?.startsWith("mood") ? " mar-batch-btn--confirm" : ""}`}
              onClick={handleBatchMood}
            >
              {batchPending?.startsWith("mood")
                ? `Re-run moods on ${batchPending.split(":")[1]}?`
                : `Re-run moods (${Math.min(moodNeededCount, 25)})`}
            </button>
          )}
          {batchPending && (
            <button className="mar-batch-btn mar-batch-btn--cancel" onClick={() => setBatchPending(null)}>
              Cancel
            </button>
          )}
          {onAnalyzeAllMissing && catalogMissingCount > 0 && (
            <button
              className="mar-batch-btn mar-batch-btn--primary"
              onClick={() => onAnalyzeAllMissing()}
              disabled={!!batchProgress && batchProgress.remaining > 0}
              title="Analyze every Catalog track missing canonical DSP/mood analysis"
            >
              Analyze All Missing ({catalogMissingCount})
            </button>
          )}
          {onRetryFailed && failedCount > 0 && (
            <button className="mar-batch-btn" onClick={onRetryFailed} disabled={!!batchProgress && batchProgress.remaining > 0}>
              Retry Failed ({failedCount})
            </button>
          )}
        </div>
      </div>

      {batchProgress && batchProgress.missing > 0 && (
        <div className="mar-batch-progress">
          Missing: {batchProgress.missing} · Queued: {batchProgress.queued} · Running: {batchProgress.running} ·
          {" "}Complete: {batchProgress.complete} · Failed: {batchProgress.failed} · Remaining: {batchProgress.remaining}
        </div>
      )}

      {/* Table */}
      <div className="mar-table-wrap">
        <table className="mar-table">
          <thead>
            <tr>
              <th className="mar-col-track">Track</th>
              <th className="mar-col-source">Src</th>
              <th className="mar-col-dsp">DSP</th>
              <th className="mar-col-features">Features</th>
              <th className="mar-col-moods">Mood Tags</th>
              <th className="mar-col-scores">Top Scores</th>
              <th className="mar-col-warnings">Flags / Warnings</th>
              <th className="mar-col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="mar-empty-state">No tracks match this filter.</td>
              </tr>
            ) : (
              rows.map((row) => (
                <ReviewRow
                  key={row.id}
                  row={row}
                  onAnalyzeDsp={onAnalyzeDsp}
                  onRerunMood={onRerunMood}
                  onForceRerunMood={onForceRerunMood}
                />
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mar-pagination">
          <button className="mar-page-btn" disabled={page === 0} onClick={() => setPage(0)}>«</button>
          <button className="mar-page-btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>‹</button>
          <span className="mar-page-info">Page {page + 1} / {totalPages} ({totalRows} rows)</span>
          <button className="mar-page-btn" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>›</button>
          <button className="mar-page-btn" disabled={page >= totalPages - 1} onClick={() => setPage(totalPages - 1)}>»</button>
        </div>
      )}
    </div>
  );
}
