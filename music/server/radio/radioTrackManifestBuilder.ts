// 0718B_RADIO_Web_Publication_Asset_Export_Bridge — deterministic local
// catalog manifest for the RadioTrackLibrary. Node-only. Mirrors
// radioManifestBuilder.ts exactly (metadata-scan, deterministic sort,
// atomic write, prior-manifest preservation on failure, highest-version-
// RETIRED suppression) over the track root and track manifest schema.

import path from "node:path";
import { readJsonSafe, writeJsonAtomic } from "./radioFsUtils";
import { walkTrackPackageVersions, type WalkedTrackPackageVersion } from "./radioTrackPackageWalker";
import type {
  RadioTrackCatalogManifest,
  RadioTrackCatalogManifestEntry,
} from "../../src/data/radioTrackPackageTypes";
import type { RadioPromotionState } from "../../src/data/radioLoopTypes";

const SCHEMA_VERSION = "1.0.0";
const INCLUDED_STATUSES: RadioPromotionState[] = ["RADIO_READY", "PUBLISHED"];

function manifestPath(trackLibraryRoot: string): string {
  return path.join(trackLibraryRoot, "catalog", "local-manifest.json");
}

// Pure — deterministic sort by RadioTrack ID, then package version.
export function sortTrackManifestEntries(entries: RadioTrackCatalogManifestEntry[]): RadioTrackCatalogManifestEntry[] {
  return [...entries].sort((a, b) => {
    if (a.radioTrackId !== b.radioTrackId) return a.radioTrackId < b.radioTrackId ? -1 : 1;
    return a.packageVersion - b.packageVersion;
  });
}

// Pure.
export function buildTrackManifestDocument(entries: RadioTrackCatalogManifestEntry[], generatedAt: string): RadioTrackCatalogManifest {
  return { schemaVersion: SCHEMA_VERSION, generatedAt, entries: sortTrackManifestEntries(entries) };
}

export function scanTrackPackageManifests(trackLibraryRoot: string): { entries: RadioTrackCatalogManifestEntry[]; issues: string[] } {
  const issues: string[] = [];
  const all = walkTrackPackageVersions(trackLibraryRoot, undefined, (issue) => issues.push(issue));

  const highestByTrack = new Map<string, WalkedTrackPackageVersion>();
  for (const v of all) {
    const current = highestByTrack.get(v.radioTrackId);
    if (!current || v.packageVersion > current.packageVersion) highestByTrack.set(v.radioTrackId, v);
  }

  const entries: RadioTrackCatalogManifestEntry[] = [];
  for (const v of all) {
    if (highestByTrack.get(v.radioTrackId)?.metadata.status === "RETIRED") continue;
    if (!INCLUDED_STATUSES.includes(v.metadata.status)) continue;
    entries.push({
      radioTrackId: v.radioTrackId,
      packageVersion: v.packageVersion,
      status: v.metadata.status,
      source: v.metadata.source,
      sourceAssetHash: v.metadata.sourceAssetHash,
      relativePackagePath: `packages/${v.radioTrackId}/v${v.packageVersion}`,
    });
  }
  return { entries, issues };
}

export interface RegenerateTrackManifestResult {
  ok: boolean;
  manifest?: RadioTrackCatalogManifest;
  issues: string[];
}

export function regenerateTrackManifestOnDisk(trackLibraryRoot: string, generatedAt: string): RegenerateTrackManifestResult {
  const { entries, issues } = scanTrackPackageManifests(trackLibraryRoot);
  try {
    const manifest = buildTrackManifestDocument(entries, generatedAt);
    writeJsonAtomic(manifestPath(trackLibraryRoot), manifest);
    return { ok: true, manifest, issues };
  } catch (e) {
    // writeJsonAtomic only replaces the file on a successful temp-file
    // write — a thrown error leaves the prior manifest untouched.
    return { ok: false, issues: [...issues, `write_failed:${String(e)}`] };
  }
}

export function readCurrentTrackManifest(trackLibraryRoot: string): RadioTrackCatalogManifest | null {
  return readJsonSafe<RadioTrackCatalogManifest>(manifestPath(trackLibraryRoot));
}
