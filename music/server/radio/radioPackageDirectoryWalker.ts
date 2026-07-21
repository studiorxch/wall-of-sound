// RadioLoop Library Workspace (0717A) — the one place that walks
// packages/<radioLoopId>/v<N>/metadata.json. Node-only. Three call sites
// need this exact traversal with different aggregation
// (radioManifestBuilder.scanPackageManifests, radioPackageVersionIndex.ts,
// radioLibraryIndex.ts) — factored out once rather than tripled.

import path from "node:path";
import { readJsonSafe, listSubdirNames } from "./radioFsUtils";
import type { RadioLoopId, RadioLoopPackageManifest, RadioPackageVersion } from "../../src/data/radioLoopTypes";

export interface WalkedPackageVersion {
  radioLoopId: RadioLoopId;
  packageVersion: RadioPackageVersion;
  metadata: RadioLoopPackageManifest;
}

const VERSION_DIR_PATTERN = /^v(\d+)$/;

function packagesDir(radioLibraryRoot: string): string {
  return path.join(radioLibraryRoot, "packages");
}

// Scans only validated version directories (readable, parseable
// metadata.json) — never a raw `.opus` file scan, never a filename-only
// guess. Unreadable/corrupt version directories are skipped rather than
// failing the whole walk; `onIssue`, when provided, is called once per
// skipped directory with the same `unreadable_metadata:<id>/<version>`
// message shape radioManifestBuilder.ts's callers already expect.
export function walkPackageVersions(radioLibraryRoot: string, radioLoopIdFilter?: RadioLoopId, onIssue?: (issue: string) => void): WalkedPackageVersion[] {
  const root = packagesDir(radioLibraryRoot);
  const radioLoopIds = radioLoopIdFilter ? [radioLoopIdFilter] : listSubdirNames(root);
  const results: WalkedPackageVersion[] = [];

  for (const radioLoopId of radioLoopIds) {
    const idDir = path.join(root, radioLoopId);
    for (const versionDirName of listSubdirNames(idDir)) {
      const match = VERSION_DIR_PATTERN.exec(versionDirName);
      if (!match) continue;
      const packageVersion = Number(match[1]);
      const metadata = readJsonSafe<RadioLoopPackageManifest>(path.join(idDir, versionDirName, "metadata.json"));
      if (!metadata) {
        onIssue?.(`unreadable_metadata:${radioLoopId}/${versionDirName}`);
        continue;
      }
      results.push({ radioLoopId, packageVersion, metadata });
    }
  }
  return results;
}

// The highest-numbered version for one RadioLoop ID, or null if none
// exist. Disk-authoritative — never derived from the manifest, which may
// already suppress this exact RadioLoop (see radioManifestBuilder decision
// 2) or simply lag a pending rebuild.
export function findHighestPackageVersion(radioLibraryRoot: string, radioLoopId: RadioLoopId): WalkedPackageVersion | null {
  const versions = walkPackageVersions(radioLibraryRoot, radioLoopId);
  if (versions.length === 0) return null;
  return versions.reduce((highest, v) => (v.packageVersion > highest.packageVersion ? v : highest));
}
