/**
 * migratePortableAudioPaths.ts
 *
 * One-pass migration that converts absolute/browser/legacy audio paths on all
 * track-like records into portable audioRelPath + audioFileName + audioCategory
 * fields. Safe to run repeatedly — already-portable records are not touched.
 *
 * Use migratePortableAudioPathsDryRun() to preview, then
 * migratePortableAudioPathsApply() to write through saveMusicState().
 */

import type { Track } from "../data/trackTypes";
import type { PlayProject } from "../data/playProjectTypes";
import {
  toPortableAudioPath,
  classifyAudioPath,
  type AudioCategory,
  type AudioPathKind,
} from "./audioPathResolver";

export interface PortableAudioPathMigrationResult {
  changedCount: number;
  unchangedCount: number;
  unresolvedCount: number;
  absolutePathCount: number;
  browserUrlCount: number;
  legacyProxyCount: number;
  filenameOnlyCount: number;
  alreadyPortableCount: number;
  unsafeCount: number;
  warnings: string[];
}

/** Fields on a Track that may carry audio path information. */
const AUDIO_PATH_FIELDS = ["filePath", "audioPath", "audioUrl", "sourcePath", "src", "url", "path"] as const;

function inferCategoryFromOwner(t: Track): AudioCategory | undefined {
  if (t.sourceOwner === "studiorich") return "catalog";
  if (t.sourceOwner === "external") return "external";
  if (t.sourceOwner === "reference") return "reference";
  // Fall back to existing audioCategory if present
  return (t as unknown as { audioCategory?: AudioCategory }).audioCategory;
}

/**
 * Inspect a single track and return a migrated copy.
 * Returns null if track needs no change.
 */
function migrateTrack(
  track: Track,
  knownRoot?: string,
): { track: Track; kind: AudioPathKind; changed: boolean; warning?: string } {
  const existing = track as unknown as {
    audioRelPath?: string;
    audioCategory?: AudioCategory;
    audioFileName?: string;
    audioStatus?: string;
  };

  // Already has a portable audioRelPath — check if it's safe and skip
  if (existing.audioRelPath && !existing.audioRelPath.includes("://") && !existing.audioRelPath.startsWith("/")) {
    return { track, kind: "relative", changed: false };
  }

  // Collect candidate path values (in priority order)
  const candidates: string[] = [];
  for (const field of AUDIO_PATH_FIELDS) {
    const val = (track as unknown as Record<string, unknown>)[field];
    if (typeof val === "string" && val.trim()) candidates.push(val.trim());
  }
  // Also check existing audioRelPath even if it looks absolute
  if (existing.audioRelPath) candidates.unshift(existing.audioRelPath);

  if (candidates.length === 0) {
    return { track, kind: "empty", changed: false };
  }

  const primaryValue = candidates[0];
  const kind = classifyAudioPath(primaryValue);
  const category = inferCategoryFromOwner(track);

  // Unsafe — flag and mark unresolved
  if (kind === "unsafe") {
    const warned: Track = {
      ...track,
      ...(existing as unknown as object),
    } as Track;
    (warned as unknown as { audioStatus: string }).audioStatus = "unresolved";
    return {
      track: warned,
      kind,
      changed: false,
      warning: `[migrate] Unsafe path on "${track.title}" (${track.trackId}): ${primaryValue}`,
    };
  }

  // Already using new music-audio prefix — just extract relPath
  if (kind === "music_audio") {
    const portable = toPortableAudioPath({ value: primaryValue, category });
    if (portable) {
      const updated = {
        ...track,
        audioRelPath: portable.audioRelPath,
        audioFileName: portable.audioFileName,
        audioCategory: portable.audioCategory,
        audioStatus: "linked",
        audioLinked: true,
      } as Track;
      (updated as unknown as { audioFileName: string }).audioFileName = portable.audioFileName;
      (updated as unknown as { audioRelPath: string }).audioRelPath = portable.audioRelPath;
      (updated as unknown as { audioCategory: AudioCategory }).audioCategory = portable.audioCategory;
      (updated as unknown as { audioStatus: string }).audioStatus = "linked";
      return { track: updated, kind, changed: true };
    }
  }

  // Try resolving with known root candidates
  const knownRootCandidates = knownRoot ? [knownRoot] : undefined;
  const portable = toPortableAudioPath({ value: primaryValue, category, knownRootCandidates });

  if (!portable) {
    // Could not resolve — mark unresolved but don't erase existing data
    const updated = { ...track } as Track;
    (updated as unknown as { audioStatus: string }).audioStatus = "unresolved";
    return {
      track: updated,
      kind,
      changed: false,
      warning: `[migrate] Could not resolve path on "${track.title}" (${track.trackId}): ${primaryValue}`,
    };
  }

  // Build updated track
  const updated = { ...track } as Track & {
    audioRelPath?: string;
    audioCategory?: AudioCategory;
    audioFileName?: string;
    audioStatus?: string;
  };
  updated.audioRelPath = portable.audioRelPath;
  updated.audioCategory = portable.audioCategory;
  updated.audioFileName = portable.audioFileName;
  updated.audioStatus = "linked";
  updated.audioLinked = true;

  return { track: updated as Track, kind, changed: true };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function migratePortableAudioPaths(
  project: PlayProject,
  knownRoot?: string,
): { project: PlayProject; result: PortableAudioPathMigrationResult } {
  const result: PortableAudioPathMigrationResult = {
    changedCount: 0,
    unchangedCount: 0,
    unresolvedCount: 0,
    absolutePathCount: 0,
    browserUrlCount: 0,
    legacyProxyCount: 0,
    filenameOnlyCount: 0,
    alreadyPortableCount: 0,
    unsafeCount: 0,
    warnings: [],
  };

  const kindCounts: Record<AudioPathKind, number> = {
    relative: 0,
    filename_only: 0,
    absolute: 0,
    browser_url: 0,
    legacy_proxy: 0,
    music_audio: 0,
    empty: 0,
    unsafe: 0,
  };

  const migratedTracks = project.libraryTracks.map((t) => {
    const { track, kind, changed, warning } = migrateTrack(t, knownRoot);
    kindCounts[kind]++;
    if (warning) result.warnings.push(warning);
    if (changed) {
      result.changedCount++;
    } else if (kind === "relative" || kind === "music_audio" || kind === "empty") {
      result.unchangedCount++;
    } else {
      result.unresolvedCount++;
    }
    return track;
  });

  result.absolutePathCount = kindCounts.absolute;
  result.browserUrlCount = kindCounts.browser_url;
  result.legacyProxyCount = kindCounts.legacy_proxy;
  result.filenameOnlyCount = kindCounts.filename_only;
  result.alreadyPortableCount = kindCounts.relative + kindCounts.music_audio + kindCounts.empty;
  result.unsafeCount = kindCounts.unsafe;

  return {
    project: { ...project, libraryTracks: migratedTracks },
    result,
  };
}

// ---------------------------------------------------------------------------
// Audit — does not mutate state
// ---------------------------------------------------------------------------

export interface AudioPathAuditResult {
  totalTrackLikeRecords: number;
  linked: number;
  missing: number;
  absolutePaths: number;
  browserUrlsStored: number;
  legacyProxyUrls: number;
  relativePaths: number;
  filenameOnly: number;
  unresolved: number;
  unsafe: number;
  empty: number;
  absoluteExamples: string[];
  browserUrlExamples: string[];
}

export function auditAudioPaths(project: PlayProject): AudioPathAuditResult {
  const audit: AudioPathAuditResult = {
    totalTrackLikeRecords: 0,
    linked: 0,
    missing: 0,
    absolutePaths: 0,
    browserUrlsStored: 0,
    legacyProxyUrls: 0,
    relativePaths: 0,
    filenameOnly: 0,
    unresolved: 0,
    unsafe: 0,
    empty: 0,
    absoluteExamples: [],
    browserUrlExamples: [],
  };

  for (const t of project.libraryTracks) {
    audit.totalTrackLikeRecords++;
    if (t.audioLinked) audit.linked++;
    if (t.audioMissing) audit.missing++;

    // Determine primary path value
    const ext = t as unknown as { audioRelPath?: string; audioStatus?: string };
    const primary = ext.audioRelPath ?? t.filePath ?? "";
    const kind = classifyAudioPath(primary);

    switch (kind) {
      case "relative": audit.relativePaths++; break;
      case "filename_only": audit.filenameOnly++; break;
      case "absolute":
        audit.absolutePaths++;
        if (audit.absoluteExamples.length < 5) audit.absoluteExamples.push(`"${t.title}": ${primary}`);
        break;
      case "browser_url":
        audit.browserUrlsStored++;
        if (audit.browserUrlExamples.length < 5) audit.browserUrlExamples.push(`"${t.title}": ${primary}`);
        break;
      case "legacy_proxy":
        audit.legacyProxyUrls++;
        break;
      case "music_audio": audit.relativePaths++; break;
      case "unsafe": audit.unsafe++; break;
      case "empty": audit.empty++; break;
    }

    if (ext.audioStatus === "unresolved") audit.unresolved++;
  }

  return audit;
}
