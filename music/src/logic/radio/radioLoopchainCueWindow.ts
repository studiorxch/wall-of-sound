// 0722A_RADIOOS_Loopchain_Player_Web_Demo §1.4/§4.2 — the bounded playback
// window for "Preview transition": defaultLeadSeconds before the overlap,
// the overlap itself, defaultLeadSeconds after — clamped so it never
// bleeds into an unrelated earlier/later block. Pure — no DOM, no Node.

import type { LoopchainSchedule } from "../../audio/loopchainPlaybackEngine";
import type { LoopchainJunction } from "../../data/radioLoopchainTypes";

export interface CueWindow {
  startChainSeconds: number;
  endChainSeconds: number;
}

export function computeCueWindow(
  schedule: LoopchainSchedule,
  junction: LoopchainJunction,
  defaultLeadSeconds: number = 8,
): CueWindow | null {
  const outgoingOccurrences = schedule.occurrences.filter((o) => o.blockId === junction.outgoingBlockId);
  const incomingOccurrences = schedule.occurrences.filter((o) => o.blockId === junction.incomingBlockId);
  if (outgoingOccurrences.length === 0 || incomingOccurrences.length === 0) return null;

  // The occurrence bracketing the actual crossfade: the outgoing block's
  // LAST occurrence, the incoming block's FIRST — the schedule already
  // places these so the overlap is exactly [incomingFirst.chainStartSeconds,
  // outgoingLast.chainEndSeconds], no need to re-derive it from
  // junction.crossfadeDurationSeconds independently.
  const outgoingLast = outgoingOccurrences.reduce((a, b) => (b.chainStartSeconds > a.chainStartSeconds ? b : a));
  const incomingFirst = incomingOccurrences.reduce((a, b) => (b.chainStartSeconds < a.chainStartSeconds ? b : a));

  const overlapStart = incomingFirst.chainStartSeconds;
  const overlapEnd = outgoingLast.chainEndSeconds;

  // Never reach back before the outgoing occurrence's own start, and never
  // reach forward past the incoming occurrence's own end — the window
  // stays inside these two occurrences, never bleeding into an unrelated
  // earlier/later block.
  const startChainSeconds = Math.max(outgoingLast.chainStartSeconds, overlapStart - defaultLeadSeconds);
  const endChainSeconds = Math.min(incomingFirst.chainEndSeconds, overlapEnd + defaultLeadSeconds);

  return { startChainSeconds, endChainSeconds };
}
