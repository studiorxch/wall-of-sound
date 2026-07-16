import type { Track } from "../data/trackTypes";
import {
  summarizeMetadataReadiness,
  deriveTrustGrade,
} from "./metadataReadiness";
import type {
  PlaylistGenerationMetadataSnapshot,
  PlaylistMetadataRepairImpact,
} from "../data/playlistPathTypes";

export type { PlaylistGenerationMetadataSnapshot, PlaylistMetadataRepairImpact };

function djb2(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
    h = h >>> 0;
  }
  return h.toString(36);
}

export function computeCratePoolMetadataRevision(tracks: Track[]): string {
  if (tracks.length === 0) return "empty";
  const sorted = [...tracks].sort((a, b) => a.trackId.localeCompare(b.trackId));
  const payload = sorted
    .map(
      (t) =>
        `${t.trackId}:${t.durationSeconds ?? 0}:${t.bpm ?? 0}:${t.camelotKey ?? ""}:${(t.energy ?? 0).toFixed(3)}`,
    )
    .join("|");
  return `r1:${djb2(payload)}`;
}

export function buildPlaylistGenerationMetadataSnapshot(
  tracks: Track[],
  crateIds: string[],
  latestImportId?: string,
): PlaylistGenerationMetadataSnapshot {
  const summary = summarizeMetadataReadiness(tracks);
  const grade = deriveTrustGrade(summary);
  const rev = computeCratePoolMetadataRevision(tracks);
  return {
    snapshotId: `snap_${Math.random().toString(36).slice(2, 9)}`,
    generatedAt: new Date().toISOString(),
    crateIds,
    poolTrackCount: tracks.length,
    readinessGrade: grade,
    durationReady: summary.durationCount,
    bpmReady: summary.bpmCount,
    keyReady: summary.keyCount,
    energyReady: summary.energyCount,
    totalTracks: summary.totalTracks,
    metadataRevision: rev,
    latestImportId,
  };
}
