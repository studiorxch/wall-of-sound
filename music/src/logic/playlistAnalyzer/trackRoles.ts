// Playlist Analyzer Review — track role derivation (spec §5.5).
// Roles come from sequence position + neighboring tracks, never from a
// track's own mood alone.

import type { PlaylistTrackReview, PlaylistTrackRole } from "../../data/playlistAnalyzerTypes";
import type { OrderedPlaylistEntry } from "./resolveOrder";

function energyOf(e: OrderedPlaylistEntry): number | null {
  return e.row.energy != null && e.row.energy > 0 ? e.row.energy : null;
}

export function computeTrackRoles(entries: OrderedPlaylistEntry[]): PlaylistTrackReview[] {
  const n = entries.length;
  if (n === 0) return [];

  const energies = entries.map(energyOf);
  const knownEnergies = energies.filter((v): v is number => v != null);
  const meanEnergy = knownEnergies.length ? knownEnergies.reduce((a, b) => a + b, 0) / knownEnergies.length : null;
  const stdEnergy = knownEnergies.length && meanEnergy != null
    ? Math.sqrt(knownEnergies.reduce((s, v) => s + (v - meanEnergy) ** 2, 0) / knownEnergies.length)
    : null;

  let peakIndex = -1;
  let peakValue = -Infinity;
  energies.forEach((v, i) => {
    if (v != null && v > peakValue) { peakValue = v; peakIndex = i; }
  });

  return entries.map((e, i) => {
    const prev = entries[i - 1];
    const next = entries[i + 1];
    const energy = energies[i];
    const prevEnergy = prev ? energies[i - 1] : null;
    const nextEnergy = next ? energies[i + 1] : null;

    let role: PlaylistTrackRole;
    let contribution: string;

    if (i === 0) {
      role = "opener";
      contribution = "sets the entry point and initial emotional register for the playlist";
    } else if (i === n - 1) {
      role = "closer";
      contribution = "delivers the final impression and resolves (or intentionally leaves open) the arc";
    } else if (i === peakIndex && stdEnergy != null && stdEnergy > 0.05) {
      role = "peak";
      contribution = "carries the highest energy point in the sequence";
    } else if (
      energy != null && prevEnergy != null && nextEnergy != null &&
      energy < prevEnergy - 0.12 && energy < nextEnergy - 0.12
    ) {
      role = "bridge";
      contribution = "a low-energy connective passage between two higher-energy neighbors";
    } else if (
      energy != null && prevEnergy != null && energy < prevEnergy - 0.25
    ) {
      role = "reset";
      contribution = "an abrupt drop that resets momentum before the next build";
    } else if (
      energy != null && prevEnergy != null && nextEnergy != null &&
      energy > prevEnergy + 0.1 && (nextEnergy >= energy - 0.05)
    ) {
      role = "lift";
      contribution = "raises energy heading toward the peak";
    } else if (
      energy != null && prevEnergy != null && nextEnergy != null &&
      energy < prevEnergy - 0.1 && nextEnergy <= energy + 0.05
    ) {
      role = "release";
      contribution = "eases energy down following a higher point";
    } else if (i < n * 0.25) {
      role = "establishing";
      contribution = "reinforces the playlist's opening identity before development begins";
    } else if (
      meanEnergy != null && energy != null && stdEnergy != null && stdEnergy > 0 &&
      Math.abs(energy - meanEnergy) / stdEnergy > 1.6
    ) {
      role = "outlier";
      contribution = "sits statistically apart from the playlist's overall energy profile";
    } else if (
      e.row.moodTags.length && prev && next &&
      !e.row.moodTags.some((m) => prev.row.moodTags.includes(m) || next.row.moodTags.includes(m))
    ) {
      role = "contrast";
      contribution = "introduces a mood distinct from both neighbors";
    } else if (
      prev && e.row.moodTags.length && prev.row.moodTags.length &&
      e.row.moodTags.some((m) => prev.row.moodTags.includes(m)) &&
      energy != null && prevEnergy != null && Math.abs(energy - prevEnergy) < 0.1
    ) {
      role = "continuation";
      contribution = "extends the mood and energy of the previous track";
    } else {
      role = "support";
      contribution = "fills out the sequence without a distinct structural function";
    }

    const warningCodes: string[] = [];
    if (e.analysisState === "missing") warningCodes.push("PLAYLIST_ANALYSIS_MISSING_TRACK_DATA");
    else if (e.analysisState === "partial") warningCodes.push("PLAYLIST_ANALYSIS_PARTIAL_TRACK_DATA");
    else if (e.analysisState === "stale") warningCodes.push("PLAYLIST_ANALYSIS_STALE_TRACK_DATA");
    if (role === "outlier") warningCodes.push("PLAYLIST_TRACK_OUTLIER");
    if (role === "closer" && energy != null && meanEnergy != null && energy > meanEnergy * 0.85) {
      warningCodes.push("PLAYLIST_CLOSER_WEAK_RESOLUTION");
    }

    const confidence = e.analysisState === "complete" ? 0.9 : e.analysisState === "partial" ? 0.55 : e.analysisState === "stale" ? 0.5 : 0.2;

    const review: PlaylistTrackReview = {
      slotId: e.slot.slotId,
      trackId: e.track.trackId,
      position: i,
      sectionId: e.slot.sectionId,
      title: e.track.title,
      artist: e.track.artist,
      durationSeconds: e.track.durationSeconds,
      bpm: e.track.bpm,
      camelotKey: e.track.camelotKey,
      energy: e.row.energy,
      primaryMoods: e.row.moodTags.slice(0, 3),
      role,
      contribution,
      transitionInId: i > 0 ? `t_${entries[i - 1].track.trackId}_${e.track.trackId}` : undefined,
      transitionOutId: i < n - 1 ? `t_${e.track.trackId}_${entries[i + 1].track.trackId}` : undefined,
      analysisState: e.analysisState,
      confidence,
      warningCodes,
    };
    return review;
  });
}
