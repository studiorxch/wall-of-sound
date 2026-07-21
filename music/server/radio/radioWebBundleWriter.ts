// 0718B_RADIO_Web_Publication_Asset_Export_Bridge — writes one immutable,
// versioned, self-contained web bundle (spec §Web bundle contract).
// Node-only. NOTHING here uploads, deploys, or hosts anything.
//
// Layout: <webExportRoot>/<slug>/v<N>/{radio-manifest.json, playlist.json,
// artwork/cover.<ext>?, audio/<rtrackId>-v<pkgVersion>.opus, checksums.json}
//
// Safety: bundle content is assembled in a staging directory; version
// allocation + the atomic rename into <slug>/v<N> happen inside the shared
// radio ID lock with a refuse-existing-target check, so repeated clicks or
// concurrent exports can never collide or half-publish. Re-export creates
// vN+1 and never touches vN. Audio is COPIED from immutable RadioTrack
// packages (no symlinks) and re-hashed after the copy. All payloads come
// from the bound package manifests — never from the client.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { randomUUID } from "node:crypto";
import { readJsonSafe, writeJsonAtomic, ensureDir, removeDirIfExists, moveDir, listSubdirNames } from "./radioFsUtils";
import { sha256File } from "./radioVersionCloneHelper";
import { withRadioIdLock } from "./radioIdAssigner";
import { trackPackageVersionDir } from "./radioTrackPackageWriter";
import { validateWebBundle } from "./radioWebBundleValidator";
import type { RadioTrackPackageManifest } from "../../src/data/radioTrackPackageTypes";
import {
  RADIO_WEB_BUNDLE_SCHEMA_VERSION,
  type RadioWebBundleExportRequest,
  type RadioWebBundleExportResponse,
  type RadioWebChecksumsFile,
  type RadioWebManifest,
  type RadioWebManifestEntry,
  type RadioWebPlaylistFile,
} from "../../src/data/radioWebBundleTypes";
import type { RadioValidationIssue } from "../../src/data/radioLoopTypes";

const VERSION_DIR_PATTERN = /^v(\d+)$/;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;
const ARTWORK_DATA_URL_PATTERN = /^data:image\/(png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/=]+)$/;

function issue(code: string, message: string): RadioValidationIssue {
  return { code, message, severity: "error" };
}

function slugDir(webExportRoot: string, slug: string): string {
  return path.join(webExportRoot, slug);
}

export function listBundleVersions(webExportRoot: string, slug: string): number[] {
  return listSubdirNames(slugDir(webExportRoot, slug))
    .map((name) => VERSION_DIR_PATTERN.exec(name)?.[1])
    .filter((v): v is string => v != null)
    .map(Number)
    .sort((a, b) => a - b);
}

// The semantic content signature: ordered exact bindings + station
// identity + artwork bytes. Timestamps and bundle version are deliberately
// excluded — the same playlist content re-exported yields the same
// signature (spec §Determinism / unchanged-export detection).
export function computeContentSignature(request: RadioWebBundleExportRequest, artworkSha256: string | null): string {
  const canonical = JSON.stringify({
    stationId: request.stationId,
    title: request.title,
    entries: request.entries.map((e) => ({ id: e.radioTrackId, v: e.packageVersion })),
    artwork: artworkSha256,
  });
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

function readLatestContentSignature(webExportRoot: string, slug: string): { version: number; contentSignature: string } | null {
  const versions = listBundleVersions(webExportRoot, slug);
  if (versions.length === 0) return null;
  const latest = versions[versions.length - 1];
  const checksums = readJsonSafe<RadioWebChecksumsFile>(path.join(slugDir(webExportRoot, slug), `v${latest}`, "checksums.json"));
  if (!checksums?.contentSignature) return null;
  return { version: latest, contentSignature: checksums.contentSignature };
}

interface ResolvedEntry {
  radioTrackId: string;
  packageVersion: number;
  metadata: RadioTrackPackageManifest;
  packageAudioPath: string;
  bundleAudioRelPath: string; // POSIX, e.g. "audio/rtrack_000001-v1.opus"
}

export interface ExportWebBundleParams {
  webExportRoot: string;
  trackLibraryRoot: string;
  request: RadioWebBundleExportRequest;
}

export async function exportWebBundle(params: ExportWebBundleParams): Promise<RadioWebBundleExportResponse> {
  const { webExportRoot, trackLibraryRoot, request } = params;

  if (!SLUG_PATTERN.test(request.slug)) {
    return { ok: false, issues: [issue("RADIO_WEB_BUNDLE_BAD_SLUG", `Slug must match ${SLUG_PATTERN}`)] };
  }
  if (!request.entries.length) {
    return { ok: false, issues: [issue("RADIO_WEB_BUNDLE_EMPTY", "A bundle needs at least one enabled, ready entry")] };
  }

  // Resolve + verify every exact binding against the real immutable
  // packages BEFORE writing anything.
  const resolved: ResolvedEntry[] = [];
  for (const entry of request.entries) {
    const pkgDir = trackPackageVersionDir(trackLibraryRoot, entry.radioTrackId, entry.packageVersion);
    const metadata = readJsonSafe<RadioTrackPackageManifest>(path.join(pkgDir, "metadata.json"));
    if (!metadata || metadata.radioTrackId !== entry.radioTrackId || metadata.packageVersion !== entry.packageVersion) {
      return { ok: false, issues: [issue("RADIO_WEB_BUNDLE_BINDING_INVALID", `Package ${entry.radioTrackId} v${entry.packageVersion} is missing or inconsistent`)] };
    }
    const packageAudioPath = path.join(pkgDir, metadata.audio.primary.relativePath);
    if (!fs.existsSync(packageAudioPath) || sha256File(packageAudioPath) !== metadata.audio.primary.sha256) {
      return { ok: false, issues: [issue("RADIO_WEB_BUNDLE_PACKAGE_CORRUPT", `Package audio for ${entry.radioTrackId} v${entry.packageVersion} fails its manifest hash`)] };
    }
    resolved.push({
      radioTrackId: entry.radioTrackId,
      packageVersion: entry.packageVersion,
      metadata,
      packageAudioPath,
      bundleAudioRelPath: `audio/${entry.radioTrackId}-v${entry.packageVersion}.opus`,
    });
  }

  // Artwork: data-URL only; decoded to bytes, format preserved.
  let artworkBytes: Buffer | null = null;
  let artworkExt: string | null = null;
  if (request.artworkDataUrl) {
    const match = ARTWORK_DATA_URL_PATTERN.exec(request.artworkDataUrl);
    if (!match) {
      return { ok: false, issues: [issue("RADIO_WEB_BUNDLE_BAD_ARTWORK", "Artwork must be a base64 image data URL (png/jpeg/webp/gif)")] };
    }
    artworkExt = match[1] === "jpg" ? "jpeg" : match[1];
    artworkBytes = Buffer.from(match[2], "base64");
  }
  const artworkSha256 = artworkBytes ? crypto.createHash("sha256").update(artworkBytes).digest("hex") : null;
  const artworkRelPath = artworkBytes ? `artwork/cover.${artworkExt}` : undefined;

  const contentSignature = computeContentSignature(request, artworkSha256);

  // Unchanged-export detection (pre-staging; re-checked under the lock).
  const latest = readLatestContentSignature(webExportRoot, request.slug);
  if (latest && latest.contentSignature === contentSignature && !request.force) {
    return { ok: true, unchanged: true, existingVersion: latest.version, slug: request.slug, contentSignature, issues: [] };
  }

  // Assemble the version-independent content in staging.
  const operationId = randomUUID();
  const stagingDir = path.join(webExportRoot, "staging", `op-${operationId}`);
  ensureDir(path.join(stagingDir, "audio"));

  try {
    const files: Record<string, { sha256: string; byteSize: number }> = {};
    const manifestEntries: RadioWebManifestEntry[] = [];

    for (const entry of resolved) {
      const dest = path.join(stagingDir, entry.bundleAudioRelPath);
      fs.copyFileSync(entry.packageAudioPath, dest);
      // Re-verify the COPY byte-for-byte against the package manifest.
      const copiedSha = sha256File(dest);
      if (copiedSha !== entry.metadata.audio.primary.sha256) {
        throw new Error(`copy verification failed for ${entry.bundleAudioRelPath}`);
      }
      files[entry.bundleAudioRelPath] = { sha256: copiedSha, byteSize: fs.statSync(dest).size };
      manifestEntries.push({
        radioTrackId: entry.radioTrackId,
        packageVersion: entry.packageVersion,
        audioUrl: entry.bundleAudioRelPath,
        durationSeconds: entry.metadata.audio.primary.durationSeconds,
        byteSize: entry.metadata.audio.primary.byteSize,
        sha256: entry.metadata.audio.primary.sha256,
        title: entry.metadata.display.title,
        artist: entry.metadata.display.artist,
        bpm: entry.metadata.musical.bpm,
        key: entry.metadata.musical.key,
        moods: entry.metadata.musical.moods,
        genres: entry.metadata.musical.genres,
      });
    }

    if (artworkBytes && artworkRelPath) {
      const dest = path.join(stagingDir, artworkRelPath);
      ensureDir(path.dirname(dest));
      fs.writeFileSync(dest, artworkBytes);
      files[artworkRelPath] = { sha256: artworkSha256!, byteSize: artworkBytes.length };
    }

    const totalDurationSeconds = manifestEntries.reduce((sum, e) => sum + e.durationSeconds, 0);
    const totalByteSize = manifestEntries.reduce((sum, e) => sum + e.byteSize, 0) + (artworkBytes?.length ?? 0);

    // Version allocation + finalize under the shared radio ID lock:
    // repeated clicks / concurrent exports serialize here, and the
    // refuse-existing-target rename makes collision structurally
    // impossible even if the scan raced.
    const finalizeResult = await withRadioIdLock<{ ok: true; bundleVersion: number; targetDir: string } | { ok: false; response: RadioWebBundleExportResponse }>(() => {
      const latestNow = readLatestContentSignature(webExportRoot, request.slug);
      if (latestNow && latestNow.contentSignature === contentSignature && !request.force) {
        return { ok: false, response: { ok: true, unchanged: true, existingVersion: latestNow.version, slug: request.slug, contentSignature, issues: [] } };
      }
      const versions = listBundleVersions(webExportRoot, request.slug);
      const bundleVersion = (versions[versions.length - 1] ?? 0) + 1;
      const createdAt = new Date().toISOString();

      const radioManifest: RadioWebManifest = {
        schemaVersion: RADIO_WEB_BUNDLE_SCHEMA_VERSION,
        stationId: request.stationId,
        bundleVersion,
        title: request.title,
        artworkUrl: artworkRelPath,
        entries: manifestEntries,
        totalDurationSeconds,
        totalByteSize,
        createdAt,
        performanceAssets: [],
      };
      const playlistFile: RadioWebPlaylistFile = {
        schemaVersion: RADIO_WEB_BUNDLE_SCHEMA_VERSION,
        stationId: request.stationId,
        bundleVersion,
        entries: resolved.map((e) => ({
          radioTrackId: e.radioTrackId,
          packageVersion: e.packageVersion,
          title: e.metadata.display.title,
          artist: e.metadata.display.artist,
          durationSeconds: e.metadata.audio.primary.durationSeconds,
          songIntelligence: {
            revision: e.metadata.songIntelligence.revision,
            status: e.metadata.songIntelligence.status,
            sections: e.metadata.songIntelligence.sections,
          },
        })),
      };

      writeJsonAtomic(path.join(stagingDir, "radio-manifest.json"), radioManifest);
      writeJsonAtomic(path.join(stagingDir, "playlist.json"), playlistFile);
      files["radio-manifest.json"] = { sha256: sha256File(path.join(stagingDir, "radio-manifest.json")), byteSize: fs.statSync(path.join(stagingDir, "radio-manifest.json")).size };
      files["playlist.json"] = { sha256: sha256File(path.join(stagingDir, "playlist.json")), byteSize: fs.statSync(path.join(stagingDir, "playlist.json")).size };

      const checksums: RadioWebChecksumsFile = { schemaVersion: RADIO_WEB_BUNDLE_SCHEMA_VERSION, contentSignature, files };
      writeJsonAtomic(path.join(stagingDir, "checksums.json"), checksums);

      const targetDir = path.join(slugDir(webExportRoot, request.slug), `v${bundleVersion}`);
      if (fs.existsSync(targetDir)) {
        return { ok: false, response: { ok: false, issues: [issue("RADIO_WEB_BUNDLE_VERSION_EXISTS", `Refusing to overwrite existing bundle ${request.slug} v${bundleVersion}`)] } };
      }
      moveDir(stagingDir, targetDir);
      return { ok: true, bundleVersion, targetDir };
    });

    if (!finalizeResult.ok) {
      removeDirIfExists(stagingDir);
      return finalizeResult.response;
    }

    // Post-export validation — only a fully validated bundle is EXPORTED.
    // A failed finalize/validation rolls back (removes) the just-written
    // version so it can never linger as a half-valid export.
    const validation = validateWebBundle(finalizeResult.targetDir, { trackLibraryRoot });
    if (!validation.ok) {
      removeDirIfExists(finalizeResult.targetDir);
      const parent = slugDir(webExportRoot, request.slug);
      if (fs.existsSync(parent) && fs.readdirSync(parent).length === 0) removeDirIfExists(parent);
      return { ok: false, issues: [issue("RADIO_WEB_BUNDLE_VALIDATION_FAILED", "Exported bundle failed post-export validation and was rolled back"), ...validation.issues] };
    }

    return {
      ok: true,
      unchanged: false,
      bundleVersion: finalizeResult.bundleVersion,
      slug: request.slug,
      exportPath: finalizeResult.targetDir,
      contentSignature,
      totalByteSize,
      totalDurationSeconds,
      entryCount: manifestEntries.length,
      validation,
      issues: [],
    };
  } catch (e) {
    removeDirIfExists(stagingDir);
    return { ok: false, issues: [issue("RADIO_WEB_BUNDLE_WRITE_FAILED", String(e))] };
  }
}
