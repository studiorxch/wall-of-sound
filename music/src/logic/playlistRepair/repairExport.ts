// Playlist Local Repair — Markdown/YAML export extension (0713_MUSIC_Playlist_
// Repair_Analyzer_Export_Completion §8/§9). Extends the existing Playlist
// Analyzer export (gptExport.ts) with repair state. Values here are read
// directly from the same PlaylistRepairSnapshot the UI renders — never
// re-derived — so UI and export can never disagree (§8.3).

import type { PlaylistIssue, PlaylistIssueAggregate, PlaylistRepairState, LibraryGapRecord } from "../../data/playlistRepairTypes";
import type { PlaylistReadinessSummary } from "../../data/playlistRepairTypes";
import type { PlaylistRepairZone, PlaylistRepairCandidate } from "../../data/playlistRepairTypes";

function yamlStr(s: string): string {
  if (/[:#\-[\]{}"']/.test(s) || s.trim() !== s || s === "") return JSON.stringify(s);
  return s;
}

export interface RepairZoneExportEntry {
  issue: PlaylistIssue;
  zone: PlaylistRepairZone;
  bestCandidate?: PlaylistRepairCandidate;
}

export interface RepairExportInput {
  readiness: PlaylistReadinessSummary;
  aggregates: PlaylistIssueAggregate[];
  nonAggregatedIssues: PlaylistIssue[];
  repairableCount: number;
  zones: RepairZoneExportEntry[];
  repairState?: PlaylistRepairState;
  playlistId: string;
  libraryGaps: LibraryGapRecord[];
}

export function buildRepairSummaryYaml(input: RepairExportInput): string[] {
  const { readiness, aggregates, nonAggregatedIssues, repairableCount, zones, repairState, playlistId, libraryGaps } = input;
  const acceptedYellow = nonAggregatedIssues.filter((i) => i.colorState === "yellow" && i.accepted);
  const playlistGaps = libraryGaps.filter((g) => g.sourcePlaylistIds.includes(playlistId) && g.status !== "resolved" && g.status !== "dismissed");
  const briefs = libraryGaps.filter((g) => g.sourcePlaylistIds.includes(playlistId));

  const yaml: string[] = [];
  yaml.push("repair_summary:");
  yaml.push(`  readiness: ${readiness.state}`);
  yaml.push(`  unresolved_red: ${readiness.unresolvedRedCount}`);
  yaml.push(`  accepted_yellow: ${readiness.acceptedYellowCount}`);
  yaml.push(`  blue_aggregates: ${aggregates.length}`);
  yaml.push(`  repairable_now: ${repairableCount}`);
  yaml.push(`  missing_track_briefs: ${briefs.length}`);
  yaml.push(`  open_library_gaps: ${playlistGaps.length}`);
  yaml.push("");

  yaml.push("blue_uncertainty:");
  if (aggregates.length === 0) {
    yaml.push("  []");
  } else {
    for (const a of aggregates) {
      yaml.push(`  - issue_type: ${a.issueType}`);
      yaml.push(`    count: ${a.count}`);
      yaml.push(`    remediation: ${a.actionType ?? "none"}`);
    }
  }
  yaml.push("");

  yaml.push("repair_zones:");
  if (zones.length === 0) {
    yaml.push("  []");
  } else {
    for (const { issue, zone, bestCandidate } of zones) {
      yaml.push(`  - issue_id: ${issue.issueId}`);
      if (zone.sectionId) yaml.push(`    section: ${yamlStr(zone.sectionId)}`);
      yaml.push(`    position: ${zone.targetPosition}`);
      yaml.push(`    scope: ${issue.scope}`);
      yaml.push(`    severity: ${issue.severity}`);
      if (zone.previousPosition != null) yaml.push(`    previous_position: ${zone.previousPosition}`);
      if (zone.nextPosition != null) yaml.push(`    next_position: ${zone.nextPosition}`);
      if (bestCandidate) {
        yaml.push(`    best_candidate:`);
        yaml.push(`      track_id: ${bestCandidate.trackId}`);
        yaml.push(`      classification: ${bestCandidate.classification}`);
        yaml.push(`      total_score: ${bestCandidate.totalScore}`);
      }
    }
  }
  yaml.push("");

  yaml.push("accepted_compromises:");
  if (acceptedYellow.length === 0) {
    yaml.push("  []");
  } else {
    for (const i of acceptedYellow) {
      const disp = repairState?.dispositions[`${i.type}:${i.primaryPosition}`];
      yaml.push(`  - position: ${i.primaryPosition}`);
      yaml.push(`    issue: ${i.type}`);
      yaml.push(`    disposition: ${disp ?? "kept_current"}`);
    }
  }
  yaml.push("");

  yaml.push("missing_track_briefs:");
  if (briefs.length === 0) {
    yaml.push("  []");
  } else {
    for (const g of briefs) {
      const b = g.mergedBrief;
      yaml.push(`  - section: ${yamlStr(b.sectionId ?? "")}`);
      yaml.push(`    role: ${yamlStr(b.role)}`);
      if (b.tempo.preferredBpmRange) yaml.push(`    preferred_bpm: [${b.tempo.preferredBpmRange[0]}, ${b.tempo.preferredBpmRange[1]}]`);
      if (b.energy.preferredRange) yaml.push(`    preferred_energy: [${b.energy.preferredRange[0]}, ${b.energy.preferredRange[1]}]`);
      yaml.push(`    preferred_keys: [${b.harmony.preferredCamelotKeys.join(", ")}]`);
      yaml.push(`    status: ${g.status}`);
    }
  }
  yaml.push("");

  yaml.push("library_gaps:");
  if (playlistGaps.length === 0) {
    yaml.push("  []");
  } else {
    for (const g of playlistGaps) {
      yaml.push(`  - gap_id: ${g.gapId}`);
      yaml.push(`    occurrences: ${g.occurrenceCount}`);
      yaml.push(`    status: ${g.status}`);
    }
  }

  if (repairState?.lastReanalysis) {
    const r = repairState.lastReanalysis;
    yaml.push("");
    yaml.push("analysis_refresh:");
    yaml.push(`  last_reanalyzed_at: ${r.lastReanalyzedAt}`);
    yaml.push(`  queued: ${r.queued}`);
    yaml.push(`  complete: ${r.complete}`);
    yaml.push(`  partial: ${r.partial}`);
    yaml.push(`  failed: ${r.failed}`);
  }

  return yaml;
}

export function buildRepairProse(input: RepairExportInput): string[] {
  const { readiness, nonAggregatedIssues, aggregates, libraryGaps, playlistId } = input;
  const redIssues = nonAggregatedIssues.filter((i) => i.colorState === "red" && !i.accepted);
  const acceptedYellow = nonAggregatedIssues.filter((i) => i.colorState === "yellow" && i.accepted);
  const briefs = libraryGaps.filter((g) => g.sourcePlaylistIds.includes(playlistId));
  const playlistGaps = libraryGaps.filter((g) => g.sourcePlaylistIds.includes(playlistId));

  const prose: string[] = [];
  prose.push("## Repair Readiness");
  prose.push(`**${readiness.state.replace(/_/g, " ")}** — ${readiness.explanation}`);
  prose.push("");

  prose.push("## Unresolved Issues");
  if (redIssues.length === 0 && aggregates.length === 0) {
    prose.push("None.");
  } else {
    for (const i of redIssues) prose.push(`- **${i.type}** (position ${i.primaryPosition + 1}): ${i.explanation}`);
    for (const a of aggregates) prose.push(`- **${a.issueType}** (${a.count} tracks): ${a.summary}`);
  }
  prose.push("");

  prose.push("## Accepted Compromises");
  prose.push(acceptedYellow.length === 0 ? "None." : acceptedYellow.map((i) => `- ${i.explanation}`).join("\n"));
  prose.push("");

  prose.push("## Missing-Track Briefs");
  prose.push(briefs.length === 0 ? "None." : briefs.map((g) => `- ${g.mergedBrief.role} (${g.status}): ${g.mergedBrief.purpose}`).join("\n"));
  prose.push("");

  prose.push("## Library Gaps");
  prose.push(playlistGaps.length === 0 ? "None." : playlistGaps.map((g) => `- ${g.gapId} (${g.status}, ${g.occurrenceCount}x)`).join("\n"));
  prose.push("");

  prose.push("## Recommended Next Actions");
  const actions: string[] = [];
  if (redIssues.length > 0) actions.push("Resolve unresolved red issues via Find Replacements before treating this playlist as ready.");
  if (aggregates.some((a) => a.actionType === "reanalyze_playlist" || a.actionType === "reanalyze_tracks")) {
    actions.push("Run Reanalyze Entire Playlist to resolve grouped blue uncertainty.");
  }
  if (playlistGaps.length > 0) actions.push("Review open library gaps — no equivalent library candidate currently exists.");
  prose.push(actions.length === 0 ? "None — playlist is at its current readiness ceiling." : actions.map((a) => `- ${a}`).join("\n"));

  return prose;
}
