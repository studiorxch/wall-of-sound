import React, { useState, useMemo, useRef } from "react";
import type { Track } from "../data/trackTypes";
import {
  buildTrackReadiness,
  summarizeMetadataReadiness,
  deriveTrustGrade,
  ESTIMATED_DURATION_FALLBACK,
  type MetadataReadinessSummary,
} from "../logic/metadataReadiness";
import {
  parseCsvText,
  parseJsonText,
  buildImportPreview,
  estimateEnergyFromBpm,
  type MetadataUpdate,
} from "../logic/metadataCsvImport";
import type {
  MetadataImportPreview,
  MetadataImportPreviewRow,
  MetadataImportRecord,
  FieldChangeClassification,
} from "../data/metadataSourceTypes";

type MetadataFilter =
  | "all"
  | "missing_duration"
  | "missing_bpm"
  | "missing_key"
  | "missing_energy"
  | "missing_path"
  | "needs_scoring"
  | "ready";

type Props = {
  tracks: Track[];
  poolName: string;
  onApplyUpdates: (updates: MetadataUpdate[]) => void;
  onApplyImportPreview: (
    preview: MetadataImportPreview,
    options: { selectedTrackIds?: Set<string>; forceConflictIds?: string[] }
  ) => MetadataImportRecord;
  onClose: () => void;
  lastImportRecord?: MetadataImportRecord;
};

function fmtDur(secs: number) {
  return `${Math.floor(secs / 60)}:${String(Math.round(secs % 60)).padStart(2, "0")}`;
}

function fmtFieldValue(field: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (field === "durationSeconds" && typeof value === "number") return fmtDur(value);
  if (field === "energy" && typeof value === "number") return value.toFixed(3);
  if (typeof value === "number") return String(value);
  return String(value);
}

const CLASSIFICATION_LABEL: Record<FieldChangeClassification, string> = {
  ADD_MISSING:         "ADD",
  REPLACE_ESTIMATE:    "REPLACE EST",
  UPDATE_WEAKER:       "UPDATE",
  KEEP_EXISTING:       "KEEP",
  OVERWRITE_STRONGER:  "OVERWRITE ⚠",
  CONFLICT:            "CONFLICT ⚠",
  HALF_DOUBLE_CONFLICT:"½×BPM ⚠",
  INVALID:             "INVALID ✕",
};

const CLASSIFICATION_CLS: Record<FieldChangeClassification, string> = {
  ADD_MISSING:          "cmp-chg--add",
  REPLACE_ESTIMATE:     "cmp-chg--replace",
  UPDATE_WEAKER:        "cmp-chg--update",
  KEEP_EXISTING:        "cmp-chg--keep",
  OVERWRITE_STRONGER:   "cmp-chg--overwrite",
  CONFLICT:             "cmp-chg--conflict",
  HALF_DOUBLE_CONFLICT: "cmp-chg--conflict",
  INVALID:              "cmp-chg--invalid",
};

const FILTERS: { id: MetadataFilter; label: string }[] = [
  { id: "all",              label: "All" },
  { id: "missing_duration", label: "Missing Duration" },
  { id: "missing_bpm",      label: "Missing BPM" },
  { id: "missing_key",      label: "Missing Key" },
  { id: "missing_energy",   label: "Missing Energy" },
  { id: "missing_path",     label: "Missing Path" },
  { id: "needs_scoring",    label: "Needs Scoring Metadata" },
  { id: "ready",            label: "Ready for Scoring" },
];

function applyFilter(tracks: Track[], filter: MetadataFilter): Track[] {
  switch (filter) {
    case "missing_duration": return tracks.filter((t) => (t.durationSeconds ?? 0) <= 0);
    case "missing_bpm":      return tracks.filter((t) => (t.bpm ?? 0) <= 0);
    case "missing_key":      return tracks.filter((t) => !t.camelotKey && !t.key);
    case "missing_energy":   return tracks.filter((t) => (t.energy ?? 0) <= 0);
    case "missing_path":     return tracks.filter((t) => !t.filePath && !t.audioFilename && !t.fileName);
    case "needs_scoring":    return tracks.filter((t) =>
      (t.durationSeconds ?? 0) <= 0 || (t.bpm ?? 0) <= 0 || (!t.camelotKey && !t.key) || (t.energy ?? 0) <= 0
    );
    case "ready": return tracks.filter((t) =>
      (t.durationSeconds ?? 0) > 0 && (t.bpm ?? 0) > 0 && (t.camelotKey || t.key) && (t.energy ?? 0) > 0
    );
    default: return tracks;
  }
}

function ReadinessBadge({ summary }: { summary: MetadataReadinessSummary }) {
  return (
    <span className={`cmp-status-badge cmp-status--${summary.status}`}>
      {summary.status.toUpperCase()}
    </span>
  );
}

export function CrateMetadataPanel({
  tracks,
  poolName,
  onApplyUpdates,
  onApplyImportPreview,
  onClose,
  lastImportRecord,
}: Props) {
  const [filter, setFilter] = useState<MetadataFilter>("all");
  const [richPreview, setRichPreview] = useState<MetadataImportPreview | null>(null);
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());
  const [forceConflictIds, setForceConflictIds] = useState<string[]>([]);
  const [importResult, setImportResult] = useState<MetadataImportRecord | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const summary = useMemo(() => summarizeMetadataReadiness(tracks), [tracks]);
  const trustGrade = deriveTrustGrade(summary);
  const filtered = useMemo(() => applyFilter(tracks, filter), [tracks, filter]);
  const energyEstimates = useMemo(() => estimateEnergyFromBpm(tracks), [tracks]);

  function showFlash(msg: string) {
    setFlash(msg);
    setTimeout(() => setFlash(null), 3000);
  }

  function handleBulkEstimateDuration() {
    const missing = tracks.filter((t) => (t.durationSeconds ?? 0) <= 0);
    if (missing.length === 0) { showFlash("No tracks are missing duration."); return; }
    const updates: MetadataUpdate[] = missing.map((t) => ({
      trackId: t.trackId,
      fields: { durationSeconds: ESTIMATED_DURATION_FALLBACK },
      matchedBy: "trackId",
    }));
    onApplyUpdates(updates);
    showFlash(`Applied 3:00 estimated duration to ${updates.length} tracks.`);
  }

  function handleEstimateEnergy() {
    if (energyEstimates.length === 0) { showFlash("No tracks eligible (need BPM, missing energy)."); return; }
    onApplyUpdates(energyEstimates);
    showFlash(`Estimated energy for ${energyEstimates.length} tracks from BPM.`);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const isJson = file.name.toLowerCase().endsWith(".json");
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = isJson ? parseJsonText(text) : parseCsvText(text) as Array<Record<string, unknown>>;
      const preview = buildImportPreview(rows, tracks, file.name, isJson ? "json" : "csv");
      setRichPreview(preview);
      setSelectedTrackIds(new Set(preview.rows.map((r) => r.trackId)));
      setForceConflictIds([]);
      setImportResult(null);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function handleApplyPreview() {
    if (!richPreview) return;
    const record = onApplyImportPreview(richPreview, {
      selectedTrackIds,
      forceConflictIds,
    });
    setImportResult(record);
    setRichPreview(null);
    showFlash(`Applied ${record.appliedFields} field updates to ${record.matchedRows} tracks.`);
  }

  function toggleRowExpand(id: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleForceConflict(trackId: string) {
    setForceConflictIds((prev) =>
      prev.includes(trackId) ? prev.filter((id) => id !== trackId) : [...prev, trackId]
    );
  }

  return (
    <div className="cmp-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="cmp-panel">
        {/* Header */}
        <div className="cmp-header">
          <div className="cmp-header-title">Metadata — {poolName}</div>
          <button className="cmp-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Readiness summary */}
        <div className="cmp-readiness-block">
          <div className="cmp-readiness-top">
            <ReadinessBadge summary={summary} />
            <span className="cmp-trust-grade">Trust: {trustGrade.toUpperCase()}</span>
          </div>
          <div className="cmp-readiness-fields">
            {[
              ["Duration", summary.durationCount],
              ["BPM", summary.bpmCount],
              ["Key", summary.keyCount],
              ["Energy", summary.energyCount],
              ["Paths", summary.filePathCount],
            ].map(([label, count]) => (
              <React.Fragment key={label as string}>
                <span className={(count as number) === summary.totalTracks ? "cmp-field-ok" : "cmp-field-weak"}>
                  {label} {count}/{summary.totalTracks}
                </span>
                <span className="cmp-field-sep">·</span>
              </React.Fragment>
            ))}
          </div>
          {summary.estimatedDurationCount > 0 && (
            <div className="cmp-estimated-note">{summary.estimatedDurationCount} tracks using estimated duration (3:00)</div>
          )}
          {(trustGrade === "excellent" || trustGrade === "usable") && (
            <div className="cmp-ready-note">Ready for trusted path scoring.</div>
          )}
          {trustGrade === "provisional" && (
            <div className="cmp-weak-note">Missing critical scoring fields — import AudioLab analysis to repair.</div>
          )}
        </div>

        {/* Import result card */}
        {(importResult ?? lastImportRecord) && (
          <ImportResultCard record={(importResult ?? lastImportRecord)!} summary={summary} />
        )}

        {/* Bulk actions */}
        <div className="cmp-actions">
          <span className="cmp-actions-label">Bulk Actions</span>
          <button className="tb-btn cmp-action-btn" onClick={handleBulkEstimateDuration}>
            Use 3:00 est for missing durations
          </button>
          {energyEstimates.length > 0 && (
            <button className="tb-btn cmp-action-btn" onClick={handleEstimateEnergy}>
              Estimate energy from BPM ({energyEstimates.length})
            </button>
          )}
          <button className="tb-btn cmp-action-btn" onClick={() => fileInputRef.current?.click()}>
            Import AudioLab CSV…
          </button>
          <button className="tb-btn cmp-action-btn" onClick={() => fileInputRef.current?.click()}>
            Import AudioLab JSON…
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.json,text/csv,application/json"
            style={{ display: "none" }}
            onChange={handleFile}
          />
        </div>

        {/* Flash */}
        {flash && <div className="cmp-flash">{flash}</div>}

        {/* Rich import preview */}
        {richPreview && (
          <RichImportPreview
            preview={richPreview}
            selectedTrackIds={selectedTrackIds}
            forceConflictIds={forceConflictIds}
            expandedRows={expandedRows}
            onToggleSelect={(id) => {
              const next = new Set(selectedTrackIds);
              next.has(id) ? next.delete(id) : next.add(id);
              setSelectedTrackIds(next);
            }}
            onToggleForceConflict={toggleForceConflict}
            onToggleExpand={toggleRowExpand}
            onApply={handleApplyPreview}
            onCancel={() => setRichPreview(null)}
          />
        )}

        {/* Filter chips */}
        {!richPreview && (
          <>
            <div className="cmp-filters">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  className={`tb-btn cmp-filter-btn${filter === f.id ? " cmp-filter-btn--active" : ""}`}
                  onClick={() => setFilter(f.id)}
                >
                  {f.label}
                  {f.id !== "all" && (
                    <span className="cmp-filter-count">{applyFilter(tracks, f.id).length}</span>
                  )}
                </button>
              ))}
            </div>

            {/* Track table */}
            <div className="cmp-table-wrap">
              {filtered.length === 0 ? (
                <div className="cmp-empty">
                  {filter === "ready" ? "All selected tracks have required scoring metadata." : "No tracks match this filter."}
                </div>
              ) : (
                <table className="cmp-table">
                  <thead>
                    <tr>
                      <th>Title</th><th>Artist</th><th>Duration</th><th>BPM</th>
                      <th>Key</th><th>Energy</th><th>Path</th><th>Missing</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((t) => {
                      const r = buildTrackReadiness(t);
                      const missing = [
                        !r.hasDuration && "Duration",
                        !r.hasBpm && "BPM",
                        !r.hasKey && "Key",
                        !r.hasEnergy && "Energy",
                        !r.hasFilePath && "Path",
                      ].filter(Boolean);
                      return (
                        <tr key={t.trackId} className={missing.length > 2 ? "cmp-row--weak" : ""}>
                          <td className="cmp-col-title">{t.title || "—"}</td>
                          <td className="cmp-col-artist">{t.artist || "—"}</td>
                          <td className="col-mono">
                            {r.hasDuration ? fmtDur(t.durationSeconds) : <span className="dur-estimated">3:00 est</span>}
                          </td>
                          <td className="col-mono">{r.hasBpm ? t.bpm : <span className="meta-missing">—</span>}</td>
                          <td className="col-mono">
                            {r.hasKey ? (t.camelotKey || t.key || "?") : <span className="meta-missing">—</span>}
                          </td>
                          <td className="col-mono">
                            {r.hasEnergy ? t.energy.toFixed(2) : <span className="meta-missing">—</span>}
                          </td>
                          <td className="col-mono">
                            {r.hasFilePath
                              ? <span className="cmp-path-ok" title={t.filePath ?? t.audioFilename ?? ""}>✓</span>
                              : <span className="meta-missing">—</span>}
                          </td>
                          <td className="cmp-col-missing">
                            {missing.length === 0
                              ? <span className="cmp-all-ok">✓ Ready</span>
                              : missing.join(", ")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Rich Import Preview ───────────────────────────────────────────────────────

function RichImportPreview({
  preview,
  selectedTrackIds,
  forceConflictIds,
  expandedRows,
  onToggleSelect,
  onToggleForceConflict,
  onToggleExpand,
  onApply,
  onCancel,
}: {
  preview: MetadataImportPreview;
  selectedTrackIds: Set<string>;
  forceConflictIds: string[];
  expandedRows: Set<string>;
  onToggleSelect: (id: string) => void;
  onToggleForceConflict: (id: string) => void;
  onToggleExpand: (id: string) => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  const { summary } = preview;
  const safeSelected = preview.rows.filter(
    (r) => selectedTrackIds.has(r.trackId) && r.safeChanges.length > 0
  ).length;

  return (
    <div className="cmp-rich-preview">
      <div className="cmp-rich-preview-header">
        <span className="cmp-csv-title">Import Preview — {preview.sourceFileName}</span>
        <button className="cmp-close-btn" onClick={onCancel}>✕</button>
      </div>

      {/* Summary stats */}
      <div className="cmp-rich-stats">
        <span className="cmp-stat">Matched <strong>{summary.matchedRows}</strong></span>
        <span className="cmp-stat-sep">·</span>
        <span className="cmp-stat">Unmatched <strong>{summary.unmatchedRows}</strong></span>
        <span className="cmp-stat-sep">·</span>
        <span className="cmp-stat cmp-stat--safe">Safe <strong>{summary.safeFields}</strong></span>
        {summary.conflictFields > 0 && <>
          <span className="cmp-stat-sep">·</span>
          <span className="cmp-stat cmp-stat--conflict">Conflicts <strong>{summary.conflictFields}</strong></span>
        </>}
        {summary.invalidFields > 0 && <>
          <span className="cmp-stat-sep">·</span>
          <span className="cmp-stat cmp-stat--invalid">Invalid <strong>{summary.invalidFields}</strong></span>
        </>}
      </div>

      {preview.errors.map((e, i) => (
        <div key={i} className="cmp-csv-error">{e}</div>
      ))}

      {/* Rows */}
      <div className="cmp-rich-rows">
        {preview.rows.map((row) => (
          <RichPreviewRow
            key={row.trackId}
            row={row}
            selected={selectedTrackIds.has(row.trackId)}
            forceConflict={forceConflictIds.includes(row.trackId)}
            expanded={expandedRows.has(row.trackId)}
            onToggleSelect={() => onToggleSelect(row.trackId)}
            onToggleForceConflict={() => onToggleForceConflict(row.trackId)}
            onToggleExpand={() => onToggleExpand(row.trackId)}
          />
        ))}
      </div>

      <div className="cmp-csv-footer">
        <button
          className="tb-btn ph-btn-primary"
          onClick={onApply}
          disabled={safeSelected === 0}
        >
          Apply Safe Updates ({safeSelected} tracks)
        </button>
        <button className="tb-btn" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function RichPreviewRow({
  row, selected, forceConflict, expanded,
  onToggleSelect, onToggleForceConflict, onToggleExpand,
}: {
  row: MetadataImportPreviewRow;
  selected: boolean;
  forceConflict: boolean;
  expanded: boolean;
  onToggleSelect: () => void;
  onToggleForceConflict: () => void;
  onToggleExpand: () => void;
}) {
  const hasConflicts = row.blockedChanges.some(
    (c) => c.classification === "CONFLICT" || c.classification === "HALF_DOUBLE_CONFLICT"
  );

  return (
    <div className={`cmp-rich-row${hasConflicts ? " cmp-rich-row--conflict" : ""}`}>
      <div className="cmp-rich-row-head">
        <input type="checkbox" checked={selected} onChange={onToggleSelect} />
        <span className="cmp-rich-match-badge">{row.matchedBy}</span>
        <span className="cmp-rich-track">{row.title || row.trackId}</span>
        <span className="cmp-rich-artist">{row.artist}</span>
        <span className="cmp-rich-changes-summary">
          {row.safeChanges.length > 0 && (
            <span className="cmp-badge cmp-badge--safe">{row.safeChanges.length} safe</span>
          )}
          {row.blockedChanges.length > 0 && (
            <span className="cmp-badge cmp-badge--blocked">{row.blockedChanges.length} blocked</span>
          )}
        </span>
        {hasConflicts && (
          <label className="cmp-force-label">
            <input type="checkbox" checked={forceConflict} onChange={onToggleForceConflict} />
            force
          </label>
        )}
        <button className="cmp-expand-btn" onClick={onToggleExpand}>
          {expanded ? "▲" : "▼"}
        </button>
      </div>
      {expanded && (
        <div className="cmp-rich-row-detail">
          {row.changes.map((c) => (
            <div key={c.field} className={`cmp-change-row ${CLASSIFICATION_CLS[c.classification]}`}>
              <span className="cmp-change-field">{c.field}</span>
              <span className="cmp-change-before">{fmtFieldValue(c.field, c.before)}</span>
              <span className="cmp-change-arrow">→</span>
              <span className="cmp-change-after">{fmtFieldValue(c.field, c.after)}</span>
              <span className={`cmp-change-cls ${CLASSIFICATION_CLS[c.classification]}`}>
                {CLASSIFICATION_LABEL[c.classification]}
              </span>
              <span className="cmp-change-src">{c.afterSource}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Import Result Card ────────────────────────────────────────────────────────

function ImportResultCard({
  record,
  summary,
}: {
  record: MetadataImportRecord;
  summary: MetadataReadinessSummary;
}) {
  const d = new Date(record.importedAt);
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return (
    <div className="cmp-import-result">
      <div className="cmp-import-result-title">
        Last import: <strong>{record.sourceFileName}</strong>
        <span className="cmp-import-result-date"> · {dateStr}</span>
      </div>
      <div className="cmp-import-result-stats">
        <span>Matched {record.matchedRows}/{record.totalRows}</span>
        <span className="cmp-field-sep">·</span>
        <span className="cmp-field-ok">Applied {record.appliedFields} fields</span>
        {record.skippedFields > 0 && <><span className="cmp-field-sep">·</span><span>Skipped {record.skippedFields}</span></>}
        {record.conflictFields > 0 && <><span className="cmp-field-sep">·</span><span className="cmp-field-weak">Conflicts {record.conflictFields}</span></>}
      </div>
      <div className="cmp-import-result-readiness">
        <ReadinessBadge summary={summary} />
        <span className="cmp-readiness-detail">
          Duration {summary.durationCount}/{summary.totalTracks}
          {" · "}BPM {summary.bpmCount}/{summary.totalTracks}
          {" · "}Key {summary.keyCount}/{summary.totalTracks}
          {" · "}Energy {summary.energyCount}/{summary.totalTracks}
        </span>
      </div>
    </div>
  );
}
