import type { Track } from "../data/trackTypes";
import type { FlowCurve } from "../data/flowCurveTypes";
import type { TrackLock, TrackSlot, OrphanTrack } from "../data/playlistTypes";
import type { PlaylistDuplicateRules } from "../data/playProjectTypes";
import { generateTrackSlots } from "./slotGenerator";
import { scoreTrackForSlot } from "./trackScoring";
import { buildOrphanTrack } from "./orphanDetector";
import { evaluateSlotWarnings } from "./warningEngine";
import { getDuplicateFamilyKey, rankDuplicateVariant } from "./duplicateFamilyRules";
import { createPlaylistDuplicateGuard, filterDuplicateCandidates, markTrackUsed } from "../lib/playlistDuplicateGuard";

const ORPHAN_SCORE_THRESHOLD = 60;

export function assignPlaylistToCurve(params: {
  tracks: Track[];
  curve: FlowCurve;
  locks: TrackLock[];
  excludedTrackIds: string[];
  targetDurationSeconds: number;
  duplicateRules?: PlaylistDuplicateRules;
}): { slots: TrackSlot[]; orphans: OrphanTrack[] } {
  const { tracks, curve, locks, excludedTrackIds, targetDurationSeconds, duplicateRules } = params;

  const excludedSet = new Set(excludedTrackIds);
  const eligibleTracks = tracks.filter((t) => !excludedSet.has(t.trackId));

  if (eligibleTracks.length === 0) {
    return { slots: [], orphans: [] };
  }

  let slots = generateTrackSlots({ curve, tracks: eligibleTracks, targetDurationSeconds });
  const orphans: OrphanTrack[] = [];
  const assignedTrackIds = new Set<string>();
  // Duplicate guard (0711_MUSIC_Playlist_Duplicate_Track_Guard): one guard for
  // the whole assignment run — locked placements count as "used" too, so the
  // greedy pass below can never re-pick the same song a lock already placed.
  const guard = createPlaylistDuplicateGuard();

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
      markTrackUsed(track, guard);
    }
  }

  // Place closer
  if (closerLock && slots.length > 0) {
    const track = eligibleTracks.find((t) => t.trackId === closerLock.trackId);
    if (track && !assignedTrackIds.has(track.trackId)) {
      const lastIdx = slots.length - 1;
      slots[lastIdx] = { ...slots[lastIdx], assignedTrackId: track.trackId };
      assignedTrackIds.add(track.trackId);
      markTrackUsed(track, guard);
    }
  }

  // Place position locks
  for (const lock of positionLocks) {
    const track = eligibleTracks.find((t) => t.trackId === lock.trackId);
    const idx = lock.slotIndex!;
    if (track && !assignedTrackIds.has(track.trackId) && idx < slots.length && !slots[idx].assignedTrackId) {
      slots[idx] = { ...slots[idx], assignedTrackId: track.trackId };
      assignedTrackIds.add(track.trackId);
      markTrackUsed(track, guard);
    }
  }

  // Greedy assignment for remaining slots
  const unassignedSlots = slots
    .map((s, i) => ({ slot: s, i }))
    .filter(({ slot }) => !slot.assignedTrackId);

  let unassignedTracks = eligibleTracks.filter((t) => !assignedTrackIds.has(t.trackId));

  // When preferredVariant is set, pre-sort within each family so the preferred
  // variant is encountered first by the greedy loop (avoid_family mode picks whichever
  // scores best; this biases toward preferred when scores are equal).
  if (duplicateRules && duplicateRules.preferredVariant !== "none") {
    const pv = duplicateRules.preferredVariant;
    unassignedTracks = [...unassignedTracks].sort((a, b) => {
      const fa = getDuplicateFamilyKey(a), fb = getDuplicateFamilyKey(b);
      if (fa === fb) return rankDuplicateVariant(a, pv) - rankDuplicateVariant(b, pv);
      return 0;
    });
  }

  const tracksById = new Map(tracks.map((t) => [t.trackId, t]));
  // Canonical duplicates (e.g. two file imports of the same song under
  // different trackIds) are collapsed here too, not just exact trackId reuse.
  let available = filterDuplicateCandidates(unassignedTracks, guard);

  // Track family keys assigned so far, in slot order (for separation check)
  const assignedFamilySlots: string[] = []; // index = slot index, value = family key or ""

  for (const { slot, i } of unassignedSlots) {
    if (available.length === 0) break;

    const prevTrack = i > 0 && slots[i - 1].assignedTrackId
      ? tracksById.get(slots[i - 1].assignedTrackId!)
      : undefined;

    // Build set of family keys blocked at slot i by duplicate rules
    let blockedFamilyKeys: Set<string> | null = null;
    if (duplicateRules && duplicateRules.mode !== "allow") {
      blockedFamilyKeys = new Set<string>();
      if (duplicateRules.mode === "avoid_family") {
        // Block all families already assigned anywhere
        for (const fk of assignedFamilySlots) { if (fk) blockedFamilyKeys.add(fk); }
      } else if (duplicateRules.mode === "separate_family") {
        // Block families assigned within the last separationTracks slots
        const sep = duplicateRules.separationTracks;
        const startIdx = Math.max(0, assignedFamilySlots.length - sep);
        for (let k = startIdx; k < assignedFamilySlots.length; k++) {
          if (assignedFamilySlots[k]) blockedFamilyKeys.add(assignedFamilySlots[k]);
        }
      }
    }

    // Score all available tracks; skip blocked families if any
    let bestScore = Infinity;
    let bestIdx = -1;

    for (let j = 0; j < available.length; j++) {
      const t = available[j];
      if (blockedFamilyKeys && blockedFamilyKeys.has(getDuplicateFamilyKey(t))) continue;
      const score = scoreTrackForSlot({
        track: t,
        slot,
        previousTrack: prevTrack,
        allTracks: eligibleTracks,
      });
      if (score < bestScore) {
        bestScore = score;
        bestIdx = j;
      }
    }

    // If all eligible tracks were blocked, fall back to ignoring family rules for this slot
    if (bestIdx < 0 && blockedFamilyKeys && blockedFamilyKeys.size > 0) {
      for (let j = 0; j < available.length; j++) {
        const score = scoreTrackForSlot({
          track: available[j],
          slot,
          previousTrack: prevTrack,
          allTracks: eligibleTracks,
        });
        if (score < bestScore) { bestScore = score; bestIdx = j; }
      }
    }

    if (bestIdx >= 0 && bestScore < ORPHAN_SCORE_THRESHOLD) {
      const chosen = available.splice(bestIdx, 1)[0];
      slots[i] = { ...slots[i], assignedTrackId: chosen.trackId };
      assignedTrackIds.add(chosen.trackId);
      markTrackUsed(chosen, guard);
      // Drop any remaining canonical-duplicate sibling of the just-chosen
      // track (e.g. a second file of the same song) so it can never be
      // picked for a later slot either.
      available = filterDuplicateCandidates(available, guard);
      assignedFamilySlots[i] = getDuplicateFamilyKey(chosen);
    } else if (bestIdx >= 0) {
      assignedFamilySlots[i] = "";
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
