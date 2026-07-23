// Shared private Library metadata export, including Comments — used
// identically by Catalog, External, and Sounds. Pure — no DOM, no Node;
// the interface layer owns the actual file-download trigger. This export
// path is entirely separate from, and never reused by, any RADIO/public
// pipeline (see radioEntryPreparation.ts's exhaustive display/musical
// allowlist, which this module never touches).

import type { Track } from "../../data/trackTypes";
import { normalizeTrackGenreTokens } from "../genreTaxonomy";

// Conditional quoting (only when the field contains a comma, quote, or
// line break), doubling embedded quotes — mirrors exportPlaylist.ts's
// `csvEsc` convention.
export function csvEscapeLibraryField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export interface LibraryExportRow {
  trackId: string;
  title: string;
  artist: string;
  bpm: string;
  key: string;
  energy: string;
  durationSeconds: string;
  rating: string;
  grouping: string;
  genre: string;
  comments: string;
}

const LIBRARY_EXPORT_HEADER = [
  "Track ID", "Title", "Artist", "BPM", "Key", "Energy", "Duration (s)", "Rating", "Grouping", "Genre", "Comments",
];

export function buildLibraryExportRows(tracks: Track[]): LibraryExportRow[] {
  return tracks.map((t) => ({
    trackId: t.trackId,
    title: t.title ?? "",
    artist: t.artist ?? "",
    bpm: typeof t.bpm === "number" ? String(t.bpm) : "",
    key: t.camelotKey ?? "",
    energy: typeof t.energy === "number" ? String(t.energy) : "",
    durationSeconds: typeof t.durationSeconds === "number" ? String(t.durationSeconds) : "",
    rating: typeof t.rating === "number" ? String(t.rating) : "",
    grouping: t.grouping ?? "",
    genre: normalizeTrackGenreTokens(t).join("; "),
    comments: t.notes ?? "",
  }));
}

function rowToOrderedFields(row: LibraryExportRow): string[] {
  return [row.trackId, row.title, row.artist, row.bpm, row.key, row.energy, row.durationSeconds, row.rating, row.grouping, row.genre, row.comments];
}

// CRLF line endings (standard CSV convention); every multiline Comments
// value is safely quoted by csvEscapeLibraryField above.
export function buildLibraryExportCsv(tracks: Track[]): string {
  const rows = buildLibraryExportRows(tracks);
  const lines = [LIBRARY_EXPORT_HEADER, ...rows.map(rowToOrderedFields)]
    .map((cols) => cols.map(csvEscapeLibraryField).join(","));
  return lines.join("\r\n");
}
