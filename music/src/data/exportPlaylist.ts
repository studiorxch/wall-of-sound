import type { PlaylistProject } from "./playlistTypes";
import type { Track } from "./trackTypes";
import type { TrackSlot } from "./playlistTypes";
import { validatePlaylistForExport, type ExportHealthReport } from "../logic/exportHealth";
import { formatNumber } from "../logic/dateFormat";

export type M3uExportResult = {
  content: string;
  report: ExportHealthReport;
};

export function exportM3u(params: {
  tracks: Track[];
  slots: TrackSlot[];
  title?: string;
}): M3uExportResult {
  const { tracks, slots } = params;
  const tracksById = new Map(tracks.map((t) => [t.trackId, t]));
  const report = validatePlaylistForExport(slots, tracksById);

  const exportableStatuses = new Set(["ok", "questionable_path", "repeat"]);
  const lines: string[] = ["#EXTM3U"];

  for (const item of report.items) {
    if (!exportableStatuses.has(item.status)) continue;
    if (!item.filePath) continue;
    const track = item.trackId ? tracksById.get(item.trackId) : undefined;
    const dur = Math.round(track?.durationSeconds ?? 0);
    const label = `${item.artist ?? "Unknown"} - ${item.title ?? "Unknown"}`;
    lines.push(`#EXTINF:${dur},${label}`);
    lines.push(item.filePath);
  }

  return { content: lines.join("\n"), report };
}

// Legacy — kept for backward compat with any callers that haven't migrated
export function exportProjectJson(project: PlaylistProject): string {
  return JSON.stringify(project, null, 2);
}

export function exportPlaylistCsv(project: PlaylistProject): string {
  const tracksById = new Map(project.tracks.map((t) => [t.trackId, t]));
  const header = "slotIndex,title,artist,bpm,camelotKey,durationSeconds,energy,startTimeSeconds,warningLevel,warningMessages";
  const rows = project.slots.map((slot) => {
    const track = slot.assignedTrackId ? tracksById.get(slot.assignedTrackId) : undefined;
    return [
      slot.slotIndex,
      csvEsc(track?.title ?? ""),
      csvEsc(track?.artist ?? ""),
      track?.bpm ?? "",
      track?.camelotKey ?? "",
      track?.durationSeconds ?? "",
      track?.energy ?? "",
      formatNumber(slot.startTimeSeconds, 1, ""),
      slot.warningLevel,
      csvEsc(slot.warningMessages.join("; ")),
    ].join(",");
  });
  return [header, ...rows].join("\n");
}

function csvEsc(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
