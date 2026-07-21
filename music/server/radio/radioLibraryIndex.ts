// RadioLoop Library Workspace (0717A) — GET /radio-library-index.
// Node-only. One portable summary per RadioLoop ID across the WHOLE
// library, including fully-retired ones — the workspace's session-
// independent baseline catalog (correction: populating from /radio-
// manifest would make retired loops silently disappear across sessions,
// which spec §11 forbids and §9.2's Status column needs to display
// RETIRED for). Deliberately separate from and never gated by the
// active/schedulable manifest.

import { walkPackageVersions, type WalkedPackageVersion } from "./radioPackageDirectoryWalker";
import type { RadioLibraryIndexEntry } from "../../src/data/radioWorkspaceTypes";

export function scanLibraryIndex(radioLibraryRoot: string): RadioLibraryIndexEntry[] {
  const all = walkPackageVersions(radioLibraryRoot);

  const highestByLoop = new Map<string, WalkedPackageVersion>();
  for (const v of all) {
    const current = highestByLoop.get(v.radioLoopId);
    if (!current || v.packageVersion > current.packageVersion) highestByLoop.set(v.radioLoopId, v);
  }

  return Array.from(highestByLoop.values())
    .sort((a, b) => (a.radioLoopId < b.radioLoopId ? -1 : a.radioLoopId > b.radioLoopId ? 1 : 0))
    .map((v) => ({
      radioLoopId: v.radioLoopId,
      packageVersion: v.packageVersion,
      status: v.metadata.status,
      source: v.metadata.source,
      workingTitle: v.metadata.title,
      roles: v.metadata.arrangement.roles,
      familyIds: v.metadata.arrangement.familyIds,
    }));
}
