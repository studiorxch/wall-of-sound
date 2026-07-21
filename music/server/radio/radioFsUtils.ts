// RadioLoop Library Foundation — small shared filesystem helpers used by
// every server/radio module. Node-only; never imported by browser code.
// Kept deliberately tiny and single-purpose (build spec §5: "do not create
// one promotion God function" applies equally to shared utilities).

import fs from "node:fs";
import path from "node:path";

// Confines a resolved path inside a root directory — the same guard shape
// vite.config.ts's existing /library-write already uses, factored out so
// every new radio route uses one tested implementation.
export function isPathConfinedTo(root: string, resolved: string): boolean {
  return resolved === root || resolved.startsWith(root + path.sep);
}

export function readJsonSafe<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const text = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// Temp-file + rename — the write is atomic from any reader's perspective;
// a crash mid-write leaves the previous file untouched (doctrine §8:
// "manifest generation must be deterministic"; build spec §5.8: "preserve
// the previous valid manifest if generation fails").
export function writeJsonAtomic(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmpPath, filePath);
}

export function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

// fs.renameSync is atomic within the same filesystem, which radioLibraryRoot
// always is (staging/ and packages/ are both under it) — no cross-device
// fallback needed.
export function moveDir(fromPath: string, toPath: string): void {
  fs.mkdirSync(path.dirname(toPath), { recursive: true });
  fs.renameSync(fromPath, toPath);
}

export function moveFile(fromPath: string, toPath: string): void {
  fs.mkdirSync(path.dirname(toPath), { recursive: true });
  fs.renameSync(fromPath, toPath);
}

export function removeDirIfExists(dirPath: string): void {
  if (fs.existsSync(dirPath)) fs.rmSync(dirPath, { recursive: true, force: true });
}

export function listSubdirNames(dirPath: string): string[] {
  // A defensive existsSync+isDirectory guard rather than just existsSync:
  // a caller-controlled path segment (e.g. a slug) could exist as a FILE
  // (a genuine failure-injection scenario exercised by
  // radioWebBundleWriter.test.ts's rollback test), and readdirSync throws
  // ENOTDIR in that case rather than the more useful "nothing here yet".
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) return [];
  return fs.readdirSync(dirPath, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}
