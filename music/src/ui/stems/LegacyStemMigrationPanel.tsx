// 0722C_MUSIC_Production_Stem_Export — reviews every existing
// `derivedKind:"stem"` group (the deprecated top-level-track system) and
// lets the operator explicitly migrate each into the new archive, one
// group at a time — never automatic, never bulk. A group unmistakably
// labeled LEGACY STEM stays fully visible and untouched until reviewed;
// nothing here treats a needs_review group as equivalent to a current
// archived stem set.

import { useMemo, useState } from "react";
import type { Track } from "../../data/trackTypes";
import { STEM_ROLES, type StemRole } from "../../data/trackStemTypes";
import { isStemTrack } from "../../logic/loops/stemLineage";
import { resolveTrackAudioIdentifier } from "../../logic/stems/stemClient";

interface LegacyGroup {
  parent: Track;
  children: Partial<Record<StemRole, Track>>;
  complete: boolean;
}

function groupLegacyStems(tracks: Track[]): LegacyGroup[] {
  const stems = tracks.filter(isStemTrack);
  const byParent = new Map<string, Partial<Record<StemRole, Track>>>();
  for (const stem of stems) {
    if (!stem.parentTrackId || !stem.stemRole) continue;
    if (stem.stemArchiveMigration?.status === "migrated") continue; // already done, not shown again
    const entry = byParent.get(stem.parentTrackId) ?? {};
    entry[stem.stemRole] = stem;
    byParent.set(stem.parentTrackId, entry);
  }
  const groups: LegacyGroup[] = [];
  for (const [parentTrackId, children] of byParent) {
    const parent = tracks.find((t) => t.trackId === parentTrackId);
    if (!parent) continue;
    groups.push({ parent, children, complete: STEM_ROLES.every((r) => children[r]) });
  }
  return groups;
}

interface Props {
  libraryTracks: Track[];
  onMigrated: (parentTrackId: string, migratedChildTrackIds: string[], stemSetId: string) => void;
  onClose: () => void;
}

export function LegacyStemMigrationPanel({ libraryTracks, onMigrated, onClose }: Props) {
  const groups = useMemo(() => groupLegacyStems(libraryTracks), [libraryTracks]);
  const [busyParentId, setBusyParentId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function handleMigrate(group: LegacyGroup) {
    const audioRelPath = resolveTrackAudioIdentifier(group.parent);
    if (!audioRelPath || !group.complete) return;
    setBusyParentId(group.parent.trackId);
    setErrors((e) => ({ ...e, [group.parent.trackId]: "" }));
    try {
      const legacyAudioRelPaths: Partial<Record<StemRole, string>> = {};
      for (const role of STEM_ROLES) {
        const child = group.children[role];
        legacyAudioRelPaths[role] = child ? (resolveTrackAudioIdentifier(child) ?? undefined) : undefined;
      }
      const res = await fetch("/stem-legacy-migrate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId: group.parent.trackId, audioRelPath, legacyAudioRelPaths }),
      });
      const result = await res.json();
      if (!result.ok) { setErrors((e) => ({ ...e, [group.parent.trackId]: result.message ?? result.error ?? "Migration failed." })); return; }
      const childIds = STEM_ROLES.map((r) => group.children[r]?.trackId).filter((id): id is string => Boolean(id));
      onMigrated(group.parent.trackId, childIds, result.stemSet.id);
    } finally {
      setBusyParentId(null);
    }
  }

  return (
    <div className="legacy-stem-migration-panel" role="dialog" aria-label="Legacy Stem Migration">
      <div className="legacy-stem-migration-header">
        <span>Review Legacy Stems</span>
        <button type="button" className="tb-btn" onClick={onClose}>Close</button>
      </div>
      {groups.length === 0 ? (
        <div className="legacy-stem-migration-empty">No legacy stem groups pending review.</div>
      ) : (
        groups.map((group) => (
          <div key={group.parent.trackId} className="legacy-stem-migration-row">
            <span className="legacy-stem-badge">LEGACY STEM</span>
            <span className="legacy-stem-migration-title">{group.parent.title}</span>
            <span className="legacy-stem-migration-roles">
              {STEM_ROLES.map((r) => (group.children[r] ? r : `missing:${r}`)).join(", ")}
            </span>
            {errors[group.parent.trackId] && <span className="legacy-stem-migration-error">{errors[group.parent.trackId]}</span>}
            <button
              type="button"
              className="tb-btn"
              disabled={!group.complete || busyParentId === group.parent.trackId}
              title={group.complete ? "Validate and register this legacy group into the new stem archive" : "Not all 4 roles are present — cannot migrate"}
              onClick={() => handleMigrate(group)}
            >
              {busyParentId === group.parent.trackId ? "Migrating…" : "Migrate to Archive"}
            </button>
          </div>
        ))
      )}
    </div>
  );
}
