// 0722C_MUSIC_Production_Stem_Export — "Register Existing Stem Set…".
// Operator picks one folder or exactly four files, maps them to roles
// (prefilled by filename, must be unambiguous before submit), explicitly
// confirms the parent track, then the files are streamed to server
// staging and validated by the same pipeline a fresh Demucs export uses —
// lossy input (e.g. MP3) is rejected there, never promoted.

import { useState } from "react";
import type { Track } from "../../data/trackTypes";
import type { StemRole } from "../../data/trackStemTypes";
import { STEM_ROLES } from "../../data/trackStemTypes";
import { pickAudioFiles, pickAudioFolder } from "../../logic/audioImport";
import { matchStemRoleFromFileName } from "../../logic/stems/stemRoleMatching";
import { createSalvageStagingOperation, uploadSalvageFile, registerExistingStemSetRequest, resolveTrackAudioIdentifier } from "../../logic/stems/stemClient";

interface Props {
  track: Track;
  onClose: () => void;
  onRegistered: () => void;
}

export function RegisterExistingStemSetDialog({ track, onClose, onRegistered }: Props) {
  const [files, setFiles] = useState<File[]>([]);
  const [roleAssignments, setRoleAssignments] = useState<Partial<Record<StemRole, File>>>({});
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function applyPicked(picked: File[]) {
    setFiles(picked);
    const assignments: Partial<Record<StemRole, File>> = {};
    for (const f of picked) {
      const role = matchStemRoleFromFileName(f.name);
      if (role && !assignments[role]) assignments[role] = f;
    }
    setRoleAssignments(assignments);
    setError(null);
  }

  async function handlePickFiles() {
    const picked = await pickAudioFiles();
    if (picked.length > 0) applyPicked(picked);
  }
  async function handlePickFolder() {
    const picked = await pickAudioFolder();
    if (picked.length > 0) applyPicked(picked);
  }

  const allRolesAssigned = STEM_ROLES.every((r) => roleAssignments[r]);
  const audioRelPath = resolveTrackAudioIdentifier(track) ?? "";

  async function handleSubmit() {
    if (!allRolesAssigned || !confirmed || !audioRelPath) return;
    setBusy(true);
    setError(null);
    try {
      const stage = await createSalvageStagingOperation();
      if (!stage.ok) { setError("Could not create a staging area."); return; }
      const roleAssignmentsForRequest: Record<string, string> = {};
      for (const role of STEM_ROLES) {
        const file = roleAssignments[role];
        if (!file) continue;
        const upload = await uploadSalvageFile(stage.operationId, role, file);
        if (!upload.ok || !upload.fileName) { setError(`Upload failed for ${role}.`); return; }
        roleAssignmentsForRequest[role] = upload.fileName;
      }
      const result = await registerExistingStemSetRequest({
        operationId: stage.operationId,
        trackId: track.trackId,
        audioRelPath,
        roleAssignments: roleAssignmentsForRequest,
        confirmed: true,
      });
      if (!result.ok) { setError(result.message ?? "Registration failed validation."); return; }
      onRegistered();
      onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stem-salvage-dialog" role="dialog" aria-label="Register Existing Stem Set">
      <div className="stem-salvage-dialog-header">
        <span>Register Existing Stem Set — {track.title}</span>
        <button type="button" className="tb-btn" onClick={onClose}>Close</button>
      </div>

      <div className="stem-salvage-dialog-pickers">
        <button type="button" className="tb-btn" onClick={handlePickFolder}>Choose Folder…</button>
        <button type="button" className="tb-btn" onClick={handlePickFiles}>Choose 4 Files…</button>
      </div>

      {files.length > 0 && (
        <div className="stem-salvage-dialog-roles">
          {STEM_ROLES.map((role) => (
            <div key={role} className="stem-salvage-role-row">
              <span>{role}</span>
              <select
                value={roleAssignments[role] ? files.indexOf(roleAssignments[role]!) : ""}
                onChange={(e) => {
                  const idx = Number(e.target.value);
                  setRoleAssignments((prev) => ({ ...prev, [role]: Number.isFinite(idx) ? files[idx] : undefined }));
                }}
              >
                <option value="">— unassigned —</option>
                {files.map((f, i) => (
                  <option key={i} value={i}>{f.name}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}

      {error && <div className="stem-salvage-dialog-error">{error}</div>}

      <label className="stem-salvage-dialog-confirm">
        <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
        This is the correct source song for these stem files.
      </label>

      <button type="button" className="tb-btn ph-btn-primary" disabled={!allRolesAssigned || !confirmed || busy} onClick={handleSubmit}>
        {busy ? "Registering…" : "Register Stem Set"}
      </button>
    </div>
  );
}
