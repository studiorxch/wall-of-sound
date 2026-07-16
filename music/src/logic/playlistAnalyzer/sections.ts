// Playlist Analyzer Review — real section analysis (spec §5.4).
// Only analyzes sections that actually exist on the playlist's slots
// (TrackSlot.sectionId/sectionLabel) — never invents a section boundary.
// When no real sections exist this returns [] and the Sequence Arc (arc.ts)
// carries the "inferred phases" fallback instead.

import type { PlaylistSectionReview } from "../../data/playlistAnalyzerTypes";
import type { OrderedPlaylistEntry } from "./resolveOrder";
import { getCamelotPenalty } from "../camelot";
import { isBpmTrustedForAnalysis, isKeyTrustedForAnalysis } from "../dspFeatureExtraction";

function groupBySection(entries: OrderedPlaylistEntry[]): Array<{ id: string; label: string; entries: OrderedPlaylistEntry[] }> {
  const groups: Array<{ id: string; label: string; entries: OrderedPlaylistEntry[] }> = [];
  for (const e of entries) {
    if (!e.slot.sectionId) continue;
    const last = groups[groups.length - 1];
    if (last && last.id === e.slot.sectionId) {
      last.entries.push(e);
    } else {
      groups.push({ id: e.slot.sectionId, label: e.slot.sectionLabel ?? e.slot.sectionId, entries: [e] });
    }
  }
  return groups;
}

function topMoods(entries: OrderedPlaylistEntry[], n = 3): string[] {
  const counts = new Map<string, number>();
  for (const e of entries) for (const m of e.row.moodTags.slice(0, 2)) counts.set(m, (counts.get(m) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([m]) => m);
}

export function buildSectionReviews(entries: OrderedPlaylistEntry[]): PlaylistSectionReview[] {
  const groups = groupBySection(entries);
  if (groups.length === 0) return [];

  return groups.map((g, gi) => {
    const first = g.entries[0];
    const last = g.entries[g.entries.length - 1];
    const startSeconds = first.slot.startTimeSeconds;
    const endSeconds = last.slot.startTimeSeconds + (last.track.durationSeconds || 0);
    const energies = g.entries.map((e) => e.row.energy).filter((v): v is number => v != null && v > 0);
    const bpms = g.entries.filter((e) => isBpmTrustedForAnalysis(e.track)).map((e) => e.track.bpm as number);

    const warningCodes: string[] = [];
    if (energies.length >= 2) {
      const spread = Math.max(...energies) - Math.min(...energies);
      if (spread < 0.06) warningCodes.push("PLAYLIST_SECTION_LOW_MOVEMENT");
    }

    // Role: rough position-based label — first group is establishing, last is
    // resolving, middle groups with the highest average energy are the peak.
    const avgEnergy = energies.length ? energies.reduce((a, b) => a + b, 0) / energies.length : null;
    const role = gi === 0 ? "establishing" : gi === groups.length - 1 ? "resolving" : "developing";

    // Entry/exit transition character vs the immediately adjacent sections.
    const prevGroup = groups[gi - 1];
    const nextGroup = groups[gi + 1];
    const entryTransition = prevGroup
      ? describeBoundary(prevGroup.entries[prevGroup.entries.length - 1], first)
      : undefined;
    const exitTransition = nextGroup
      ? describeBoundary(last, nextGroup.entries[0])
      : undefined;

    return {
      sectionId: g.id,
      sectionLabel: g.label,
      isRealSection: true,
      startSlotIndex: first.slot.slotIndex,
      endSlotIndex: last.slot.slotIndex,
      startSeconds,
      endSeconds,
      durationSeconds: endSeconds - startSeconds,
      trackCount: g.entries.length,
      dominantMoods: topMoods(g.entries),
      averageEnergy: avgEnergy,
      energyRange: energies.length ? [Math.min(...energies), Math.max(...energies)] : null,
      bpmRange: bpms.length ? [Math.min(...bpms), Math.max(...bpms)] : null,
      role,
      entryTransition,
      exitTransition,
      warningCodes,
    };
  });
}

function describeBoundary(from: OrderedPlaylistEntry, to: OrderedPlaylistEntry): string {
  const fromEnergy = from.row.energy ?? null;
  const toEnergy = to.row.energy ?? null;
  const energyNote = fromEnergy != null && toEnergy != null
    ? (toEnergy - fromEnergy > 0.15 ? "energy lift" : toEnergy - fromEnergy < -0.15 ? "energy drop" : "energy holds")
    : "energy unknown";
  const keyPenalty = isKeyTrustedForAnalysis(from.track) && isKeyTrustedForAnalysis(to.track)
    ? getCamelotPenalty(from.track.camelotKey as string, to.track.camelotKey as string)
    : null;
  const keyNote = keyPenalty == null ? "" : keyPenalty <= 4 ? ", harmonically close" : keyPenalty >= 18 ? ", harmonic tension" : "";
  return `${energyNote}${keyNote}`;
}
