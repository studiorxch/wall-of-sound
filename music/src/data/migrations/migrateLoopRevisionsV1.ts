// 0715C_MUSIC_Loop_Workspace_Editing_And_Revision_Completion §37 —
// approved-loop → revision migration. A standalone, explicitly-invoked,
// versioned, idempotent migration, following the exact precedent already
// set by `migrateV1` in ../playProjectStorage.ts (a named function called
// directly from the load path) rather than being folded into
// `repairStoredProject`'s generic per-field array-shape defaulting — that
// function only backfills missing arrays/defaults, it never synthesizes
// new domain records.
//
// Every existing `approved` LoopAsset becomes revision `v1`: its own id,
// rendered path, and exact frames are preserved untouched, and
// `activeRevisionId` is pointed at the synthesized revision.

import type { PlayProject } from "../playProjectTypes";
import type { LoopRevision } from "../loopTypes";

const DEFAULT_SAMPLE_RATE = 44100;

function genRevisionId(): string {
  return `rev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function migrateApprovedLoopsToRevisionsV1(project: PlayProject): PlayProject {
  // Version gate — the fast, explicit no-op path once already migrated.
  if ((project.loopRevisionsMigrationVersion ?? 0) >= 1) return project;

  const loops = project.loops ?? [];
  const existingRevisions = project.loopRevisions ?? [];
  const revisionedLoopIds = new Set(existingRevisions.map((r) => r.loopId));
  const sampleRateByTrackId = new Map(
    (project.libraryTracks ?? []).map((t) => [t.trackId, t.audioAnalysis?.sampleRate ?? DEFAULT_SAMPLE_RATE]),
  );

  const newRevisions: LoopRevision[] = [];
  const nextLoops = loops.map((loop) => {
    // Independently idempotent even without the version gate above: a loop
    // that already has an activeRevisionId or an existing revision record
    // is left untouched — running this twice touches nothing the second
    // time.
    if (loop.status !== "approved" || loop.activeRevisionId || revisionedLoopIds.has(loop.id)) {
      return loop;
    }
    const sampleRate = sampleRateByTrackId.get(loop.sourceTrackId) ?? DEFAULT_SAMPLE_RATE;
    const revision: LoopRevision = {
      id: genRevisionId(),
      loopId: loop.id,
      startFrame: Math.round(loop.startSeconds * sampleRate),
      endFrame: Math.round(loop.endSeconds * sampleRate),
      label: loop.title,
      createdAt: loop.createdAt,
      createdBy: "manual_edit",
    };
    newRevisions.push(revision);
    return { ...loop, activeRevisionId: revision.id };
  });

  return {
    ...project,
    loops: nextLoops,
    loopRevisions: [...existingRevisions, ...newRevisions],
    loopRevisionsMigrationVersion: 1,
  };
}
