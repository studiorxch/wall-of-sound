// RadioLoop Library Workspace (0717A) — metadata-only edit dialog (build
// spec §9.6). The role field is a closed set of checkboxes over
// RadioArrangementRole — never free text — so a legacy value like
// "atmosphere" can only be cleared by explicitly picking a valid
// replacement (decision 10), never re-saved as-is.

import { useState } from "react";
import { RADIO_ARRANGEMENT_ROLES } from "../../data/radioLoopTypes";
import type { RadioArrangementRole } from "../../data/radioLoopTypes";
import type { RadioLoopMetadataEditRequest, RadioLoopMetadataRevisionResult, RadioLoopWorkspaceRow } from "../../data/radioWorkspaceTypes";
import { validateMetadataEditRequest } from "../../logic/radio/radioMetadataEditValidator";

type Props = {
  row: RadioLoopWorkspaceRow;
  onClose: () => void;
  onSaved: () => void;
};

export function RadioLoopMetadataEditDialog({ row, onClose, onSaved }: Props) {
  const [title, setTitle] = useState(row.workingTitle ?? "");
  const [roles, setRoles] = useState<string[]>(row.roles.filter((r) => (RADIO_ARRANGEMENT_ROLES as readonly string[]).includes(r)));
  const [energy, setEnergy] = useState(row.energy != null ? String(row.energy) : "");
  const [density, setDensity] = useState(row.density != null ? String(row.density) : "");
  const [stability, setStability] = useState(row.stability != null ? String(row.stability) : "");
  const [maxRepeats, setMaxRepeats] = useState("");
  const [minRest, setMinRest] = useState("");
  const [publicUseApproved, setPublicUseApproved] = useState(row.publicUseApproved ?? false);
  const [approvalChangeConfirmed, setApprovalChangeConfirmed] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<RadioLoopMetadataRevisionResult | null>(null);

  function toggleRole(role: RadioArrangementRole) {
    setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  }

  function buildRequest(): RadioLoopMetadataEditRequest {
    return {
      radioLoopId: row.radioLoopId,
      sourcePackageVersion: row.currentPackageVersion,
      title: title.trim() || undefined,
      roles,
      energy: energy === "" ? undefined : Number(energy),
      density: density === "" ? undefined : Number(density),
      stability: stability === "" ? undefined : Number(stability),
      maximumConsecutiveRepeats: maxRepeats === "" ? undefined : Number(maxRepeats),
      minimumRestCycles: minRest === "" ? undefined : Number(minRest),
      publicUseApproved,
      approvalChangeConfirmed,
    };
  }

  async function handleSubmit() {
    if (submitting) return;
    const request = buildRequest();
    const clientIssues = validateMetadataEditRequest(request, row.publicUseApproved ?? false);
    if (clientIssues.length > 0) {
      setResult({ ok: false, issues: clientIssues });
      return;
    }
    setSubmitting(true);
    try {
      const resp = await fetch("/radio-package-revise-metadata", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request),
      });
      const json = (await resp.json()) as RadioLoopMetadataRevisionResult;
      setResult(json);
      if (json.ok) onSaved();
    } catch {
      setResult({ ok: false, issues: [{ code: "RADIO_EDIT_REQUEST_FAILED", message: "The request failed", severity: "error" }] });
    } finally {
      setSubmitting(false);
    }
  }

  const approvalChanged = publicUseApproved !== (row.publicUseApproved ?? false);

  return (
    <div className="npw-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !submitting) onClose(); }}>
      <div className="npw-modal">
        <div className="npw-header">
          <div className="npw-header-title">Edit Metadata — {row.radioLoopId}</div>
          <button className="npw-close" onClick={onClose} disabled={submitting}>✕</button>
        </div>
        <div className="npw-body">
          <p style={{ fontSize: 12, opacity: 0.75 }}>
            Saving creates a new immutable package version (v{row.currentPackageVersion + 1}) without re-encoding the unchanged audio. The current version (v{row.currentPackageVersion}) is preserved.
          </p>

          <div className="npw-step-label">Working title</div>
          <input value={title} onChange={(e) => setTitle(e.target.value)} disabled={submitting} style={{ width: "100%", marginBottom: 10 }} />

          <div className="npw-step-label">Roles *</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 10 }}>
            {RADIO_ARRANGEMENT_ROLES.map((role) => (
              <label key={role} style={{ fontSize: 12 }}>
                <input type="checkbox" checked={roles.includes(role)} onChange={() => toggleRole(role)} disabled={submitting} /> {role}
              </label>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
            <label style={{ fontSize: 11 }}>Energy (0–1)
              <input type="number" min={0} max={1} step={0.05} value={energy} onChange={(e) => setEnergy(e.target.value)} disabled={submitting} style={{ width: "100%" }} />
            </label>
            <label style={{ fontSize: 11 }}>Density (0–1)
              <input type="number" min={0} max={1} step={0.05} value={density} onChange={(e) => setDensity(e.target.value)} disabled={submitting} style={{ width: "100%" }} />
            </label>
            <label style={{ fontSize: 11 }}>Stability (0–1)
              <input type="number" min={0} max={1} step={0.05} value={stability} onChange={(e) => setStability(e.target.value)} disabled={submitting} style={{ width: "100%" }} />
            </label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
            <label style={{ fontSize: 11 }}>Max consecutive repeats
              <input type="number" min={1} step={1} value={maxRepeats} onChange={(e) => setMaxRepeats(e.target.value)} disabled={submitting} style={{ width: "100%" }} />
            </label>
            <label style={{ fontSize: 11 }}>Min rest cycles
              <input type="number" min={0} step={1} value={minRest} onChange={(e) => setMinRest(e.target.value)} disabled={submitting} style={{ width: "100%" }} />
            </label>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 6 }}>
            <input type="checkbox" checked={publicUseApproved} onChange={(e) => setPublicUseApproved(e.target.checked)} disabled={submitting} />
            Public-use approved
          </label>
          {approvalChanged && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, marginBottom: 14, color: "rgba(255,210,120,0.95)" }}>
              <input type="checkbox" checked={approvalChangeConfirmed} onChange={(e) => setApprovalChangeConfirmed(e.target.checked)} disabled={submitting} />
              I confirm this approval change
            </label>
          )}

          {result && !result.ok && (
            <div style={{ fontSize: 12, marginBottom: 10 }}>
              {result.issues.map((issue, i) => (
                <div key={i} style={{ color: "rgba(255,120,120,0.95)" }}>✕ {issue.message}</div>
              ))}
            </div>
          )}
          {result?.ok && (
            <div style={{ fontSize: 12, marginBottom: 10, color: "rgba(64,217,176,0.95)" }}>
              Saved as v{result.packageVersion}. Asset hash match: {String(result.assetHashMatch)}.
            </div>
          )}

          <div className="npw-actions">
            <button className="npw-btn npw-btn--ghost" onClick={onClose} disabled={submitting}>Close</button>
            <button className="npw-btn npw-btn--primary" onClick={() => void handleSubmit()} disabled={submitting || result?.ok === true}>
              {submitting ? "Saving…" : "Save as new version"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
