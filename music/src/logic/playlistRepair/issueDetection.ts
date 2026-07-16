// Playlist Local Repair — issue detection (0713_MUSIC_Playlist_Local_Repair_
// And_Gap_Analysis §5/§6). Reuses the exact same math the generator and
// Playlist Analyzer Review already use (playlistSequencing/, dspFeatureExtraction
// trust helpers, computeMoodContinuity, computeTrackRoles) — no re-derivation.

import type { PlaylistIssue, PlaylistIssueColorState } from "../../data/playlistRepairTypes";
import type { OrderedPlaylistEntry } from "../playlistAnalyzer/resolveOrder";
import { isBpmTrustedForAnalysis, isKeyTrustedForAnalysis } from "../dspFeatureExtraction";
import { computeBpmTransitionDistance } from "../playlistSequencing/bpmTransition";
import { scoreKeyTransition } from "../playlistSequencing/keyTransition";
import { computeMoodContinuity } from "../playlistAnalyzer/transitions";
import { computeTrackRoles } from "../playlistAnalyzer/trackRoles";
import { PREFERRED_TOLERANCE, ACCEPTABLE_TOLERANCE } from "../playlistEnergyEnvelope";
import type { PlaylistSectionEnergyEnvelope } from "../../data/playlistShapeTypes";

// A deterministic key for persisting user disposition across recomputation —
// NOT the same as issueId (which is regenerated fresh every call).
export function issueKey(issue: Pick<PlaylistIssue, "type" | "primaryPosition">): string {
  return `${issue.type}:${issue.primaryPosition}`;
}

function makeIssue(partial: Omit<PlaylistIssue, "issueId" | "colorState"> & { colorState?: PlaylistIssueColorState }): PlaylistIssue {
  const colorState: PlaylistIssueColorState = partial.colorState ?? (
    partial.severity === "error" ? "red" : partial.severity === "warning" ? "yellow" : "blue"
  );
  return {
    ...partial,
    issueId: `issue_${partial.type}_${partial.primaryPosition}`,
    colorState,
  };
}

const LARGE_BPM_JUMP = 20;
const ABRUPT_ENERGY = 0.3;

// ── Transition-scoped issues (§5 Transition) ────────────────────────────────

function detectTransitionIssues(entries: OrderedPlaylistEntry[]): PlaylistIssue[] {
  const issues: PlaylistIssue[] = [];

  for (let i = 0; i < entries.length - 1; i++) {
    const from = entries[i];
    const to = entries[i + 1];
    const positions = [from.position, to.position];
    const sectionId = from.slot.sectionId;

    const fromBpmTrusted = isBpmTrustedForAnalysis(from.track);
    const toBpmTrusted = isBpmTrustedForAnalysis(to.track);
    const fromBpm = fromBpmTrusted ? from.track.bpm : undefined;
    const toBpm = toBpmTrusted ? to.track.bpm : undefined;

    if (!fromBpmTrusted || !toBpmTrusted) {
      issues.push(makeIssue({
        type: "missing_bpm", severity: "info", primaryPosition: to.position, affectedPositions: positions,
        scope: "transition", sectionId,
        explanation: `${!fromBpmTrusted ? from.track.title : to.track.title} has no trusted BPM — this transition's tempo fit could not be evaluated.`,
        warningCodes: ["PLAYLIST_REPAIR_MISSING_BPM"], repairAvailable: false, missingTrackBriefAvailable: false,
      }));
    } else {
      const dist = computeBpmTransitionDistance(fromBpm, toBpm);
      if (dist.effectiveDelta != null && dist.effectiveDelta > LARGE_BPM_JUMP) {
        issues.push(makeIssue({
          type: "bpm_large_jump", severity: "error", primaryPosition: to.position, affectedPositions: positions,
          scope: "transition", sectionId,
          explanation: `Effective BPM jump of ${dist.effectiveDelta.toFixed(1)} between "${from.track.title}" and "${to.track.title}".`,
          warningCodes: ["PLAYLIST_REPAIR_BPM_LARGE_JUMP"], repairAvailable: true, missingTrackBriefAvailable: true,
        }));
      } else if (dist.relationship === "half_time" || dist.relationship === "double_time") {
        issues.push(makeIssue({
          type: "bpm_half_double_ambiguity", severity: "info", primaryPosition: to.position, affectedPositions: positions,
          scope: "transition", sectionId,
          explanation: `Tempo relationship reads as ${dist.relationship.replace("_", "-")} rather than a direct match.`,
          warningCodes: ["PLAYLIST_REPAIR_BPM_HALF_DOUBLE_AMBIGUITY"], repairAvailable: false, missingTrackBriefAvailable: false,
        }));
      }
    }

    const fromKeyTrusted = isKeyTrustedForAnalysis(from.track);
    const toKeyTrusted = isKeyTrustedForAnalysis(to.track);
    if (!fromKeyTrusted || !toKeyTrusted) {
      issues.push(makeIssue({
        type: "untrusted_key", severity: "info", primaryPosition: to.position, affectedPositions: positions,
        scope: "transition", sectionId,
        explanation: `Key data is missing or untrusted for this transition — harmonic fit could not be evaluated.`,
        warningCodes: ["PLAYLIST_REPAIR_KEY_UNTRUSTED"], repairAvailable: false, missingTrackBriefAvailable: false,
      }));
    } else {
      const keyResult = scoreKeyTransition(from.track.camelotKey as string, to.track.camelotKey as string);
      if (keyResult.penalty != null && keyResult.penalty >= 18) {
        issues.push(makeIssue({
          type: "key_incompatible", severity: "warning", primaryPosition: to.position, affectedPositions: positions,
          scope: "transition", sectionId,
          explanation: `Camelot penalty ${keyResult.penalty} between ${from.track.camelotKey} and ${to.track.camelotKey} — a distant/tense key relationship.`,
          warningCodes: ["PLAYLIST_REPAIR_KEY_INCOMPATIBLE"], repairAvailable: true, missingTrackBriefAvailable: true,
        }));
      }
    }

    const fromEnergy = from.row.energy;
    const toEnergy = to.row.energy;
    if (fromEnergy != null && fromEnergy > 0 && toEnergy != null && toEnergy > 0) {
      const delta = Math.abs(toEnergy - fromEnergy);
      if (delta >= ABRUPT_ENERGY) {
        issues.push(makeIssue({
          type: "energy_discontinuity", severity: "error", primaryPosition: to.position, affectedPositions: positions,
          scope: "transition", sectionId,
          explanation: `Energy jumps ${(delta).toFixed(2)} between "${from.track.title}" and "${to.track.title}".`,
          warningCodes: ["PLAYLIST_REPAIR_ENERGY_DISCONTINUITY"], repairAvailable: true, missingTrackBriefAvailable: true,
        }));
      }
    }

    const continuity = computeMoodContinuity(from.row.moodTags, to.row.moodTags);
    if (continuity != null && continuity === 0 && from.row.moodTags.length > 0 && to.row.moodTags.length > 0) {
      issues.push(makeIssue({
        type: "mood_discontinuity", severity: "warning", primaryPosition: to.position, affectedPositions: positions,
        scope: "transition", sectionId,
        explanation: `No shared mood between "${from.track.title}" and "${to.track.title}".`,
        warningCodes: ["PLAYLIST_REPAIR_MOOD_DISCONTINUITY"], repairAvailable: true, missingTrackBriefAvailable: false,
      }));
    }

    if (to.analysisState === "partial" || to.analysisState === "stale") {
      issues.push(makeIssue({
        type: "low_confidence", severity: "info", primaryPosition: to.position, affectedPositions: [to.position],
        scope: "transition", sectionId,
        explanation: `"${to.track.title}" analysis is ${to.analysisState} — this transition's read carries reduced confidence.`,
        warningCodes: ["PLAYLIST_REPAIR_LOW_CONFIDENCE"], repairAvailable: false, missingTrackBriefAvailable: false,
      }));
    }
  }

  return issues;
}

// ── Local-window-scoped issues (§5 Local window) ────────────────────────────

function detectLocalWindowIssues(entries: OrderedPlaylistEntry[]): PlaylistIssue[] {
  const issues: PlaylistIssue[] = [];
  if (entries.length < 3) return issues;
  const roles = computeTrackRoles(entries);

  for (let i = 1; i < entries.length - 1; i++) {
    const r = roles[i];
    const prevRole = roles[i - 1];
    const nextRole = roles[i + 1];
    const positions = [i - 1, i, i + 1].filter((p) => p >= 0 && p < entries.length);

    if (r.role === "bridge" && r.confidence < 0.6) {
      issues.push(makeIssue({
        type: "weak_bridge", severity: "warning", primaryPosition: i, affectedPositions: positions,
        scope: "local_window",
        explanation: `"${entries[i].track.title}" is a bridge track with low analysis confidence — its connective role may not hold up.`,
        warningCodes: ["PLAYLIST_REPAIR_WEAK_BRIDGE"], repairAvailable: true, missingTrackBriefAvailable: true,
      }));
    }

    if (r.role === "peak" && prevRole.role === "peak") {
      issues.push(makeIssue({
        type: "duplicate_peak", severity: "warning", primaryPosition: i, affectedPositions: [i - 1, i],
        scope: "local_window",
        explanation: `Two adjacent tracks both read as "peak" — the section may have a duplicated high point rather than one clear peak.`,
        warningCodes: ["PLAYLIST_REPAIR_DUPLICATE_ROLE"], repairAvailable: true, missingTrackBriefAvailable: false,
      }));
    }

    if (r.role === nextRole?.role && r.role !== "support" && r.role !== "continuation") {
      issues.push(makeIssue({
        type: "repeated_role", severity: "info", primaryPosition: i, affectedPositions: [i, i + 1],
        scope: "local_window",
        explanation: `"${entries[i].track.title}" and "${entries[i + 1].track.title}" both read as "${r.role}" back to back.`,
        warningCodes: ["PLAYLIST_REPAIR_DUPLICATE_ROLE"], repairAvailable: false, missingTrackBriefAvailable: false,
      }));
    }
  }

  return issues;
}

// ── Section-scoped issues (§5 Section) ──────────────────────────────────────

function detectSectionIssues(entries: OrderedPlaylistEntry[], envelopesBySectionId: Map<string, PlaylistSectionEnergyEnvelope>): PlaylistIssue[] {
  const issues: PlaylistIssue[] = [];
  const bySection = new Map<string, OrderedPlaylistEntry[]>();
  for (const e of entries) {
    if (!e.slot.sectionId) continue;
    if (!bySection.has(e.slot.sectionId)) bySection.set(e.slot.sectionId, []);
    bySection.get(e.slot.sectionId)!.push(e);
  }

  for (const [sectionId, group] of bySection) {
    const envelope = envelopesBySectionId.get(sectionId);
    if (!envelope || group.length === 0) continue;

    const knownEnergies = group.map((e) => e.row.energy).filter((v): v is number => v != null && v > 0);
    if (knownEnergies.length === 0) continue;
    const avgEnergy = knownEnergies.reduce((a, b) => a + b, 0) / knownEnergies.length;
    const targetMid = (envelope.start + envelope.end) / 2;
    const positions = group.map((e) => e.position);

    if (avgEnergy < targetMid - ACCEPTABLE_TOLERANCE) {
      issues.push(makeIssue({
        type: "section_below_target", severity: "warning", primaryPosition: positions[0], affectedPositions: positions,
        scope: "section", sectionId,
        explanation: `Section "${sectionId}" averages energy ${avgEnergy.toFixed(2)}, below its envelope target (~${targetMid.toFixed(2)}).`,
        warningCodes: ["PLAYLIST_REPAIR_SECTION_BELOW_TARGET"], repairAvailable: true, missingTrackBriefAvailable: true,
      }));
    } else if (avgEnergy > targetMid + ACCEPTABLE_TOLERANCE) {
      issues.push(makeIssue({
        type: "section_above_target", severity: "warning", primaryPosition: positions[0], affectedPositions: positions,
        scope: "section", sectionId,
        explanation: `Section "${sectionId}" averages energy ${avgEnergy.toFixed(2)}, above its envelope target (~${targetMid.toFixed(2)}).`,
        warningCodes: ["PLAYLIST_REPAIR_SECTION_ABOVE_TARGET"], repairAvailable: true, missingTrackBriefAvailable: true,
      }));
    }

    // Direction mismatch: envelope expects rise/fall but observed energy
    // trend across the section runs the opposite way.
    if ((envelope.shape === "rise" || envelope.shape === "fall") && group.length >= 3) {
      const first = group[0].row.energy;
      const last = group[group.length - 1].row.energy;
      if (first != null && first > 0 && last != null && last > 0) {
        const observedDelta = last - first;
        const expectRise = envelope.shape === "rise";
        if ((expectRise && observedDelta < -PREFERRED_TOLERANCE) || (!expectRise && observedDelta > PREFERRED_TOLERANCE)) {
          issues.push(makeIssue({
            type: "section_direction_mismatch", severity: "warning", primaryPosition: positions[0], affectedPositions: positions,
            scope: "section", sectionId,
            explanation: `Section "${sectionId}" is configured to ${envelope.shape}, but observed energy moves the opposite direction.`,
            warningCodes: ["PLAYLIST_REPAIR_SECTION_DIRECTION_MISMATCH"], repairAvailable: true, missingTrackBriefAvailable: false,
          }));
        }
      }
    }
  }

  return issues;
}

// ── Playlist-scoped issues (§5 Playlist — used sparingly) ───────────────────

function detectPlaylistIssues(entries: OrderedPlaylistEntry[], transitionAndLocal: PlaylistIssue[]): PlaylistIssue[] {
  const issues: PlaylistIssue[] = [];
  if (entries.length === 0) return issues;

  const roles = computeTrackRoles(entries);
  const hasPeak = roles.some((r) => r.role === "peak");
  if (!hasPeak && entries.length >= 5) {
    issues.push(makeIssue({
      type: "no_viable_peak", severity: "warning", primaryPosition: 0, affectedPositions: entries.map((e) => e.position),
      scope: "playlist",
      explanation: "No track in this playlist reads as a clear peak — energy variance is too flat to identify one.",
      warningCodes: ["PLAYLIST_REPAIR_PEAK_MISSING"], repairAvailable: false, missingTrackBriefAvailable: true,
    }));
  }

  const redCount = transitionAndLocal.filter((i) => i.colorState === "red").length;
  if (redCount >= 3) {
    issues.push(makeIssue({
      type: "too_many_red_issues", severity: "error", primaryPosition: 0, affectedPositions: entries.map((e) => e.position),
      scope: "playlist",
      explanation: `${redCount} unresolved material defects across the playlist.`,
      warningCodes: ["PLAYLIST_REPAIR_NO_PERFECT_MATCH"], repairAvailable: false, missingTrackBriefAvailable: false,
    }));
  }

  const missingCount = entries.filter((e) => e.analysisState === "missing").length;
  if (entries.length > 0 && missingCount / entries.length > 0.5) {
    issues.push(makeIssue({
      type: "coverage_too_low", severity: "warning", primaryPosition: 0, affectedPositions: entries.map((e) => e.position),
      scope: "playlist",
      explanation: `${missingCount} of ${entries.length} tracks have no analysis coverage — playlist-level judgments carry low confidence.`,
      warningCodes: ["PLAYLIST_REPAIR_LOW_CONFIDENCE"], repairAvailable: false, missingTrackBriefAvailable: false,
    }));
  }

  return issues;
}

export function detectPlaylistIssuesAll(
  entries: OrderedPlaylistEntry[],
  envelopesBySectionId: Map<string, PlaylistSectionEnergyEnvelope> = new Map(),
): PlaylistIssue[] {
  const transition = detectTransitionIssues(entries);
  const localWindow = detectLocalWindowIssues(entries);
  const section = detectSectionIssues(entries, envelopesBySectionId);
  const playlist = detectPlaylistIssues(entries, [...transition, ...localWindow]);
  return [...transition, ...localWindow, ...section, ...playlist];
}
