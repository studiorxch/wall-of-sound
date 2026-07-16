import type { Track } from "../data/trackTypes";
import type { UnmatchedImportRow } from "../data/metadataSourceTypes";
import { suggestIdentityFromFilename, isNumericFilename, isBadFilenameParse } from "./filenameIdentity";

export type ExternalIdentityIssueType =
  | "missing_file_path"
  | "file_not_found"
  | "unsupported_extension"
  | "blank_title"
  | "blank_artist"
  | "numeric_filename"
  | "bad_filename_parse"
  | "duplicate_filename"
  | "duplicate_file_path"
  | "unmatched_audiolab_row"
  | "weak_match_suggestion"
  | "metadata_conflict"
  | "wrong_owner";

export type ExternalIdentityIssue = {
  issueId: string;
  issueType: ExternalIdentityIssueType;
  severity: "blocking" | "warning" | "info";
  trackId?: string;
  title?: string;
  artist?: string;
  filename?: string;
  filePath?: string;
  sourceRowId?: string;
  suggestedTitle?: string;
  suggestedArtist?: string;
  suggestedFilePath?: string;
  suggestedTrackId?: string;
  confidence?: "high" | "medium" | "low";
  reason: string;
  // UI state
  ignored?: boolean;
  deferred?: boolean;
};

function uid(prefix: string, ...parts: (string | undefined)[]): string {
  return [prefix, ...parts.map((p) => (p ?? "").replace(/[^a-z0-9]/gi, "_").slice(0, 24))].join(":");
}

export function detectExternalIdentityIssues(
  externalTracks: Track[],
  unmatchedRows: UnmatchedImportRow[] = [],
): ExternalIdentityIssue[] {
  const issues: ExternalIdentityIssue[] = [];

  // Track-level issues
  const filenameCount = new Map<string, number>();
  const filePathCount = new Map<string, number>();

  for (const t of externalTracks) {
    const fn = t.audioFilename ?? t.fileName ?? "";
    if (fn) filenameCount.set(fn, (filenameCount.get(fn) ?? 0) + 1);
    const fp = t.filePath ?? "";
    if (fp) filePathCount.set(fp, (filePathCount.get(fp) ?? 0) + 1);
  }

  for (const t of externalTracks) {
    const fn = t.audioFilename ?? t.fileName ?? "";
    const fp = t.filePath ?? "";

    // Missing filePath
    if (!fp) {
      issues.push({
        issueId: uid("mfp", t.trackId),
        issueType: "missing_file_path",
        severity: "blocking",
        trackId: t.trackId,
        title: t.title,
        artist: t.artist,
        filename: fn || undefined,
        reason: "No filePath recorded — cannot run AudioLab analysis",
      });
    }

    // Blank title
    if (!t.title?.trim()) {
      const suggestion = fn ? suggestIdentityFromFilename(fn) : null;
      issues.push({
        issueId: uid("bt", t.trackId),
        issueType: "blank_title",
        severity: "warning",
        trackId: t.trackId,
        title: t.title,
        artist: t.artist,
        filename: fn || undefined,
        filePath: fp || undefined,
        suggestedTitle: suggestion?.title,
        confidence: suggestion?.confidence,
        reason: "Title is blank",
      });
    }

    // Blank artist
    if (!t.artist?.trim()) {
      const suggestion = fn ? suggestIdentityFromFilename(fn) : null;
      issues.push({
        issueId: uid("ba", t.trackId),
        issueType: "blank_artist",
        severity: "warning",
        trackId: t.trackId,
        title: t.title,
        artist: t.artist,
        filename: fn || undefined,
        filePath: fp || undefined,
        suggestedArtist: suggestion?.artist,
        confidence: suggestion?.confidence,
        reason: "Artist is blank",
      });
    }

    // Numeric filename
    if (fn && isNumericFilename(fn)) {
      issues.push({
        issueId: uid("nf", t.trackId),
        issueType: "numeric_filename",
        severity: "warning",
        trackId: t.trackId,
        title: t.title,
        artist: t.artist,
        filename: fn,
        filePath: fp || undefined,
        reason: "Filename is purely numeric — identity cannot be parsed from it",
      });
    }

    // Bad filename parse — title looks like it's just the slugified filename
    if (fn && t.title && isBadFilenameParse(t.title, fn)) {
      issues.push({
        issueId: uid("bfp", t.trackId),
        issueType: "bad_filename_parse",
        severity: "info",
        trackId: t.trackId,
        title: t.title,
        artist: t.artist,
        filename: fn,
        filePath: fp || undefined,
        reason: "Title appears to be the raw filename — may need manual correction",
      });
    }

    // Duplicate filename
    if (fn && (filenameCount.get(fn) ?? 0) > 1) {
      issues.push({
        issueId: uid("dfn", t.trackId, fn),
        issueType: "duplicate_filename",
        severity: "info",
        trackId: t.trackId,
        title: t.title,
        artist: t.artist,
        filename: fn,
        filePath: fp || undefined,
        reason: `Filename "${fn}" is shared by ${filenameCount.get(fn)} tracks`,
      });
    }

    // Duplicate filePath
    if (fp && (filePathCount.get(fp) ?? 0) > 1) {
      issues.push({
        issueId: uid("dfp", t.trackId, fp),
        issueType: "duplicate_file_path",
        severity: "warning",
        trackId: t.trackId,
        title: t.title,
        artist: t.artist,
        filename: fn || undefined,
        filePath: fp,
        reason: `filePath is shared by ${filePathCount.get(fp)} tracks`,
      });
    }
  }

  // Unmatched AudioLab rows
  for (const row of unmatchedRows) {
    const suggestion = row.filename ? suggestIdentityFromFilename(row.filename) : null;
    issues.push({
      issueId: uid("ual", row.filename ?? "", row.filePath ?? ""),
      issueType: "unmatched_audiolab_row",
      severity: "warning",
      filename: row.filename,
      filePath: row.filePath,
      suggestedTitle: row.title || suggestion?.title,
      suggestedArtist: row.artist || suggestion?.artist,
      confidence: suggestion?.confidence,
      reason: row.reason ?? "AudioLab row did not match any External track",
    });
  }

  return issues;
}

export type IssueGroup = {
  blocking: ExternalIdentityIssue[];
  warnings: ExternalIdentityIssue[];
  info: ExternalIdentityIssue[];
  unmatched: ExternalIdentityIssue[];
  pathIssues: ExternalIdentityIssue[];
  titleArtist: ExternalIdentityIssue[];
  deferred: ExternalIdentityIssue[];
};

export function groupIdentityIssues(
  issues: ExternalIdentityIssue[],
  ignoredIds: Set<string>,
  deferredIds: Set<string>,
): IssueGroup {
  const active = issues.filter((i) => !ignoredIds.has(i.issueId));
  const deferred = active.filter((i) => deferredIds.has(i.issueId));
  const live = active.filter((i) => !deferredIds.has(i.issueId));

  return {
    blocking: live.filter((i) => i.severity === "blocking"),
    warnings: live.filter((i) => i.severity === "warning" && i.issueType !== "unmatched_audiolab_row"),
    info: live.filter((i) => i.severity === "info"),
    unmatched: live.filter((i) => i.issueType === "unmatched_audiolab_row"),
    pathIssues: live.filter((i) =>
      ["missing_file_path", "file_not_found", "duplicate_file_path"].includes(i.issueType)
    ),
    titleArtist: live.filter((i) =>
      ["blank_title", "blank_artist", "numeric_filename", "bad_filename_parse"].includes(i.issueType)
    ),
    deferred,
  };
}
