import React, { useState, useMemo, useRef } from "react";
import type { Track } from "../data/trackTypes";
import type { CrateRecord } from "../data/crateTypes";
import type { PlaylistRecord } from "../data/playProjectTypes";
import type { MetadataImportRecord, MetadataImportPreview } from "../data/metadataSourceTypes";
import {
  computeExternalCoverage,
  computeCrateCoverage,
  getTracksMissingAnalysis,
  exportManifestCsv,
  exportMissingAnalysisCsv,
  downloadCsv,
  type CrateCoverage,
} from "../logic/externalCoverage";
import { detectExternalIdentityIssues, groupIdentityIssues } from "../logic/externalIdentityIssues";
import { buildRepairedMissingManifestRows, exportRepairedManifestCsv } from "../logic/externalIdentityRepair";
import { undoLatestBatchRepair } from "../logic/externalIdentityBatchReview";
import { computeLibraryHealthSummary, type HealthGrade } from "../logic/libraryHealth";
import type { ExternalIdentityRepairRecord } from "../logic/externalIdentityRepair";
import type { ExternalIdentityBatchRepairRecord } from "../logic/externalIdentityBatchReview";
import { ExternalIdentityRepairPanel } from "./ExternalIdentityRepairPanel";
import { IntakeRepairReviewPanel } from "./IntakeRepairReviewPanel";
import { parseCsvText, parseJsonText, buildImportPreview } from "../logic/metadataCsvImport";
import type { IntakeRepairBatch } from "../logic/intakeRepairQueue";

type Tab = "overview" | "missing" | "identity" | "paths" | "unmatched" | "quality" | "history" | "advanced";
type RepairTab = "blocking" | "warnings" | "titleArtist" | "pathIssues" | "unmatched" | "deferred";

type Props = {
  externalTracks: Track[];
  libraryTracks: Track[];
  crates: CrateRecord[];
  playlists: PlaylistRecord[];
  latestImport?: MetadataImportRecord;
  repairHistory: ExternalIdentityRepairRecord[];
  batchRepairHistory: ExternalIdentityBatchRepairRecord[];
  ignoredIssueIds: string[];
  deferredIssueIds: string[];
  onApplyRepairs: (updatedTracks: Track[], newRecords: ExternalIdentityRepairRecord[], batchRecord?: ExternalIdentityBatchRepairRecord) => void;
  onUpdateBatchHistory: (next: ExternalIdentityBatchRepairRecord[]) => void;
  onIgnoreIssue: (issueId: string) => void;
  onDeferIssue: (issueId: string) => void;
  onApplyImportPreview: (preview: MetadataImportPreview, opts: { selectedTrackIds?: Set<string>; forceConflictIds?: string[] }) => MetadataImportRecord;
  onApplyIntakeRepairs?: (updatedTracks: Track[], batch: IntakeRepairBatch, newIgnoredIds: string[], newDeferredIds: string[]) => void;
  onClose: () => void;
};

function GradeChip({ grade }: { grade: HealthGrade | string }) {
  const cls =
    grade === "EXCELLENT" ? "lhp-grade--excellent"
    : grade === "USABLE"  ? "lhp-grade--usable"
    : grade === "PROVISIONAL" ? "lhp-grade--provisional"
    : grade === "WEAK"    ? "lhp-grade--weak"
    : "lhp-grade--blocked";
  return <span className={`lhp-grade ${cls}`}>{grade}</span>;
}

function ReadinessBar({ ready, total, label }: { ready: number; total: number; label: string }) {
  const pct = total > 0 ? Math.round((ready / total) * 100) : 0;
  const cls = pct === 100 ? "ecp-bar--full" : pct >= 70 ? "ecp-bar--ok" : pct > 0 ? "ecp-bar--partial" : "ecp-bar--none";
  return (
    <div className="ecp-readiness-row">
      <span className="ecp-readiness-label">{label}</span>
      <div className="ecp-bar-wrap">
        <div className={`ecp-bar ${cls}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="ecp-readiness-count">{ready}/{total}</span>
    </div>
  );
}

export function LibraryHealthPanel({
  externalTracks,
  libraryTracks,
  crates,
  playlists,
  latestImport,
  repairHistory,
  batchRepairHistory,
  ignoredIssueIds,
  deferredIssueIds,
  onApplyRepairs,
  onUpdateBatchHistory,
  onIgnoreIssue,
  onDeferIssue,
  onApplyImportPreview,
  onApplyIntakeRepairs,
  onClose,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [showRepair, setShowRepair] = useState(false);
  const [repairInitialTab, setRepairInitialTab] = useState<RepairTab>("blocking");
  const [showIntakeRepair, setShowIntakeRepair] = useState(false);
  const [intakeRepairBatch, setIntakeRepairBatch] = useState<IntakeRepairBatch | null>(null);
  const [importFlash, setImportFlash] = useState<string | null>(null);
  const [importPending, setImportPending] = useState<MetadataImportPreview | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);

  function openRepair(tab: RepairTab = "blocking") {
    setRepairInitialTab(tab);
    setShowRepair(true);
  }

  const health = useMemo(
    () => computeLibraryHealthSummary(externalTracks, libraryTracks, crates, playlists, latestImport, ignoredIssueIds, deferredIssueIds),
    [externalTracks, libraryTracks, crates, playlists, latestImport, ignoredIssueIds, deferredIssueIds],
  );

  const coverage = useMemo(
    () => computeExternalCoverage(externalTracks, latestImport),
    [externalTracks, latestImport],
  );

  const crateCoverage: CrateCoverage[] = useMemo(
    () => computeCrateCoverage(crates, libraryTracks, playlists),
    [crates, libraryTracks, playlists],
  );

  const missingTracks = useMemo(
    () => getTracksMissingAnalysis(externalTracks, crates, libraryTracks),
    [externalTracks, crates, libraryTracks],
  );

  const unmatchedRows = latestImport?.unmatchedRows_detail ?? [];

  const allIssues = useMemo(
    () => detectExternalIdentityIssues(externalTracks, unmatchedRows),
    [externalTracks, unmatchedRows],
  );

  const issueGroups = useMemo(
    () => groupIdentityIssues(allIssues, new Set(ignoredIssueIds), new Set(deferredIssueIds)),
    [allIssues, ignoredIssueIds, deferredIssueIds],
  );

  function handleExportManifest() {
    const csv = exportManifestCsv(externalTracks, crates, libraryTracks);
    downloadCsv(csv, "music_external_manifest.csv");
  }

  function handleExportMissing() {
    const csv = exportMissingAnalysisCsv(missingTracks);
    downloadCsv(csv, "music_external_missing_analysis.csv");
  }

  function handleExportRepaired() {
    const rows = buildRepairedMissingManifestRows(missingTracks, repairHistory);
    if (rows.length === 0) { alert("No repaired rows to export."); return; }
    const csv = exportRepairedManifestCsv(rows);
    downloadCsv(csv, "music_external_repaired_manifest.csv");
  }

  function handleUndoBatch() {
    if (batchRepairHistory.length === 0) { alert("No batch to undo."); return; }
    const { updatedTracks, updatedBatchHistory, undoneCount, skippedCount } =
      undoLatestBatchRepair(externalTracks, batchRepairHistory, repairHistory);
    onApplyRepairs(updatedTracks, [], undefined);
    onUpdateBatchHistory(updatedBatchHistory);
    const msg = skippedCount > 0
      ? `Undid ${undoneCount} change(s). ${skippedCount} skipped (modified after batch).`
      : `Undid ${undoneCount} change(s).`;
    setImportFlash(msg);
    setTimeout(() => setImportFlash(null), 4000);
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const isJson = file.name.toLowerCase().endsWith(".json");
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = isJson ? parseJsonText(text) : parseCsvText(text) as Array<Record<string, unknown>>;
      const preview = buildImportPreview(rows, externalTracks, file.name, isJson ? "json" : "csv");
      setImportPending(preview);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function handleApplyImport() {
    if (!importPending) return;
    const record = onApplyImportPreview(importPending, {
      selectedTrackIds: new Set(importPending.rows.map((r) => r.trackId)),
    });
    setImportPending(null);
    setImportFlash(`Applied ${record.appliedFields} field updates to ${record.matchedRows} tracks. ${record.unmatchedRows} unmatched.`);
    setTimeout(() => setImportFlash(null), 5000);
  }

  const tabLabels: Record<Tab, string> = {
    overview: "Overview",
    missing: `Missing Analysis${missingTracks.length > 0 ? ` (${missingTracks.length})` : ""}`,
    identity: `Identity${health.identityIssueCount > 0 ? ` (${health.identityIssueCount})` : ""}`,
    paths: `Paths${health.pathIssueCount > 0 ? ` (${health.pathIssueCount})` : ""}`,
    unmatched: `Unmatched${health.unmatchedImportCount > 0 ? ` (${health.unmatchedImportCount})` : ""}`,
    quality: "File Quality",
    history: "History",
    advanced: "Advanced",
  };

  return (
    <>
    <div className="cmp-overlay">
      <div className="cmp-panel lhp-panel">
        <div className="cmp-header">
          <span className="cmp-title">Library Health</span>
          <button className="cmp-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="lhp-tabs">
          {(["overview", "missing", "identity", "paths", "unmatched", "quality", "history", "advanced"] as Tab[]).map((tab) => (
            <button
              key={tab}
              className={`lhp-tab${activeTab === tab ? " lhp-tab--active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tabLabels[tab]}
            </button>
          ))}
        </div>

        {/* ── Overview ── */}
        {activeTab === "overview" && (
          <div className="lhp-section">
            <div className="lhp-overview-header">
              <GradeChip grade={health.overallGrade} />
              <span className="lhp-overview-subtitle">
                {health.openIssueCount === 0
                  ? "No open repairs."
                  : `${health.openIssueCount} open repair${health.openIssueCount !== 1 ? "s" : ""} need attention.`}
              </span>
            </div>

            <div className="lhp-stat-grid">
              <div className="lhp-stat">
                <span className="lhp-stat-label">Missing analysis</span>
                <span className={`lhp-stat-value ${health.missingAnalysisCount > 0 ? "lhp-stat--warn" : "lhp-stat--ok"}`}>{health.missingAnalysisCount}</span>
              </div>
              <div className="lhp-stat">
                <span className="lhp-stat-label">Identity issues</span>
                <span className={`lhp-stat-value ${health.identityIssueCount > 0 ? "lhp-stat--warn" : "lhp-stat--ok"}`}>{health.identityIssueCount}</span>
              </div>
              <div className="lhp-stat">
                <span className="lhp-stat-label">Path issues</span>
                <span className={`lhp-stat-value ${health.pathIssueCount > 0 ? "lhp-stat--warn" : "lhp-stat--ok"}`}>{health.pathIssueCount}</span>
              </div>
              <div className="lhp-stat">
                <span className="lhp-stat-label">Unmatched imports</span>
                <span className={`lhp-stat-value ${health.unmatchedImportCount > 0 ? "lhp-stat--warn" : "lhp-stat--ok"}`}>{health.unmatchedImportCount}</span>
              </div>
              {health.stalePlaylistOptionCount > 0 && (
                <div className="lhp-stat">
                  <span className="lhp-stat-label">Stale playlist options</span>
                  <span className="lhp-stat-value lhp-stat--warn">{health.stalePlaylistOptionCount}</span>
                </div>
              )}
            </div>

            {health.latestImportSummary && (
              <div className="lhp-import-summary">
                <span className="lhp-import-label">Latest AudioLab import:</span>{" "}
                <strong>{health.latestImportSummary.sourceFileName}</strong>{" "}
                <span className="ecp-muted">{health.latestImportSummary.importedAt.slice(0, 10)}</span>
                {" · "}{health.latestImportSummary.matchedRows} matched
                {" · "}{health.latestImportSummary.appliedFields} fields applied
                {health.latestImportSummary.unmatchedRows > 0
                  ? ` · ${health.latestImportSummary.unmatchedRows} unmatched`
                  : ""}
              </div>
            )}

            <div className="lhp-readiness-block">
              <ReadinessBar ready={coverage.durationReady} total={coverage.totalTracks} label="Duration" />
              <ReadinessBar ready={coverage.bpmReady} total={coverage.totalTracks} label="BPM" />
              <ReadinessBar ready={coverage.keyReady} total={coverage.totalTracks} label="Key" />
              <ReadinessBar ready={coverage.energyReady} total={coverage.totalTracks} label="Energy" />
              <ReadinessBar ready={coverage.filePathCount} total={coverage.totalTracks} label="Path" />
            </div>

            {/* ── Intake Readiness (0705Q) ── */}
            {health.intakeReadiness && health.intakeReadiness.total > 0 && (
              <div className="lhp-intake-block">
                <div className="lhp-intake-title">Intake Readiness</div>
                <div className="lhp-intake-grades">
                  <span className="lhp-intake-grade lhp-intake-grade--excellent">
                    EXCELLENT <strong>{health.intakeReadiness.excellent}</strong>
                  </span>
                  <span className="lhp-intake-grade lhp-intake-grade--good">
                    GOOD <strong>{health.intakeReadiness.good}</strong>
                  </span>
                  {health.intakeReadiness.review > 0 && (
                    <span className="lhp-intake-grade lhp-intake-grade--review">
                      REVIEW <strong>{health.intakeReadiness.review}</strong>
                    </span>
                  )}
                  {health.intakeReadiness.blocked > 0 && (
                    <span className="lhp-intake-grade lhp-intake-grade--blocked">
                      BLOCKED <strong>{health.intakeReadiness.blocked}</strong>
                    </span>
                  )}
                </div>
                <div className="lhp-intake-stats">
                  {health.intakeReadiness.identityIssues > 0 && (
                    <span className="lhp-intake-stat lhp-intake-stat--warn">
                      Identity: {health.intakeReadiness.identityIssues} review
                    </span>
                  )}
                  {health.batchTrust?.suspiciousKey && (
                    <span className="lhp-intake-stat lhp-intake-stat--warn">
                      Key: {health.batchTrust.dominantKeyCount}/{health.batchTrust.totalTracks} share {health.batchTrust.dominantKey} — untrusted
                    </span>
                  )}
                  {health.batchTrust?.suspiciousBpm && (
                    <span className="lhp-intake-stat lhp-intake-stat--warn">
                      BPM: {health.batchTrust.dominantBpmCount}/{health.batchTrust.totalTracks} share {health.batchTrust.dominantBpm} — suspicious
                    </span>
                  )}
                  {health.intakeReadiness.moodSuggestionsGenerated > 0 && (
                    <span className="lhp-intake-stat">
                      Mood suggestions: {health.intakeReadiness.moodSuggestionsGenerated}
                    </span>
                  )}
                  {health.intakeReadiness.referenceCount > 0 && (
                    <span className="lhp-intake-stat">
                      Sounds: {health.intakeReadiness.referenceCount} (excluded from playlists)
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="lhp-overview-actions">
              {health.openIssueCount > 0 && (
                <button className="tb-btn lhp-primary-btn" onClick={() => openRepair("blocking")}>
                  Review Repairs
                </button>
              )}
              {onApplyIntakeRepairs && (
                <button className="tb-btn lhp-primary-btn" onClick={() => setShowIntakeRepair(true)}>
                  Review Intake Repairs
                </button>
              )}
              <button className="tb-btn" onClick={() => setActiveTab("missing")} disabled={missingTracks.length === 0}>
                Send Missing Tracks to AudioLab ({missingTracks.length})
              </button>
              {health.stalePlaylistOptionCount > 0 && (
                <div className="lhp-stale-note ecp-muted">
                  {health.stalePlaylistOptionCount} playlist option{health.stalePlaylistOptionCount !== 1 ? "s" : ""} generated before latest metadata repair — review in Crate playlists.
                </div>
              )}
            </div>

            <div className="lhp-helper-copy ecp-muted">
              Library Health shows what still needs attention. Most cleanup starts with Review Repairs or Import AudioLab Results. No action is applied automatically.
            </div>
          </div>
        )}

        {/* ── Missing Analysis ── */}
        {activeTab === "missing" && (
          <div className="lhp-section">
            <div className="ecp-section-actions">
              <span className="ecp-section-count">{missingTracks.length} tracks need analysis</span>
              <button className="tb-btn lhp-primary-btn" onClick={handleExportMissing} disabled={missingTracks.length === 0}>
                Send Missing Tracks to AudioLab
              </button>
              <button className="tb-btn" onClick={() => openRepair("pathIssues")}>
                Review Path Issues
              </button>
            </div>
            {missingTracks.length === 0 ? (
              <div className="ecp-empty">All External tracks have analysis data.</div>
            ) : (
              <>
                <div className="lhp-helper-copy ecp-muted">
                  Export a manifest of tracks that still need audio analysis, then run AudioLab with --manifest.
                </div>
                <code className="lhp-code">./audiolab/bin/analyze_external.sh --manifest /path/to/music_external_missing.csv</code>
                <div className="ecp-missing-list">
                  {missingTracks.slice(0, 200).map((t) => (
                    <div key={t.trackId} className="ecp-missing-row">
                      <div className="ecp-missing-title">{t.title || t.filename || t.trackId}</div>
                      <div className="ecp-missing-meta">
                        {t.artist && <span className="ecp-muted">{t.artist}</span>}
                        {t.filePath ? (
                          <span className="ecp-path" title={t.filePath}>{t.filePath.split("/").slice(-2).join("/")}</span>
                        ) : (
                          <span className="ecp-cell--warn">no path</span>
                        )}
                      </div>
                      <div className="ecp-missing-fields">
                        {t.missingFields.map((f) => <span key={f} className="ecp-missing-field">{f}</span>)}
                        <span className="ecp-missing-reason ecp-muted">{t.reason}</span>
                      </div>
                    </div>
                  ))}
                  {missingTracks.length > 200 && (
                    <div className="ecp-muted ecp-truncated">…and {missingTracks.length - 200} more — export to see full list</div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Identity ── */}
        {activeTab === "identity" && (
          <div className="lhp-section">
            <div className="ecp-section-actions">
              <button className="tb-btn lhp-primary-btn" onClick={() => openRepair("titleArtist")}>
                Review Identity Issues
              </button>
              <button className="tb-btn" onClick={() => openRepair("blocking")} disabled={issueGroups.blocking.length === 0}>
                Blocking ({issueGroups.blocking.length})
              </button>
              <button className="tb-btn" onClick={() => openRepair("warnings")} disabled={issueGroups.warnings.length === 0}>
                Warnings ({issueGroups.warnings.length})
              </button>
            </div>
            <div className="lhp-issue-counts">
              <div className="lhp-issue-row">
                <span className="lhp-issue-label">Blank title / artist</span>
                <span className={`lhp-issue-n ${issueGroups.titleArtist.length > 0 ? "lhp-stat--warn" : "lhp-stat--ok"}`}>{issueGroups.titleArtist.length}</span>
              </div>
              <div className="lhp-issue-row">
                <span className="lhp-issue-label">Blocking issues</span>
                <span className={`lhp-issue-n ${issueGroups.blocking.length > 0 ? "lhp-stat--warn" : "lhp-stat--ok"}`}>{issueGroups.blocking.length}</span>
              </div>
              <div className="lhp-issue-row">
                <span className="lhp-issue-label">Warnings</span>
                <span className={`lhp-issue-n ${issueGroups.warnings.length > 0 ? "lhp-stat--warn" : "lhp-stat--ok"}`}>{issueGroups.warnings.length}</span>
              </div>
              <div className="lhp-issue-row">
                <span className="lhp-issue-label">Deferred</span>
                <span className="lhp-issue-n ecp-muted">{issueGroups.deferred.length}</span>
              </div>
            </div>
            {batchRepairHistory.length > 0 && (
              <div className="lhp-batch-summary ecp-muted">
                Latest batch: {batchRepairHistory[0].appliedChangeCount} applied · {batchRepairHistory[0].blockedChangeCount} blocked
                {" · "}{batchRepairHistory[0].appliedAt.slice(0, 10)}
                <button className="tb-btn lhp-inline-btn" onClick={handleUndoBatch}>Undo Latest Identity Batch</button>
              </div>
            )}
            <div className="lhp-helper-copy ecp-muted">
              Review Identity Issues opens the batch repair workflow. Accepted changes fill blank fields only — existing values are never overwritten automatically.
            </div>
          </div>
        )}

        {/* ── Paths ── */}
        {activeTab === "paths" && (
          <div className="lhp-section">
            <div className="ecp-section-actions">
              <span className="ecp-section-count">
                {health.pathIssueCount} path issue{health.pathIssueCount !== 1 ? "s" : ""}
              </span>
              <button className="tb-btn lhp-primary-btn" onClick={() => openRepair("pathIssues")}>
                Review Path Issues
              </button>
            </div>
            {issueGroups.pathIssues.length === 0 ? (
              <div className="ecp-empty">No path issues found.</div>
            ) : (
              <div className="lhp-path-list">
                {issueGroups.pathIssues.map((issue) => (
                  <div key={issue.issueId} className="lhp-path-row">
                    <div className="lhp-path-title">{issue.title || issue.filename || issue.trackId}</div>
                    <div className="lhp-path-type ecp-muted">{issue.issueType.replace(/_/g, " ")}</div>
                    {issue.filePath && (
                      <div className="ecp-path ecp-muted" title={issue.filePath}>
                        {issue.filePath.split("/").slice(-2).join("/")}
                      </div>
                    )}
                    <div className="ecp-muted lhp-path-reason">{issue.reason}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Unmatched ── */}
        {activeTab === "unmatched" && (
          <div className="lhp-section">
            <div className="ecp-section-actions">
              <span className="ecp-section-count">
                {unmatchedRows.length > 0
                  ? `${unmatchedRows.length} rows from latest import didn't match any track`
                  : "No unmatched rows from latest import"}
              </span>
              {unmatchedRows.length > 0 && (
                <button className="tb-btn lhp-primary-btn" onClick={() => openRepair("unmatched")}>
                  Review Unmatched Imports
                </button>
              )}
            </div>
            {unmatchedRows.length === 0 ? (
              <div className="ecp-empty">
                {latestImport ? "All rows from the latest import were matched." : "No import yet. Use Advanced → Import AudioLab Results."}
              </div>
            ) : (
              <div className="ecp-unmatched-list">
                {unmatchedRows.map((r, i) => (
                  <div key={i} className="ecp-unmatched-row">
                    <div className="ecp-unmatched-filename">{r.filename}</div>
                    <div className="ecp-unmatched-meta">
                      {r.title && <span>{r.title}</span>}
                      {r.artist && <span className="ecp-muted"> — {r.artist}</span>}
                      {r.durationSeconds && <span className="ecp-muted"> {Math.round(r.durationSeconds / 60)}:{String(Math.round(r.durationSeconds % 60)).padStart(2, "0")}</span>}
                      {r.bpm && <span className="ecp-muted"> {r.bpm} BPM</span>}
                    </div>
                    <div className="ecp-unmatched-reason ecp-muted">{r.reason}</div>
                    {r.filePath && (
                      <div className="ecp-path ecp-muted" title={r.filePath}>{r.filePath.split("/").slice(-2).join("/")}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── File Quality ── */}
        {activeTab === "quality" && (
          <div className="lhp-section">
            <div className="ecp-empty lhp-placeholder">
              <strong>File quality tracking is not fully wired yet.</strong>
              <br />
              Decoder warnings from AudioLab reports will appear here later.
            </div>
          </div>
        )}

        {/* ── History ── */}
        {activeTab === "history" && (
          <div className="lhp-section">
            <div className="lhp-history-section">
              <div className="lhp-history-heading">Latest AudioLab import</div>
              {health.latestImportSummary ? (
                <div className="lhp-history-card">
                  <div><strong>{health.latestImportSummary.sourceFileName}</strong></div>
                  <div className="ecp-muted">{health.latestImportSummary.importedAt.slice(0, 16).replace("T", " ")}</div>
                  <div>{health.latestImportSummary.matchedRows} matched · {health.latestImportSummary.appliedFields} fields applied · {health.latestImportSummary.unmatchedRows} unmatched</div>
                </div>
              ) : (
                <div className="ecp-muted">No import yet.</div>
              )}
            </div>

            <div className="lhp-history-section">
              <div className="lhp-history-heading">Latest identity batch repair</div>
              {batchRepairHistory.length > 0 ? (
                <div className="lhp-history-card">
                  <div className="ecp-muted">{batchRepairHistory[0].appliedAt.slice(0, 16).replace("T", " ")}</div>
                  <div>{batchRepairHistory[0].appliedChangeCount} applied · {batchRepairHistory[0].blockedChangeCount} blocked · {batchRepairHistory[0].selectedIssueCount} issues selected</div>
                  {batchRepairHistory[0].undoneAt && (
                    <div className="ecp-muted">Undone {batchRepairHistory[0].undoneAt.slice(0, 10)}</div>
                  )}
                </div>
              ) : (
                <div className="ecp-muted">No batch repair yet.</div>
              )}
            </div>

            {crateCoverage.some((c) => c.staleOptionCount > 0) && (
              <div className="lhp-history-section">
                <div className="lhp-history-heading">Stale playlist options</div>
                {crateCoverage.filter((c) => c.staleOptionCount > 0).map((c) => (
                  <div key={c.crateId} className="lhp-history-card ecp-muted">
                    {c.crateName} — {c.staleOptionCount} stale option{c.staleOptionCount !== 1 ? "s" : ""}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Advanced ── */}
        {activeTab === "advanced" && (
          <div className="lhp-section">
            <div className="lhp-helper-copy ecp-muted">
              Advanced tools are for AudioLab round-trips and debugging. Most library cleanup starts from Overview.
            </div>

            {importFlash && <div className="lhp-flash">{importFlash}</div>}

            {importPending && (
              <div className="lhp-import-pending">
                <div><strong>{importPending.sourceFileName}</strong></div>
                <div className="ecp-muted">{importPending.rows.length} rows to match · {importPending.rows.filter((r) => r.matchStatus !== "UNMATCHED").length} matched</div>
                <div className="lhp-import-actions">
                  <button className="tb-btn lhp-primary-btn" onClick={handleApplyImport}>
                    Apply Import
                  </button>
                  <button className="tb-btn" onClick={() => setImportPending(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="lhp-advanced-actions">
              <div className="lhp-advanced-group">
                <div className="lhp-advanced-group-label">Import</div>
                <button className="tb-btn lhp-primary-btn" onClick={() => importFileRef.current?.click()}>
                  Import AudioLab Results
                </button>
                <input
                  ref={importFileRef}
                  type="file"
                  accept=".csv,.json"
                  style={{ display: "none" }}
                  onChange={handleImportFile}
                />
              </div>

              <div className="lhp-advanced-group">
                <div className="lhp-advanced-group-label">Export</div>
                <button className="tb-btn" onClick={handleExportManifest}>
                  Export Full Manifest
                </button>
                <button className="tb-btn" onClick={handleExportMissing} disabled={missingTracks.length === 0}>
                  Export Missing Analysis CSV ({missingTracks.length})
                </button>
                <button className="tb-btn" onClick={handleExportRepaired}>
                  Export Repaired AudioLab Manifest
                </button>
              </div>

              <div className="lhp-advanced-group">
                <div className="lhp-advanced-group-label">Repair</div>
                <button className="tb-btn" onClick={handleUndoBatch} disabled={batchRepairHistory.length === 0}>
                  Undo Latest Identity Batch
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>

    {showIntakeRepair && onApplyIntakeRepairs && (
      <IntakeRepairReviewPanel
        tracks={[...externalTracks, ...libraryTracks]}
        crates={crates}
        ignoredIds={ignoredIssueIds}
        deferredIds={deferredIssueIds}
        latestBatch={intakeRepairBatch}
        onApply={(updatedTracks, batch, newIgnored, newDeferred) => {
          setIntakeRepairBatch(batch);
          onApplyIntakeRepairs(updatedTracks, batch, newIgnored, newDeferred);
        }}
        onUndo={(restoredTracks) => {
          setIntakeRepairBatch(null);
          onApplyIntakeRepairs(restoredTracks, { batchId: "", appliedAt: "", itemIds: [], trackSnapshotsBefore: {}, trackSnapshotsAfter: {}, summary: { applied: 0, blocked: 0, deferred: 0, ignored: 0 } }, [], []);
        }}
        onClose={() => setShowIntakeRepair(false)}
      />
    )}
    {showRepair && (
      <ExternalIdentityRepairPanel
        externalTracks={externalTracks}
        libraryTracks={libraryTracks}
        crates={crates}
        unmatchedRows={latestImport?.unmatchedRows_detail ?? []}
        repairHistory={repairHistory}
        batchRepairHistory={batchRepairHistory}
        ignoredIssueIds={ignoredIssueIds}
        deferredIssueIds={deferredIssueIds}
        onApplyRepairs={onApplyRepairs}
        onUpdateBatchHistory={onUpdateBatchHistory}
        onIgnoreIssue={onIgnoreIssue}
        onDeferIssue={onDeferIssue}
        onClose={() => setShowRepair(false)}
        initialTab={repairInitialTab}
      />
    )}
    </>
  );
}
