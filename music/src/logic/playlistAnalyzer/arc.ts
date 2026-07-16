// Playlist Analyzer Review — Sequence Arc (spec §5.3).
// Always produces 5 phases (Opening/Development/Peak/Release/Closer). When
// real playlist sections exist, phase boundaries snap to section boundaries
// so the arc and the Section Analysis agree; otherwise phases are derived by
// position percentile and explicitly labeled as inferred (spec §12.5).

import type { PlaylistArcPhase, PlaylistArcPhaseName, PlaylistArcSummary } from "../../data/playlistAnalyzerTypes";
import type { OrderedPlaylistEntry } from "./resolveOrder";
import { isBpmTrustedForAnalysis } from "../dspFeatureExtraction";

const PHASES: PlaylistArcPhaseName[] = ["opening", "development", "peak", "release", "closer"];
const PHASE_BOUNDS: Array<[number, number]> = [
  [0, 0.15], [0.15, 0.4], [0.4, 0.6], [0.6, 0.85], [0.85, 1.0],
];

function energyMovementLabel(energies: number[]): string {
  if (energies.length < 2) return "insufficient data";
  const delta = energies[energies.length - 1] - energies[0];
  if (Math.abs(delta) < 0.08) return "holds steady";
  return delta > 0 ? "rising" : "falling";
}

function tempoMovementLabel(bpms: number[]): string {
  if (bpms.length < 2) return "insufficient data";
  const delta = bpms[bpms.length - 1] - bpms[0];
  if (Math.abs(delta) < 4) return "steady tempo";
  return delta > 0 ? "accelerating" : "slowing";
}

function topMoods(group: OrderedPlaylistEntry[], n = 3): string[] {
  const counts = new Map<string, number>();
  for (const e of group) for (const m of e.row.moodTags.slice(0, 2)) counts.set(m, (counts.get(m) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([m]) => m);
}

const NARRATIVE_FUNCTION: Record<PlaylistArcPhaseName, string> = {
  opening: "establishes the playlist's emotional starting point",
  development: "builds context and introduces movement",
  peak: "carries the densest emotional and energetic weight",
  release: "eases tension built through the peak",
  closer: "resolves or intentionally leaves the arc open",
};

function buildPhase(
  phase: PlaylistArcPhaseName,
  group: OrderedPlaylistEntry[],
  sectionIds: string[],
): PlaylistArcPhase {
  if (group.length === 0) {
    return {
      phase, sectionIds, startSlotIndex: -1, endSlotIndex: -1,
      dominantMoods: [], energyMovement: "no tracks", tempoMovement: "no tracks",
      narrativeFunction: NARRATIVE_FUNCTION[phase], entryBehavior: "n/a", exitBehavior: "n/a",
      confidence: 0,
    };
  }
  const energies = group.map((e) => e.row.energy).filter((v): v is number => v != null && v > 0);
  const bpms = group.filter((e) => isBpmTrustedForAnalysis(e.track)).map((e) => e.track.bpm as number);
  const featured = group.filter((e) => e.row.features);
  const avgTexture = featured.length
    ? featured.reduce((s, e) => s + e.row.features!.texture, 0) / featured.length : undefined;
  const avgBandwidth = featured.length
    ? featured.reduce((s, e) => s + e.row.features!.bandwidth, 0) / featured.length : undefined;

  const first = group[0];
  const last = group[group.length - 1];

  return {
    phase,
    sectionIds,
    startSlotIndex: first.slot.slotIndex,
    endSlotIndex: last.slot.slotIndex,
    dominantMoods: topMoods(group),
    energyMovement: energyMovementLabel(energies),
    tempoMovement: tempoMovementLabel(bpms),
    tonalCharacter: topMoods(group, 1)[0],
    texture: avgTexture != null ? (avgTexture < 0.4 ? "smooth" : avgTexture > 0.6 ? "rough" : "balanced") : undefined,
    density: avgBandwidth != null ? (avgBandwidth < 0.4 ? "sparse" : avgBandwidth > 0.6 ? "dense" : "moderate") : undefined,
    narrativeFunction: NARRATIVE_FUNCTION[phase],
    entryBehavior: first.position === 0 ? "opens the playlist" : `continues from position ${first.position}`,
    exitBehavior: last.position === group.length - 1 && phase === "closer" ? "ends the playlist" : "hands off to the next phase",
    confidence: +(featured.length / group.length).toFixed(3),
  };
}

export function computeArc(entries: OrderedPlaylistEntry[]): PlaylistArcSummary {
  if (entries.length === 0) {
    return { derivedFromRealSections: false, phases: PHASES.map((p) => buildPhase(p, [], [])) };
  }

  const hasRealSections = entries.some((e) => !!e.slot.sectionId);
  const n = entries.length;

  if (!hasRealSections) {
    const phases = PHASES.map((phase, i) => {
      const [lo, hi] = PHASE_BOUNDS[i];
      const startIdx = Math.floor(lo * n);
      const endIdx = i === PHASES.length - 1 ? n : Math.max(startIdx + 1, Math.floor(hi * n));
      return buildPhase(phase, entries.slice(startIdx, endIdx), []);
    });
    return { derivedFromRealSections: false, phases };
  }

  // Real sections exist — assign each contiguous section group to the phase
  // whose percentile bounds contain the group's midpoint, preserving section
  // boundaries (a phase may span >1 section group, but never splits one).
  const sectionGroups: Array<{ id: string; entries: OrderedPlaylistEntry[] }> = [];
  for (const e of entries) {
    const groupId = e.slot.sectionId ?? "__none__";
    const last = sectionGroups[sectionGroups.length - 1];
    if (last && last.id === groupId) {
      last.entries.push(e);
    } else {
      sectionGroups.push({ id: groupId, entries: [e] });
    }
  }

  const phaseBuckets: OrderedPlaylistEntry[][] = PHASES.map(() => []);
  const phaseSectionIds: string[][] = PHASES.map(() => []);
  for (const group of sectionGroups) {
    const midpoint = (group.entries[0].position + group.entries[group.entries.length - 1].position) / 2 / n;
    let phaseIdx = PHASE_BOUNDS.findIndex(([lo, hi]) => midpoint >= lo && midpoint < hi);
    if (phaseIdx === -1) phaseIdx = PHASES.length - 1;
    phaseBuckets[phaseIdx].push(...group.entries);
    if (group.id !== "__none__") phaseSectionIds[phaseIdx].push(group.id);
  }

  const phases = PHASES.map((phase, i) => buildPhase(phase, phaseBuckets[i], phaseSectionIds[i]));
  return { derivedFromRealSections: true, phases };
}
