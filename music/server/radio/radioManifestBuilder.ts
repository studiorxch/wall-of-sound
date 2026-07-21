// RadioLoop Library Foundation — deterministic local catalog manifest
// (build spec §5.8). Node-only. Scans package METADATA, never arbitrary
// audio filenames, and writes atomically so a failed rebuild can never
// leave a corrupt or partial local-manifest.json.

import path from "node:path";
import { readJsonSafe, writeJsonAtomic } from "./radioFsUtils";
import { walkPackageVersions, type WalkedPackageVersion } from "./radioPackageDirectoryWalker";
import type {
  RadioCatalogManifest,
  RadioCatalogManifestEntry,
  RadioPromotionState,
} from "../../src/data/radioLoopTypes";

const SCHEMA_VERSION = "1.0.0";
// Doctrine §7 — only RADIO_READY/PUBLISHED, non-retired entries are
// playable/listable; CANDIDATE/VALIDATING/RETIRED are excluded.
const INCLUDED_STATUSES: RadioPromotionState[] = ["RADIO_READY", "PUBLISHED"];

function manifestPath(radioLibraryRoot: string): string {
  return path.join(radioLibraryRoot, "catalog", "local-manifest.json");
}

// Pure — deterministic sort by RadioLoop ID, then package version.
export function sortManifestEntries(entries: RadioCatalogManifestEntry[]): RadioCatalogManifestEntry[] {
  return [...entries].sort((a, b) => {
    if (a.radioLoopId !== b.radioLoopId) return a.radioLoopId < b.radioLoopId ? -1 : 1;
    return a.packageVersion - b.packageVersion;
  });
}

// Pure.
export function buildManifestDocument(entries: RadioCatalogManifestEntry[], generatedAt: string): RadioCatalogManifest {
  return { schemaVersion: SCHEMA_VERSION, generatedAt, entries: sortManifestEntries(entries) };
}

// Scans packages/**/metadata.json — the package content itself is the
// source of truth, never a directory-name guess or raw audio-file scan.
//
// 0717A decision 2 (authorized change to this verified 0716B function):
// once a RadioLoop's HIGHEST version is RETIRED, the entire RadioLoop is
// suppressed from the active/schedulable manifest — not just that one
// retired version while an older RADIO_READY version keeps appearing.
// Retirement itself never mutates an existing version (see
// radioRetirementOrchestrator.ts); it creates a new, higher RETIRED
// version, and it's specifically that "new highest version" fact this scan
// reacts to. A non-retired RadioLoop with multiple RADIO_READY versions is
// completely unaffected — every matching version still gets its own entry,
// exactly as before this change (see the regression test in
// radioManifestBuilder.test.ts).
export function scanPackageManifests(radioLibraryRoot: string): { entries: RadioCatalogManifestEntry[]; issues: string[] } {
  const issues: string[] = [];
  const all = walkPackageVersions(radioLibraryRoot, undefined, (issue) => issues.push(issue));

  const highestByLoop = new Map<string, WalkedPackageVersion>();
  for (const v of all) {
    const current = highestByLoop.get(v.radioLoopId);
    if (!current || v.packageVersion > current.packageVersion) highestByLoop.set(v.radioLoopId, v);
  }

  const entries: RadioCatalogManifestEntry[] = [];
  for (const v of all) {
    if (highestByLoop.get(v.radioLoopId)?.metadata.status === "RETIRED") continue;
    if (!INCLUDED_STATUSES.includes(v.metadata.status)) continue;
    entries.push({
      radioLoopId: v.radioLoopId,
      packageVersion: v.packageVersion,
      status: v.metadata.status,
      source: v.metadata.source,
      relativePackagePath: `packages/${v.radioLoopId}/v${v.packageVersion}`,
    });
  }
  return { entries, issues };
}

export interface RegenerateResult {
  ok: boolean;
  manifest?: RadioCatalogManifest;
  issues: string[];
}

// The full deterministic re-scan + atomic write. This is exactly what
// finalize calls internally AND what the standalone /radio-manifest-rebuild
// reconciliation route calls — a full fresh scan every time, so it's
// naturally idempotent and self-healing for any valid-but-unlisted package.
export function regenerateManifestOnDisk(radioLibraryRoot: string, generatedAt: string): RegenerateResult {
  const { entries, issues } = scanPackageManifests(radioLibraryRoot);
  try {
    const manifest = buildManifestDocument(entries, generatedAt);
    writeJsonAtomic(manifestPath(radioLibraryRoot), manifest);
    return { ok: true, manifest, issues };
  } catch (e) {
    // §5.8 — preserve the previous valid manifest if generation fails:
    // writeJsonAtomic only replaces the file on a successful temp-file
    // write, so a thrown error here has already left the prior file
    // completely untouched.
    return { ok: false, issues: [...issues, `write_failed:${String(e)}`] };
  }
}

export function readCurrentManifest(radioLibraryRoot: string): RadioCatalogManifest | null {
  return readJsonSafe<RadioCatalogManifest>(manifestPath(radioLibraryRoot));
}
