// Playlist Local Repair — builds repair-zone + best-candidate summaries for
// the export and for Playlist Analyzer Review's Transitions/Overview badges
// (0713_MUSIC_Playlist_Repair_Analyzer_Export_Completion §6.3/§8.1). Reuses
// the exact same candidateSearch/candidateRanking used by the Repair panel's
// "Find Replacements" — no new ranking logic. Bounded to the playlist's
// current repairable (non-accepted, repairAvailable) issues, so this stays
// cheap (a handful of candidate searches, not one per transition).

import type { Track } from "../../data/trackTypes";
import type { CrateRecord } from "../../data/crateTypes";
import type { PlaylistRecord } from "../../data/playProjectTypes";
import type { PlaylistIssue } from "../../data/playlistRepairTypes";
import type { OrderedPlaylistEntry } from "../playlistAnalyzer/resolveOrder";
import { buildRepairZone } from "./repairZone";
import { searchRepairCandidates } from "./candidateSearch";
import { rankRepairCandidates } from "./candidateRanking";
import { getEnergyTargetAtPosition } from "../playlistEnergyEnvelope";
import type { RepairZoneExportEntry } from "./repairExport";

export function buildRepairZoneSummaries(
  playlist: PlaylistRecord,
  entries: OrderedPlaylistEntry[],
  repairableIssues: PlaylistIssue[],
  libraryTracks: Track[],
  crates: CrateRecord[],
): RepairZoneExportEntry[] {
  const tracksById = new Map(libraryTracks.map((t) => [t.trackId, t]));
  const cratesById = new Map(crates.map((c) => [c.id, c]));
  const playlistTrackIds = entries.map((e) => e.track.trackId);

  return repairableIssues.map((issue) => {
    const zone = buildRepairZone(issue, entries);
    const section = issue.sectionId ? playlist.shapeConfig?.sections.find((s) => s.id === issue.sectionId) : undefined;

    const prevTrack = zone.previousTrackId ? tracksById.get(zone.previousTrackId) : undefined;
    const currentTrack = zone.currentTrackId ? tracksById.get(zone.currentTrackId) : undefined;
    const nextTrack = zone.nextTrackId ? tracksById.get(zone.nextTrackId) : undefined;
    const targetEnergy = section
      ? getEnergyTargetAtPosition(section.energyEnvelope, entries.length > 1 ? zone.targetPosition / (entries.length - 1) : 0)
      : currentTrack?.energy;

    const pool = searchRepairCandidates({ zone, section, cratesById, libraryTracks, playlistTrackIds });
    const ranked = rankRepairCandidates({ zone, candidates: pool, previousTrack: prevTrack, currentTrack, nextTrack, targetEnergy });
    const bestCandidate = ranked.find((c) => c.classification === "perfect_match" || c.classification === "strong_match") ?? ranked[0];

    return { issue, zone, bestCandidate };
  });
}
