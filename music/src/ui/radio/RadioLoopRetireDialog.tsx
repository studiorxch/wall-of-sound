// RadioLoop Library Workspace (0717A) — retirement dialog (build spec
// §9.8). Whole-RadioLoop scope only. Retirement creates a NEW immutable
// version with status RETIRED (never mutates an existing one) — the
// dialog states this plainly, along with the fact that the package and
// its history are preserved, only future scheduling eligibility changes.

import { useState } from "react";
import type { RadioLoopWorkspaceRow } from "../../data/radioWorkspaceTypes";

type Props = {
  row: RadioLoopWorkspaceRow;
  onClose: () => void;
  onRetired: () => void;
};

interface RetireResponse {
  ok: boolean;
  radioLoopId?: string;
  newPackageVersion?: number;
  issues: Array<{ code: string; message: string; severity: "error" | "warning" }>;
}

export function RadioLoopRetireDialog({ row, onClose, onRetired }: Props) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<RetireResponse | null>(null);

  async function handleRetire() {
    if (submitting || !reason.trim()) return;
    setSubmitting(true);
    try {
      const resp = await fetch("/radio-package-retire", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ radioLoopId: row.radioLoopId, reason: reason.trim() }),
      });
      const json = (await resp.json()) as RetireResponse;
      setResult(json);
      if (json.ok) onRetired();
    } catch {
      setResult({ ok: false, issues: [{ code: "RADIO_RETIRE_REQUEST_FAILED", message: "The request failed", severity: "error" }] });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="npw-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}>
      <div className="npw-modal">
        <div className="npw-header">
          <div className="npw-header-title">Retire — {row.radioLoopId}</div>
          <button className="npw-close" onClick={onClose} disabled={submitting}>✕</button>
        </div>
        <div className="npw-body">
          <p style={{ fontSize: 12, opacity: 0.85 }}>
            Retirement excludes this RadioLoop from future RADIO scheduling. It does <strong>not</strong> delete the package or any prior version —
            a new immutable RETIRED version is created and every earlier version, including v{row.currentPackageVersion}, remains exactly as it is.
          </p>

          <div className="npw-step-label">Retirement reason *</div>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} disabled={submitting} rows={3} style={{ width: "100%" }} />

          {result && !result.ok && (
            <div style={{ fontSize: 12, marginTop: 10 }}>
              {result.issues.map((issue, i) => <div key={i} style={{ color: "rgba(255,120,120,0.95)" }}>✕ {issue.message}</div>)}
            </div>
          )}
          {result?.ok && (
            <div style={{ fontSize: 12, marginTop: 10, color: "rgba(64,217,176,0.95)" }}>
              Retired as v{result.newPackageVersion}.
            </div>
          )}

          <div className="npw-actions">
            <button className="npw-btn npw-btn--ghost" onClick={onClose} disabled={submitting}>Close</button>
            <button className="npw-btn npw-btn--primary" onClick={() => void handleRetire()} disabled={submitting || !reason.trim() || result?.ok === true}>
              {submitting ? "Retiring…" : "Retire"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
