import type { TrackSlot } from "../data/playlistTypes";
import type { Track } from "../data/trackTypes";

export type ExportHealthStatus =
  | "ok"
  | "empty_slot"
  | "no_path"
  | "missing_file"
  | "unsupported_extension"
  | "questionable_path"
  | "repeat"
  | "unknown_error";

export type ExportHealthItem = {
  slotIndex: number;
  trackId?: string;
  title?: string;
  artist?: string;
  filePath?: string;
  status: ExportHealthStatus;
  message: string;
};

export type ExportHealthReport = {
  totalSlots: number;
  exportableCount: number;
  skippedCount: number;
  problemCount: number;
  items: ExportHealthItem[];
};

const SUPPORTED_EXTS = new Set([".mp3", ".wav", ".aiff", ".aif", ".flac", ".m4a", ".ogg", ".opus"]);

function isSuspiciousPath(p: string): string | null {
  if (/[\n\r\0]/.test(p)) return "contains control characters";
  if (p !== p.trim()) return "leading/trailing whitespace";
  if (p.startsWith("file://")) return "has file:// prefix (may cause M3U ambiguity)";
  if (!p.startsWith("/")) return "not an absolute path";
  if (/[^\x20-\x7E -￿]/.test(p)) return "contains non-printable characters";
  return null;
}

function extOf(p: string): string {
  const i = p.lastIndexOf(".");
  return i >= 0 ? p.slice(i).toLowerCase() : "";
}

export function validatePlaylistForExport(
  slots: TrackSlot[],
  tracksById: Map<string, Track>,
): ExportHealthReport {
  const seenPaths = new Map<string, number>(); // filePath → first slotIndex
  const items: ExportHealthItem[] = [];

  for (const slot of slots) {
    const base = { slotIndex: slot.slotIndex };

    if (!slot.assignedTrackId) {
      items.push({ ...base, status: "empty_slot", message: "Empty slot" });
      continue;
    }

    const track = tracksById.get(slot.assignedTrackId);
    if (!track) {
      items.push({ ...base, trackId: slot.assignedTrackId, status: "unknown_error", message: "Track not found in library" });
      continue;
    }

    const meta = { trackId: track.trackId, title: track.title, artist: track.artist };

    if (!track.filePath) {
      items.push({ ...base, ...meta, status: "no_path", message: "No file path — run Track Pool Analyzer" });
      continue;
    }

    const suspicious = isSuspiciousPath(track.filePath);
    if (suspicious) {
      items.push({ ...base, ...meta, filePath: track.filePath, status: "questionable_path", message: `Questionable path: ${suspicious}` });
      // Don't skip — still exportable, just flagged
      seenPaths.set(track.filePath, slot.slotIndex);
      continue;
    }

    const ext = extOf(track.filePath);
    if (!SUPPORTED_EXTS.has(ext)) {
      items.push({ ...base, ...meta, filePath: track.filePath, status: "unsupported_extension", message: `Unsupported extension: ${ext || "(none)"}` });
      continue;
    }

    if (seenPaths.has(track.filePath)) {
      const firstSlot = seenPaths.get(track.filePath)!;
      items.push({ ...base, ...meta, filePath: track.filePath, status: "repeat", message: `REPEAT — same audio file as slot #${firstSlot + 1}` });
      // Still exportable — just warn
      continue;
    }

    seenPaths.set(track.filePath, slot.slotIndex);
    items.push({ ...base, ...meta, filePath: track.filePath, status: "ok", message: "OK" });
  }

  const skippedStatuses: ExportHealthStatus[] = ["empty_slot", "no_path", "missing_file", "unsupported_extension", "unknown_error"];
  const problemStatuses: ExportHealthStatus[] = ["questionable_path", "repeat", ...skippedStatuses];

  const exportableCount = items.filter((i) => !skippedStatuses.includes(i.status)).length;
  const skippedCount = items.filter((i) => skippedStatuses.includes(i.status)).length;
  const problemCount = items.filter((i) => problemStatuses.includes(i.status)).length;

  return { totalSlots: slots.length, exportableCount, skippedCount, problemCount, items };
}

export function formatExportReport(report: ExportHealthReport, projectTitle: string): string {
  const now = new Date().toISOString().slice(0, 19);
  const lines: string[] = [
    "M3U Export Report",
    `Project: ${projectTitle}`,
    `Generated: ${now}`,
    "",
    "SUMMARY",
    `Total playlist slots: ${report.totalSlots}`,
    `Exported entries: ${report.exportableCount}`,
    `Skipped entries: ${report.skippedCount}`,
    `Warnings: ${report.problemCount - report.skippedCount}`,
  ];

  const skipped = report.items.filter((i) => ["empty_slot", "no_path", "missing_file", "unsupported_extension", "unknown_error"].includes(i.status));
  const warnings = report.items.filter((i) => ["questionable_path", "repeat"].includes(i.status));

  if (skipped.length > 0) {
    lines.push("", "SKIPPED");
    for (const item of skipped) {
      const label = item.title ? `${item.artist} – ${item.title}` : (item.filePath ?? `trackId:${item.trackId}`);
      lines.push(`#${String(item.slotIndex + 1).padStart(2, "0")} ${item.status.toUpperCase().replace("_", " ")} — ${label}`);
    }
  }

  if (warnings.length > 0) {
    lines.push("", "WARNINGS");
    for (const item of warnings) {
      const label = item.title ? `${item.artist} – ${item.title}` : (item.filePath ?? "");
      lines.push(`#${String(item.slotIndex + 1).padStart(2, "0")} ${item.status.toUpperCase().replace("_", " ")} — ${label}: ${item.message}`);
    }
  }

  return lines.join("\n");
}
