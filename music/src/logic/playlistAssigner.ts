import type { Track } from "../data/trackTypes";
import type { FlowCurve } from "../data/flowCurveTypes";
import type { TrackLock, TrackSlot, OrphanTrack } from "../data/playlistTypes";
import { generateTrackSlots } from "./slotGenerator";
import { scoreTrackForSlot } from "./trackScoring";
import { buildOrphanTrack } from "./orphanDetector";
import { evaluateSlotWarnings } from "./warningEngine";

const ORPHAN_SCORE_THRESHOLD = 60;

export function assignPlaylistToCurve(params: {
  tracks: Track[];
  curve: FlowCurve;
  locks: TrackLock[];
  excludedTrackIds: string[];
  targetDurationSeconds: number;
}): { slots: TrackSlot[]; orphans: OrphanTrack[] } {
  const { tracks, curve, locks, excludedTrackIds, targetDurationSeconds } = params;

  const excludedSet = new Set(excludedTrackIds);
  const eligibleTracks = tracks.filter((t) => !excludedSet.has(t.trackId));

  if (eligibleTracks.length === 0) {
    return { slots: [], orphans: [] };
  }

  let slots = generateTrackSlots({ curve, tracks: eligibleTracks, targetDurationSeconds });
  const orphans: OrphanTrack[] = [];
  const assignedTrackIds = new Set<string>();

  // Find lock helpers
  const openerLock = locks.find((l) => l.lockType === "opener");
  const closerLock = locks.find((l) => l.lockType === "closer");
  const positionLocks = locks.filter((l) => l.lockType === "position" && l.slotIndex != null);

  // Place opener
  if (openerLock && slots.length > 0) {
    const track = eligibleTracks.find((t) => t.trackId === openerLock.trackId);
    if (track) {
      slots[0] = { ...slots[0], assignedTrackId: track.trackId };
      assignedTrackIds.add(track.trackId);
    }
  }

  // Place closer
  if (closerLock && slots.length > 0) {
    const track = eligibleTracks.find((t) => t.trackId === closerLock.trackId);
    if (track && !assignedTrackIds.has(track.trackId)) {
      const lastIdx = slots.length - 1;
      slots[lastIdx] = { ...slots[lastIdx], assignedTrackId: track.trackId };
      assignedTrackIds.add(track.trackId);
    }
  }

  // Place position locks
  for (const lock of positionLocks) {
    const track = eligibleTracks.find((t) => t.trackId === lock.trackId);
    const idx = lock.slotIndex!;
    if (track && !assignedTrackIds.has(track.trackId) && idx < slots.length && !slots[idx].assignedTrackId) {
      slots[idx] = { ...slots[idx], assignedTrackId: track.trackId };
      assignedTrackIds.add(track.trackId);
    }
  }

  // Greedy assignment for remaining slots
  const unassignedSlots = slots
    .map((s, i) => ({ slot: s, i }))
    .filter(({ slot }) => !slot.assignedTrackId);

  const unassignedTracks = eligibleTracks.filter((t) => !assignedTrackIds.has(t.trackId));

  const tracksById = new Map(tracks.map((t) => [t.trackId, t]));
  const available = [...unassignedTracks];

  for (const { slot, i } of unassignedSlots) {
    if (available.length === 0) break;

    const prevTrack = i > 0 && slots[i - 1].assignedTrackId
      ? tracksById.get(slots[i - 1].assignedTrackId!)
      : undefined;

    let bestScore = Infinity;
    let bestIdx = -1;

    for (let j = 0; j < available.length; j++) {
      const score = scoreTrackForSlot({
        track: available[j],
        slot,
        previousTrack: prevTrack,
        allTracks: eligibleTracks,
      });
      if (score < bestScore) {
        bestScore = score;
        bestIdx = j;
      }
    }

    if (bestIdx >= 0 && bestScore < ORPHAN_SCORE_THRESHOLD) {
      const chosen = available.splice(bestIdx, 1)[0];
      slots[i] = { ...slots[i], assignedTrackId: chosen.trackId };
      assignedTrackIds.add(chosen.trackId);
    } else if (bestIdx >= 0) {
      // Score too high — log top candidates to help diagnose red slots
      const top5 = available
        .map((t) => ({
          t,
          score: scoreTrackForSlot({ track: t, slot, previousTrack: prevTrack, allTracks: eligibleTracks }),
        }))
        .sort((a, b) => a.score - b.score)
        .slice(0, 5);
      console.debug(
        `[PlaylistAssigner] slot ${i} unassigned — target BPM ${Math.round(slot.targetBpm)}, energy ${slot.targetEnergy?.toFixed(2)}, best score ${bestScore.toFixed(1)} (threshold ${ORPHAN_SCORE_THRESHOLD})`,
        '\n  top 5 candidates:',
        top5.map(({ t, score }) => `${t.title ?? t.trackId} (${t.bpm}BPM e${t.energy?.toFixed(2)} ${t.camelotKey}) score=${score.toFixed(1)}`).join('\n    '),
      );
    }
  }

  // Remaining tracks become orphans
  const stillAvailable = available.filter((t) => !assignedTrackIds.has(t.trackId));
  for (const track of stillAvailable) {
    orphans.push(buildOrphanTrack({ track, reasons: ["NO_VALID_SLOT"] }));
  }

  // Evaluate warnings
  slots = evaluateSlotWarnings({ slots, tracksById });

  return { slots, orphans };
}
