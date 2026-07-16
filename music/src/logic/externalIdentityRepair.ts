import type { Track } from "../data/trackTypes";
import type { ExternalIdentityIssue, ExternalIdentityIssueType } from "./externalIdentityIssues";

export type ExternalIdentityRepairAction =
  | "edit_title_artist"
  | "set_file_path"
  | "accept_filename_parse"
  | "assign_audiolab_row"
  | "mark_reference"
  | "ignore_issue"
  | "defer_issue";

export type ExternalIdentityRepairRecord = {
  repairId: string;
  repairedAt: string;
  trackId?: string;
  issueType: ExternalIdentityIssueType;
  action: ExternalIdentityRepairAction;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  source: "manual" | "filename_parse" | "audiolab_unmatched_row";
};

function newId(): string {
  return `repair-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export type RepairResult = {
  updatedTrack: Track;
  record: ExternalIdentityRepairRecord;
};

export function applyEditTitleArtist(
  track: Track,
  title: string,
  artist: string,
): RepairResult {
  const before = { title: track.title, artist: track.artist };
  const updatedTrack: Track = { ...track, title: title.trim(), artist: artist.trim() };
  return {
    updatedTrack,
    record: {
      repairId: newId(),
      repairedAt: new Date().toISOString(),
      trackId: track.trackId,
      issueType: "blank_title",
      action: "edit_title_artist",
      before,
      after: { title: updatedTrack.title, artist: updatedTrack.artist },
      source: "manual",
    },
  };
}

export function applySetFilePath(
  track: Track,
  filePath: string,
): RepairResult {
  const before = { filePath: track.filePath };
  const parts = filePath.replace(/\\/g, "/").split("/");
  const filename = parts[parts.length - 1] ?? "";
  const updatedTrack: Track = {
    ...track,
    filePath: filePath.trim(),
    audioFilename: filename || track.audioFilename,
  };
  return {
    updatedTrack,
    record: {
      repairId: newId(),
      repairedAt: new Date().toISOString(),
      trackId: track.trackId,
      issueType: "missing_file_path",
      action: "set_file_path",
      before,
      after: { filePath: updatedTrack.filePath },
      source: "manual",
    },
  };
}

export function applyAcceptFilenameParse(
  track: Track,
  suggestedTitle: string | undefined,
  suggestedArtist: string | undefined,
): RepairResult {
  const before = { title: track.title, artist: track.artist };
  const updatedTrack: Track = {
    ...track,
    title: suggestedTitle?.trim() || track.title,
    artist: suggestedArtist?.trim() || track.artist,
  };
  return {
    updatedTrack,
    record: {
      repairId: newId(),
      repairedAt: new Date().toISOString(),
      trackId: track.trackId,
      issueType: "bad_filename_parse",
      action: "accept_filename_parse",
      before,
      after: { title: updatedTrack.title, artist: updatedTrack.artist },
      source: "filename_parse",
    },
  };
}

export function applyMarkReference(
  track: Track,
): RepairResult {
  const before = { sourceOwner: track.sourceOwner };
  const updatedTrack: Track = { ...track, sourceOwner: "reference" };
  return {
    updatedTrack,
    record: {
      repairId: newId(),
      repairedAt: new Date().toISOString(),
      trackId: track.trackId,
      issueType: "wrong_owner",
      action: "mark_reference",
      before,
      after: { sourceOwner: "reference" },
      source: "manual",
    },
  };
}

export function applyBatchFilenameParseRepairs(
  tracks: Track[],
  issues: ExternalIdentityIssue[],
): { updatedTracks: Track[]; records: ExternalIdentityRepairRecord[] } {
  const highConfIssues = issues.filter(
    (i) =>
      (i.issueType === "blank_title" || i.issueType === "blank_artist" || i.issueType === "bad_filename_parse") &&
      i.confidence === "high" &&
      (i.suggestedTitle || i.suggestedArtist) &&
      i.trackId,
  );

  const repairByTrackId = new Map<string, ExternalIdentityIssue[]>();
  for (const iss of highConfIssues) {
    const id = iss.trackId!;
    if (!repairByTrackId.has(id)) repairByTrackId.set(id, []);
    repairByTrackId.get(id)!.push(iss);
  }

  const records: ExternalIdentityRepairRecord[] = [];
  const updatedTracks = tracks.map((t) => {
    const relevant = repairByTrackId.get(t.trackId);
    if (!relevant) return t;
    // Only fill blanks — never overwrite existing non-empty values
    const newTitle = !t.title?.trim() ? (relevant.find((i) => i.suggestedTitle)?.suggestedTitle ?? t.title) : t.title;
    const newArtist = !t.artist?.trim() ? (relevant.find((i) => i.suggestedArtist)?.suggestedArtist ?? t.artist) : t.artist;
    if (newTitle === t.title && newArtist === t.artist) return t;
    records.push({
      repairId: newId(),
      repairedAt: new Date().toISOString(),
      trackId: t.trackId,
      issueType: "blank_title",
      action: "accept_filename_parse",
      before: { title: t.title, artist: t.artist },
      after: { title: newTitle, artist: newArtist },
      source: "filename_parse",
    });
    return { ...t, title: newTitle ?? t.title, artist: newArtist ?? t.artist };
  });

  return { updatedTracks, records };
}

export type RepairedManifestRow = {
  trackId: string;
  title: string;
  artist: string;
  filename: string;
  filePath: string;
  crateIds: string;
  missingFields: string;
  repairStatus: string;
  lastRepairAction: string;
};

export function buildRepairedMissingManifestRows(
  missingTracks: Array<{
    trackId: string;
    title: string;
    artist: string;
    filename?: string;
    filePath?: string;
    crateIds: string[];
    missingFields: string[];
    reason: string;
  }>,
  repairHistory: ExternalIdentityRepairRecord[],
): RepairedManifestRow[] {
  const lastRepair = new Map<string, ExternalIdentityRepairRecord>();
  for (const r of repairHistory) {
    if (r.trackId) lastRepair.set(r.trackId, r);
  }

  return missingTracks
    .filter((t) => t.filePath) // only rows with a usable path
    .map((t) => {
      const repair = lastRepair.get(t.trackId);
      return {
        trackId: t.trackId,
        title: t.title ?? "",
        artist: t.artist ?? "",
        filename: t.filename ?? "",
        filePath: t.filePath ?? "",
        crateIds: t.crateIds.join(";"),
        missingFields: t.missingFields.join(";"),
        repairStatus: repair ? "repaired" : "pending",
        lastRepairAction: repair?.action ?? "",
      };
    });
}

export function exportRepairedManifestCsv(rows: RepairedManifestRow[]): string {
  const header = "trackId,title,artist,filename,filePath,crateIds,missingFields,repairStatus,lastRepairAction";
  const q = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = rows.map((r) =>
    [
      q(r.trackId), q(r.title), q(r.artist), q(r.filename),
      q(r.filePath), q(r.crateIds), q(r.missingFields),
      q(r.repairStatus), q(r.lastRepairAction),
    ].join(","),
  );
  return [header, ...lines].join("\n");
}
