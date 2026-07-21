// RadioLoop Library Workspace (0717A) — version inspector + comparison
// (build spec §9.7). Always sources its version list from
// GET /radio-package-versions, never derived from the (possibly-partial)
// manifest-grouped workspace rows — the only route that supplies complete
// history including retired versions (decision 5).

import { useEffect, useState } from "react";
import type { RadioLoopPackageManifest } from "../../data/radioLoopTypes";
import type { RadioLoopVersionIndexEntry, RadioLoopWorkspaceRow } from "../../data/radioWorkspaceTypes";
import { fetchVersionHistory } from "../../logic/radio/radioManifestClient";
import { compareRadioLoopVersions, type RadioLoopVersionDiff } from "../../logic/radio/radioVersionCompare";

type Props = {
  row: RadioLoopWorkspaceRow;
  onClose: () => void;
};

async function fetchMetadata(radioLoopId: string, packageVersion: number): Promise<RadioLoopPackageManifest | null> {
  try {
    const resp = await fetch(`/radio-package?radioLoopId=${encodeURIComponent(radioLoopId)}&packageVersion=${packageVersion}`);
    if (!resp.ok) return null;
    return (await resp.json()) as RadioLoopPackageManifest;
  } catch {
    return null;
  }
}

export function RadioLoopInspectorDialog({ row, onClose }: Props) {
  const [versions, setVersions] = useState<RadioLoopVersionIndexEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [versionA, setVersionA] = useState<number | null>(null);
  const [versionB, setVersionB] = useState<number | null>(null);
  const [diff, setDiff] = useState<RadioLoopVersionDiff | null>(null);
  const [compareStatus, setCompareStatus] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const result = await fetchVersionHistory(row.radioLoopId);
      setVersions(result);
      if (result.length >= 2) {
        setVersionA(result[result.length - 2].packageVersion);
        setVersionB(result[result.length - 1].packageVersion);
      } else if (result.length === 1) {
        setVersionA(result[0].packageVersion);
        setVersionB(result[0].packageVersion);
      }
      setLoading(false);
    })();
  }, [row.radioLoopId]);

  async function runCompare() {
    if (versionA == null || versionB == null) return;
    setCompareStatus("Comparing…");
    const [a, b] = await Promise.all([fetchMetadata(row.radioLoopId, versionA), fetchMetadata(row.radioLoopId, versionB)]);
    if (!a || !b) { setCompareStatus("Could not load one or both versions for comparison."); setDiff(null); return; }
    setDiff(compareRadioLoopVersions(a, b));
    setCompareStatus(null);
  }

  return (
    <div className="npw-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="npw-modal">
        <div className="npw-header">
          <div className="npw-header-title">Inspect — {row.radioLoopId}</div>
          <button className="npw-close" onClick={onClose}>✕</button>
        </div>
        <div className="npw-body">
          <div className="npw-step-label">Version history</div>
          {loading ? <p>Loading…</p> : (
            <table className="loop-library-table">
              <thead><tr><th>Version</th><th>Status</th><th>Roles</th><th>Retirement</th></tr></thead>
              <tbody>
                {versions.map((v) => (
                  <tr key={v.packageVersion}>
                    <td>v{v.packageVersion}</td>
                    <td>{v.status}</td>
                    <td>{v.roles.join(", ") || "—"}</td>
                    <td>{v.retirement ? `${v.retirement.reason} (${v.retirement.retiredAt})` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="npw-step-label" style={{ marginTop: 16 }}>Compare versions</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select value={versionA ?? ""} onChange={(e) => setVersionA(Number(e.target.value))}>
              {versions.map((v) => <option key={v.packageVersion} value={v.packageVersion}>v{v.packageVersion}</option>)}
            </select>
            <span>vs</span>
            <select value={versionB ?? ""} onChange={(e) => setVersionB(Number(e.target.value))}>
              {versions.map((v) => <option key={v.packageVersion} value={v.packageVersion}>v{v.packageVersion}</option>)}
            </select>
            <button className="npw-btn" onClick={() => void runCompare()}>Compare</button>
          </div>
          {compareStatus && <p>{compareStatus}</p>}
          {diff && (
            <div style={{ fontSize: 12, marginTop: 10 }}>
              <div>Arrangement changed: <strong>{String(diff.arrangementChanged)}</strong></div>
              <div>Approval changed: <strong>{String(diff.approvalChanged)}</strong></div>
              <div>Musical metadata changed: <strong>{String(diff.musicalChanged)}</strong></div>
              <div>Stem set changed: <strong>{String(diff.stemSetChanged)}</strong></div>
              <div>Audio identity changed: <strong>{String(diff.audioIdentityChanged)}</strong>{!diff.audioIdentityChanged && diff.changedFields.length > 0 ? " (metadata-only revision — no re-encode)" : ""}</div>
            </div>
          )}

          <div className="npw-actions">
            <button className="npw-btn npw-btn--ghost" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
