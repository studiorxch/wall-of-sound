// Shared per-track private comment normalization, search, and batch-edit
// logic — used identically by Catalog, External, and Sounds. Pure — no
// DOM, no Node.
//
// Field-naming decision (documented here, not just in the completion
// report, since it's load-bearing for every function below): this build
// REUSES the existing `Track.notes?: string` field as the canonical
// private-comment storage rather than adding a new, confusingly similar
// `comments` field. `notes` is already optional, already private/
// internal-only (see trackTypes.ts's own "Internal notes about this
// track" framing), and already flows through the established
// persistence/hydration/migration/export architecture untouched. Because
// `notes` lives on `Track` itself (not on any Catalog-specific record),
// this capability is canonical track metadata and was always available to
// every library that displays a `Track` — this module has no
// library-specific logic at all. A separate `Track.comment?: string` field
// also exists but is unrelated: it's import-sourced ID3-style metadata,
// not an operator annotation, and this build never touches it. The grid UI
// labels the column "Comments" while the underlying field stays `notes` —
// TrackEditorPanel/TrackInspector's existing "Notes" label is left as-is.

export type BatchCommentMode = "append" | "replace" | "clear";

// Trims only meaningless OUTER whitespace (including surrounding blank
// lines) — internal spaces and line breaks are preserved exactly.
// An all-whitespace or empty input normalizes to `undefined` (removes the
// optional field).
export function normalizeCommentInput(raw: string): string | undefined {
  const trimmed = raw.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export function commentContainsQuery(comment: string | undefined, query: string): boolean {
  if (!query.trim()) return true;
  return (comment ?? "").toLowerCase().includes(query.toLowerCase());
}

// Compact single-line preview for the collapsed grid cell. Internal line
// breaks collapse to spaces for the one-line preview only — the full value
// (with real line breaks) is what the editor/tooltip show.
export function truncateCommentPreview(comment: string | undefined, maxLength = 60): string {
  if (!comment) return "";
  const singleLine = comment.replace(/\s+/g, " ").trim();
  if (singleLine.length <= maxLength) return singleLine;
  return `${singleLine.slice(0, Math.max(0, maxLength - 1))}…`;
}

// The one authoritative batch-comment computation: Append never adds a
// stray leading separator when the existing value is empty; Replace
// overwrites; Clear removes the field entirely. Never defaults to Replace
// or Clear — the caller's default UI selection must be "append".
export function computeBatchCommentValue(mode: BatchCommentMode, text: string, existing: string | undefined): string | undefined {
  if (mode === "clear") return undefined;
  if (mode === "replace") return normalizeCommentInput(text);
  const normalizedAppend = normalizeCommentInput(text);
  if (!normalizedAppend) return existing;
  if (!existing || existing.trim().length === 0) return normalizedAppend;
  return `${existing}\n${normalizedAppend}`;
}

export interface BatchCommentPreview {
  affectedCount: number;
  sampleBefore?: string;
  sampleAfter?: string;
}

// A representative before/after sample (first selected track) plus the
// exact affected count, for the confirmation UI.
export function previewBatchCommentOperation(
  mode: BatchCommentMode,
  text: string,
  selectedTracks: Array<{ notes?: string }>,
): BatchCommentPreview {
  const affectedCount = selectedTracks.length;
  const sample = selectedTracks[0];
  if (!sample) return { affectedCount };
  return {
    affectedCount,
    sampleBefore: sample.notes,
    sampleAfter: computeBatchCommentValue(mode, text, sample.notes),
  };
}
