// RadioLoop Library Workspace (0717A) — the governed derived-material
// curation surface (build spec §5.1: NOT a track-catalog subsection).
// Reuses LoopLibraryView's exact CSS classes (loop-library-*) rather than
// introducing a parallel dashboard aesthetic (spec §9.1). Row population
// source is GET /radio-library-index — every RadioLoop ever promoted,
// retired included, session-independent (decision 5) — never
// /radio-manifest alone.

import { useEffect, useMemo, useState } from "react";
import type { Track } from "../../data/trackTypes";
import type { LoopAsset } from "../../data/loopTypes";
import type { RadioLoopFilterState, RadioLoopSortState, RadioLoopWorkspaceRow } from "../../data/radioWorkspaceTypes";
import type { UseRadioLoopAuditionResult } from "../../logic/radio/radioLoopAudition";
import { fetchWorkspaceRows } from "../../logic/radio/radioManifestClient";
import { resolveRadioLoopSource } from "../../logic/radio/radioSourceResolver";
import { applyWorkspaceQuery, withDetectedIssues } from "../../logic/radio/radioLoopQuery";
import { RadioLoopInspectorDialog } from "./RadioLoopInspectorDialog";
import { RadioLoopMetadataEditDialog } from "./RadioLoopMetadataEditDialog";
import { RadioLoopRetireDialog } from "./RadioLoopRetireDialog";

function fmtTime(seconds: number | undefined): string {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

const DEFAULT_FILTER: RadioLoopFilterState = { search: "", role: "all", status: "all", approval: "all", stemStatus: "all" };
const DEFAULT_SORT: RadioLoopSortState = { key: "radioLoopId", direction: "asc" };

type Props = {
  libraryTracks: Track[];
  loops: LoopAsset[];
  onOpenSourceLoop: (sourceTrackId: string) => void;
  audition: UseRadioLoopAuditionResult;
  // 0717B §9 — "Open RadioLoops" navigation target. Purely additive: no
  // change to load()/filtering/sorting when omitted.
  focusRadioLoopId?: string;
};

export function RadioLoopsWorkspace({ libraryTracks, loops, onOpenSourceLoop, audition, focusRadioLoopId }: Props) {
  const [rows, setRows] = useState<RadioLoopWorkspaceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadIssue, setLoadIssue] = useState<string | null>(null);
  const [filter, setFilter] = useState<RadioLoopFilterState>(DEFAULT_FILTER);
  const [sort, setSort] = useState<RadioLoopSortState>(DEFAULT_SORT);
  const [revealStatus, setRevealStatus] = useState<string | null>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);

  const [inspectRow, setInspectRow] = useState<RadioLoopWorkspaceRow | null>(null);
  const [editRow, setEditRow] = useState<RadioLoopWorkspaceRow | null>(null);
  const [retireRow, setRetireRow] = useState<RadioLoopWorkspaceRow | null>(null);

  // No setState call at the top of this function on purpose — the initial
  // mount effect below relies on `loading`'s own useState(true) default
  // instead of setting it synchronously within the effect body; only a
  // user-triggered refresh (triggerLoad) sets it explicitly beforehand.
  async function load() {
    const result = await fetchWorkspaceRows();
    const resolved = result.rows.map((row) => {
      const source = resolveRadioLoopSource(row.sourceTrackId, row.sourceLoopId, libraryTracks, loops);
      return withDetectedIssues({ ...row, source });
    });
    setRows(resolved);
    setLoadIssue(result.issues.length > 0 ? result.issues.map((i) => i.message).join("; ") : null);
    setLoading(false);
  }

  function triggerLoad() {
    setLoading(true);
    void load();
  }

  useEffect(() => {
    void load();
    // Stop and release RadioLoop audition when leaving the workspace.
    return () => audition.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(() => applyWorkspaceQuery(rows, filter, sort), [rows, filter, sort]);

  useEffect(() => {
    if (!focusRadioLoopId || rows.length === 0) return;
    if (!rows.some((r) => r.radioLoopId === focusRadioLoopId)) return;
    const el = document.getElementById(`radio-loop-row-${focusRadioLoopId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedId(focusRadioLoopId);
    const t = setTimeout(() => setHighlightedId(null), 2500);
    return () => clearTimeout(t);
  }, [focusRadioLoopId, rows]);

  async function togglePlay(row: RadioLoopWorkspaceRow) {
    const isThisPlaying = audition.state.radioLoopId === row.radioLoopId && audition.state.packageVersion === row.currentPackageVersion && audition.state.phase === "playing";
    if (isThisPlaying) { audition.stop(); return; }
    await audition.play(row.radioLoopId, row.currentPackageVersion);
  }

  function toggleSort(key: RadioLoopSortState["key"]) {
    setSort((prev) => (prev.key === key ? { key, direction: prev.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" }));
  }

  function sortIndicator(key: RadioLoopSortState["key"]): string {
    if (sort.key !== key) return "";
    return sort.direction === "asc" ? " ▲" : " ▼";
  }

  async function reveal(row: RadioLoopWorkspaceRow) {
    setRevealStatus(`Revealing ${row.radioLoopId}…`);
    try {
      const resp = await fetch("/radio-package-reveal", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ radioLoopId: row.radioLoopId, packageVersion: row.currentPackageVersion }),
      });
      const result = await resp.json();
      setRevealStatus(result.ok ? null : `Could not reveal package: ${result.reason ?? "unknown error"}`);
    } catch {
      setRevealStatus("Could not reveal package: request failed");
    }
  }

  if (!loading && rows.length === 0) {
    return (
      <div className="loop-library-root">
        <div className="loop-library-header"><h2>Published Loop Packages</h2></div>
        <div className="loop-library-empty" style={{ padding: 24 }}>
          <p>Published loop packages are created from approved loops.</p>
          <p>Open the Loop Library and choose <strong>Promote to Radio</strong> on an approved loop.</p>
          <p>This workspace populates automatically after a successful promotion.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="loop-library-root">
      <div className="loop-library-header">
        <h2>Published Loop Packages</h2>
        <input
          className="loop-library-search"
          placeholder="Search ID, title, source, role…"
          value={filter.search}
          onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
        />
        <select value={filter.status} onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value as RadioLoopFilterState["status"] }))}>
          <option value="all">All statuses</option>
          <option value="RADIO_READY">RADIO_READY</option>
          <option value="PUBLISHED">PUBLISHED</option>
          <option value="RETIRED">RETIRED</option>
        </select>
        <select value={filter.approval} onChange={(e) => setFilter((f) => ({ ...f, approval: e.target.value as RadioLoopFilterState["approval"] }))}>
          <option value="all">All approval</option>
          <option value="approved">Approved</option>
          <option value="unapproved">Unapproved</option>
        </select>
        <select value={filter.stemStatus} onChange={(e) => setFilter((f) => ({ ...f, stemStatus: e.target.value as RadioLoopFilterState["stemStatus"] }))}>
          <option value="all">All stems</option>
          <option value="available">Stems available</option>
          <option value="missing">No stems</option>
        </select>
        <button onClick={triggerLoad}>{loading ? "Loading…" : "Refresh"}</button>
        {revealStatus && <span className="loop-library-batch-status">{revealStatus}</span>}
        {loadIssue && <span className="loop-library-batch-status" style={{ color: "rgba(255,120,120,0.9)" }}>{loadIssue}</span>}
      </div>

      <table className="loop-library-table">
        <thead>
          <tr>
            <th onClick={() => toggleSort("radioLoopId")} style={{ cursor: "pointer" }} title="Sort">RadioLoop{sortIndicator("radioLoopId")}</th>
            <th>Source</th>
            <th>Version</th>
            <th onClick={() => toggleSort("status")} style={{ cursor: "pointer" }} title="Sort">Status{sortIndicator("status")}</th>
            <th onClick={() => toggleSort("durationSeconds")} style={{ cursor: "pointer" }} title="Sort">Duration{sortIndicator("durationSeconds")}</th>
            <th onClick={() => toggleSort("bpm")} style={{ cursor: "pointer" }} title="Sort">BPM{sortIndicator("bpm")}</th>
            <th>Key</th><th>Bars</th><th>Roles</th>
            <th onClick={() => toggleSort("energy")} style={{ cursor: "pointer" }} title="Sort">Energy{sortIndicator("energy")}</th>
            <th>Stability</th><th>Stems</th><th>Approval</th><th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((row) => {
            const isPlaying = audition.state.radioLoopId === row.radioLoopId && audition.state.packageVersion === row.currentPackageVersion && audition.state.phase === "playing";
            const isLoadingAudio = audition.state.radioLoopId === row.radioLoopId && audition.state.packageVersion === row.currentPackageVersion && audition.state.phase === "loading";
            const isRetired = row.status === "RETIRED";
            const legacyRoleWarning = row.issues.find((i) => i.code === "RADIO_WORKSPACE_LEGACY_ROLE");
            return (
              <tr
                key={`${row.radioLoopId}-v${row.currentPackageVersion}`}
                id={`radio-loop-row-${row.radioLoopId}`}
                className={`${legacyRoleWarning ? "loop-row-needs-review" : ""}${highlightedId === row.radioLoopId ? " radio-loop-row--focused" : ""}`}
              >
                <td>{row.radioLoopId}{row.workingTitle ? <div style={{ fontSize: 11, opacity: 0.7 }}>{row.workingTitle}</div> : null}</td>
                <td title={row.source.unresolvedReason}>{row.source.resolved ? row.source.displayName : "Unresolved source"}</td>
                <td>v{row.currentPackageVersion}{!row.isActiveInManifest && !isRetired ? " (pending)" : ""}</td>
                <td title={legacyRoleWarning?.message}>{row.status}{legacyRoleWarning ? " ⚠" : ""}</td>
                <td>{fmtTime(row.durationSeconds)}</td>
                <td>{row.bpm ? Math.round(row.bpm) : "—"}</td>
                <td>{row.key ?? "—"}</td>
                <td>{row.bars ?? "—"}</td>
                <td>{row.roles.join(", ") || "—"}</td>
                <td>{row.energy != null ? row.energy.toFixed(2) : "—"}</td>
                <td>{row.stability != null ? row.stability.toFixed(2) : "—"}</td>
                <td>{row.stemStatus}</td>
                <td>{row.publicUseApproved ? "Approved" : "Not approved"}</td>
                <td className="loop-library-actions">
                  <button disabled={isRetired} title={isRetired ? "Retired packages cannot be auditioned" : undefined} onClick={() => void togglePlay(row)}>
                    {isLoadingAudio ? "Loading…" : isPlaying ? "Stop" : "Play"}
                  </button>
                  <button disabled={!row.source.resolved} title={!row.source.resolved ? row.source.unresolvedReason : "Navigate to the source loop"} onClick={() => onOpenSourceLoop(row.sourceTrackId)}>
                    Open source
                  </button>
                  <button disabled={!row.source.resolved} title="Promoting new audio happens from the source loop's own Promote to Radio action" onClick={() => onOpenSourceLoop(row.sourceTrackId)}>
                    Promote new version
                  </button>
                  <button disabled={isRetired} title={isRetired ? "Cannot revise a retired RadioLoop's metadata" : undefined} onClick={() => setEditRow(row)}>
                    Edit metadata
                  </button>
                  <button onClick={() => setInspectRow(row)}>Inspect / compare</button>
                  <button onClick={() => void reveal(row)}>Reveal in Finder</button>
                  <button disabled={isRetired} title={isRetired ? "Already retired" : undefined} onClick={() => setRetireRow(row)}>
                    Retire
                  </button>
                </td>
              </tr>
            );
          })}
          {visible.length === 0 && (
            <tr><td colSpan={14} className="loop-library-empty">No published loop packages match the current filters.</td></tr>
          )}
        </tbody>
      </table>

      {inspectRow && <RadioLoopInspectorDialog row={inspectRow} onClose={() => setInspectRow(null)} />}
      {editRow && (
        <RadioLoopMetadataEditDialog
          row={editRow}
          onClose={() => setEditRow(null)}
          onSaved={() => { setEditRow(null); triggerLoad(); }}
        />
      )}
      {retireRow && (
        <RadioLoopRetireDialog
          row={retireRow}
          onClose={() => setRetireRow(null)}
          onRetired={() => { setRetireRow(null); triggerLoad(); }}
        />
      )}
    </div>
  );
}
