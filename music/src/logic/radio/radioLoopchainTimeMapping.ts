// 0722A_RADIOOS_Loopchain_Player_Web_Demo §1.2/§4.2 — chain-time <->
// occurrence/source-time mapping, BOTH directions. Neither direction
// existed before this build: the engine's own scheduling (loopchainPlayback
// Engine.ts) only ever scans FORWARD from "now," never resolves an
// arbitrary point on the timeline backward to an occurrence, and nothing
// converts a source-track position back onto the chain timeline. Pure — no
// DOM, no Node, no AudioContext — so seeking, click/drag on the overview
// waveform, and marker placement in the transition-detail view can all
// share the exact same math the engine's own seek() uses.

import type { LoopchainSchedule, ScheduledOccurrence } from "../../audio/loopchainPlaybackEngine";

export interface ChainTimeLocation {
  occurrence: ScheduledOccurrence;
  // Absolute position inside the source track (sourceOffsetSeconds +
  // occurrenceLocalSeconds) — the same frame of reference as
  // Track.playbackBounds.audibleStartSeconds/audibleEndSeconds.
  sourceTimeSeconds: number;
  // 0..sourceDurationSeconds, position within this occurrence's own span.
  occurrenceLocalSeconds: number;
  // True when chainTimeSeconds falls inside this occurrence's own scheduled
  // fade-in or fade-out window (i.e. it's audibly crossfading right now).
  isInOverlap: boolean;
}

// Forward direction: given a point on the chain timeline (a click, the
// live playhead), find which occurrence covers it and where that is in the
// source track. Two occurrences legitimately overlap at a crossfade
// boundary — when chainTimeSeconds falls in both, the higher-globalIndex
// (incoming) occurrence wins, since that's the one a listener perceives as
// "now playing" past the crossfade midpoint.
export function chainTimeToOccurrence(
  schedule: LoopchainSchedule,
  chainTimeSeconds: number,
): ChainTimeLocation | null {
  if (chainTimeSeconds < 0 || chainTimeSeconds > schedule.totalChainDurationSeconds) return null;

  let best: ScheduledOccurrence | null = null;
  for (const occ of schedule.occurrences) {
    if (chainTimeSeconds >= occ.chainStartSeconds && chainTimeSeconds < occ.chainEndSeconds) {
      if (!best || occ.globalIndex > best.globalIndex) best = occ;
    }
  }
  // The very end of the chain lands exactly on the last occurrence's own
  // (exclusive) chainEndSeconds, which the loop above never matches —
  // fall back to an inclusive check only for this boundary case.
  if (!best) {
    for (const occ of schedule.occurrences) {
      if (Math.abs(occ.chainEndSeconds - chainTimeSeconds) < 1e-9) {
        if (!best || occ.globalIndex > best.globalIndex) best = occ;
      }
    }
  }
  if (!best) return null;

  const occurrenceLocalSeconds = chainTimeSeconds - best.chainStartSeconds;
  const sourceTimeSeconds = best.sourceOffsetSeconds + occurrenceLocalSeconds;
  const isInOverlap =
    (best.fadeInDurationSeconds != null && occurrenceLocalSeconds < best.fadeInDurationSeconds) ||
    (best.fadeOutDurationSeconds != null && occurrenceLocalSeconds > best.sourceDurationSeconds - best.fadeOutDurationSeconds);

  return { occurrence: best, sourceTimeSeconds, occurrenceLocalSeconds, isInOverlap };
}

// Inverse direction: given a specific occurrence and an ABSOLUTE position
// in its source track (the same frame of reference as
// ChainTimeLocation.sourceTimeSeconds and Track.playbackBounds' audible
// bounds), find where that lands on the chain timeline. Used to place
// source-track-relative markers (detected silence, audible bounds) onto a
// chain-relative canvas x-axis. Returns null if the occurrence id no
// longer exists in the schedule (a stale reference after a re-expand).
// Does NOT clamp the result to the occurrence's own [chainStartSeconds,
// chainEndSeconds) span — a sourceTimeSeconds outside the occurrence's own
// window legitimately maps outside its chain window too; callers that only
// want in-window markers clip the result themselves.
export function occurrenceSourceTimeToChainTime(
  schedule: LoopchainSchedule,
  occurrenceId: string,
  sourceTimeSeconds: number,
): number | null {
  const occ = schedule.occurrences.find((o) => o.occurrenceId === occurrenceId);
  if (!occ) return null;
  return occ.chainStartSeconds + (sourceTimeSeconds - occ.sourceOffsetSeconds);
}
