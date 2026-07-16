// PLAY project durable export/import (0623B).
// LocalStorage = autosave cache. Project JSON = durable source of truth.

import type { PlayProject } from "./playProjectTypes";
import { downloadFile } from "./exportPlaylist";

// ── Constants ──────────────────────────────────────────────────────────────

export const PLAY_PROJECT_EXPORT_KIND = "PLAY_PROJECT" as const;
export const PLAY_PROJECT_EXPORT_VERSION = "1.0.0" as const;

// ── Types ──────────────────────────────────────────────────────────────────

export type PlayProjectExport = {
  exportKind: typeof PLAY_PROJECT_EXPORT_KIND;
  exportVersion: typeof PLAY_PROJECT_EXPORT_VERSION;
  exportedAt: string;
  appBuild?: string;
  project: PlayProject;
};

// ── Guards ─────────────────────────────────────────────────────────────────

export function isPlayProjectExport(value: unknown): value is PlayProjectExport {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.exportKind === PLAY_PROJECT_EXPORT_KIND &&
    typeof v.exportedAt === "string" &&
    !!v.project &&
    typeof v.project === "object"
  );
}

// ── Create / download ──────────────────────────────────────────────────────

export function createPlayProjectExport(project: PlayProject): PlayProjectExport {
  return {
    exportKind: PLAY_PROJECT_EXPORT_KIND,
    exportVersion: PLAY_PROJECT_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    project,
  };
}

/**
 * Download the project as a JSON file and return the ISO timestamp of export.
 * Filename: PLAY_Project_<titleSlug>_YYYY-MM-DD_HH-mm.json
 */
export function downloadPlayProjectExport(project: PlayProject): string {
  const envelope = createPlayProjectExport(project);
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timeStr = `${pad(now.getHours())}-${pad(now.getMinutes())}`;
  const rawTitle = project.playlists[0]?.title ?? "Project";
  const titleSlug = rawTitle
    .replace(/[^a-zA-Z0-9\s]/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 40) || "Project";
  const filename = `PLAY_Project_${titleSlug}_${dateStr}_${timeStr}.json`;
  downloadFile(filename, JSON.stringify(envelope, null, 2), "application/json");
  return envelope.exportedAt;
}

// ── Import ─────────────────────────────────────────────────────────────────

/**
 * Read a File, parse it as a PLAY project export envelope or raw v2 project.
 * Rejects with a user-readable message if the file is malformed or unrecognized.
 * Returns the raw PlayProject (caller must repair before loading into state).
 *
 * Migration path (0712_MUSIC_Library_Overflow_Menu_Pruning §3/§11): the
 * now-removed "Download Backup" menu action, and Data Management's snapshot
 * downloads, wrapped the same PlayProject under a `state` key instead of
 * `project` (`{ snapshotType, createdAt, summary, state }` or
 * `{ label, exportedAt, state }`) with no exportKind/exportVersion tag.
 * Existing files in either legacy shape remain importable here rather than
 * being orphaned by the menu consolidation.
 */
export function readPlayProjectExportFile(file: File): Promise<PlayProject> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const text = ev.target?.result as string;
        const parsed: unknown = JSON.parse(text);
        if (isPlayProjectExport(parsed)) {
          resolve(parsed.project);
          return;
        }
        if (
          parsed &&
          typeof parsed === "object" &&
          (parsed as Record<string, unknown>).schemaVersion === "play-project-v2"
        ) {
          resolve(parsed as PlayProject);
          return;
        }
        // Legacy backup/snapshot envelope — same PlayProject, wrapped under `state`.
        if (
          parsed &&
          typeof parsed === "object" &&
          "state" in (parsed as Record<string, unknown>) &&
          (parsed as Record<string, unknown>).state &&
          typeof (parsed as Record<string, unknown>).state === "object" &&
          ((parsed as Record<string, unknown>).state as Record<string, unknown>).schemaVersion === "play-project-v2"
        ) {
          resolve((parsed as Record<string, unknown>).state as PlayProject);
          return;
        }
        reject(new Error("Invalid library file.\nMissing playlists/tracks/library schema."));
      } catch {
        reject(new Error("Invalid library file.\nCould not parse JSON."));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file."));
    reader.readAsText(file);
  });
}

// ── Dirty tracking ─────────────────────────────────────────────────────────

/**
 * Stable content hash for dirty tracking — changes when playlists, tracks,
 * slots, schedule, or active selection change. Excludes timestamps.
 */
export function stableProjectHash(project: PlayProject): string {
  const content = {
    activePlaylistId: project.activePlaylistId,
    playlists: project.playlists.map((pl) => ({
      id: pl.playlistId,
      title: pl.title,
      sourceGroupId: pl.sourceGroupId,
      mode: pl.broadcastIdentity?.presentationMode,
      slots: pl.slots.map((s) => s.assignedTrackId ?? ""),
    })),
    trackIds: project.libraryTracks.map((t) => t.trackId),
    scheduleBlocks: project.schedule?.blocks?.map((b) => b.blockId) ?? [],
  };
  return JSON.stringify(content);
}
