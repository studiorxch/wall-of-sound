import type { Track } from "../data/trackTypes";
import type { ExternalIdentityIssue } from "./externalIdentityIssues";
import type { ExternalIdentityRepairRecord } from "./externalIdentityRepair";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ExternalIdentityBatchFilterState = {
  confidence: "all" | "high" | "medium" | "low";
  issueType: "all" | "blank_artist" | "blank_title" | "bad_filename_parse" | "numeric_filename";
  suggestedArtist: string;
  status: "unresolved" | "all";
  sortBy: "confidence" | "suggested_artist" | "filename" | "track_title";
};

export const DEFAULT_BATCH_FILTER: ExternalIdentityBatchFilterState = {
  confidence: "all",
  issueType: "blank_artist",
  suggestedArtist: "",
  status: "unresolved",
  sortBy: "suggested_artist",
};

export type ExternalIdentityBatchChange = {
  issueId: string;
  trackId: string;
  field: "title" | "artist";
  before: string;
  after: string;
  confidence: "high" | "medium" | "low";
  source: "filename_parse";
  reason: string;
};

export type ExternalIdentityBatchBlockedChange = {
  issueId: string;
  trackId: string;
  field: "title" | "artist";
  before: string;
  attemptedAfter: string;
  reason: "would_overwrite_non_empty_field" | "low_confidence" | "missing_track" | "conflict";
};

export type ExternalIdentityBatchPreview = {
  totalIssues: number;
  visibleIssues: number;
  selectedIssues: number;
  changes: ExternalIdentityBatchChange[];
  blockedChanges: ExternalIdentityBatchBlockedChange[];
};

export type ExternalIdentityBatchRepairRecord = {
  batchId: string;
  appliedAt: string;
  action: "accept_filename_parse_selected" | "ignore_selected";
  source: "filename_parse";
  selectedIssueCount: number;
  appliedChangeCount: number;
  blockedChangeCount: number;
  affectedTrackIds: string[];
  changes: ExternalIdentityBatchChange[];
  undoneAt?: string;
};

// ── Filter + Sort ─────────────────────────────────────────────────────────────

const TITLE_ARTIST_TYPES = new Set(["blank_title", "blank_artist", "bad_filename_parse", "numeric_filename"]);

export function filterExternalIdentityIssues(
  issues: ExternalIdentityIssue[],
  filter: ExternalIdentityBatchFilterState,
  ignoredIds: Set<string>,
): ExternalIdentityIssue[] {
  return issues.filter((i) => {
    if (!TITLE_ARTIST_TYPES.has(i.issueType)) return false;
    if (filter.status === "unresolved" && ignoredIds.has(i.issueId)) return false;
    if (filter.confidence !== "all" && i.confidence !== filter.confidence) return false;
    if (filter.issueType !== "all" && i.issueType !== filter.issueType) return false;
    if (filter.suggestedArtist) {
      const q = filter.suggestedArtist.toLowerCase();
      if (!(i.suggestedArtist ?? "").toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

export function sortExternalIdentityIssues(
  issues: ExternalIdentityIssue[],
  sortBy: ExternalIdentityBatchFilterState["sortBy"],
): ExternalIdentityIssue[] {
  const CONF_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
  return [...issues].sort((a, b) => {
    switch (sortBy) {
      case "confidence":
        return (CONF_RANK[a.confidence ?? "low"] ?? 2) - (CONF_RANK[b.confidence ?? "low"] ?? 2);
      case "suggested_artist":
        return (a.suggestedArtist ?? "").localeCompare(b.suggestedArtist ?? "");
      case "filename":
        return (a.filename ?? "").localeCompare(b.filename ?? "");
      case "track_title":
        return (a.title ?? "").localeCompare(b.title ?? "");
    }
  });
}

// ── Preview builder ───────────────────────────────────────────────────────────

export function buildExternalIdentityBatchPreview(
  selectedIssueIds: Set<string>,
  allIssues: ExternalIdentityIssue[],
  visibleIssues: ExternalIdentityIssue[],
  trackById: Map<string, Track>,
): ExternalIdentityBatchPreview {
  const changes: ExternalIdentityBatchChange[] = [];
  const blockedChanges: ExternalIdentityBatchBlockedChange[] = [];

  for (const id of selectedIssueIds) {
    const issue = allIssues.find((i) => i.issueId === id);
    if (!issue || !issue.trackId) {
      blockedChanges.push({
        issueId: id,
        trackId: issue?.trackId ?? "",
        field: "artist",
        before: "",
        attemptedAfter: "",
        reason: "missing_track",
      });
      continue;
    }
    const track = trackById.get(issue.trackId);
    if (!track) {
      blockedChanges.push({
        issueId: id,
        trackId: issue.trackId,
        field: "artist",
        before: "",
        attemptedAfter: issue.suggestedArtist ?? "",
        reason: "missing_track",
      });
      continue;
    }

    const tryApply = (field: "title" | "artist", current: string, suggested: string | undefined) => {
      if (!suggested) return;
      if (current && current !== suggested) {
        blockedChanges.push({
          issueId: id,
          trackId: issue.trackId!,
          field,
          before: current,
          attemptedAfter: suggested,
          reason: "would_overwrite_non_empty_field",
        });
      } else {
        changes.push({
          issueId: id,
          trackId: issue.trackId!,
          field,
          before: current,
          after: suggested,
          confidence: issue.confidence ?? "low",
          source: "filename_parse",
          reason: issue.reason,
        });
      }
    };

    if (issue.issueType === "blank_title" || issue.issueType === "bad_filename_parse") {
      tryApply("title", track.title ?? "", issue.suggestedTitle);
    }
    if (issue.issueType === "blank_artist" || issue.issueType === "bad_filename_parse") {
      tryApply("artist", track.artist ?? "", issue.suggestedArtist);
    }
  }

  return {
    totalIssues: allIssues.filter((i) => TITLE_ARTIST_TYPES.has(i.issueType)).length,
    visibleIssues: visibleIssues.length,
    selectedIssues: selectedIssueIds.size,
    changes,
    blockedChanges,
  };
}

// ── Batch apply ───────────────────────────────────────────────────────────────

function newBatchId(): string {
  return `batch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function buildBatchRepairRecord(
  preview: ExternalIdentityBatchPreview,
  action: ExternalIdentityBatchRepairRecord["action"],
): ExternalIdentityBatchRepairRecord {
  return {
    batchId: newBatchId(),
    appliedAt: new Date().toISOString(),
    action,
    source: "filename_parse",
    selectedIssueCount: preview.selectedIssues,
    appliedChangeCount: preview.changes.length,
    blockedChangeCount: preview.blockedChanges.length,
    affectedTrackIds: [...new Set(preview.changes.map((c) => c.trackId))],
    changes: preview.changes,
  };
}

export function applyBatchChangesToTracks(
  tracks: Track[],
  changes: ExternalIdentityBatchChange[],
): Track[] {
  const byTrackId = new Map<string, ExternalIdentityBatchChange[]>();
  for (const c of changes) {
    if (!byTrackId.has(c.trackId)) byTrackId.set(c.trackId, []);
    byTrackId.get(c.trackId)!.push(c);
  }
  return tracks.map((t) => {
    const cs = byTrackId.get(t.trackId);
    if (!cs) return t;
    let updated = { ...t };
    for (const c of cs) {
      if (c.field === "title") updated = { ...updated, title: c.after };
      if (c.field === "artist") updated = { ...updated, artist: c.after };
    }
    return updated;
  });
}

// ── Undo ─────────────────────────────────────────────────────────────────────

export type UndoResult = {
  updatedTracks: Track[];
  undoneCount: number;
  skippedCount: number;
  skippedReasons: string[];
};

export function undoLatestBatchRepair(
  tracks: Track[],
  batchHistory: ExternalIdentityBatchRepairRecord[],
  repairHistory: ExternalIdentityRepairRecord[],
): {
  updatedTracks: Track[];
  updatedBatchHistory: ExternalIdentityBatchRepairRecord[];
  undoneCount: number;
  skippedCount: number;
} {
  const latest = batchHistory.find((b) => !b.undoneAt);
  if (!latest) return { updatedTracks: tracks, updatedBatchHistory: batchHistory, undoneCount: 0, skippedCount: 0 };

  // Build a map of field→value at the time of the batch from "before"
  const restoreMap = new Map<string, { title?: string; artist?: string }>();
  for (const c of latest.changes) {
    const existing = restoreMap.get(c.trackId) ?? {};
    restoreMap.set(c.trackId, { ...existing, [c.field]: c.before });
  }

  // Check if any fields were changed AFTER this batch (by later repair records)
  const batchAppliedAt = new Date(latest.appliedAt).getTime();
  const laterRepairs = repairHistory.filter((r) => new Date(r.repairedAt).getTime() > batchAppliedAt);
  const changedAfter = new Map<string, Set<string>>();
  for (const r of laterRepairs) {
    if (!r.trackId) continue;
    const fields = changedAfter.get(r.trackId) ?? new Set();
    Object.keys(r.after).forEach((f) => fields.add(f));
    changedAfter.set(r.trackId, fields);
  }

  let undoneCount = 0;
  let skippedCount = 0;

  const updatedTracks = tracks.map((t) => {
    const restore = restoreMap.get(t.trackId);
    if (!restore) return t;
    const laterFields = changedAfter.get(t.trackId) ?? new Set();
    let updated = { ...t };
    if (restore.title !== undefined && !laterFields.has("title")) {
      updated = { ...updated, title: restore.title };
      undoneCount++;
    } else if (restore.title !== undefined) {
      skippedCount++;
    }
    if (restore.artist !== undefined && !laterFields.has("artist")) {
      updated = { ...updated, artist: restore.artist };
      undoneCount++;
    } else if (restore.artist !== undefined) {
      skippedCount++;
    }
    return updated;
  });

  const updatedBatchHistory = batchHistory.map((b) =>
    b.batchId === latest.batchId ? { ...b, undoneAt: new Date().toISOString() } : b,
  );

  return { updatedTracks, updatedBatchHistory, undoneCount, skippedCount };
}

// ── Coverage delta ────────────────────────────────────────────────────────────

export type IdentityCoverageDelta = {
  artistBefore: number;
  artistAfter: number;
  titleBefore: number;
  titleAfter: number;
  total: number;
};

export function computeIdentityCoverageDelta(
  tracksBefore: Track[],
  tracksAfter: Track[],
): IdentityCoverageDelta {
  const ext = (ts: Track[]) => ts.filter((t) => t.sourceOwner === "external");
  const before = ext(tracksBefore);
  const after = ext(tracksAfter);
  return {
    total: before.length,
    artistBefore: before.filter((t) => t.artist?.trim()).length,
    artistAfter: after.filter((t) => t.artist?.trim()).length,
    titleBefore: before.filter((t) => t.title?.trim()).length,
    titleAfter: after.filter((t) => t.title?.trim()).length,
  };
}
