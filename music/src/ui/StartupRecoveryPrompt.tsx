// Startup recovery prompt (0712_MUSIC_Recovery_Screen_Removal).
//
// Renders ONLY when assessment.severity === "critical" — i.e. the current
// state is genuinely unparseable/invalid/missing, never merely "smaller than
// some other snapshot." Exactly three actions, per spec §4: Download Raw
// Current Data, Restore Earlier Snapshot, Open Empty Temporary Session.
// No "Recommended" labeling, no Start Blank, no bare "Restore Checkpoint".

import { useState } from "react";
import type { StartupRecoveryAssessment } from "../logic/musicStartupRecovery";
import type { MusicStateSummary } from "../logic/musicStateSummary";
import type { StateRecordSummary } from "../logic/musicStateStore";

interface StartupRecoveryPromptProps {
  assessment: StartupRecoveryAssessment;
  onRestoreSnapshot: (id: "lastKnownGood" | string) => void;
  onDownloadCurrent: () => void;
  onOpenEmptyTemporarySession: () => void;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function SnapshotRow({
  id, label, createdAt, summary, onSelect,
}: {
  id: string;
  label: string;
  createdAt: string;
  summary: MusicStateSummary;
  onSelect: (id: string) => void;
}) {
  return (
    <button className="srp-checkpoint-row" onClick={() => onSelect(id)}>
      <span className="srp-cp-date">{label} · {fmtDate(createdAt)}</span>
      <span className="srp-cp-counts">
        {summary.trackCount}t · {summary.nonDefaultPlaylistCount}pl · {summary.crateCount}cr · {summary.samplerBankCount}bk
      </span>
    </button>
  );
}

function SnapshotPicker({
  lastKnownGoodSummary,
  checkpointSummaries,
  onSelect,
  onCancel,
}: {
  lastKnownGoodSummary?: MusicStateSummary | null;
  checkpointSummaries: StateRecordSummary[];
  onSelect: (id: string) => void;
  onCancel: () => void;
}) {
  return (
    <div className="srp-checkpoint-picker">
      <div className="srp-checkpoint-title">Restore Earlier Snapshot</div>
      <p className="srp-confirm-body">
        Restoring will replace the current state. A backup of the current state is created
        automatically first, and the exact counts are shown before you confirm.
      </p>
      <div className="srp-checkpoint-list">
        {lastKnownGoodSummary && (
          <SnapshotRow id="lastKnownGood" label="Last Known Good" createdAt={lastKnownGoodSummary.lastSavedAt ?? ""} summary={lastKnownGoodSummary} onSelect={onSelect} />
        )}
        {checkpointSummaries.map((c) => (
          <SnapshotRow key={c.id} id={c.id} label={c.reason ?? "Snapshot"} createdAt={c.createdAt} summary={c.summary} onSelect={onSelect} />
        ))}
        {!lastKnownGoodSummary && checkpointSummaries.length === 0 && (
          <div className="srp-confirm-body">No earlier snapshots are available.</div>
        )}
      </div>
      <button className="srp-btn srp-btn--ghost" onClick={onCancel}>← Back</button>
    </div>
  );
}

export function StartupRecoveryPrompt({
  assessment,
  onRestoreSnapshot,
  onDownloadCurrent,
  onOpenEmptyTemporarySession,
}: StartupRecoveryPromptProps) {
  const [showPicker, setShowPicker] = useState(false);

  if (assessment.severity !== "critical") return null;

  if (showPicker) {
    return (
      <div className="srp-overlay">
        <div className="srp-modal">
          <SnapshotPicker
            lastKnownGoodSummary={assessment.lastKnownGoodSummary}
            checkpointSummaries={assessment.checkpointSummaries ?? []}
            onSelect={(id) => { setShowPicker(false); onRestoreSnapshot(id); }}
            onCancel={() => setShowPicker(false)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="srp-overlay">
      <div className="srp-modal">
        <div className="srp-header">
          <div className="srp-title">MUSIC State Could Not Be Loaded</div>
          <div className="srp-severity srp-severity--critical">CRITICAL</div>
        </div>

        <p className="srp-message">{assessment.message}</p>

        <div className="srp-actions">
          <button className="srp-btn" onClick={onDownloadCurrent}>
            Download Raw Current Data
          </button>
          <button className="srp-btn" onClick={() => setShowPicker(true)}>
            Restore Earlier Snapshot…
          </button>
          <button className="srp-btn srp-btn--ghost" onClick={onOpenEmptyTemporarySession} title="Does not overwrite your saved data.">
            Open Empty Temporary Session
          </button>
        </div>
      </div>
    </div>
  );
}
