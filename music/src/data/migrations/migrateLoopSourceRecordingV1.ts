// 0828_MUSIC_Looper_Loop_Library_Tagging — sourceRecording/tags/
// purposeMemberships backfill for every LoopAsset that existed before this
// build. A standalone, explicitly-invoked, versioned, idempotent migration,
// following the exact precedent set by migrateApprovedLoopsToRevisionsV1
// in ./migrateLoopRevisionsV1.ts (a named function called directly from the
// load path, gated on its own PlayProject version field) rather than being
// folded into repairStoredProject's generic per-field array-shape defaulting
// — that function only backfills missing arrays/defaults, it never resolves
// cross-record relationships.
//
// Conservative by design: sourceRecording is left UNSET (not guessed) for
// any loop that can't be confidently resolved — a missing source track, or
// a track whose sourceOwner isn't one of the three known library values —
// with needsReview flagged instead. tags/purposeMemberships are always
// safely backfilled to empty arrays (they carry no provenance, so there is
// nothing to get wrong). This migration never rewrites sourceTrackId, never
// renames/moves source audio, and never touches any existing Track/asset id
// — it only adds new fields to LoopAsset.

import type { PlayProject } from "../playProjectTypes";
import { buildSourceRecordingForTrack } from "../../logic/loops/loopSourceRecording";

export function migrateLoopSourceRecordingV1(project: PlayProject): PlayProject {
  // Version gate — the fast, explicit no-op path once already migrated.
  if ((project.loopSourceRecordingMigrationVersion ?? 0) >= 1) return project;

  const loops = project.loops ?? [];
  const tracksById = new Map((project.libraryTracks ?? []).map((t) => [t.trackId, t]));

  const nextLoops = loops.map((loop) => {
    // Independently idempotent even without the version gate above: a loop
    // that already carries sourceRecording, tags, and purposeMemberships is
    // left untouched.
    if (loop.sourceRecording && loop.tags && loop.purposeMemberships) return loop;

    const track = loop.sourceTrackId ? tracksById.get(loop.sourceTrackId) : undefined;
    const resolved = track ? buildSourceRecordingForTrack(track) : null;

    return {
      ...loop,
      sourceRecording: loop.sourceRecording ?? resolved ?? undefined,
      // Only flag for review when resolution genuinely failed — never
      // downgrade a loop that was already fine.
      needsReview: loop.needsReview || (!loop.sourceRecording && !resolved),
      tags: loop.tags ?? [],
      purposeMemberships: loop.purposeMemberships ?? [],
    };
  });

  return {
    ...project,
    loops: nextLoops,
    loopSourceRecordingMigrationVersion: 1,
  };
}
