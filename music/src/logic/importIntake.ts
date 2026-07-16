// Import-to-crate intake pipeline (0711_MUSIC_Import_To_Crate_Intake_Pipeline).
// Wraps the existing audioImport.ts upload+stub-track step with review-queue
// construction, filename-based identity parsing, duplicate detection, and
// crate assignment — the pieces that let a raw import become a codec-safe,
// crate-ready commit instead of dropping straight into the active library.

import type { Track } from "../data/trackTypes";
import type { CrateRecord } from "../data/crateTypes";
import type { ImportResult } from "./audioImport";
import type { MusicImportIntakeItem, IntakeDuplicateStatus } from "../data/importTypes";
import { SUPPORTED_AUDIO_EXTENSIONS } from "../data/importTypes";

// ── Filename identity parsing ────────────────────────────────────────────────

export function extensionOf(fileName: string): string {
  const m = fileName.match(/\.[^.]+$/);
  return m ? m[0].toLowerCase() : "";
}

export function isSupportedAudioExtension(fileName: string): boolean {
  return SUPPORTED_AUDIO_EXTENSIONS.includes(extensionOf(fileName));
}

/**
 * Parses "Artist - Title.ext" out of a filename. Low confidence (title-only,
 * artist left blank) is reported via `confident: false` rather than guessing —
 * the caller should surface that as an intake warning, not invent data.
 */
export function parseIdentityFromFilename(fileName: string): { title: string; artist: string; confident: boolean } {
  const base = fileName.replace(/\.[^.]+$/, "").trim();
  const parts = base.split(/\s+-\s+/);
  if (parts.length >= 2) {
    const [artist, ...rest] = parts;
    return { title: rest.join(" - ").trim(), artist: artist.trim(), confident: true };
  }
  return { title: base, artist: "", confident: false };
}

// ── Duplicate detection (spec §Duplicate Detection minimum checks) ──────────

const DURATION_TOLERANCE_SECONDS = 2;

function normalizeForCompare(s: string): string {
  return s.toLowerCase().trim().replace(/\s+/g, " ");
}

export function detectDuplicate(
  candidate: { fileName: string; sourcePath: string; title?: string; artist?: string; durationSeconds?: number },
  existingTracks: Track[],
): { status: IntakeDuplicateStatus; duplicateOfTrackId?: string } {
  for (const t of existingTracks) {
    // Same sourcePath (audioRelPath/filePath) — exact duplicate.
    if (candidate.sourcePath && (t.audioRelPath === candidate.sourcePath || t.filePath === candidate.sourcePath)) {
      return { status: "exact_duplicate", duplicateOfTrackId: t.trackId };
    }
    // Same fileName + duration within tolerance — exact duplicate (re-import
    // of the same physical file under a different path).
    if (
      t.audioFileName === candidate.fileName &&
      candidate.durationSeconds != null && t.durationSeconds != null &&
      Math.abs(t.durationSeconds - candidate.durationSeconds) <= DURATION_TOLERANCE_SECONDS
    ) {
      return { status: "exact_duplicate", duplicateOfTrackId: t.trackId };
    }
  }

  if (candidate.title && candidate.artist) {
    const title = normalizeForCompare(candidate.title);
    const artist = normalizeForCompare(candidate.artist);
    for (const t of existingTracks) {
      if (normalizeForCompare(t.title ?? "") === title && normalizeForCompare(t.artist ?? "") === artist) {
        return { status: "possible_duplicate", duplicateOfTrackId: t.trackId };
      }
    }
  }

  return { status: "not_duplicate" };
}

// ── Intake item construction ─────────────────────────────────────────────────

function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/** Wraps an already-uploaded ImportResult (from audioImport.ts) as a review-queue item. */
export function buildIntakeItem(result: ImportResult, existingTracks: Track[]): MusicImportIntakeItem {
  const { track } = result;
  const parsed = parseIdentityFromFilename(track.audioFileName ?? track.title ?? "");
  const warnings: string[] = [];
  if (!parsed.confident) {
    warnings.push(`Low-confidence filename parse — missing artist/title metadata. Review before commit.`);
  }

  const dup = detectDuplicate(
    {
      fileName: track.audioFileName ?? "",
      sourcePath: track.audioRelPath ?? "",
      title: track.title,
      artist: track.artist,
      durationSeconds: track.durationSeconds,
    },
    existingTracks,
  );
  if (dup.status === "exact_duplicate") warnings.push("Exact duplicate of an existing track.");
  else if (dup.status === "possible_duplicate") warnings.push("Possible duplicate — matches an existing track's artist/title.");

  return {
    id: genId("intake"),
    sourcePath: track.audioRelPath ?? "",
    fileName: track.audioFileName ?? track.title ?? "unknown",
    extension: extensionOf(track.audioFileName ?? ""),
    status: "scanning",
    metadata: {
      title: track.title,
      artist: track.artist,
      albumTitle: track.albumTitle,
      durationSeconds: track.durationSeconds,
      bpm: track.bpm,
      energy: track.energy,
    },
    duplicateStatus: dup.status,
    duplicateOfTrackId: dup.duplicateOfTrackId,
    assignedCrateIds: [],
    warnings,
    errors: [],
    track,
  };
}

/** Resolves the item's committable status once its playback scan result is known. */
export function resolveIntakeStatus(item: MusicImportIntakeItem): MusicImportIntakeItem["status"] {
  if (item.playbackIssue?.status === "unplayable") return "blocked";
  if (item.duplicateStatus === "exact_duplicate") return "warning";
  if (item.warnings.length > 0) return "warning";
  return "ready";
}

// ── Crate assignment ─────────────────────────────────────────────────────────
//
// CrateRecord is filter-based (CrateFilters.groupings), not membership-based —
// there is no explicit track-id list to append to. Assignment therefore tags
// the track's single `grouping` field with a shared value and registers that
// same value into every selected crate's filters.groupings, so the crate's
// existing query mechanism picks the track up. Assigning to N crates at once
// means the same tag is added to all N crates' groupings lists.

export function assignTracksToCrates(
  tracks: Track[],
  crates: CrateRecord[],
): { tracks: Track[]; crates: CrateRecord[] } {
  if (crates.length === 0 || tracks.length === 0) return { tracks, crates };
  const tag = crates.length === 1 ? crates[0].name : `intake:${genId("batch")}`;

  const updatedTracks = tracks.map((t) => ({ ...t, grouping: tag }));
  const crateIds = new Set(crates.map((c) => c.id));
  const updatedCrates = crates.map((c) => {
    if (!crateIds.has(c.id)) return c;
    if (c.filters.groupings.includes(tag)) return c;
    return { ...c, filters: { ...c.filters, groupings: [...c.filters.groupings, tag] } };
  });

  return { tracks: updatedTracks, crates: updatedCrates };
}
