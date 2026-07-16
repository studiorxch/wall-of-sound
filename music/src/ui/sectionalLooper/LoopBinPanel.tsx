// 0715C_MUSIC_Loop_Workspace_Editing_And_Revision_Completion §26-§31 —
// tabbed, filterable, sortable Loop Bin, replacing 0715B's single flat
// list. Row construction/filtering/sorting is pure logic
// (logic/loops/loopBinFilters.ts); this component only renders and wires
// callbacks.
//
// Row actions are the genuinely achievable subset for a browser-only app:
// Approved/Stale rows get select/preview/render/revise/archive/copy-path
// (no OS Finder access is possible from a browser — "Show in Finder" is
// deliberately NOT implemented rather than faked, matching 0714O's own
// disclosed download-only precedent). Suggestion rows get
// select/preview/approve/reject. Rejected rows get restore. "Regenerate" a
// stale candidate isn't wired per-row — candidate regeneration already
// exists at the grid level (0714T's "Regenerate Candidates" on grid
// change) and duplicating it per-row is out of this build's scope.

import type { LoopBinFilters, LoopBinRow, LoopBinSortKey, LoopBinTab, LoopBinViewState } from "../../data/loopTypes";
import { countsByTab, filterLoopBinRows, sortLoopBinRows } from "../../logic/loops/loopBinFilters";

const TABS: LoopBinTab[] = ["approved", "suggestions", "rejected", "stale"];
const TAB_LABELS: Record<LoopBinTab, string> = {
  approved: "Approved", suggestions: "Suggestions", rejected: "Rejected", stale: "Stale",
};
const SORT_KEYS: LoopBinSortKey[] = ["start_time", "length", "score", "created", "updated", "name"];

export interface LoopBinPanelProps {
  rows: LoopBinRow[];
  viewState: LoopBinViewState;
  onViewStateChange: (next: LoopBinViewState) => void;

  onSelectCandidate: (candidateIndex: number) => void;
  onPreviewCandidate: (candidateIndex: number) => void;
  onApproveCandidate: (candidateIndex: number) => void;
  onRejectCandidate: (candidateIndex: number) => void;
  onRestoreCandidate: (candidateIndex: number) => void;

  onLoadLoop: (loopId: string) => void;
  onPreviewLoop: (loopId: string) => void;
  onRenderLoop: (loopId: string) => void;
  onArchiveLoop: (loopId: string) => void;
  onReviseLoop: (loopId: string) => void;
  onCopyRenderedPath: (loopId: string) => void;

  renderingLoopIds: Set<string>;
  renderedPathByLoopId: Map<string, string | undefined>;
}

export function LoopBinPanel({
  rows, viewState, onViewStateChange,
  onSelectCandidate, onPreviewCandidate, onApproveCandidate, onRejectCandidate, onRestoreCandidate,
  onLoadLoop, onPreviewLoop, onRenderLoop, onArchiveLoop, onReviseLoop, onCopyRenderedPath,
  renderingLoopIds, renderedPathByLoopId,
}: LoopBinPanelProps) {
  const counts = countsByTab(rows);
  const filtered = filterLoopBinRows(rows, viewState.tab, viewState.filters);
  const sorted = sortLoopBinRows(filtered, viewState.sort);

  function setFilters(patch: Partial<LoopBinFilters>) {
    onViewStateChange({ ...viewState, filters: { ...viewState.filters, ...patch }, updatedAt: new Date().toISOString() });
  }

  function candidateIndexOf(row: LoopBinRow): number | null {
    if (row.candidateId == null) return null;
    const n = Number(row.candidateId);
    return Number.isFinite(n) ? n : null;
  }

  return (
    <div className="looper-loop-bin-panel">
      <div className="looper-loop-bin-tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={viewState.tab === tab}
            className={viewState.tab === tab ? "active" : ""}
            onClick={() => onViewStateChange({ ...viewState, tab, updatedAt: new Date().toISOString() })}
          >
            {TAB_LABELS[tab]} {counts[tab]}
          </button>
        ))}
      </div>

      <div className="looper-loop-bin-filters">
        <select value={viewState.filters.length ?? ""} onChange={(e) => setFilters({ length: e.target.value ? (e.target.value === "free" ? "free" : Number(e.target.value) as 4 | 8 | 16 | 32 | 64) : undefined })}>
          <option value="">Length: any</option>
          {[4, 8, 16, 32, 64].map((n) => <option key={n} value={n}>{n} bars</option>)}
          <option value="free">Free</option>
        </select>
        <select value={viewState.filters.mode ?? ""} onChange={(e) => setFilters({ mode: (e.target.value || undefined) as LoopBinFilters["mode"] })}>
          <option value="">Mode: any</option>
          <option value="trusted">Trusted</option>
          <option value="provisional">Provisional</option>
          <option value="time_based">Time-Based</option>
          <option value="manual">Manual</option>
        </select>
        <select value={viewState.filters.render ?? ""} onChange={(e) => setFilters({ render: (e.target.value || undefined) as LoopBinFilters["render"] })}>
          <option value="">Render: any</option>
          <option value="rendered">Rendered</option>
          <option value="not_rendered">Not Rendered</option>
          <option value="stale">Stale</option>
          <option value="missing">Missing</option>
        </select>
        <select value={viewState.filters.source ?? ""} onChange={(e) => setFilters({ source: (e.target.value || undefined) as LoopBinFilters["source"] })}>
          <option value="">Source: any</option>
          <option value="track">Track</option>
          <option value="stem">Stem</option>
        </select>
        <select value={viewState.sort} onChange={(e) => onViewStateChange({ ...viewState, sort: e.target.value as LoopBinSortKey, updatedAt: new Date().toISOString() })}>
          {SORT_KEYS.map((k) => <option key={k} value={k}>Sort: {k.replace("_", " ")}</option>)}
        </select>
      </div>

      <div className="looper-compact-list looper-loop-bin" role="table" aria-label={`${TAB_LABELS[viewState.tab]} loops`}>
        <div className="looper-compact-row looper-compact-header" role="row">
          <span>Title</span><span>Length</span><span>Section</span><span>Render</span><span>Actions</span>
        </div>
        {sorted.map((row) => {
          const candidateIndex = candidateIndexOf(row);
          return (
            <div key={row.id} className={`looper-compact-row is-${row.status}`} role="row">
              <span>
                {row.title}
                {(row.parentTrackTitle || row.revisionLabel) && (
                  <span className="looper-compact-row-hint">
                    {row.sourceKind === "stem" ? "Stem" : "Track"}
                    {row.parentTrackTitle ? ` · ${row.parentTrackTitle}` : ""}
                    {row.revisionLabel ? ` · ${row.revisionLabel}` : ""}
                  </span>
                )}
              </span>
              <span>{row.lengthLabel}</span>
              <span>{row.sectionLabel ?? "—"}</span>
              <span>{row.renderStatus ?? "—"}</span>
              <span className="looper-compact-actions">
                {row.status === "suggestion" && candidateIndex != null && (
                  <>
                    <button onClick={() => onSelectCandidate(candidateIndex)}>Select</button>
                    <button onClick={() => onPreviewCandidate(candidateIndex)}>▶</button>
                    <button onClick={() => onApproveCandidate(candidateIndex)}>✓</button>
                    <button onClick={() => onRejectCandidate(candidateIndex)}>✕</button>
                  </>
                )}
                {row.status === "rejected" && candidateIndex != null && (
                  <button onClick={() => onRestoreCandidate(candidateIndex)}>Restore</button>
                )}
                {(row.status === "approved" || row.status === "stale") && row.loopId && (
                  <>
                    <button onClick={() => onLoadLoop(row.loopId!)}>Select</button>
                    <button onClick={() => onPreviewLoop(row.loopId!)}>▶</button>
                    <button disabled={renderingLoopIds.has(row.loopId)} onClick={() => onRenderLoop(row.loopId!)}>
                      {renderingLoopIds.has(row.loopId) ? "Rendering…" : "Render"}
                    </button>
                    <button onClick={() => onReviseLoop(row.loopId!)}>Revise</button>
                    <button onClick={() => onArchiveLoop(row.loopId!)}>Archive</button>
                    {renderedPathByLoopId.get(row.loopId) && (
                      <button onClick={() => onCopyRenderedPath(row.loopId!)}>Copy Path</button>
                    )}
                  </>
                )}
              </span>
            </div>
          );
        })}
        {sorted.length === 0 && <div className="looper-compact-row looper-compact-empty" role="row"><span>Nothing in this tab.</span></div>}
      </div>
    </div>
  );
}
