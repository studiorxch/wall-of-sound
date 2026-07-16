// Playlist Local Repair — blue-uncertainty aggregation (0713_MUSIC_Playlist_
// Repair_Analyzer_Export_Completion §4). Purely a presentation-layer grouping
// over the live-computed issue list — never removes or mutates the
// underlying PlaylistIssue records, and only groups blue issues that share
// the same issue type (== same root cause/remediation/warning code, since
// each blue issue type in issueDetection.ts maps to exactly one warning
// code). Red/yellow issues, and any accepted issue, are never aggregated.

import type { OrderedPlaylistEntry } from "../playlistAnalyzer/resolveOrder";
import type { PlaylistIssue, PlaylistIssueAggregate, PlaylistIssueAggregateActionType } from "../../data/playlistRepairTypes";

const ACTION_BY_TYPE: Record<string, PlaylistIssueAggregateActionType> = {
  missing_bpm: "reanalyze_tracks",
  untrusted_key: "reanalyze_tracks",
  low_confidence: "review_provenance",
  bpm_half_double_ambiguity: "review_provenance",
  coverage_too_low: "reanalyze_playlist",
};

const LABEL_BY_TYPE: Record<string, string> = {
  missing_bpm: "have no trusted BPM",
  untrusted_key: "have untrusted key provenance",
  low_confidence: "carry low analysis confidence",
  bpm_half_double_ambiguity: "read as half/double-time rather than a direct match",
  coverage_too_low: "have no analysis coverage",
};

// Aggregation is linear in issue count (§14) — single pass, Map keyed by type.
export function aggregateBlueIssues(issues: PlaylistIssue[], entries: OrderedPlaylistEntry[]): PlaylistIssueAggregate[] {
  const trackIdAtPosition = new Map<number, string>();
  for (const e of entries) trackIdAtPosition.set(e.position, e.track.trackId);

  const groups = new Map<string, PlaylistIssue[]>();
  for (const issue of issues) {
    if (issue.colorState !== "blue") continue;
    if (issue.accepted) continue;
    if (!groups.has(issue.type)) groups.set(issue.type, []);
    groups.get(issue.type)!.push(issue);
  }

  const aggregates: PlaylistIssueAggregate[] = [];
  for (const [type, group] of groups) {
    // A lone occurrence reads better as an individual card than a "1 track" aggregate.
    if (group.length < 2) continue;

    const positions = new Set<number>();
    for (const issue of group) for (const p of issue.affectedPositions) positions.add(p);
    const affectedPositions = [...positions].sort((a, b) => a - b);
    const affectedTrackIds = [...new Set(affectedPositions.map((p) => trackIdAtPosition.get(p)).filter((id): id is string => !!id))];

    const label = LABEL_BY_TYPE[type] ?? `share the "${type}" condition`;

    aggregates.push({
      aggregateId: `aggregate_${type}`,
      issueType: type,
      colorState: "blue",
      count: group.length,
      affectedPositions,
      affectedTrackIds,
      summary: `${affectedTrackIds.length} track${affectedTrackIds.length === 1 ? "" : "s"} ${label}`,
      detail: group[0].explanation,
      actionType: ACTION_BY_TYPE[type] ?? "none",
    });
  }

  aggregates.sort((a, b) => b.count - a.count);
  return aggregates;
}

// Issues not folded into any aggregate — every red/yellow issue, plus any
// blue issue whose type didn't reach the aggregation threshold or is accepted.
export function nonAggregatedIssues(issues: PlaylistIssue[], aggregates: PlaylistIssueAggregate[]): PlaylistIssue[] {
  const aggregatedTypes = new Set(aggregates.map((a) => a.issueType));
  return issues.filter((issue) => !(issue.colorState === "blue" && !issue.accepted && aggregatedTypes.has(issue.type)));
}
