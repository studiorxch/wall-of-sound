// RadioLoop Library Foundation — staging operation directories (build spec
// §5.2). Node-only. A promotion never writes directly into packages/; it
// always stages first, and a failed operation is removed or quarantined
// without ever touching an existing valid package.

import path from "node:path";
import fs from "node:fs";
import { ensureDir, removeDirIfExists } from "./radioFsUtils";

export function stagingOperationDir(radioLibraryRoot: string, operationId: string): string {
  return path.join(radioLibraryRoot, "staging", `op-${operationId}`);
}

export function createStagingOperation(radioLibraryRoot: string, operationId: string): string {
  const dir = stagingOperationDir(radioLibraryRoot, operationId);
  ensureDir(dir);
  ensureDir(path.join(dir, "stems"));
  return dir;
}

export function stagingOperationExists(radioLibraryRoot: string, operationId: string): boolean {
  return fs.existsSync(stagingOperationDir(radioLibraryRoot, operationId));
}

// Removes a failed operation's staging directory entirely. Never called
// against anything outside staging/ — callers must only ever pass an
// operationId, never a raw path, so there is no way to point this at
// packages/.
export function cleanupStagingOperation(radioLibraryRoot: string, operationId: string): void {
  removeDirIfExists(stagingOperationDir(radioLibraryRoot, operationId));
}
