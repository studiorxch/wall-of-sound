// RadioLoop Library Workspace (0717A) — GET /radio-package inspection
// route. Node-only. Metadata-only read: never source-reference.json,
// never a local path (metadata.json itself is already validated
// path-absolute-free at write time — see radioPackageWriter.findAbsolutePathIssues).

import path from "node:path";
import { readJsonSafe } from "./radioFsUtils";
import { packageVersionDir } from "./radioPackageWriter";
import type { RadioLoopId, RadioLoopPackageManifest, RadioPackageVersion } from "../../src/data/radioLoopTypes";

export function readPackageMetadata(radioLibraryRoot: string, radioLoopId: RadioLoopId, packageVersion: RadioPackageVersion): RadioLoopPackageManifest | null {
  return readJsonSafe<RadioLoopPackageManifest>(path.join(packageVersionDir(radioLibraryRoot, radioLoopId, packageVersion), "metadata.json"));
}
