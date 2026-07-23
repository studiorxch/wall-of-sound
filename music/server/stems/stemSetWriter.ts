// 0722C_MUSIC_Production_Stem_Export — atomic promote: staging -> the real
// archive. Node-only. Never overwrites an existing valid `sets/*`
// directory; the caller (stemExportOrchestrator.ts / stemSalvageOrchestrator.ts)
// is responsible for re-confirming the parent's identity immediately before
// calling this, so a parent changed mid-job can't receive the output —
// this module is deliberately mechanical, not a second place identity
// logic could drift.

import fs from "node:fs";
import path from "node:path";
import { writeJsonAtomic, ensureDir, moveDir } from "./stemFsUtils";
import { trackStemSetsDir } from "./stemFsUtils";
import { STEM_ROLES, type StemRole, type TrackStemFile, type TrackStemSet } from "../../src/data/trackStemTypes";

const MANIFEST_FILENAME = "stem-manifest.json";

export function setDirName(createdAt: string, fingerprint: string, model: string): string {
  const safeCreatedAt = createdAt.replace(/[^0-9TZ.-]/g, "");
  const shortFingerprint = fingerprint.slice(0, 8);
  const safeModel = model.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${safeCreatedAt}_${shortFingerprint}_${safeModel}`;
}

export interface FinalizeStemSetParams {
  stemLibraryRoot: string;
  safeTrackId: string;
  stagingDir: string; // contains vocals.wav/drums.wav/bass.wav/other.wav, already validated+normalized
  set: Omit<TrackStemSet, "archiveDirectory" | "stems"> & { stems: Record<StemRole, TrackStemFile> };
}

export interface FinalizeStemSetResult {
  ok: boolean;
  stemSet?: TrackStemSet;
  reason?: string;
}

export function finalizeStemSet(params: FinalizeStemSetParams): FinalizeStemSetResult {
  const { stemLibraryRoot, safeTrackId, stagingDir, set } = params;
  const setsDir = trackStemSetsDir(stemLibraryRoot, safeTrackId);
  const dirName = setDirName(set.createdAt, set.sourceAudioIdentity.fingerprint, set.model);
  const finalDir = path.join(setsDir, dirName);

  if (fs.existsSync(finalDir)) {
    return { ok: false, reason: `a set directory already exists at ${finalDir} — never overwritten` };
  }

  const relativeSetDir = path.relative(stemLibraryRoot, finalDir);
  const stemsWithPaths: Record<StemRole, TrackStemFile> = { ...set.stems };
  for (const role of STEM_ROLES) {
    const file = stemsWithPaths[role];
    stemsWithPaths[role] = { ...file, relativeArchivePath: path.join(relativeSetDir, file.fileName) };
  }

  const stemSet: TrackStemSet = { ...set, archiveDirectory: relativeSetDir, stems: stemsWithPaths };

  writeJsonAtomic(path.join(stagingDir, MANIFEST_FILENAME), stemSet);
  ensureDir(setsDir);
  moveDir(stagingDir, finalDir);

  return { ok: true, stemSet };
}

export function manifestFileName(): string {
  return MANIFEST_FILENAME;
}
