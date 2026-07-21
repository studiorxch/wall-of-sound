// 0718B_RADIO_Web_Publication_Asset_Export_Bridge — walks
// packages/<radioTrackId>/v<N>/metadata.json under the RadioTrackLibrary
// root. Node-only. Mirrors radioPackageDirectoryWalker.ts exactly (same
// traversal, same unreadable-skip contract) but typed against
// RadioTrackPackageManifest — the two package families never share a
// metadata schema, so a shared generic walker would only blur the types.

import path from "node:path";
import { readJsonSafe, listSubdirNames } from "./radioFsUtils";
import type { RadioTrackId, RadioTrackPackageManifest } from "../../src/data/radioTrackPackageTypes";

export interface WalkedTrackPackageVersion {
  radioTrackId: RadioTrackId;
  packageVersion: number;
  metadata: RadioTrackPackageManifest;
}

const VERSION_DIR_PATTERN = /^v(\d+)$/;

function packagesDir(trackLibraryRoot: string): string {
  return path.join(trackLibraryRoot, "packages");
}

export function walkTrackPackageVersions(trackLibraryRoot: string, radioTrackIdFilter?: RadioTrackId, onIssue?: (issue: string) => void): WalkedTrackPackageVersion[] {
  const root = packagesDir(trackLibraryRoot);
  const radioTrackIds = radioTrackIdFilter ? [radioTrackIdFilter] : listSubdirNames(root);
  const results: WalkedTrackPackageVersion[] = [];

  for (const radioTrackId of radioTrackIds) {
    const idDir = path.join(root, radioTrackId);
    for (const versionDirName of listSubdirNames(idDir)) {
      const match = VERSION_DIR_PATTERN.exec(versionDirName);
      if (!match) continue;
      const packageVersion = Number(match[1]);
      const metadata = readJsonSafe<RadioTrackPackageManifest>(path.join(idDir, versionDirName, "metadata.json"));
      if (!metadata) {
        onIssue?.(`unreadable_metadata:${radioTrackId}/${versionDirName}`);
        continue;
      }
      results.push({ radioTrackId, packageVersion, metadata });
    }
  }
  return results;
}

// Disk-authoritative highest version for one RadioTrack ID.
export function findHighestTrackPackageVersion(trackLibraryRoot: string, radioTrackId: RadioTrackId): WalkedTrackPackageVersion | null {
  const versions = walkTrackPackageVersions(trackLibraryRoot, radioTrackId);
  if (versions.length === 0) return null;
  return versions.reduce((highest, v) => (v.packageVersion > highest.packageVersion ? v : highest));
}
