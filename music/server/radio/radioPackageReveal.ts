// RadioLoop Library Workspace (0717A) — POST /radio-package-reveal.
// Node-only. Argument-array subprocess only, same shape as
// radioOpusEncoder.ts's execFile('ffmpeg', ...) — never an interpolated
// shell string. Resolves the package directory server-side from validated
// (radioLoopId, packageVersion); never accepts a client-supplied path.

import { execFile } from "node:child_process";
import fs from "node:fs";
import { packageVersionDir } from "./radioPackageWriter";
import type { RadioLoopId, RadioPackageVersion } from "../../src/data/radioLoopTypes";

export interface RevealResult {
  ok: boolean;
  reason?: "unsupported_platform" | "not_found" | "exec_failed";
  stderrTail?: string;
}

const STDERR_TAIL_CHARS = 2000;

export function revealPackageInFinder(radioLibraryRoot: string, radioLoopId: RadioLoopId, packageVersion: RadioPackageVersion): Promise<RevealResult> {
  return revealDirectoryInFinder(packageVersionDir(radioLibraryRoot, radioLoopId, packageVersion));
}

// 0718B — the generic form, reused for revealing an exported web-bundle
// version directory. Callers resolve `dir` server-side from validated
// identifiers (never a client-supplied path) before calling this.
export function revealDirectoryInFinder(dir: string): Promise<RevealResult> {
  if (!fs.existsSync(dir)) {
    return Promise.resolve({ ok: false, reason: "not_found" });
  }
  if (process.platform !== "darwin") {
    return Promise.resolve({ ok: false, reason: "unsupported_platform" });
  }
  return new Promise((resolve) => {
    execFile("open", ["-R", dir], (error, _stdout, stderr) => {
      resolve({ ok: !error, reason: error ? "exec_failed" : undefined, stderrTail: (stderr ?? "").slice(-STDERR_TAIL_CHARS) });
    });
  });
}
