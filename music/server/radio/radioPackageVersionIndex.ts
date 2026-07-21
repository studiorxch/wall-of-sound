// RadioLoop Library Workspace (0717A) — GET /radio-package-versions.
// Node-only. Full version history for ONE RadioLoop, including retired
// versions — the manifest excludes an entire RadioLoop once its highest
// version is retired (radioManifestBuilder.ts), so this is the only route
// that can answer "show me this RadioLoop's complete history."

import { walkPackageVersions } from "./radioPackageDirectoryWalker";
import type { RadioLoopId } from "../../src/data/radioLoopTypes";
import type { RadioLoopVersionIndexEntry } from "../../src/data/radioWorkspaceTypes";

// Portable only — never source-reference.json, never a local path.
export function scanRadioLoopVersions(radioLibraryRoot: string, radioLoopId: RadioLoopId): RadioLoopVersionIndexEntry[] {
  const versions = walkPackageVersions(radioLibraryRoot, radioLoopId);
  return versions
    .sort((a, b) => a.packageVersion - b.packageVersion)
    .map((v) => ({
      radioLoopId: v.radioLoopId,
      packageVersion: v.packageVersion,
      status: v.metadata.status,
      source: v.metadata.source,
      workingTitle: v.metadata.title,
      roles: v.metadata.arrangement.roles,
      familyIds: v.metadata.arrangement.familyIds,
      retirement: v.metadata.retirement,
    }));
}
