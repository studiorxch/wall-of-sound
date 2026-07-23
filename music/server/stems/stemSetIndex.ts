// 0722C_MUSIC_Production_Stem_Export — the filesystem IS the source of
// truth (mirrors server/radio/radioLibraryIndex.ts's scan-on-every-request
// pattern). No `hasStems` boolean or stem-set record is ever persisted in
// client/app JSON state — every request re-derives lifecycle live. Node-only.

import fs from "node:fs";
import path from "node:path";
import { readJsonSafe, listSubdirNames } from "./stemFsUtils";
import { trackStemSetsDir } from "./stemFsUtils";
import { manifestFileName } from "./stemSetWriter";
import { revalidateSourceIdentity } from "./stemIdentity";
import type { StemRole, StemSetLifecycleResult, TrackStemSet } from "../../src/data/trackStemTypes";

export function scanStemSetsForTrack(stemLibraryRoot: string, safeTrackId: string): TrackStemSet[] {
  const setsDir = trackStemSetsDir(stemLibraryRoot, safeTrackId);
  const dirNames = listSubdirNames(setsDir);
  const sets: TrackStemSet[] = [];
  for (const dirName of dirNames) {
    const manifest = readJsonSafe<TrackStemSet>(path.join(setsDir, dirName, manifestFileName()));
    if (manifest) sets.push(manifest);
  }
  return sets.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0)); // newest first
}

function stemFilesOnDiskIntact(stemLibraryRoot: string, set: TrackStemSet): boolean {
  for (const role of Object.keys(set.stems) as StemRole[]) {
    const file = set.stems[role];
    if (!file) return false;
    const absPath = path.join(stemLibraryRoot, file.relativeArchivePath);
    if (!fs.existsSync(absPath)) return false;
    try {
      if (fs.statSync(absPath).size !== file.sizeBytes) return false;
    } catch {
      return false;
    }
  }
  return true;
}

export interface ClassifyContext {
  stemLibraryRoot: string;
  sourcePath: string; // the parent track's CURRENT resolved, confined audio path
  scratchWavPathFor: (stemSetId: string) => string; // only used if a set needs a tier-3 full decode; caller owns cleanup
}

// Classifies every registered set for one track TOGETHER, since "current"
// is relative to the whole group: among sets whose identity still matches
// the live parent, the most recently created one is CURRENT and any older
// still-matching ones are ARCHIVED (not current, but not stale either) —
// "at most one stem set may be CURRENT for the active parent audio/model
// combination."
export async function classifyStemSetsForTrack(sets: TrackStemSet[], ctx: ClassifyContext): Promise<Map<string, StemSetLifecycleResult>> {
  const results = new Map<string, StemSetLifecycleResult>();
  if (sets.length === 0) return results;

  const sourceExists = fs.existsSync(ctx.sourcePath);

  let firstMatchAssigned = false;
  for (const set of sets) {
    if (!stemFilesOnDiskIntact(ctx.stemLibraryRoot, set)) {
      results.set(set.id, { lifecycle: "unavailable", reason: "One or more archived stem files are missing or changed size on disk." });
      continue;
    }
    if (!sourceExists) {
      results.set(set.id, { lifecycle: "orphaned", reason: "The parent source track's audio file is missing." });
      continue;
    }

    const outcome = await revalidateSourceIdentity({
      sourcePath: ctx.sourcePath,
      sourceStatAtCreation: set.sourceStatAtCreation,
      sourceRawFileHashAtCreation: set.sourceRawFileHashAtCreation,
      sourceIdentity: set.sourceAudioIdentity,
      scratchWavPath: ctx.scratchWavPathFor(set.id),
    });

    if (!outcome.ok) {
      const reason = outcome.reason === "source_missing" ? "The parent source track's audio file is missing." : "Could not verify the parent source track's audio right now.";
      results.set(set.id, { lifecycle: outcome.reason === "source_missing" ? "orphaned" : "unavailable", reason });
      continue;
    }
    if (!outcome.matches) {
      results.set(set.id, { lifecycle: "outdated", reason: "The parent track's decoded audio has changed since this set was created." });
      continue;
    }
    // Matches the live parent — the first (newest, since `sets` is sorted
    // newest-first) matching set is CURRENT; any later (older) matching
    // set is an intentionally-retained ARCHIVED version.
    if (!firstMatchAssigned) {
      results.set(set.id, { lifecycle: "current", reason: "Matches the exact current decoded parent audio." });
      firstMatchAssigned = true;
    } else {
      results.set(set.id, { lifecycle: "archived", reason: "An earlier set that still matches the parent audio, superseded by a newer current set." });
    }
  }
  return results;
}

export function findCurrentStemSet(sets: TrackStemSet[], lifecycles: Map<string, StemSetLifecycleResult>): TrackStemSet | null {
  return sets.find((s) => lifecycles.get(s.id)?.lifecycle === "current") ?? null;
}

// Cheap existence check for the Library grid's batch badge route — skips
// classification entirely for the vast majority of tracks that have never
// been stem-exported, so a grid of hundreds of rows costs proportional to
// "how many actually have stems," never "how many rows exist."
export function hasAnyStemSets(stemLibraryRoot: string, safeTrackId: string): boolean {
  return listSubdirNames(trackStemSetsDir(stemLibraryRoot, safeTrackId)).length > 0;
}
