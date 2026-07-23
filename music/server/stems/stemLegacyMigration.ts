// 0722C_MUSIC_Production_Stem_Export — copies the FOUR already-known,
// already-library-managed audio files behind an old `derivedKind:"stem"`
// group into fresh staging (no browser upload needed — they're already on
// disk under LIBRARY_ROOT), then hands off to the exact same
// validate+promote pipeline "Register Existing Stem Set…" uses. Node-only.

import fs from "node:fs";
import path from "node:path";
import { isPathConfinedTo, resolveTrackSourcePath } from "./stemFsUtils";
import { createStagingOperation as ensureStaged } from "./stemStagingFs";
import { STEM_ROLES, type StemRole } from "../../src/data/trackStemTypes";

export interface StageLegacyStemFilesResult {
  ok: boolean;
  stagingDir?: string;
  roleAssignments?: Record<StemRole, string>;
  reason?: string;
}

export function stageLegacyStemFiles(
  musicLibraryRoot: string,
  stemLibraryRoot: string,
  operationId: string,
  legacyAudioRelPaths: Partial<Record<StemRole, string>>,
): StageLegacyStemFilesResult {
  for (const role of STEM_ROLES) {
    if (!legacyAudioRelPaths[role]) return { ok: false, reason: `No legacy file known for role ${role}.` };
  }
  const stagingDir = ensureStaged(stemLibraryRoot, operationId);
  const roleAssignments: Partial<Record<StemRole, string>> = {};
  for (const role of STEM_ROLES) {
    const relPath = legacyAudioRelPaths[role]!;
    const src = resolveTrackSourcePath(musicLibraryRoot, relPath);
    if (!isPathConfinedTo(musicLibraryRoot, src) || !fs.existsSync(src)) {
      return { ok: false, reason: `${role}: legacy file not found (${relPath}).` };
    }
    const destName = `${role}-legacy${path.extname(src)}`;
    fs.copyFileSync(src, path.join(stagingDir, destName));
    roleAssignments[role] = destName;
  }
  return { ok: true, stagingDir, roleAssignments: roleAssignments as Record<StemRole, string> };
}
