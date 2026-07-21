// 0718B_RADIO_Web_Publication_Asset_Export_Bridge — the deterministic
// preflight/plan builder for a Web Bundle export. Pure — no network, no
// mutation. Every entry's preparation state is computed elsewhere
// (radioEntryPreparation.ts's computeEntryPreparationState) and supplied
// here already resolved, alongside each READY entry's fetched
// RadioTrackPackageManifest (the one source of real byteSize/duration —
// this file never invents a size estimate from anything but that).
//
// Export is blocked unless every enabled (includedInPublish) entry is
// READY — a single NOT_APPROVED/NEEDS_PREPARATION/STALE/FAILED/PREPARING
// entry anywhere in the playlist blocks the whole export, surfaced as a
// named blocker rather than a silent partial bundle.

import type { RadioPlaylist, RadioPlaylistEntry, RadioEntryPreparationState } from "../../data/radioPlaylistTypes";
import type { RadioTrackId, RadioTrackPackageManifest } from "../../data/radioTrackPackageTypes";
import type { RadioWebBundleExportRequest } from "../../data/radioWebBundleTypes";
import type { Track } from "../../data/trackTypes";

export interface EntryPlanInput {
  entry: RadioPlaylistEntry;
  track: Track | undefined;
  state: RadioEntryPreparationState;
  // The bound package's portable metadata — required to place a READY
  // entry into the plan; a READY entry with no manifest yet loaded is
  // treated as blocking (its real size/title can't be honestly reported).
  packageManifest: RadioTrackPackageManifest | null;
}

export interface RadioWebBundlePlanEntry {
  entryId: string;
  radioTrackId: RadioTrackId;
  packageVersion: number;
  title: string;
  artist: string;
  durationSeconds: number;
  byteSize: number;
}

export interface RadioWebBundlePlanBlocker {
  entryId?: string; // absent for playlist-level blockers
  code: string;
  message: string;
}

export interface RadioWebBundlePlanCounts {
  ready: number;
  excluded: number;
  notApproved: number;
  needsPreparation: number;
  preparing: number;
  stale: number;
  failed: number;
  total: number;
}

export interface RadioWebBundlePlan {
  stationId: string;
  title: string;
  readyEntries: RadioWebBundlePlanEntry[];
  counts: RadioWebBundlePlanCounts;
  estimatedAudioBytes: number;
  estimatedArtworkBytes: number;
  estimatedTotalBytes: number;
  artworkAvailable: boolean;
  blockers: RadioWebBundlePlanBlocker[];
  // False whenever any blocker exists, including "this READY entry's
  // manifest hasn't loaded yet" — never true on partial data.
  canExport: boolean;
}

const PREPARATION_STATE_LABEL: Record<RadioEntryPreparationState, string> = {
  NOT_APPROVED: "not yet approved",
  NEEDS_PREPARATION: "not yet prepared",
  PREPARING: "currently preparing",
  READY: "ready",
  STALE: "stale — needs re-preparation",
  FAILED: "failed preparation",
  EXCLUDED: "excluded from export",
};

// Only a data: URL can be embedded in a local bundle — no network fetch
// exists server-side for http(s)-sourced artwork (disclosed deviation,
// see the build plan). An http(s)-sourced or absent cover simply means no
// artwork ships; it never blocks the rest of the export.
function isEmbeddableArtwork(src: string | undefined): boolean {
  return Boolean(src && src.startsWith("data:"));
}

// Base64 encodes 3 bytes as 4 characters — a standard, honest estimate,
// not a byte-exact figure (the exact size is only known once the server
// decodes and writes the file).
function estimateDataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return Math.floor((base64.length * 3) / 4);
}

export function buildWebBundlePlan(playlist: RadioPlaylist, inputs: EntryPlanInput[]): RadioWebBundlePlan {
  const ordered = [...inputs].sort((a, b) => a.entry.order - b.entry.order);

  const counts: RadioWebBundlePlanCounts = {
    ready: 0, excluded: 0, notApproved: 0, needsPreparation: 0, preparing: 0, stale: 0, failed: 0,
    total: ordered.length,
  };
  const readyEntries: RadioWebBundlePlanEntry[] = [];
  const blockers: RadioWebBundlePlanBlocker[] = [];

  if (ordered.length === 0) {
    blockers.push({ code: "RADIO_WEB_BUNDLE_EMPTY_PLAYLIST", message: "This playlist has no entries to export" });
  }

  for (const input of ordered) {
    const { entry, track, state, packageManifest } = input;
    const label = track?.title ?? entry.id;

    switch (state) {
      case "EXCLUDED":
        counts.excluded++;
        continue; // excluded entries never block or appear in the bundle
      case "NOT_APPROVED": counts.notApproved++; break;
      case "NEEDS_PREPARATION": counts.needsPreparation++; break;
      case "PREPARING": counts.preparing++; break;
      case "STALE": counts.stale++; break;
      case "FAILED": counts.failed++; break;
      case "READY": counts.ready++; break;
    }

    if (state !== "READY") {
      blockers.push({ entryId: entry.id, code: `RADIO_WEB_BUNDLE_ENTRY_${state}`, message: `"${label}" is ${PREPARATION_STATE_LABEL[state]}` });
      continue;
    }

    if (!entry.trackBinding || !packageManifest) {
      blockers.push({ entryId: entry.id, code: "RADIO_WEB_BUNDLE_MANIFEST_UNLOADED", message: `"${label}" is ready, but its package details haven't loaded yet` });
      continue;
    }

    readyEntries.push({
      entryId: entry.id,
      radioTrackId: entry.trackBinding.radioTrackId,
      packageVersion: entry.trackBinding.packageVersion,
      title: packageManifest.display.title,
      artist: packageManifest.display.artist,
      durationSeconds: packageManifest.audio.primary.durationSeconds,
      byteSize: packageManifest.audio.primary.byteSize,
    });
  }

  const estimatedAudioBytes = readyEntries.reduce((sum, e) => sum + e.byteSize, 0);
  const artworkAvailable = isEmbeddableArtwork(playlist.coverImage?.src);
  const estimatedArtworkBytes = artworkAvailable ? estimateDataUrlBytes(playlist.coverImage!.src) : 0;

  return {
    stationId: playlist.id,
    title: playlist.title,
    readyEntries,
    counts,
    estimatedAudioBytes,
    estimatedArtworkBytes,
    estimatedTotalBytes: estimatedAudioBytes + estimatedArtworkBytes,
    artworkAvailable,
    blockers,
    canExport: blockers.length === 0 && readyEntries.length > 0,
  };
}

// Lowercase, hyphen-separated, confined to [a-z0-9-], matching the
// server's slug pattern exactly (radioWebBundleWriter.ts). Falls back to
// "station" for a title with no usable characters (e.g. emoji-only) —
// never an empty string, which the server would reject outright.
export function slugifyStationTitle(title: string): string {
  const slug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  return slug || "station";
}

// Turns a validated, exportable plan into the exact request body
// /radio-web-bundle-export expects. Deliberately sends ONLY
// {radioTrackId, packageVersion} per entry — every display/musical/
// section payload is re-derived server-side from the bound immutable
// package manifest, never trusted from the client (see radioWebBundleTypes.ts).
export function buildWebBundleExportRequest(plan: RadioWebBundlePlan, slug: string, artworkDataUrl: string | undefined, force?: boolean): RadioWebBundleExportRequest {
  return {
    stationId: plan.stationId,
    title: plan.title,
    slug,
    entries: plan.readyEntries.map((e) => ({ radioTrackId: e.radioTrackId, packageVersion: e.packageVersion })),
    artworkDataUrl,
    force,
  };
}
