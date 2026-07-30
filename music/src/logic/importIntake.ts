// Import-to-crate intake pipeline (0711_MUSIC_Import_To_Crate_Intake_Pipeline).
// Wraps the existing audioImport.ts upload+stub-track step with review-queue
// construction, filename-based identity parsing, duplicate detection, and
// crate assignment — the pieces that let a raw import become a codec-safe,
// crate-ready commit instead of dropping straight into the active library.

import type { Track } from "../data/trackTypes";
import type { ImportResult } from "./audioImport";
import type { MusicImportIntakeItem, IntakeDuplicateStatus, IntakeItemStatus } from "../data/importTypes";
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

// Whether identifying metadata is complete enough to skip review — evaluated
// identically at construction and after every edit (reresolveIntakeItem), so
// a Catalog import that already has both fields (title from the filename,
// artist from the StudioRich default below) goes straight to Ready, and a
// non-Catalog import with a genuinely blank artist clears to Ready the
// moment the user fills it in, rather than staying stuck on whatever the
// ORIGINAL raw filename parse happened to produce.
function identityWarnings(metadata: { title?: string; artist?: string }): string[] {
  if (!metadata.title?.trim() || !metadata.artist?.trim()) {
    return ["Missing artist/title metadata — review before import."];
  }
  return [];
}

/** Wraps an already-uploaded ImportResult (from audioImport.ts) as a review-queue item. */
export function buildIntakeItem(result: ImportResult, existingTracks: Track[]): MusicImportIntakeItem {
  let { track } = result;
  const parsed = parseIdentityFromFilename(track.audioFileName ?? track.title ?? "");
  if (!track.title?.trim() && parsed.title) track = { ...track, title: parsed.title };
  if (!track.artist?.trim() && parsed.artist) track = { ...track, artist: parsed.artist };

  // 0728_MUSIC_Import_Intake_Simplification §Catalog-aware artist default —
  // offered only, never forced: only fills a genuinely blank artist, on
  // Catalog destinations only, and is still a plain editable field afterward.
  // Applied BEFORE identityWarnings so a Catalog import that now has a
  // complete title+artist (default included) reads Ready, not a stale
  // Needs Review left over from before the default was applied.
  if (track.sourceOwner === "studiorich" && !track.artist?.trim()) {
    track = { ...track, artist: "StudioRich" };
  }

  const warnings = identityWarnings({ title: track.title, artist: track.artist });

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
    warnings,
    errors: [],
    existingTracks,
    track,
  };
}

// Human-readable reason for the item's current non-ready state — the one
// place this text is composed, so the table row and any future surface stay
// in sync with resolveIntakeStatus's own classification.
export function intakeStatusReason(item: MusicImportIntakeItem): string | null {
  if (item.playbackIssue?.status === "unplayable") {
    return item.playbackIssue.message ? `${item.playbackIssue.code ?? "Unplayable"}: ${item.playbackIssue.message}` : "File failed the playability scan.";
  }
  if (item.duplicateStatus === "exact_duplicate") return "Exact duplicate of an existing track.";
  if (item.duplicateStatus === "possible_duplicate") return "Possible duplicate — matches an existing track's artist/title.";
  if (item.warnings.length > 0) return item.warnings[0];
  return null;
}

/** Resolves the item's committable status once its playback scan result is known. */
export function resolveIntakeStatus(item: MusicImportIntakeItem): IntakeItemStatus {
  if (item.playbackIssue?.status === "unplayable") return "blocked";
  const isDuplicate = item.duplicateStatus === "exact_duplicate" || item.duplicateStatus === "possible_duplicate";
  if (isDuplicate && item.duplicateResolution !== "import_separately") return "duplicate";
  if (item.warnings.length > 0) return "needs_review";
  return "ready";
}

// Reruns duplicate detection (the SAME detectDuplicate resolver, never a
// second detection path) AND the identity-completeness check against an
// item's own existingTracks snapshot after a title/artist edit, then
// recomputes its status from those fresh results — never leaves the prior
// status/duplicate result stale against edited metadata.
// Exact-duplicate matching is sourcePath/fileName+duration based, so it is
// unaffected by a text edit and will only ever clear via an explicit
// duplicateResolution; possible-duplicate matching IS title/artist based and
// clears automatically the moment the edited text no longer matches; a
// low-confidence-parse Needs Review clears the moment both fields are filled.
export function reresolveIntakeItem(item: MusicImportIntakeItem): MusicImportIntakeItem {
  const dup = detectDuplicate(
    {
      fileName: item.fileName,
      sourcePath: item.sourcePath,
      title: item.metadata.title,
      artist: item.metadata.artist,
      durationSeconds: item.metadata.durationSeconds,
    },
    item.existingTracks,
  );
  const updated: MusicImportIntakeItem = {
    ...item,
    duplicateStatus: dup.status,
    duplicateOfTrackId: dup.duplicateOfTrackId,
    // A resolution only means something while there's still something to
    // resolve — once the match itself clears, drop it rather than carry a
    // stale decision forward if a later edit reintroduces a match.
    duplicateResolution: dup.status === "not_duplicate" ? undefined : item.duplicateResolution,
    warnings: identityWarnings(item.metadata),
  };
  return { ...updated, status: resolveIntakeStatus(updated) };
}
