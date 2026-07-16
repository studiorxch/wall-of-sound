// Data Management → Backups & Recovery (0712_MUSIC_Recovery_Screen_Removal
// §2.4/§2.5). User-initiated only — never an automatic startup modal.
// Presents current/backup snapshots as neutral information (no
// "Recommended" labeling based on counts) and requires explicit
// confirmation, with exact count differences, before any restore.

import { useState } from "react";
import type { MusicStateSummary } from "../logic/musicStateSummary";
import type { StateRecordSummary } from "../logic/musicStateStore";

export interface DataManagementSnapshot {
  id: string;
  label: string;
  createdAt: string;
  summary: MusicStateSummary;
}

type Props = {
  currentSummary: MusicStateSummary | null;
  lastKnownGoodSummary: MusicStateSummary | null;
  checkpointSummaries: StateRecordSummary[];
  onClose: () => void;
  onDownloadCurrent: () => void;
  onDownloadSnapshot: (id: string) => void;
  /** Performs the restore. Caller is responsible for backing up current state first. */
  onConfirmRestore: (id: string) => void;
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function countDiff(current: number, snapshot: number): string {
  const delta = snapshot - current;
  if (delta === 0) return "±0";
  return delta > 0 ? `+${delta}` : `${delta}`;
}

export function DataManagementPanel({
  currentSummary,
  lastKnownGoodSummary,
  checkpointSummaries,
  onClose,
  onDownloadCurrent,
  onDownloadSnapshot,
  onConfirmRestore,
}: Props) {
  const [confirmTarget, setConfirmTarget] = useState<DataManagementSnapshot | null>(null);

  const allSnapshots: DataManagementSnapshot[] = [
    ...(lastKnownGoodSummary ? [{ id: "lastKnownGood", label: "Last Known Good", createdAt: lastKnownGoodSummary.lastSavedAt ?? "", summary: lastKnownGoodSummary }] : []),
    ...checkpointSummaries.map((c) => ({ id: c.id, label: c.reason ?? "Snapshot", createdAt: c.createdAt, summary: c.summary })),
  ];

  return (
    <div className="dmp-overlay" onClick={onClose}>
      <div className="dmp-panel" onClick={(e) => e.stopPropagation()}>
        <div className="dmp-header">
          <div className="dmp-title">Data Management — Backups &amp; Recovery</div>
          <button className="dmp-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {confirmTarget ? (
          <div className="dmp-confirm">
            <div className="dmp-confirm-title">Restore "{confirmTarget.label}"?</div>
            <p className="dmp-confirm-body">
              This will replace the current library state. A backup of the current state is
              created automatically before restoring.
            </p>
            <table className="dmp-diff-table">
              <thead>
                <tr><th></th><th>Current</th><th>{confirmTarget.label}</th><th>Diff</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td>Tracks</td>
                  <td>{currentSummary?.trackCount ?? "—"}</td>
                  <td>{confirmTarget.summary.trackCount}</td>
                  <td>{currentSummary ? countDiff(currentSummary.trackCount, confirmTarget.summary.trackCount) : "—"}</td>
                </tr>
                <tr>
                  <td>Playlists</td>
                  <td>{currentSummary?.nonDefaultPlaylistCount ?? "—"}</td>
                  <td>{confirmTarget.summary.nonDefaultPlaylistCount}</td>
                  <td>{currentSummary ? countDiff(currentSummary.nonDefaultPlaylistCount, confirmTarget.summary.nonDefaultPlaylistCount) : "—"}</td>
                </tr>
                <tr>
                  <td>Crates</td>
                  <td>{currentSummary?.crateCount ?? "—"}</td>
                  <td>{confirmTarget.summary.crateCount}</td>
                  <td>{currentSummary ? countDiff(currentSummary.crateCount, confirmTarget.summary.crateCount) : "—"}</td>
                </tr>
                <tr>
                  <td>Banks</td>
                  <td>{currentSummary?.samplerBankCount ?? "—"}</td>
                  <td>{confirmTarget.summary.samplerBankCount}</td>
                  <td>{currentSummary ? countDiff(currentSummary.samplerBankCount, confirmTarget.summary.samplerBankCount) : "—"}</td>
                </tr>
              </tbody>
            </table>
            <div className="dmp-confirm-timestamp">Snapshot taken: {fmtDate(confirmTarget.createdAt)}</div>
            <div className="dmp-warn">⚠ This will replace your current state. This action cannot be undone except by restoring the automatic pre-restore backup.</div>
            <div className="dmp-confirm-actions">
              <button className="dmp-btn dmp-btn--danger" onClick={() => { onConfirmRestore(confirmTarget.id); setConfirmTarget(null); }}>
                Yes, restore this snapshot
              </button>
              <button className="dmp-btn dmp-btn--ghost" onClick={() => setConfirmTarget(null)}>Cancel</button>
            </div>
          </div>
        ) : (
          <>
            <div className="dmp-section">
              <div className="dmp-section-label">Current State</div>
              {currentSummary ? (
                <div className="dmp-snapshot-row">
                  <span>{currentSummary.trackCount}t · {currentSummary.nonDefaultPlaylistCount}pl · {currentSummary.crateCount}cr · {currentSummary.samplerBankCount}bk</span>
                  <button className="dmp-btn dmp-btn--sm" onClick={onDownloadCurrent}>Download</button>
                </div>
              ) : <div className="dmp-empty">No current state loaded.</div>}
            </div>

            <div className="dmp-section">
              <div className="dmp-section-label">Snapshots</div>
              {allSnapshots.length === 0 && <div className="dmp-empty">No backup snapshots are available.</div>}
              {allSnapshots.map((s) => (
                <div key={s.id} className="dmp-snapshot-row">
                  <span>{s.label} · {fmtDate(s.createdAt)} · {s.summary.trackCount}t · {s.summary.nonDefaultPlaylistCount}pl · {s.summary.crateCount}cr · {s.summary.samplerBankCount}bk</span>
                  <div className="dmp-snapshot-actions">
                    <button className="dmp-btn dmp-btn--sm" onClick={() => onDownloadSnapshot(s.id)}>Download</button>
                    <button className="dmp-btn dmp-btn--sm" onClick={() => setConfirmTarget(s)}>Restore Earlier Snapshot…</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
