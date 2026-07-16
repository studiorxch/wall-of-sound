import type { Track } from "../data/trackTypes";
import type { CrateRecord } from "../data/crateTypes";
import type { PlaylistRecord } from "../data/playProjectTypes";
import type { MetadataImportRecord } from "../data/metadataSourceTypes";
import {
  summarizeMetadataReadiness,
  deriveTrustGrade,
  type MetadataTrustGrade,
} from "./metadataReadiness";
import { resolveCrateTracks } from "./resolveCrate";

export type ExternalCoverageSummary = {
  totalTracks: number;
  analyzedCount: number;   // tracks with real duration > 0
  durationReady: number;
  bpmReady: number;
  keyReady: number;
  energyReady: number;
  filePathCount: number;
  trustGrade: MetadataTrustGrade;
  coveragePct: number;     // 0–100
  latestImport?: MetadataImportRecord;
};

export type CrateCoverage = {
  crateId: string;
  crateName: string;
  trackCount: number;
  durationReady: number;
  bpmReady: number;
  keyReady: number;
  energyReady: number;
  trustGrade: MetadataTrustGrade;
  affectedPlaylistIds: string[];
  staleOptionCount: number;
};

export type MissingAnalysisTrack = {
  trackId: string;
  title: string;
  artist: string;
  filename?: string;
  filePath?: string;
  crateIds: string[];
  missingFields: string[];
  reason: string;
};

export function computeExternalCoverage(
  externalTracks: Track[],
  latestImport?: MetadataImportRecord,
): ExternalCoverageSummary {
  const summary = summarizeMetadataReadiness(externalTracks);
  const trustGrade = deriveTrustGrade(summary);
  const analyzedCount = summary.durationCount; // proxy: real duration = analyzed
  const fields = summary.durationCount + summary.bpmCount + summary.energyCount + summary.keyCount;
  const maxFields = externalTracks.length * 4;
  const coveragePct = maxFields > 0 ? Math.round((fields / maxFields) * 100) : 0;
  return {
    totalTracks: summary.totalTracks,
    analyzedCount,
    durationReady: summary.durationCount,
    bpmReady: summary.bpmCount,
    keyReady: summary.keyCount,
    energyReady: summary.energyCount,
    filePathCount: summary.filePathCount,
    trustGrade,
    coveragePct,
    latestImport,
  };
}

export function computeCrateCoverage(
  crates: CrateRecord[],
  libraryTracks: Track[],
  playlists: PlaylistRecord[],
): CrateCoverage[] {
  const externalIds = new Set(
    libraryTracks.filter((t) => t.sourceOwner === "external").map((t) => t.trackId),
  );

  return crates
    .map((c) => {
      const { tracks: crateTracks } = resolveCrateTracks(c, libraryTracks);
      const externalTracks = crateTracks.filter((t) => externalIds.has(t.trackId));
      if (externalTracks.length === 0) return null;

      const summary = summarizeMetadataReadiness(externalTracks);
      const trustGrade = deriveTrustGrade(summary);

      const affectedPlaylists = playlists.filter((pl) => pl.crateIds?.includes(c.id));
      const staleOptionCount = affectedPlaylists.reduce(
        (s, pl) => s + (pl.pathOptions?.filter((o) => o.staleReason).length ?? 0),
        0,
      );

      return {
        crateId: c.id,
        crateName: c.name,
        trackCount: externalTracks.length,
        durationReady: summary.durationCount,
        bpmReady: summary.bpmCount,
        keyReady: summary.keyCount,
        energyReady: summary.energyCount,
        trustGrade,
        affectedPlaylistIds: affectedPlaylists.map((pl) => pl.playlistId),
        staleOptionCount,
      };
    })
    .filter((c): c is CrateCoverage => c !== null);
}

export function getTracksMissingAnalysis(externalTracks: Track[], crates: CrateRecord[], libraryTracks: Track[]): MissingAnalysisTrack[] {
  const cratesByTrackId = new Map<string, string[]>();
  for (const c of crates) {
    const { tracks } = resolveCrateTracks(c, libraryTracks);
    for (const t of tracks) {
      if (!cratesByTrackId.has(t.trackId)) cratesByTrackId.set(t.trackId, []);
      cratesByTrackId.get(t.trackId)!.push(c.id);
    }
  }

  return externalTracks
    .filter((t) => {
      const missing = (t.durationSeconds ?? 0) === 0 || (t.bpm ?? 0) === 0 || (t.energy ?? 0) === 0;
      return missing;
    })
    .map((t) => {
      const missingFields: string[] = [];
      if ((t.durationSeconds ?? 0) === 0) missingFields.push("duration");
      if ((t.bpm ?? 0) === 0) missingFields.push("bpm");
      if (!(t.camelotKey || t.key)) missingFields.push("key");
      if ((t.energy ?? 0) === 0) missingFields.push("energy");

      const hasPath = !!(t.filePath || t.audioFilename || t.fileName);
      const reason = !hasPath
        ? "missing file path"
        : "not analyzed";

      return {
        trackId: t.trackId,
        title: t.title,
        artist: t.artist,
        filename: t.audioFilename ?? t.fileName,
        filePath: t.filePath,
        crateIds: cratesByTrackId.get(t.trackId) ?? [],
        missingFields,
        reason,
      };
    });
}

export function exportManifestCsv(tracks: Track[], crates: CrateRecord[], libraryTracks: Track[]): string {
  const cratesByTrackId = new Map<string, string[]>();
  for (const c of crates) {
    const { tracks: ct } = resolveCrateTracks(c, libraryTracks);
    for (const t of ct) {
      if (!cratesByTrackId.has(t.trackId)) cratesByTrackId.set(t.trackId, []);
      cratesByTrackId.get(t.trackId)!.push(c.id);
    }
  }

  const header = "trackId,title,artist,filename,filePath,crateIds,missingFields,currentBpm,currentKey,currentCamelotKey,currentEnergy,currentDurationSeconds";
  const rows = tracks.map((t) => {
    const missing: string[] = [];
    if ((t.durationSeconds ?? 0) === 0) missing.push("duration");
    if ((t.bpm ?? 0) === 0) missing.push("bpm");
    if (!(t.camelotKey || t.key)) missing.push("key");
    if ((t.energy ?? 0) === 0) missing.push("energy");
    const crateIds = cratesByTrackId.get(t.trackId)?.join(";") ?? "";
    const q = (v: string | number | undefined | null) =>
      `"${String(v ?? "").replace(/"/g, '""')}"`;
    return [
      q(t.trackId), q(t.title), q(t.artist),
      q(t.audioFilename ?? t.fileName ?? ""),
      q(t.filePath ?? ""),
      q(crateIds),
      q(missing.join(";")),
      q(t.bpm ?? ""), q(t.key ?? ""), q(t.camelotKey ?? ""),
      q(t.energy ?? ""), q(t.durationSeconds ?? ""),
    ].join(",");
  });
  return [header, ...rows].join("\n");
}

export function exportMissingAnalysisCsv(missing: MissingAnalysisTrack[]): string {
  const header = "trackId,title,artist,filename,filePath,crateIds,missingFields,reason";
  const rows = missing.map((t) => {
    const q = (v: string | undefined | null) =>
      `"${String(v ?? "").replace(/"/g, '""')}"`;
    return [
      q(t.trackId), q(t.title), q(t.artist),
      q(t.filename ?? ""), q(t.filePath ?? ""),
      q(t.crateIds.join(";")), q(t.missingFields.join(";")), q(t.reason),
    ].join(",");
  });
  return [header, ...rows].join("\n");
}

export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
