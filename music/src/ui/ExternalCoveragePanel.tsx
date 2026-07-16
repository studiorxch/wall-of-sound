import { useState, useMemo } from "react";
import type { Track } from "../data/trackTypes";
import type { CrateRecord } from "../data/crateTypes";
import type { PlaylistRecord } from "../data/playProjectTypes";
import type { MetadataImportRecord } from "../data/metadataSourceTypes";
import {
  computeExternalCoverage,
  computeCrateCoverage,
  getTracksMissingAnalysis,
  exportManifestCsv,
  exportMissingAnalysisCsv,
  downloadCsv,
  type ExternalCoverageSummary,
  type CrateCoverage,
} from "../logic/externalCoverage";
import type { ExternalIdentityRepairRecord } from "../logic/externalIdentityRepair";
import { ExternalIdentityRepairPanel } from "./ExternalIdentityRepairPanel";

import type { ExternalIdentityBatchRepairRecord } from "../logic/externalIdentityBatchReview";

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
  onClose: () => void;
};

function GradeChip({ grade }: { grade: string }) {
  const cls =
    grade === "excellent" ? "ecp-grade--excellent"
    : grade === "usable"  ? "ecp-grade--usable"
    : grade === "weak"    ? "ecp-grade--weak"
    : grade === "provisional" ? "ecp-grade--provisional"
    : "ecp-grade--blocked";
  return <span className={`ecp-grade ${cls}`}>{grade.toUpperCase()}</span>;
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

export function ExternalCoveragePanel({
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
  onClose,
}: Props) {
  const [activeTab, setActiveTab] = useState<"summary" | "crates" | "missing" | "unmatched">("summary");
  const [showRepair, setShowRepair] = useState(false);
  type RepairTab = "blocking" | "warnings" | "titleArtist" | "pathIssues" | "unmatched" | "deferred";
  const [repairInitialTab, setRepairInitialTab] = useState<RepairTab>("blocking");

  function openRepair(tab: RepairTab = "blocking") {
    setRepairInitialTab(tab);
    setShowRepair(true);
  }

  const coverage: ExternalCoverageSummary = useMemo(
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

  function handleExportManifest() {
    const csv = exportManifestCsv(externalTracks, crates, libraryTracks);
    downloadCsv(csv, "music_external_manifest.csv");
  }

  function handleExportMissing() {
    const csv = exportMissingAnalysisCsv(missingTracks);
    downloadCsv(csv, "music_external_missing_analysis.csv");
  }

  function handleExportUnmatched() {
    const header = "filename,filePath,title,artist,durationSeconds,bpm,reason";
    const rows = unmatchedRows.map((r) => {
      const q = (v: string | number | undefined | null) =>
        `"${String(v ?? "").replace(/"/g, '""')}"`;
      return [q(r.filename), q(r.filePath), q(r.title), q(r.artist), q(r.durationSeconds), q(r.bpm), q(r.reason)].join(",");
    });
    downloadCsv([header, ...rows].join("\n"), "music_audiolab_unmatched.csv");
  }

  return (
    <>
    <div className="cmp-overlay">
      <div className="cmp-panel ecp-panel">
        <div className="cmp-header">
          <span className="cmp-title">External Coverage</span>
          <button className="cmp-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Tabs */}
        <div className="ecp-tabs">
          {(["summary", "crates", "missing", "unmatched"] as const).map((tab) => (
            <button
              key={tab}
              className={`ecp-tab${activeTab === tab ? " ecp-tab--active" : ""}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === "summary" ? "Coverage" : tab === "crates" ? `Crates (${crateCoverage.length})` : tab === "missing" ? `Missing (${missingTracks.length})` : `Unmatched (${unmatchedRows.length})`}
            </button>
          ))}
        </div>

        {/* Summary */}
        {activeTab === "summary" && (
          <div className="ecp-section">
            <div className="ecp-summary-row">
              <GradeChip grade={coverage.trustGrade} />
              <span className="ecp-summary-pct">{coverage.coveragePct}% coverage</span>
              <span className="ecp-summary-count">{coverage.totalTracks} tracks</span>
            </div>

            <div className="ecp-readiness-block">
              <ReadinessBar ready={coverage.durationReady} total={coverage.totalTracks} label="Duration" />
              <ReadinessBar ready={coverage.bpmReady} total={coverage.totalTracks} label="BPM" />
              <ReadinessBar ready={coverage.keyReady} total={coverage.totalTracks} label="Key" />
              <ReadinessBar ready={coverage.energyReady} total={coverage.totalTracks} label="Energy" />
              <ReadinessBar ready={coverage.filePathCount} total={coverage.totalTracks} label="Path" />
            </div>

            {coverage.latestImport && (
              <div className="ecp-last-import">
                <span className="ecp-last-import-label">Latest import:</span>{" "}
                <strong>{coverage.latestImport.sourceFileName}</strong>{" "}
                <span className="ecp-muted">{coverage.latestImport.importedAt.slice(0, 10)}</span>
                {" · "}{coverage.latestImport.matchedRows}/{coverage.latestImport.totalRows} matched
                {" · "}{coverage.latestImport.appliedFields} fields applied
                {coverage.latestImport.affectedCrateIds?.length
                  ? ` · ${coverage.latestImport.affectedCrateIds.length} crates affected`
                  : ""}
                {(coverage.latestImport.staleOptionCount ?? 0) > 0
                  ? ` · ${coverage.latestImport.staleOptionCount} stale option sets`
                  : ""}
              </div>
            )}

            <div className="ecp-actions">
              <button className="tb-btn" onClick={handleExportManifest}>
                Export Manifest CSV
              </button>
              <button className="tb-btn" onClick={handleExportMissing} disabled={missingTracks.length === 0}>
                Export Missing Analysis CSV ({missingTracks.length})
              </button>
              <button className="tb-btn ecp-repair-btn" onClick={() => openRepair("blocking")}>
                Repair Identity
              </button>
            </div>

            <div className="ecp-audiolab-hint">
              <strong>To repair missing External metadata:</strong>
              <span>1. Export Missing Analysis CSV above.</span>
              <code>./audiolab/bin/analyze_external.sh --manifest /path/to/music_external_missing.csv</code>
              <span>3. Import <code style={{display:"inline"}}>audiolab/output/analysis-csv/latest.csv</code> via Fix Metadata → Import AudioLab CSV.</span>
            </div>
          </div>
        )}

        {/* Crate Coverage */}
        {activeTab === "crates" && (
          <div className="ecp-section">
            {crateCoverage.length === 0 ? (
              <div className="ecp-empty">No crates contain External tracks.</div>
            ) : (
              <table className="ecp-table">
                <thead>
                  <tr>
                    <th>Crate</th>
                    <th>Tracks</th>
                    <th>Dur</th>
                    <th>BPM</th>
                    <th>Energy</th>
                    <th>Trust</th>
                    <th>Stale</th>
                  </tr>
                </thead>
                <tbody>
                  {crateCoverage.map((c) => (
                    <tr key={c.crateId} className={c.staleOptionCount > 0 ? "ecp-row--stale" : ""}>
                      <td className="ecp-crate-name">{c.crateName}</td>
                      <td>{c.trackCount}</td>
                      <td className={c.durationReady === c.trackCount ? "ecp-cell--ok" : "ecp-cell--warn"}>
                        {c.durationReady}/{c.trackCount}
                      </td>
                      <td className={c.bpmReady === c.trackCount ? "ecp-cell--ok" : "ecp-cell--warn"}>
                        {c.bpmReady}/{c.trackCount}
                      </td>
                      <td className={c.energyReady === c.trackCount ? "ecp-cell--ok" : "ecp-cell--warn"}>
                        {c.energyReady}/{c.trackCount}
                      </td>
                      <td><GradeChip grade={c.trustGrade} /></td>
                      <td>{c.staleOptionCount > 0 ? <span className="ecp-stale-badge">{c.staleOptionCount} stale</span> : <span className="ecp-muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Missing Analysis */}
        {activeTab === "missing" && (
          <div className="ecp-section">
            <div className="ecp-section-actions">
              <span className="ecp-section-count">{missingTracks.length} tracks need analysis</span>
              <button className="tb-btn" onClick={() => openRepair("pathIssues")}>
                Repair Paths
              </button>
              <button className="tb-btn" onClick={handleExportMissing} disabled={missingTracks.length === 0}>
                Export CSV
              </button>
            </div>
            {missingTracks.length === 0 ? (
              <div className="ecp-empty">All External tracks have analysis data.</div>
            ) : (
              <div className="ecp-missing-list">
                {missingTracks.slice(0, 200).map((t) => (
                  <div key={t.trackId} className="ecp-missing-row">
                    <div className="ecp-missing-title">{t.title || t.filename || t.trackId}</div>
                    <div className="ecp-missing-meta">
                      {t.artist && <span className="ecp-muted">{t.artist}</span>}
                      {t.filePath ? (
                        <span className="ecp-path" title={t.filePath}>
                          {t.filePath.split("/").slice(-2).join("/")}
                        </span>
                      ) : (
                        <span className="ecp-cell--warn">no path</span>
                      )}
                    </div>
                    <div className="ecp-missing-fields">
                      {t.missingFields.map((f) => (
                        <span key={f} className="ecp-missing-field">{f}</span>
                      ))}
                      <span className="ecp-missing-reason ecp-muted">{t.reason}</span>
                    </div>
                  </div>
                ))}
                {missingTracks.length > 200 && (
                  <div className="ecp-muted ecp-truncated">
                    …and {missingTracks.length - 200} more — export CSV for full list
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Unmatched AudioLab Rows */}
        {activeTab === "unmatched" && (
          <div className="ecp-section">
            <div className="ecp-section-actions">
              <span className="ecp-section-count">
                {unmatchedRows.length > 0
                  ? `${unmatchedRows.length} rows from latest import didn't match any track`
                  : "No unmatched rows from latest import"}
              </span>
              {unmatchedRows.length > 0 && (
                <>
                  <button className="tb-btn" onClick={() => openRepair("unmatched")}>
                    Resolve Unmatched
                  </button>
                  <button className="tb-btn" onClick={handleExportUnmatched}>
                    Export CSV
                  </button>
                </>
              )}
            </div>
            {unmatchedRows.length === 0 ? (
              <div className="ecp-empty">
                {latestImport ? "All rows from the latest import were matched." : "No import yet. Use Fix Metadata → Import AudioLab CSV."}
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
                      <div className="ecp-path ecp-muted" title={r.filePath}>
                        {r.filePath.split("/").slice(-2).join("/")}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>

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
