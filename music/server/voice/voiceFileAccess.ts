import fs from "node:fs";
import path from "node:path";
import { revealDirectoryInFinder } from "../radio/radioPackageReveal";
import { isPathConfinedTo } from "../radio/radioFsUtils";

const VOICE_ROOT_PREFIX = "voice/";

function resolveVoicePath(libraryRoot: string, relativePath: string): string | null {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized.startsWith(VOICE_ROOT_PREFIX)) return null;
  const resolved = path.resolve(libraryRoot, normalized);
  return isPathConfinedTo(libraryRoot, resolved) ? resolved : null;
}

export async function revealVoiceFileInFinder(
  libraryRoot: string,
  relativePath: string,
): Promise<{ ok: boolean; reason?: "not_found" | "forbidden" | "exec_failed" | "unsupported_platform" }> {
  const resolved = resolveVoicePath(libraryRoot, relativePath);
  if (!resolved) return { ok: false, reason: "forbidden" };
  if (!fs.existsSync(resolved)) return { ok: false, reason: "not_found" };
  const result = await revealDirectoryInFinder(resolved);
  return result.ok ? { ok: true } : result;
}

export function deleteVoiceFile(
  libraryRoot: string,
  relativePath: string,
): { ok: boolean; reason?: "not_found" | "forbidden" | "delete_failed" } {
  const resolved = resolveVoicePath(libraryRoot, relativePath);
  if (!resolved) return { ok: false, reason: "forbidden" };
  if (!fs.existsSync(resolved)) return { ok: false, reason: "not_found" };
  try {
    fs.unlinkSync(resolved);
    return { ok: true };
  } catch {
    return { ok: false, reason: "delete_failed" };
  }
}
