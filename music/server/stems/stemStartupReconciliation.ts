// 0722C_MUSIC_Production_Stem_Export — startup reconciliation for staging
// directories abandoned by a prior process (a Vite dev-server restart
// mid-job). Node-only. Runs once from a `configureServer` hook.
//
// This NEVER promotes anything it finds — a set that was mid-separation
// when the server died must never silently become a registered stem set.
// It only writes a diagnostic marker so the job-status API can surface a
// distinct "interrupted" state instead of the UI showing nothing (which
// would look like the export never happened) or, worse, showing it stuck
// "processing" forever (since the in-memory job registry that WOULD have
// tracked it starts empty on every process restart and has no way to know
// this staging dir exists without this scan).

import fs from "node:fs";
import path from "node:path";
import { listSubdirNames, writeJsonAtomic, readJsonSafe } from "./stemFsUtils";

const STAGING_DIRNAME = "staging";
const MARKER_FILENAME = "interrupted-job.json";

export interface InterruptedJobRecord {
  operationId: string;
  detectedAt: string;
  stagingDir: string;
}

// Idempotent — re-running (e.g. a second dev-server restart before anyone
// looked) never overwrites an already-detected marker's original
// `detectedAt`, so the diagnostic reflects the FIRST time this was noticed.
export function reconcileAbandonedStemStaging(stemLibraryRoot: string): InterruptedJobRecord[] {
  const stagingRoot = path.join(stemLibraryRoot, STAGING_DIRNAME);
  if (!fs.existsSync(stagingRoot)) return [];

  const found: InterruptedJobRecord[] = [];
  for (const opDirName of listSubdirNames(stagingRoot)) {
    if (!opDirName.startsWith("op-")) continue;
    const dir = path.join(stagingRoot, opDirName);
    const markerPath = path.join(dir, MARKER_FILENAME);
    const existing = readJsonSafe<InterruptedJobRecord>(markerPath);
    if (existing) { found.push(existing); continue; }
    const record: InterruptedJobRecord = {
      operationId: opDirName.slice("op-".length),
      detectedAt: new Date().toISOString(),
      stagingDir: dir,
    };
    writeJsonAtomic(markerPath, record);
    found.push(record);
  }
  return found;
}

export function listInterruptedStemJobs(stemLibraryRoot: string): InterruptedJobRecord[] {
  const stagingRoot = path.join(stemLibraryRoot, STAGING_DIRNAME);
  if (!fs.existsSync(stagingRoot)) return [];
  const records: InterruptedJobRecord[] = [];
  for (const opDirName of listSubdirNames(stagingRoot)) {
    const marker = readJsonSafe<InterruptedJobRecord>(path.join(stagingRoot, opDirName, MARKER_FILENAME));
    if (marker) records.push(marker);
  }
  return records;
}
