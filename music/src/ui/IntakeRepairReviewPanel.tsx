import { useState, useMemo } from "react";
import type { Track } from "../data/trackTypes";
import type { CrateRecord } from "../data/crateTypes";
import {
  buildIntakeRepairQueue,
  selectSafeRepairs,
  type IntakeRepairItem,
  type IntakeRepairKind,
  type IntakeRepairBatch,
} from "../logic/intakeRepairQueue";
import { applyIntakeRepairs, undoIntakeRepairBatch } from "../logic/intakeRepairApply";

type FilterKind = "all" | "safe" | "review" | "blocked" | "identity" | "trust" | "mood" | "source_role";

const KIND_LABELS: Record<IntakeRepairKind, string> = {
  identity_split: "Identity Split",
  track_number_cleanup: "Track # Cleanup",
  artist_fill: "Artist Fill",
  title_cleanup: "Title Cleanup",
  post_artist_title_cleanup: "Title Cleanup",
  analysis_trust_update: "Analysis Trust",
  mood_cluster_apply: "Mood / Cluster",
  source_role_review: "Source Role",
  readiness_refresh: "Readiness",
};

const KIND_CATEGORY: Record<IntakeRepairKind, FilterKind> = {
  identity_split: "identity",
  track_number_cleanup: "identity",
  artist_fill: "identity",
  title_cleanup: "identity",
  post_artist_title_cleanup: "identity",
  analysis_trust_update: "trust",
  mood_cluster_apply: "mood",
  source_role_review: "source_role",
  readiness_refresh: "all",
};

type Props = {
  tracks: Track[];
  crates: CrateRecord[];
  ignoredIds: string[];
  deferredIds: string[];
  latestBatch: IntakeRepairBatch | null;
  onApply: (updatedTracks: Track[], batch: IntakeRepairBatch, newIgnored: string[], newDeferred: string[]) => void;
  onUndo: (restoredTracks: Track[]) => void;
  onClose: () => void;
};

function RiskBadge({ risk }: { risk: IntakeRepairItem["risk"] }) {
  const cls = risk === "safe" ? "irp-risk--safe" : risk === "review" ? "irp-risk--review" : "irp-risk--blocked";
  return <span className={`irp-risk ${cls}`}>{risk}</span>;
}

function FieldDiff({ label, before, after }: { label: string; before: unknown; after: unknown }) {
  const bStr = Array.isArray(before) ? before.join(", ") : String(before ?? "—");
  const aStr = Array.isArray(after) ? after.join(", ") : String(after ?? "—");
  if (bStr === aStr) return null;
  return (
    <div className="irp-diff-row">
      <span className="irp-diff-field">{label}</span>
      <span className="irp-diff-before">{bStr || "—"}</span>
      <span className="irp-diff-arrow">→</span>
      <span className="irp-diff-after">{aStr || "—"}</span>
    </div>
  );
}

export function IntakeRepairReviewPanel({
  tracks, crates, ignoredIds, deferredIds, latestBatch,
  onApply, onUndo, onClose,
}: Props) {
  const [filter, setFilter] = useState<FilterKind>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [applyResult, setApplyResult] = useState<{ applied: number; blocked: number } | null>(null);
  const [pendingIgnored, setPendingIgnored] = useState<string[]>([]);
  const [pendingDeferred, setPendingDeferred] = useState<string[]>([]);

  const allIgnored = useMemo(() => new Set([...ignoredIds, ...pendingIgnored]), [ignoredIds, pendingIgnored]);
  const allDeferred = useMemo(() => new Set([...deferredIds, ...pendingDeferred]), [deferredIds, pendingDeferred]);

  const queue = useMemo(
    () => buildIntakeRepairQueue(tracks, crates, [...allIgnored], [...allDeferred]),
    [tracks, crates, allIgnored, allDeferred],
  );

  const filtered = useMemo(() => {
    return queue.filter(item => {
      if (item.status === "ignored" || allIgnored.has(item.repairId)) return false;
      if (filter === "all") return true;
      if (filter === "safe") return item.risk === "safe";
      if (filter === "review") return item.risk === "review";
      if (filter === "blocked") return item.risk === "blocked";
      return KIND_CATEGORY[item.kind] === filter;
    });
  }, [queue, filter, allIgnored]);

  const counts = useMemo(() => ({
    safe: queue.filter(i => i.risk === "safe" && !allIgnored.has(i.repairId)).length,
    review: queue.filter(i => i.risk === "review" && !allIgnored.has(i.repairId)).length,
    blocked: queue.filter(i => i.risk === "blocked" && !allIgnored.has(i.repairId)).length,
    identity: queue.filter(i => KIND_CATEGORY[i.kind] === "identity" && !allIgnored.has(i.repairId)).length,
    trust: queue.filter(i => KIND_CATEGORY[i.kind] === "trust" && !allIgnored.has(i.repairId)).length,
    mood: queue.filter(i => KIND_CATEGORY[i.kind] === "mood" && !allIgnored.has(i.repairId)).length,
  }), [queue, allIgnored]);

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function handleSelectSafe() {
    const safe = selectSafeRepairs(filtered);
    setSelected(new Set(safe));
  }

  function handleApply() {
    if (selected.size === 0) return;
    const { updatedTracks, batch, appliedItems, blockedItems } = applyIntakeRepairs(tracks, queue, selected);
    setApplyResult({ applied: appliedItems.length, blocked: blockedItems.length });
    setSelected(new Set());
    onApply(updatedTracks, batch, pendingIgnored, pendingDeferred);
  }

  function handleUndo() {
    if (!latestBatch) return;
    const restored = undoIntakeRepairBatch(tracks, latestBatch);
    onUndo(restored);
    setApplyResult(null);
  }

  function handleDefer(id: string) {
    setPendingDeferred(prev => [...prev, id]);
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
  }

  function handleIgnore(id: string) {
    setPendingIgnored(prev => [...prev, id]);
    setSelected(prev => { const n = new Set(prev); n.delete(id); return n; });
  }

  const FILTERS: { key: FilterKind; label: string; count?: number }[] = [
    { key: "all", label: `All (${queue.filter(i => !allIgnored.has(i.repairId)).length})` },
    { key: "safe", label: `Safe (${counts.safe})` },
    { key: "review", label: `Review (${counts.review})` },
    { key: "blocked", label: `Blocked (${counts.blocked})` },
    { key: "identity", label: `Identity (${counts.identity})` },
    { key: "trust", label: `Trust (${counts.trust})` },
    { key: "mood", label: `Mood (${counts.mood})` },
  ];

  return (
    <div className="irp-panel">
      <div className="irp-header">
        <span className="irp-title">Intake Repair Review</span>
        <button className="cmp-close-btn" onClick={onClose}>✕</button>
      </div>

      {applyResult && (
        <div className="irp-result-card">
          Applied {applyResult.applied} repair{applyResult.applied !== 1 ? "s" : ""}.
          {applyResult.blocked > 0 && ` ${applyResult.blocked} blocked (manual conflicts).`}
          {latestBatch && (
            <button className="irp-undo-btn" onClick={handleUndo}>Undo Latest Batch</button>
          )}
        </div>
      )}

      {!applyResult && latestBatch && (
        <div className="irp-result-card irp-result-card--subtle">
          Latest batch: {latestBatch.summary.applied} applied.{" "}
          <button className="irp-undo-btn" onClick={handleUndo}>Undo</button>
        </div>
      )}

      <div className="irp-filters">
        {FILTERS.map(f => (
          <button
            key={f.key}
            className={`irp-filter-btn${filter === f.key ? " irp-filter-btn--active" : ""}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="irp-actions">
        <button className="tb-btn irp-primary-btn" onClick={handleSelectSafe} disabled={counts.safe === 0}>
          Select Safe Repairs
        </button>
        <button
          className="tb-btn irp-primary-btn"
          onClick={handleApply}
          disabled={selected.size === 0}
        >
          Apply Selected ({selected.size})
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="irp-empty">No repair candidates in this view.</div>
      ) : (
        <div className="irp-list">
          {filtered.map(item => {
            const isExpanded = expanded === item.repairId;
            const isSelected = selected.has(item.repairId);
            const isBlocked = item.risk === "blocked";
            return (
              <div
                key={item.repairId}
                className={`irp-item${isSelected ? " irp-item--selected" : ""}${isBlocked ? " irp-item--blocked" : ""}`}
              >
                <div className="irp-item-row" onClick={() => !isBlocked && toggleSelect(item.repairId)}>
                  <input
                    type="checkbox"
                    className="irp-check"
                    checked={isSelected}
                    disabled={isBlocked}
                    onChange={() => !isBlocked && toggleSelect(item.repairId)}
                    onClick={e => e.stopPropagation()}
                  />
                  <RiskBadge risk={item.risk} />
                  <span className="irp-kind">{KIND_LABELS[item.kind]}</span>
                  <span className="irp-track-title">
                    {tracks.find(t => t.trackId === item.trackId)?.title ?? item.trackId}
                  </span>
                  <span className="irp-conf">{Math.round(item.confidence * 100)}%</span>
                  <button
                    className="irp-expand-btn"
                    onClick={e => { e.stopPropagation(); setExpanded(isExpanded ? null : item.repairId); }}
                  >
                    {isExpanded ? "▲" : "▼"}
                  </button>
                </div>

                {isExpanded && (
                  <div className="irp-detail">
                    <div className="irp-reason">{item.reason}</div>
                    {item.blockerReason && (
                      <div className="irp-blocker-reason">Blocked: {item.blockerReason}</div>
                    )}
                    <div className="irp-diff">
                      {item.fieldsChanged.map(f => (
                        <FieldDiff
                          key={f}
                          label={f}
                          before={(item.before as Record<string, unknown>)[f]}
                          after={(item.after as Record<string, unknown>)[f]}
                        />
                      ))}
                    </div>
                    <div className="irp-detail-actions">
                      {!isBlocked && (
                        <button className="irp-action-btn" onClick={() => handleDefer(item.repairId)}>
                          Defer
                        </button>
                      )}
                      <button className="irp-action-btn" onClick={() => handleIgnore(item.repairId)}>
                        Ignore
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
