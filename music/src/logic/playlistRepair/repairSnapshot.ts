// Playlist Local Repair — single shared snapshot (0713_MUSIC_Playlist_Repair_
// Analyzer_Export_Completion §15: "do not duplicate library-gap or
// repair-state ownership"). Both the Repair panel and Playlist Analyzer
// Review must report the same readiness (§7) — this is the one place that
// computes issues/aggregates/readiness from a playlist + library, so both
// surfaces (and the export) read the identical numbers.

import type { PlaylistRecord } from "../../data/playProjectTypes";
import type { Track } from "../../data/trackTypes";
import type { PlaylistIssue, PlaylistReadinessSummary, PlaylistRepairState } from "../../data/playlistRepairTypes";
import { resolvePlaylistOrder, type OrderedPlaylistEntry } from "../playlistAnalyzer/resolveOrder";
import { detectPlaylistIssuesAll, issueKey } from "./issueDetection";
import { aggregateBlueIssues, nonAggregatedIssues } from "./aggregateIssues";
import { computeReadiness } from "./readiness";
import type { PlaylistIssueAggregate } from "../../data/playlistRepairTypes";

export interface PlaylistRepairSnapshot {
  entries: OrderedPlaylistEntry[];
  issues: PlaylistIssue[];
  aggregates: PlaylistIssueAggregate[];
  nonAggregated: PlaylistIssue[];
  readiness: PlaylistReadinessSummary;
  repairableCount: number;
}

export function computePlaylistRepairSnapshot(
  playlist: PlaylistRecord,
  tracksById: Map<string, Track>,
): PlaylistRepairSnapshot {
  const entries = resolvePlaylistOrder(playlist.slots, tracksById);
  const envelopesBySectionId = new Map<string, import("../../data/playlistShapeTypes").PlaylistSectionEnergyEnvelope>();
  for (const sec of playlist.shapeConfig?.sections ?? []) envelopesBySectionId.set(sec.id, sec.energyEnvelope);

  const dispositions = (playlist.repairState as PlaylistRepairState | undefined)?.dispositions ?? {};
  const raw = detectPlaylistIssuesAll(entries, envelopesBySectionId);
  const issues = raw.map((issue) => {
    const disp = dispositions[issueKey(issue)];
    return disp ? { ...issue, accepted: disp === "accepted_temporary" || disp === "kept_current" } : issue;
  });

  const aggregates = aggregateBlueIssues(issues, entries);
  const nonAggregated = nonAggregatedIssues(issues, aggregates);
  const readiness = computeReadiness(issues);
  const repairableCount = nonAggregated.filter((i) => i.repairAvailable && !i.accepted).length;

  return { entries, issues, aggregates, nonAggregated, readiness, repairableCount };
}
