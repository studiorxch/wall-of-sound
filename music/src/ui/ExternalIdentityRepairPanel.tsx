import { useState, useMemo } from "react";
import type { Track } from "../data/trackTypes";
import type { UnmatchedImportRow } from "../data/metadataSourceTypes";
import {
  detectExternalIdentityIssues,
  groupIdentityIssues,
  type ExternalIdentityIssue,
  type IssueGroup,
} from "../logic/externalIdentityIssues";
import {
  applyEditTitleArtist,
  applySetFilePath,
  applyAcceptFilenameParse,
  buildRepairedMissingManifestRows,
  exportRepairedManifestCsv,
  type ExternalIdentityRepairRecord,
} from "../logic/externalIdentityRepair";
import {
  DEFAULT_BATCH_FILTER,
  filterExternalIdentityIssues,
  sortExternalIdentityIssues,
  buildExternalIdentityBatchPreview,
  buildBatchRepairRecord,
  applyBatchChangesToTracks,
  undoLatestBatchRepair,
  computeIdentityCoverageDelta,
  type ExternalIdentityBatchFilterState,
  type ExternalIdentityBatchPreview,
  type ExternalIdentityBatchRepairRecord,
} from "../logic/externalIdentityBatchReview";
import { getTracksMissingAnalysis } from "../logic/externalCoverage";
import { downloadCsv } from "../logic/externalCoverage";
import type { CrateRecord } from "../data/crateTypes";

type Props = {
  externalTracks: Track[];
  libraryTracks: Track[];
  crates: CrateRecord[];
  unmatchedRows: UnmatchedImportRow[];
  repairHistory: ExternalIdentityRepairRecord[];
  batchRepairHistory: ExternalIdentityBatchRepairRecord[];
  ignoredIssueIds: string[];
  deferredIssueIds: string[];
  onApplyRepairs: (
    updatedTracks: Track[],
    newRecords: ExternalIdentityRepairRecord[],
    batchRecord?: ExternalIdentityBatchRepairRecord,
  ) => void;
  onUpdateBatchHistory: (next: ExternalIdentityBatchRepairRecord[]) => void;
  onIgnoreIssue: (issueId: string) => void;
  onDeferIssue: (issueId: string) => void;
  onClose: () => void;
  initialTab?: IssueTabKey;
};

type IssueTabKey = "blocking" | "warnings" | "titleArtist" | "pathIssues" | "unmatched" | "deferred";

const TABS: { key: IssueTabKey; label: (g: IssueGroup) => string }[] = [
  { key: "blocking",    label: (g) => `Blocking (${g.blocking.length})` },
  { key: "warnings",    label: (g) => `Warnings (${g.warnings.length})` },
  { key: "titleArtist", label: (g) => `Title/Artist (${g.titleArtist.length})` },
  { key: "pathIssues",  label: (g) => `Path Issues (${g.pathIssues.length})` },
  { key: "unmatched",   label: (g) => `Unmatched (${g.unmatched.length})` },
  { key: "deferred",    label: (g) => `Deferred (${g.deferred.length})` },
];

function SeverityChip({ severity }: { severity: string }) {
  const cls = severity === "blocking" ? "eip-sev--block" : severity === "warning" ? "eip-sev--warn" : "eip-sev--info";
  return <span className={`eip-sev ${cls}`}>{severity === "blocking" ? "BLOCK" : severity === "warning" ? "WARN" : "INFO"}</span>;
}

function ConfChip({ conf }: { conf?: string }) {
  if (!conf) return null;
  return <span className={`eip-conf eip-conf--${conf}`}>{conf}</span>;
}

type EditState = { issueId: string; field: "title_artist" | "file_path"; title: string; artist: string; filePath: string };

// ── Batch Preview Modal ───────────────────────────────────────────────────────

function BatchPreviewModal({
  preview,
  onApply,
  onCancel,
}: {
  preview: ExternalIdentityBatchPreview;
  onApply: () => void;
  onCancel: () => void;
}) {
  // Group changes by artist for display
  const byArtist = new Map<string, number>();
  for (const c of preview.changes) {
    if (c.field === "artist") byArtist.set(c.after, (byArtist.get(c.after) ?? 0) + 1);
  }
  const artistEntries = [...byArtist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

  return (
    <div className="eip-modal-overlay">
      <div className="eip-modal">
        <div className="eip-modal-title">Apply {preview.selectedIssues} selected suggestions?</div>
        <div className="eip-modal-body">
          <div className="eip-preview-counts">
            <span className="eip-preview-ok">{preview.changes.length} changes ready</span>
            {preview.blockedChanges.length > 0 && (
              <span className="eip-preview-blocked">{preview.blockedChanges.length} blocked</span>
            )}
          </div>
          {artistEntries.length > 0 && (
            <div className="eip-preview-section">
              <div className="eip-preview-label">Artist fills:</div>
              {artistEntries.map(([artist, count]) => (
                <div key={artist} className="eip-preview-row">
                  <span className="eip-muted">blank</span>
                  <span className="eip-preview-arrow">→</span>
                  <strong>{artist}</strong>
                  <span className="eip-muted eip-preview-count">{count} tracks</span>
                </div>
              ))}
            </div>
          )}
          {preview.blockedChanges.length > 0 && (
            <div className="eip-preview-section eip-preview-blocked-list">
              <div className="eip-preview-label">Blocked:</div>
              {preview.blockedChanges.slice(0, 5).map((b, i) => (
                <div key={i} className="eip-preview-row eip-muted">
                  {b.reason.replace(/_/g, " ")} — {b.before} → {b.attemptedAfter}
                </div>
              ))}
              {preview.blockedChanges.length > 5 && (
                <div className="eip-muted">…and {preview.blockedChanges.length - 5} more</div>
              )}
            </div>
          )}
        </div>
        <div className="eip-modal-actions">
          <button className="tb-btn" onClick={onApply} disabled={preview.changes.length === 0}>
            Apply {preview.changes.length} changes
          </button>
          <button className="tb-btn eip-btn-muted" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Batch Result Card ─────────────────────────────────────────────────────────

function BatchResultCard({
  record,
  delta,
  canUndo,
  onUndo,
  onExportManifest,
  onDismiss,
}: {
  record: ExternalIdentityBatchRepairRecord;
  delta: { artistBefore: number; artistAfter: number; titleBefore: number; titleAfter: number; total: number };
  canUndo: boolean;
  onUndo: () => void;
  onExportManifest: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="eip-result-card">
      <div className="eip-result-header">
        <span className="eip-result-title">Batch identity repair complete</span>
        <button className="eip-result-dismiss" onClick={onDismiss}>✕</button>
      </div>
      <div className="eip-result-stats">
        <div className="eip-result-stat"><span className="eip-muted">Selected</span> {record.selectedIssueCount}</div>
        <div className="eip-result-stat"><span className="eip-ok">Applied</span> {record.appliedChangeCount}</div>
        {record.blockedChangeCount > 0 && (
          <div className="eip-result-stat"><span className="eip-warn">Blocked</span> {record.blockedChangeCount}</div>
        )}
        <div className="eip-result-stat"><span className="eip-muted">Tracks</span> {record.affectedTrackIds.length}</div>
      </div>
      <div className="eip-result-delta">
        <span className="eip-muted">Artist:</span>
        {" "}{delta.artistBefore}/{delta.total}
        <span className="eip-preview-arrow"> → </span>
        <strong className="eip-ok">{delta.artistAfter}/{delta.total}</strong>
      </div>
      <div className="eip-result-actions">
        {canUndo && <button className="tb-btn eip-btn-sm" onClick={onUndo}>Undo Latest Batch</button>}
        <button className="tb-btn eip-btn-sm" onClick={onExportManifest}>Export Repaired Manifest</button>
      </div>
    </div>
  );
}

// ── Title/Artist Batch Tab ────────────────────────────────────────────────────

function TitleArtistBatchTab({
  allIssues,
  externalTracks,
  libraryTracks,
  crates,
  repairHistory,
  batchRepairHistory,
  ignoredIssueIds,
  deferredIssueIds: _deferredIssueIds,
  onApplyRepairs,
  onUpdateBatchHistory,
  onIgnoreMultiple,
}: {
  allIssues: ExternalIdentityIssue[];
  externalTracks: Track[];
  libraryTracks: Track[];
  crates: CrateRecord[];
  repairHistory: ExternalIdentityRepairRecord[];
  batchRepairHistory: ExternalIdentityBatchRepairRecord[];
  ignoredIssueIds: string[];
  deferredIssueIds: string[];
  onApplyRepairs: Props["onApplyRepairs"];
  onUpdateBatchHistory: Props["onUpdateBatchHistory"];
  onIgnoreMultiple: (ids: string[]) => void;
}) {
  const [filter, setFilter] = useState<ExternalIdentityBatchFilterState>(DEFAULT_BATCH_FILTER);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showPreview, setShowPreview] = useState(false);
  const [latestBatchResult, setLatestBatchResult] = useState<{
    record: ExternalIdentityBatchRepairRecord;
    delta: ReturnType<typeof computeIdentityCoverageDelta>;
  } | null>(null);

  const ignoredSet = useMemo(() => new Set(ignoredIssueIds), [ignoredIssueIds]);
  const trackById = useMemo(() => new Map(externalTracks.map((t) => [t.trackId, t])), [externalTracks]);

  const TITLE_ARTIST_TYPES = new Set(["blank_title", "blank_artist", "bad_filename_parse", "numeric_filename"]);
  const taIssues = useMemo(
    () => allIssues.filter((i) => TITLE_ARTIST_TYPES.has(i.issueType)),
    [allIssues],
  );

  const visible = useMemo(() => {
    const filtered = filterExternalIdentityIssues(taIssues, filter, ignoredSet);
    return sortExternalIdentityIssues(filtered, filter.sortBy);
  }, [taIssues, filter, ignoredSet]);

  const preview = useMemo(
    () => buildExternalIdentityBatchPreview(selected, taIssues, visible, trackById),
    [selected, taIssues, visible, trackById],
  );

  const missingTracks = useMemo(
    () => getTracksMissingAnalysis(externalTracks, crates, libraryTracks),
    [externalTracks, crates, libraryTracks],
  );

  // Unique artist suggestions for filter dropdown
  const artistSuggestions = useMemo(() => {
    const s = new Set(taIssues.map((i) => i.suggestedArtist).filter(Boolean) as string[]);
    return [...s].sort();
  }, [taIssues]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAllVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      visible.forEach((i) => next.add(i.issueId));
      return next;
    });
  }

  function selectHighConfVisible() {
    setSelected((prev) => {
      const next = new Set(prev);
      visible.filter((i) => i.confidence === "high").forEach((i) => next.add(i.issueId));
      return next;
    });
  }

  function clearSelection() { setSelected(new Set()); }

  function handleApplySelected() {
    const nextTracks = applyBatchChangesToTracks(externalTracks, preview.changes);
    const batchRecord = buildBatchRepairRecord(preview, "accept_filename_parse_selected");
    const repairRecords: ExternalIdentityRepairRecord[] = preview.changes.map((c) => ({
      repairId: `${batchRecord.batchId}-${c.trackId}-${c.field}`,
      repairedAt: batchRecord.appliedAt,
      trackId: c.trackId,
      issueType: "blank_artist",
      action: "accept_filename_parse",
      before: { [c.field]: c.before },
      after: { [c.field]: c.after },
      source: "filename_parse",
    }));
    const delta = computeIdentityCoverageDelta(
      externalTracks.map((t) => ({ ...t, sourceOwner: "external" as const })),
      nextTracks.map((t) => ({ ...t, sourceOwner: "external" as const })),
    );
    // Mark applied issues as ignored
    const appliedIssueIds = [...new Set(preview.changes.map((c) => c.issueId))];
    onIgnoreMultiple(appliedIssueIds);
    onApplyRepairs(nextTracks, repairRecords, batchRecord);
    setLatestBatchResult({ record: batchRecord, delta });
    setSelected(new Set());
    setShowPreview(false);
  }

  function handleIgnoreSelected() {
    onIgnoreMultiple([...selected]);
    setSelected(new Set());
  }

  function handleUndoLatest() {
    const result = undoLatestBatchRepair(externalTracks, batchRepairHistory, repairHistory);
    if (result.undoneCount === 0) return;
    const repairRecords: ExternalIdentityRepairRecord[] = [{
      repairId: `undo-${Date.now().toString(36)}`,
      repairedAt: new Date().toISOString(),
      trackId: undefined,
      issueType: "blank_artist",
      action: "edit_title_artist",
      before: {},
      after: {},
      source: "manual",
    }];
    onApplyRepairs(result.updatedTracks, repairRecords);
    onUpdateBatchHistory(result.updatedBatchHistory);
    setLatestBatchResult(null);
  }

  function handleExportManifest() {
    const rows = buildRepairedMissingManifestRows(missingTracks, repairHistory);
    const csv = exportRepairedManifestCsv(rows);
    downloadCsv(csv, "music_external_repaired_missing.csv");
  }

  const latestUndoable = batchRepairHistory.find((b) => !b.undoneAt);

  return (
    <div className="eip-ta-tab">
      {/* Latest batch result card */}
      {latestBatchResult && (
        <BatchResultCard
          record={latestBatchResult.record}
          delta={latestBatchResult.delta}
          canUndo={!!latestUndoable}
          onUndo={handleUndoLatest}
          onExportManifest={handleExportManifest}
          onDismiss={() => setLatestBatchResult(null)}
        />
      )}

      {/* Filter bar */}
      <div className="eip-filter-bar">
        <select
          className="eip-select"
          value={filter.confidence}
          onChange={(e) => setFilter({ ...filter, confidence: e.target.value as ExternalIdentityBatchFilterState["confidence"] })}
        >
          <option value="all">All confidence</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          className="eip-select"
          value={filter.issueType}
          onChange={(e) => setFilter({ ...filter, issueType: e.target.value as ExternalIdentityBatchFilterState["issueType"] })}
        >
          <option value="all">All types</option>
          <option value="blank_artist">Blank artist</option>
          <option value="blank_title">Blank title</option>
          <option value="bad_filename_parse">Bad parse</option>
          <option value="numeric_filename">Numeric filename</option>
        </select>
        <select
          className="eip-select"
          value={filter.suggestedArtist}
          onChange={(e) => setFilter({ ...filter, suggestedArtist: e.target.value })}
        >
          <option value="">All artists</option>
          {artistSuggestions.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <select
          className="eip-select"
          value={filter.sortBy}
          onChange={(e) => setFilter({ ...filter, sortBy: e.target.value as ExternalIdentityBatchFilterState["sortBy"] })}
        >
          <option value="suggested_artist">Sort: artist</option>
          <option value="confidence">Sort: confidence</option>
          <option value="filename">Sort: filename</option>
          <option value="track_title">Sort: title</option>
        </select>
      </div>

      {/* Batch action bar */}
      <div className="eip-batch-action-bar">
        <span className="eip-muted eip-ta-count">{visible.length} visible · {selected.size} selected</span>
        <button className="tb-btn eip-btn-sm" onClick={selectAllVisible} disabled={visible.length === 0}>Select all</button>
        <button className="tb-btn eip-btn-sm" onClick={selectHighConfVisible}>High conf</button>
        <button className="tb-btn eip-btn-sm eip-btn-muted" onClick={clearSelection} disabled={selected.size === 0}>Clear</button>
        <button
          className="tb-btn eip-btn-sm"
          disabled={selected.size === 0 || preview.changes.length === 0}
          onClick={() => setShowPreview(true)}
        >
          Apply selected ({preview.changes.length})
        </button>
        <button
          className="tb-btn eip-btn-sm eip-btn-muted"
          disabled={selected.size === 0}
          onClick={handleIgnoreSelected}
        >
          Ignore selected
        </button>
        {latestUndoable && !latestBatchResult && (
          <button className="tb-btn eip-btn-sm eip-btn-muted" onClick={handleUndoLatest}>
            Undo latest batch
          </button>
        )}
      </div>

      {/* Table */}
      {visible.length === 0 ? (
        <div className="eip-empty">No issues match the current filters.</div>
      ) : (
        <div className="eip-ta-table-wrap">
          <table className="eip-ta-table">
            <thead>
              <tr>
                <th className="eip-ta-th-check">
                  <input
                    type="checkbox"
                    checked={visible.length > 0 && visible.every((i) => selected.has(i.issueId))}
                    onChange={(e) => e.target.checked ? selectAllVisible() : clearSelection()}
                  />
                </th>
                <th>Conf</th>
                <th>Type</th>
                <th>Track</th>
                <th>Filename</th>
                <th>Suggestion</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((issue) => {
                const sel = selected.has(issue.issueId);
                return (
                  <tr
                    key={issue.issueId}
                    className={`eip-ta-row${sel ? " eip-ta-row--selected" : ""}`}
                    onClick={() => toggleSelect(issue.issueId)}
                  >
                    <td onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={sel} onChange={() => toggleSelect(issue.issueId)} />
                    </td>
                    <td><ConfChip conf={issue.confidence} /></td>
                    <td className="eip-muted eip-ta-type">{issue.issueType.replace(/_/g, " ")}</td>
                    <td className="eip-ta-track">
                      <div>{issue.title || <span className="eip-muted">(no title)</span>}</div>
                      {issue.artist && <div className="eip-muted eip-ta-artist">{issue.artist}</div>}
                    </td>
                    <td className="eip-ta-filename eip-muted">{issue.filename}</td>
                    <td className="eip-ta-suggestion">
                      {issue.suggestedArtist && (
                        <div>
                          <span className="eip-muted">artist: </span>
                          <span className="eip-before">{issue.artist || "—"}</span>
                          <span className="eip-preview-arrow"> → </span>
                          <strong>{issue.suggestedArtist}</strong>
                        </div>
                      )}
                      {issue.suggestedTitle && (
                        <div>
                          <span className="eip-muted">title: </span>
                          <span className="eip-before">{issue.title || "—"}</span>
                          <span className="eip-preview-arrow"> → </span>
                          <strong>{issue.suggestedTitle}</strong>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Preview modal */}
      {showPreview && (
        <BatchPreviewModal
          preview={preview}
          onApply={handleApplySelected}
          onCancel={() => setShowPreview(false)}
        />
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function ExternalIdentityRepairPanel({
  externalTracks,
  libraryTracks,
  crates,
  unmatchedRows,
  repairHistory,
  batchRepairHistory,
  ignoredIssueIds,
  deferredIssueIds,
  onApplyRepairs,
  onUpdateBatchHistory,
  onIgnoreIssue,
  onDeferIssue,
  onClose,
  initialTab = "blocking",
}: Props) {
  const [activeTab, setActiveTab] = useState<IssueTabKey>(initialTab);
  const [editState, setEditState] = useState<EditState | null>(null);
  const [unmatchedAssignSearch, setUnmatchedAssignSearch] = useState<{ issueId: string; query: string } | null>(null);

  const ignoredSet = useMemo(() => new Set(ignoredIssueIds), [ignoredIssueIds]);
  const deferredSet = useMemo(() => new Set(deferredIssueIds), [deferredIssueIds]);

  const allIssues = useMemo(
    () => detectExternalIdentityIssues(externalTracks, unmatchedRows),
    [externalTracks, unmatchedRows],
  );

  const groups = useMemo(
    () => groupIdentityIssues(allIssues, ignoredSet, deferredSet),
    [allIssues, ignoredSet, deferredSet],
  );

  const missingTracks = useMemo(
    () => getTracksMissingAnalysis(externalTracks, crates, libraryTracks),
    [externalTracks, crates, libraryTracks],
  );

  const trackById = useMemo(
    () => new Map(externalTracks.map((t) => [t.trackId, t])),
    [externalTracks],
  );

  const activeIssues: ExternalIdentityIssue[] = groups[activeTab] ?? [];
  const totalActive = groups.blocking.length + groups.warnings.length + groups.titleArtist.length +
    groups.pathIssues.length + groups.unmatched.length;

  function handleIgnoreMultiple(ids: string[]) {
    ids.forEach((id) => onIgnoreIssue(id));
  }

  function handleAcceptFilename(issue: ExternalIdentityIssue) {
    const track = issue.trackId ? trackById.get(issue.trackId) : undefined;
    if (!track) return;
    const { updatedTrack, record } = applyAcceptFilenameParse(track, issue.suggestedTitle, issue.suggestedArtist);
    onApplyRepairs([updatedTrack], [record]);
    onIgnoreIssue(issue.issueId);
  }

  function handleSaveEdit(issue: ExternalIdentityIssue) {
    if (!editState) return;
    const track = issue.trackId ? trackById.get(issue.trackId) : undefined;
    if (editState.field === "title_artist" && track) {
      const { updatedTrack, record } = applyEditTitleArtist(track, editState.title, editState.artist);
      onApplyRepairs([updatedTrack], [record]);
      onIgnoreIssue(issue.issueId);
    } else if (editState.field === "file_path" && track) {
      const { updatedTrack, record } = applySetFilePath(track, editState.filePath);
      onApplyRepairs([updatedTrack], [record]);
      onIgnoreIssue(issue.issueId);
    }
    setEditState(null);
  }

  function handleMarkReference(issue: ExternalIdentityIssue) {
    const track = issue.trackId ? trackById.get(issue.trackId) : undefined;
    if (!track) return;
    const { updatedTrack, record } = { updatedTrack: { ...track, sourceOwner: "reference" as const }, record: { repairId: `ref-${Date.now()}`, repairedAt: new Date().toISOString(), trackId: track.trackId, issueType: "wrong_owner" as const, action: "mark_reference" as const, before: { sourceOwner: track.sourceOwner }, after: { sourceOwner: "reference" }, source: "manual" as const } };
    onApplyRepairs([updatedTrack], [record]);
    onIgnoreIssue(issue.issueId);
  }

  function handleAssignUnmatchedRow(issue: ExternalIdentityIssue, targetTrack: Track) {
    const { updatedTrack, record } = applyEditTitleArtist(
      targetTrack,
      issue.suggestedTitle || targetTrack.title,
      issue.suggestedArtist || targetTrack.artist,
    );
    const withPath = issue.filePath
      ? applySetFilePath(updatedTrack, issue.filePath)
      : { updatedTrack, record };
    onApplyRepairs([withPath.updatedTrack], [record, withPath.record]);
    onIgnoreIssue(issue.issueId);
    setUnmatchedAssignSearch(null);
  }

  function handleExportManifest() {
    const rows = buildRepairedMissingManifestRows(missingTracks, repairHistory);
    const csv = exportRepairedManifestCsv(rows);
    downloadCsv(csv, "music_external_repaired_missing.csv");
  }

  function renderIssueActions(issue: ExternalIdentityIssue) {
    const track = issue.trackId ? trackById.get(issue.trackId) : undefined;
    const isEditing = editState?.issueId === issue.issueId;

    if (issue.issueType === "unmatched_audiolab_row") {
      const searching = unmatchedAssignSearch?.issueId === issue.issueId;
      return (
        <div className="eip-actions">
          {!searching ? (
            <>
              <button className="tb-btn eip-btn-sm" onClick={() => setUnmatchedAssignSearch({ issueId: issue.issueId, query: "" })}>Assign to track</button>
              <button className="tb-btn eip-btn-sm eip-btn-muted" onClick={() => onIgnoreIssue(issue.issueId)}>Ignore</button>
            </>
          ) : (
            <div className="eip-assign-search">
              <input className="eip-input" placeholder="Search by title or artist…" value={unmatchedAssignSearch.query} autoFocus onChange={(e) => setUnmatchedAssignSearch({ ...unmatchedAssignSearch, query: e.target.value })} />
              <div className="eip-assign-results">
                {externalTracks.filter((t) => { const q = unmatchedAssignSearch.query.toLowerCase(); return !q || t.title?.toLowerCase().includes(q) || t.artist?.toLowerCase().includes(q); }).slice(0, 8).map((t) => (
                  <button key={t.trackId} className="eip-assign-result" onClick={() => handleAssignUnmatchedRow(issue, t)}>
                    <span className="eip-result-title">{t.title || "(no title)"}</span>
                    {t.artist && <span className="eip-result-artist eip-muted"> — {t.artist}</span>}
                  </button>
                ))}
              </div>
              <button className="tb-btn eip-btn-sm eip-btn-muted" onClick={() => setUnmatchedAssignSearch(null)}>Cancel</button>
            </div>
          )}
        </div>
      );
    }

    if (issue.issueType === "missing_file_path" || issue.issueType === "file_not_found") {
      const editing = isEditing && editState?.field === "file_path";
      return (
        <div className="eip-actions">
          {editing ? (
            <div className="eip-edit-row">
              <input className="eip-input eip-input--wide" placeholder="/path/to/audio/file.mp3" value={editState.filePath} autoFocus onChange={(e) => setEditState({ ...editState, filePath: e.target.value })} />
              <button className="tb-btn eip-btn-sm" disabled={!editState.filePath.trim()} onClick={() => handleSaveEdit(issue)}>Save</button>
              <button className="tb-btn eip-btn-sm eip-btn-muted" onClick={() => setEditState(null)}>Cancel</button>
            </div>
          ) : (
            <>
              <button className="tb-btn eip-btn-sm" onClick={() => setEditState({ issueId: issue.issueId, field: "file_path", title: track?.title ?? "", artist: track?.artist ?? "", filePath: track?.filePath ?? "" })}>Set path</button>
              {track && <button className="tb-btn eip-btn-sm eip-btn-muted" onClick={() => handleMarkReference(issue)}>Mark Reference</button>}
              <button className="tb-btn eip-btn-sm eip-btn-muted" onClick={() => onDeferIssue(issue.issueId)}>Defer</button>
            </>
          )}
        </div>
      );
    }

    if (["blank_title", "blank_artist", "bad_filename_parse"].includes(issue.issueType)) {
      const hasSuggestion = !!(issue.suggestedTitle || issue.suggestedArtist);
      const editing = isEditing && editState?.field === "title_artist";
      return (
        <div className="eip-actions">
          {hasSuggestion && issue.confidence !== "low" && (
            <button className="tb-btn eip-btn-sm" onClick={() => handleAcceptFilename(issue)}>Accept</button>
          )}
          {editing ? (
            <div className="eip-edit-row">
              <input className="eip-input" placeholder="Title" value={editState.title} autoFocus onChange={(e) => setEditState({ ...editState, title: e.target.value })} />
              <input className="eip-input" placeholder="Artist" value={editState.artist} onChange={(e) => setEditState({ ...editState, artist: e.target.value })} />
              <button className="tb-btn eip-btn-sm" onClick={() => handleSaveEdit(issue)}>Save</button>
              <button className="tb-btn eip-btn-sm eip-btn-muted" onClick={() => setEditState(null)}>Cancel</button>
            </div>
          ) : (
            <button className="tb-btn eip-btn-sm eip-btn-muted" onClick={() => setEditState({ issueId: issue.issueId, field: "title_artist", title: track?.title ?? "", artist: track?.artist ?? "", filePath: "" })}>Edit</button>
          )}
          <button className="tb-btn eip-btn-sm eip-btn-muted" onClick={() => onIgnoreIssue(issue.issueId)}>Ignore</button>
        </div>
      );
    }

    return (
      <div className="eip-actions">
        <button className="tb-btn eip-btn-sm eip-btn-muted" onClick={() => onIgnoreIssue(issue.issueId)}>Ignore</button>
        <button className="tb-btn eip-btn-sm eip-btn-muted" onClick={() => onDeferIssue(issue.issueId)}>Defer</button>
      </div>
    );
  }

  function renderIssueRow(issue: ExternalIdentityIssue) {
    return (
      <div key={issue.issueId} className="eip-issue-row">
        <div className="eip-issue-header">
          <SeverityChip severity={issue.severity} />
          <span className="eip-issue-type">{issue.issueType.replace(/_/g, " ")}</span>
          <ConfChip conf={issue.confidence} />
        </div>
        <div className="eip-issue-identity">
          {issue.title || issue.artist ? (
            <><span className="eip-identity-title">{issue.title || "(no title)"}</span>{issue.artist && <span className="eip-muted"> — {issue.artist}</span>}</>
          ) : issue.filename ? <span className="eip-identity-filename">{issue.filename}</span> : null}
        </div>
        {issue.filePath && <div className="eip-issue-path eip-muted" title={issue.filePath}>{issue.filePath.split("/").slice(-2).join("/")}</div>}
        {(issue.suggestedTitle || issue.suggestedArtist) && (
          <div className="eip-suggestion">
            {issue.suggestedTitle && <span>Title: <strong>{issue.suggestedTitle}</strong></span>}
            {issue.suggestedArtist && <span>Artist: <strong>{issue.suggestedArtist}</strong></span>}
          </div>
        )}
        <div className="eip-reason eip-muted">{issue.reason}</div>
        {renderIssueActions(issue)}
      </div>
    );
  }

  return (
    <div className="cmp-overlay">
      <div className="cmp-panel eip-panel">
        <div className="cmp-header">
          <span className="cmp-title">Identity Repair Queue</span>
          <span className="eip-header-count eip-muted">{totalActive} issues</span>
          <button className="cmp-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Global batch bar */}
        <div className="eip-batch-bar">
          <button className="tb-btn eip-btn-sm" onClick={handleExportManifest}>Export Repaired Manifest</button>
        </div>

        {/* Tabs */}
        <div className="eip-tabs">
          {TABS.map(({ key, label }) => (
            <button key={key} className={`eip-tab${activeTab === key ? " eip-tab--active" : ""}`} onClick={() => setActiveTab(key)}>
              {label(groups)}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="eip-section">
          {activeTab === "titleArtist" ? (
            <TitleArtistBatchTab
              allIssues={allIssues}
              externalTracks={externalTracks}
              libraryTracks={libraryTracks}
              crates={crates}
              repairHistory={repairHistory}
              batchRepairHistory={batchRepairHistory}
              ignoredIssueIds={ignoredIssueIds}
              deferredIssueIds={deferredIssueIds}
              onApplyRepairs={onApplyRepairs}
              onUpdateBatchHistory={onUpdateBatchHistory}
              onIgnoreMultiple={handleIgnoreMultiple}
            />
          ) : activeIssues.length === 0 ? (
            <div className="eip-empty">{activeTab === "deferred" ? "No deferred issues." : "No issues in this category."}</div>
          ) : (
            <div className="eip-issue-list">{activeIssues.map((issue) => renderIssueRow(issue))}</div>
          )}
        </div>

        <div className="eip-footer">
          <span className="eip-muted">Repaired manifest → run</span>
          <code className="eip-footer-cmd">--manifest music_external_repaired_missing.csv</code>
        </div>
      </div>
    </div>
  );
}
