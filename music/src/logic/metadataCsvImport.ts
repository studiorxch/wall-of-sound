import type { Track } from "../data/trackTypes";
import {
  METADATA_TRUST_RANK,
  type MetadataSourceLabel,
  type FieldChangeClassification,
  type FieldChange,
  type MetadataImportPreviewRow,
  type MetadataImportPreview,
  type MetadataImportPreviewSummary,
  type MetadataImportRecord,
  type MetadataImportResult,
  type TrackMetadataSource,
} from "../data/metadataSourceTypes";

// ── Legacy types (kept for backward compat with CrateMetadataPanel bulk actions) ──

export type MetadataUpdate = {
  trackId: string;
  fields: Partial<{
    durationSeconds: number;
    bpm: number;
    camelotKey: string;
    energy: number;
    rating: number;
    filePath: string;
  }>;
  matchedBy: "trackId" | "filePath" | "titleArtist";
  originalTitle?: string;
  originalArtist?: string;
};

export type CsvImportPreview = {
  matched: MetadataUpdate[];
  unmatchedRows: number;
  fieldCounts: Record<string, number>;
  errors: string[];
};

// ── Validation ────────────────────────────────────────────────────────────────

function validateField(field: string, value: unknown): boolean {
  if (value === null || value === undefined) return false;
  switch (field) {
    case "durationSeconds": return typeof value === "number" && value > 0 && value < 86400;
    case "bpm":             return typeof value === "number" && value > 20 && value < 300;
    case "energy":          return typeof value === "number" && value >= 0 && value <= 1;
    case "sampleRate":      return typeof value === "number" && value > 0;
    case "channels":        return typeof value === "number" && value >= 1;
    case "key":             return typeof value === "string" && /^[A-G][#b]?$/.test(value.trim());
    case "camelotKey":      return typeof value === "string" && /^\d{1,2}[AB]$/i.test(value.trim());
    case "filePath":        return typeof value === "string" && value.trim().length > 0;
    case "rating":          return typeof value === "number" && value >= 0 && value <= 5;
    default:                return typeof value === "string" && (value as string).trim().length > 0;
  }
}

// ── Trust hierarchy ───────────────────────────────────────────────────────────

function existingSourceFor(track: Track, field: string): MetadataSourceLabel {
  const stored = track.metadataSources?.[field]?.source;
  if (stored) return stored;
  // Infer from current value
  switch (field) {
    case "durationSeconds":
      if (!track.durationSeconds || track.durationSeconds <= 0) return "missing";
      return "external_imported";
    case "bpm":
      if (!track.bpm || track.bpm <= 0) return "missing";
      return "external_imported";
    case "energy":
      if (!track.energy || track.energy <= 0) return "missing";
      if (track.energySource === "estimated") return "estimated";
      return "external_imported";
    case "camelotKey":
      if (!track.camelotKey) return "missing";
      return "external_imported";
    case "key":
      if (!track.key && !track.camelotKey) return "missing";
      return "external_imported";
    default:
      return "missing";
  }
}

function classifyChange(
  field: string,
  existingValue: unknown,
  newValue: unknown,
  existingSource: MetadataSourceLabel,
  newSource: MetadataSourceLabel,
): FieldChangeClassification {
  if (!validateField(field, newValue)) return "INVALID";

  const existingRank = METADATA_TRUST_RANK[existingSource];
  const newRank = METADATA_TRUST_RANK[newSource];

  // Missing → anything is ADD_MISSING
  if (existingSource === "missing" || existingValue === null || existingValue === undefined ||
      (typeof existingValue === "number" && existingValue <= 0)) {
    return "ADD_MISSING";
  }

  // REPLACE_ESTIMATE: existing is estimated, new is analyzed
  if ((existingSource === "estimated" || existingSource === "audiolab_estimated") &&
      (newSource === "audiolab_analyzed" || newSource === "manual_confirmed" || newSource === "verified_catalog")) {
    return "REPLACE_ESTIMATE";
  }

  // Same value → KEEP_EXISTING
  if (existingValue === newValue) return "KEEP_EXISTING";

  // Check for significant difference (conflict thresholds)
  if (field === "durationSeconds" && typeof existingValue === "number" && typeof newValue === "number") {
    if (Math.abs(existingValue - newValue) > 5) {
      if (newRank > existingRank) return "UPDATE_WEAKER";
      if (newRank < existingRank) return "OVERWRITE_STRONGER";
      return "CONFLICT";
    }
    return newRank >= existingRank ? "UPDATE_WEAKER" : "KEEP_EXISTING";
  }

  if (field === "bpm" && typeof existingValue === "number" && typeof newValue === "number") {
    const ratio = newValue / existingValue;
    if (Math.abs(ratio - 2) < 0.1 || Math.abs(ratio - 0.5) < 0.1) return "HALF_DOUBLE_CONFLICT";
    if (Math.abs(existingValue - newValue) > 3) {
      if (newRank > existingRank) return "UPDATE_WEAKER";
      if (newRank < existingRank) return "OVERWRITE_STRONGER";
      return "CONFLICT";
    }
    return newRank >= existingRank ? "UPDATE_WEAKER" : "KEEP_EXISTING";
  }

  if (field === "energy" && typeof existingValue === "number" && typeof newValue === "number") {
    if (Math.abs(existingValue - newValue) > 0.15) {
      if (newRank > existingRank) return "UPDATE_WEAKER";
      if (newRank < existingRank) return "OVERWRITE_STRONGER";
      return "CONFLICT";
    }
    return newRank >= existingRank ? "UPDATE_WEAKER" : "KEEP_EXISTING";
  }

  if ((field === "key" || field === "camelotKey") && existingValue && newValue && existingValue !== newValue) {
    if (newRank > existingRank) return "UPDATE_WEAKER";
    if (newRank < existingRank) return "OVERWRITE_STRONGER";
    return "CONFLICT";
  }

  // Generic trust comparison
  if (newRank > existingRank) return "UPDATE_WEAKER";
  if (newRank < existingRank) return "OVERWRITE_STRONGER";
  return "KEEP_EXISTING";
}

const SAFE_CLASSIFICATIONS = new Set<FieldChangeClassification>([
  "ADD_MISSING", "REPLACE_ESTIMATE", "UPDATE_WEAKER",
]);

// ── Parsing ───────────────────────────────────────────────────────────────────

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parseDuration(v: string): number | null {
  if (!v) return null;
  if (v.includes(":")) {
    const [m, s] = v.split(":").map(Number);
    if (isNaN(m) || isNaN(s)) return null;
    return m * 60 + s;
  }
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

export function parseCsvText(text: string): Array<Record<string, string>> {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase().replace(/['"]/g, ""));
  return lines.slice(1).map((line) => {
    // Simple CSV split (handles quoted fields with commas)
    const vals: string[] = [];
    let cur = "";
    let inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === "," && !inQ) { vals.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    vals.push(cur.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = vals[i] ?? ""; });
    return row;
  });
}

export function parseJsonText(text: string): Array<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.tracks)) return parsed.tracks;
    return [];
  } catch {
    return [];
  }
}

// Extract raw field values from a CSV row or JSON record
function extractRawFields(row: Record<string, unknown>): {
  trackId?: string; filePath?: string; filename?: string; title?: string; artist?: string;
  durationSeconds?: number; bpm?: number; key?: string; camelotKey?: string;
  energy?: number; sampleRate?: number; channels?: number; rating?: number;
  analysisSource?: string; analysisVersion?: string; analyzedAt?: string;
} {
  const g = (keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = row[k] ?? row[k.toLowerCase()];
      if (v !== undefined && v !== null && String(v).trim()) return String(v).trim();
    }
  };
  const gn = (keys: string[]): number | undefined => {
    const s = g(keys);
    if (!s) return undefined;
    const n = parseFloat(s);
    return isNaN(n) ? undefined : n;
  };

  return {
    trackId: g(["trackId", "trackid"]),
    filePath: g(["filePath", "filepath"]),
    filename: g(["filename"]),
    title: g(["title"]),
    artist: g(["artist"]),
    durationSeconds: (() => {
      const s = g(["durationSeconds", "durationseconds", "duration"]);
      if (!s) return undefined;
      if (s.includes(":")) {
        const dur = parseDuration(s);
        return dur ?? undefined;
      }
      const n = parseFloat(s);
      return isNaN(n) ? undefined : n;
    })(),
    bpm: (() => { const n = gn(["bpm"]); return n !== undefined ? Math.round(n) : undefined; })(),
    key: g(["key"]),
    camelotKey: g(["camelotKey", "camelotkey"]),
    energy: gn(["energy"]),
    sampleRate: gn(["sampleRate", "samplerate"]),
    channels: gn(["channels"]),
    rating: gn(["rating"]),
    analysisSource: g(["analysisSource", "analysissource"]),
    analysisVersion: g(["analysisVersion", "analysisversion"]),
    analyzedAt: g(["analyzedAt", "analyzedat"]),
  };
}

// ── Track matching ────────────────────────────────────────────────────────────

function matchTrack(
  raw: ReturnType<typeof extractRawFields>,
  byTrackId: Map<string, Track>,
  byFilePath: Map<string, Track>,
  byFilename: Map<string, Track>,
  byTitleArtist: Map<string, Track>,
): { track: Track; matchedBy: MetadataImportPreviewRow["matchedBy"] } | null {
  if (raw.trackId && byTrackId.has(raw.trackId)) {
    return { track: byTrackId.get(raw.trackId)!, matchedBy: "trackId" };
  }
  if (raw.filePath && byFilePath.has(raw.filePath)) {
    return { track: byFilePath.get(raw.filePath)!, matchedBy: "filePath" };
  }
  if (raw.filename && byFilename.has(raw.filename.toLowerCase())) {
    return { track: byFilename.get(raw.filename.toLowerCase())!, matchedBy: "filename" };
  }
  if (raw.title || raw.artist) {
    const key = normalize(raw.title ?? "") + "|" + normalize(raw.artist ?? "");
    if (key !== "|" && byTitleArtist.has(key)) {
      return { track: byTitleArtist.get(key)!, matchedBy: "titleArtist" };
    }
  }
  return null;
}

// ── Determine source label for imported data ──────────────────────────────────

function importedSourceLabel(raw: ReturnType<typeof extractRawFields>, field: string): MetadataSourceLabel {
  const src = raw.analysisSource?.toLowerCase() ?? "";
  if (src === "librosa" || src.includes("audiolab")) {
    // energy is always an estimate from AudioLab
    if (field === "energy") return "audiolab_estimated";
    return "audiolab_analyzed";
  }
  return "external_imported";
}

// ── Build rich import preview ─────────────────────────────────────────────────

function buildPreviewRow(
  track: Track,
  raw: ReturnType<typeof extractRawFields>,
  matchedBy: MetadataImportPreviewRow["matchedBy"],
): MetadataImportPreviewRow {
  const FIELDS_TO_PROCESS: Array<{ field: string; rawValue: unknown }> = [
    { field: "durationSeconds", rawValue: raw.durationSeconds },
    { field: "bpm",             rawValue: raw.bpm },
    { field: "camelotKey",      rawValue: raw.camelotKey },
    { field: "key",             rawValue: raw.key },
    { field: "energy",          rawValue: raw.energy },
    { field: "filePath",        rawValue: raw.filePath },
    { field: "rating",          rawValue: raw.rating },
  ].filter((f) => f.rawValue !== undefined && f.rawValue !== null && f.rawValue !== "");

  const changes: FieldChange[] = [];

  for (const { field, rawValue } of FIELDS_TO_PROCESS) {
    const existingSource = existingSourceFor(track, field);
    const newSource = importedSourceLabel(raw, field);
    const existingValue = (track as Record<string, unknown>)[field];
    const classification = classifyChange(field, existingValue, rawValue, existingSource, newSource);

    changes.push({
      field,
      before: existingValue,
      after: rawValue,
      beforeSource: existingSource,
      afterSource: newSource,
      classification,
      confidence: raw.analysisSource ? "medium" : "unknown",
    });
  }

  const safeChanges = changes.filter((c) => SAFE_CLASSIFICATIONS.has(c.classification));
  const blockedChanges = changes.filter((c) => !SAFE_CLASSIFICATIONS.has(c.classification));

  const hasConflicts = blockedChanges.some(
    (c) => c.classification === "CONFLICT" || c.classification === "HALF_DOUBLE_CONFLICT"
  );

  return {
    trackId: track.trackId,
    title: track.title,
    artist: track.artist,
    filePath: track.filePath,
    matchedBy,
    matchStatus: safeChanges.length === 0 && blockedChanges.length === 0
      ? "UNMATCHED"
      : hasConflicts
      ? "CONFLICT"
      : safeChanges.length > 0 && blockedChanges.length === 0
      ? "MATCHED"
      : "PARTIAL",
    changes,
    safeChanges,
    blockedChanges,
  };
}

export function buildImportPreview(
  rows: Array<Record<string, unknown>>,
  tracks: Track[],
  sourceFileName: string,
  sourceType: "csv" | "json",
): MetadataImportPreview {
  const importId = `import-${Date.now()}`;
  const byTrackId = new Map(tracks.map((t) => [t.trackId, t]));
  const byFilePath = new Map(
    tracks.filter((t) => t.filePath).map((t) => [t.filePath!, t])
  );
  const byFilename = new Map(
    tracks.filter((t) => t.audioFilename || t.fileName).map((t) => [
      ((t.audioFilename || t.fileName) ?? "").toLowerCase(), t,
    ])
  );
  const byTitleArtist = new Map(
    tracks.map((t) => [normalize(t.title) + "|" + normalize(t.artist), t])
  );

  const previewRows: MetadataImportPreviewRow[] = [];
  let unmatchedRows = 0;
  const errors: string[] = [];
  const unmatchedDetails: import("../data/metadataSourceTypes").UnmatchedImportRow[] = [];

  for (const row of rows) {
    const raw = extractRawFields(row as Record<string, unknown>);
    const match = matchTrack(raw, byTrackId, byFilePath, byFilename, byTitleArtist);
    if (!match) {
      unmatchedRows++;
      unmatchedDetails.push({
        filename: raw.filename ?? "",
        filePath: raw.filePath,
        title: raw.title,
        artist: raw.artist,
        durationSeconds: raw.durationSeconds != null ? Number(raw.durationSeconds) : undefined,
        bpm: raw.bpm != null ? Number(raw.bpm) : undefined,
        reason: "no matching AudioLab row",
      });
      continue;
    }
    const previewRow = buildPreviewRow(match.track, raw, match.matchedBy);
    if (previewRow.changes.length > 0) {
      previewRows.push(previewRow);
    } else {
      unmatchedRows++;
      unmatchedDetails.push({
        filename: raw.filename ?? "",
        filePath: raw.filePath,
        title: raw.title,
        artist: raw.artist,
        durationSeconds: raw.durationSeconds != null ? Number(raw.durationSeconds) : undefined,
        bpm: raw.bpm != null ? Number(raw.bpm) : undefined,
        reason: "no changes to apply",
      });
    }
  }

  const summary: MetadataImportPreviewSummary = {
    totalRows: rows.length,
    matchedRows: previewRows.length,
    unmatchedRows,
    safeFields: previewRows.reduce((s, r) => s + r.safeChanges.length, 0),
    blockedFields: previewRows.reduce((s, r) => s + r.blockedChanges.filter(
      c => c.classification === "OVERWRITE_STRONGER"
    ).length, 0),
    conflictFields: previewRows.reduce((s, r) => s + r.blockedChanges.filter(
      c => c.classification === "CONFLICT" || c.classification === "HALF_DOUBLE_CONFLICT"
    ).length, 0),
    invalidFields: previewRows.reduce((s, r) => s + r.blockedChanges.filter(
      c => c.classification === "INVALID"
    ).length, 0),
  };

  if (previewRows.length === 0 && rows.length > 0) {
    errors.push("No tracks matched. Check that filePath, trackId, or title+artist align with library tracks.");
  }

  return { importId, sourceFileName, sourceType, rows: previewRows, unmatchedDetails, summary, errors };
}

// ── Apply safe updates ────────────────────────────────────────────────────────

export type ApplyOptions = {
  safeOnly?: boolean;           // default true — only ADD_MISSING/REPLACE_ESTIMATE/UPDATE_WEAKER
  forceConflictIds?: string[];  // trackIds where CONFLICT/OVERWRITE_STRONGER is allowed
  selectedTrackIds?: Set<string>; // if set, only apply for these trackIds
};

export function applyImportPreview(
  preview: MetadataImportPreview,
  tracks: Track[],
  options: ApplyOptions = {},
): {
  updatedTracks: Track[];
  importRecord: MetadataImportRecord;
  result: MetadataImportResult;
} {
  const { safeOnly = true, forceConflictIds = [], selectedTrackIds } = options;
  const forceSet = new Set(forceConflictIds);
  const importedAt = new Date().toISOString();
  const trackMap = new Map(tracks.map((t) => [t.trackId, t]));

  let appliedFields = 0;
  let skippedFields = 0;
  let conflictFields = 0;
  let invalidFields = 0;

  for (const row of preview.rows) {
    if (selectedTrackIds && !selectedTrackIds.has(row.trackId)) continue;
    const track = trackMap.get(row.trackId);
    if (!track) continue;

    const allowForce = forceSet.has(row.trackId);
    const patch: Record<string, unknown> = {};
    const sources: Record<string, TrackMetadataSource> = { ...(track.metadataSources ?? {}) };

    for (const change of row.changes) {
      if (change.classification === "INVALID") {
        invalidFields++;
        continue;
      }
      if (change.classification === "KEEP_EXISTING") {
        skippedFields++;
        continue;
      }
      const isSafe = SAFE_CLASSIFICATIONS.has(change.classification);
      if (!isSafe && safeOnly && !allowForce) {
        if (change.classification === "CONFLICT" || change.classification === "HALF_DOUBLE_CONFLICT") {
          conflictFields++;
        }
        skippedFields++;
        continue;
      }

      patch[change.field] = change.after;
      sources[change.field] = {
        field: change.field,
        value: change.after,
        source: change.afterSource,
        sourceFile: preview.sourceFileName,
        importedAt,
        confidence: change.confidence,
      };
      appliedFields++;
    }

    if (Object.keys(patch).length > 0) {
      trackMap.set(row.trackId, { ...track, ...patch, metadataSources: sources });
    }
  }

  const importRecord: MetadataImportRecord = {
    importId: preview.importId,
    source: "audiolab",
    sourceFileName: preview.sourceFileName,
    importedAt,
    totalRows: preview.summary.totalRows,
    matchedRows: preview.summary.matchedRows,
    unmatchedRows: preview.summary.unmatchedRows,
    appliedFields,
    skippedFields,
    conflictFields,
    invalidFields,
    unmatchedRows_detail: preview.unmatchedDetails?.slice(0, 50),
  };

  return {
    updatedTracks: Array.from(trackMap.values()),
    importRecord,
    result: { importRecord, appliedCount: appliedFields, skippedCount: skippedFields },
  };
}

// ── Legacy helpers (used by CrateMetadataPanel bulk actions) ──────────────────

export function buildCsvImportPreview(
  rows: Array<Record<string, string>>,
  tracks: Track[],
): CsvImportPreview {
  const byTrackId = new Map(tracks.map((t) => [t.trackId, t]));
  const byFilePath = new Map(tracks.filter((t) => t.filePath).map((t) => [t.filePath!, t]));
  const byTitleArtist = new Map(tracks.map((t) => [normalize(t.title) + "|" + normalize(t.artist), t]));

  const matched: MetadataUpdate[] = [];
  const errors: string[] = [];
  let unmatchedRows = 0;
  const fieldCounts: Record<string, number> = {};

  for (const row of rows) {
    let track: Track | undefined;
    let matchedBy: MetadataUpdate["matchedBy"] = "titleArtist";

    if (row["trackid"] && byTrackId.has(row["trackid"])) {
      track = byTrackId.get(row["trackid"]);
      matchedBy = "trackId";
    } else if (row["filepath"] && byFilePath.has(row["filepath"])) {
      track = byFilePath.get(row["filepath"]);
      matchedBy = "filePath";
    } else {
      const key = normalize(row["title"] ?? "") + "|" + normalize(row["artist"] ?? "");
      if (key !== "|" && byTitleArtist.has(key)) {
        track = byTitleArtist.get(key);
        matchedBy = "titleArtist";
      }
    }

    if (!track) { unmatchedRows++; continue; }

    const fields: MetadataUpdate["fields"] = {};
    const durRaw = row["durationseconds"] ?? row["duration"] ?? "";
    if (durRaw) { const dur = parseDuration(durRaw); if (dur && dur > 0) { fields.durationSeconds = dur; fieldCounts["duration"] = (fieldCounts["duration"] ?? 0) + 1; } }
    const bpmRaw = row["bpm"] ?? "";
    if (bpmRaw) { const bpm = parseFloat(bpmRaw); if (!isNaN(bpm) && bpm > 0) { fields.bpm = Math.round(bpm); fieldCounts["bpm"] = (fieldCounts["bpm"] ?? 0) + 1; } }
    const keyRaw = row["camelotkey"] ?? row["key"] ?? "";
    if (keyRaw.trim()) { fields.camelotKey = keyRaw.trim(); fieldCounts["key"] = (fieldCounts["key"] ?? 0) + 1; }
    const energyRaw = row["energy"] ?? "";
    if (energyRaw) { const e = parseFloat(energyRaw); if (!isNaN(e) && e >= 0 && e <= 1) { fields.energy = Math.round(e * 100) / 100; fieldCounts["energy"] = (fieldCounts["energy"] ?? 0) + 1; } }
    const ratingRaw = row["rating"] ?? "";
    if (ratingRaw) { const r = parseFloat(ratingRaw); if (!isNaN(r) && r >= 0 && r <= 5) { fields.rating = Math.round(r); fieldCounts["rating"] = (fieldCounts["rating"] ?? 0) + 1; } }
    const fpRaw = row["filepath"] ?? "";
    if (fpRaw.trim()) { fields.filePath = fpRaw.trim(); fieldCounts["filePath"] = (fieldCounts["filePath"] ?? 0) + 1; }

    if (Object.keys(fields).length > 0) {
      matched.push({ trackId: track.trackId, fields, matchedBy, originalTitle: track.title, originalArtist: track.artist });
    } else { unmatchedRows++; }
  }

  if (errors.length === 0 && matched.length === 0 && rows.length > 0) {
    errors.push("Imported file did not contain new metadata for selected tracks.");
  }
  return { matched, unmatchedRows, fieldCounts, errors };
}

export function estimateEnergyFromBpm(tracks: Track[]): MetadataUpdate[] {
  const bpmTracks = tracks.filter((t) => (t.bpm ?? 0) > 0);
  if (bpmTracks.length === 0) return [];
  const bpms = bpmTracks.map((t) => t.bpm ?? 0);
  const minBpm = Math.min(...bpms);
  const maxBpm = Math.max(...bpms);
  const range = maxBpm - minBpm || 1;
  return tracks
    .filter((t) => (t.bpm ?? 0) > 0 && (t.energy ?? 0) === 0)
    .map((t) => ({
      trackId: t.trackId,
      fields: { energy: Math.round((0.20 + (((t.bpm ?? 0) - minBpm) / range) * 0.70) * 100) / 100 },
      matchedBy: "trackId" as const,
    }));
}
