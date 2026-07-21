// 0721_MUSIC_RADIO_Sectional_Loopchain_Player §5 — the ONE authoritative
// expansion from a LoopchainBlock's repeat mode into concrete scheduled
// occurrences. No second, competing expansion path exists anywhere else
// in this build. Pure — no DOM, no Node, no AudioContext access (the
// playback engine consumes OccurrencePlan[], it never derives counts
// itself).

import type { LoopchainBlock } from "../../data/radioLoopchainTypes";

export interface OccurrencePlan {
  occurrenceIndex: number;
  // Seconds into the source track where this occurrence's playback begins
  // — always the block's own section start, since every occurrence plays
  // the same region.
  sourceOffsetSeconds: number;
  durationSeconds: number;
}

export interface ExpansionResult {
  occurrences: OccurrencePlan[];
  occurrenceCount: number;
  requestedResidenceSeconds?: number;
  // The exact audible duration this expansion actually produces, always
  // reported (not only for targetResidenceSeconds) so a repeatCount chain
  // is just as honestly measurable.
  plannedAudibleResidenceSeconds: number;
}

export class LoopchainExpansionError extends Error {}

// Each cycle after the first only ADDS (cycleDurationSeconds -
// crossfadeDurationSeconds) of new audible time — the crossfade overlap
// means consecutive cycles share that much time rather than stacking full
// durations. The first cycle alone contributes its full duration.
function plannedAudibleResidence(occurrenceCount: number, cycleDurationSeconds: number, crossfadeDurationSeconds: number): number {
  if (occurrenceCount <= 0) return 0;
  return cycleDurationSeconds + (occurrenceCount - 1) * (cycleDurationSeconds - crossfadeDurationSeconds);
}

function buildOccurrences(count: number, sourceOffsetSeconds: number, cycleDurationSeconds: number): OccurrencePlan[] {
  const occurrences: OccurrencePlan[] = [];
  for (let i = 0; i < count; i++) {
    occurrences.push({ occurrenceIndex: i, sourceOffsetSeconds, durationSeconds: cycleDurationSeconds });
  }
  return occurrences;
}

export function expandBlockToOccurrences(
  block: LoopchainBlock,
  cycleDurationSeconds: number,
  sourceOffsetSeconds: number,
): ExpansionResult {
  if (!(cycleDurationSeconds > 0)) {
    throw new LoopchainExpansionError("cycleDurationSeconds must be positive");
  }
  const crossfadeDurationSeconds = block.crossfadeDurationSeconds;
  if (crossfadeDurationSeconds < 0) {
    throw new LoopchainExpansionError("crossfadeDurationSeconds must not be negative");
  }
  if (crossfadeDurationSeconds >= cycleDurationSeconds) {
    throw new LoopchainExpansionError(
      "crossfadeDurationSeconds must be less than cycleDurationSeconds — each added cycle would contribute zero or negative new audible time",
    );
  }

  if (block.repeatMode.mode === "repeatCount") {
    const occurrenceCount = block.repeatMode.count;
    if (!(occurrenceCount > 0) || !Number.isInteger(occurrenceCount)) {
      throw new LoopchainExpansionError("repeatCount.count must be a positive integer");
    }
    return {
      occurrences: buildOccurrences(occurrenceCount, sourceOffsetSeconds, cycleDurationSeconds),
      occurrenceCount,
      plannedAudibleResidenceSeconds: plannedAudibleResidence(occurrenceCount, cycleDurationSeconds, crossfadeDurationSeconds),
    };
  }

  const targetSeconds = block.repeatMode.seconds;
  if (!(targetSeconds > 0)) {
    throw new LoopchainExpansionError("targetResidenceSeconds.seconds must be positive");
  }

  // Smallest integer occurrenceCount for which:
  //   cycleDurationSeconds + (occurrenceCount - 1) * (cycleDurationSeconds - crossfadeDurationSeconds) >= targetSeconds
  // Always a whole number of complete cycles — never a truncated final
  // occurrence (that would create a new, untested exit boundary).
  const addedPerExtraCycle = cycleDurationSeconds - crossfadeDurationSeconds;
  let occurrenceCount = 1;
  if (targetSeconds > cycleDurationSeconds) {
    const extraCyclesNeeded = Math.ceil((targetSeconds - cycleDurationSeconds) / addedPerExtraCycle);
    occurrenceCount = 1 + extraCyclesNeeded;
  }

  return {
    occurrences: buildOccurrences(occurrenceCount, sourceOffsetSeconds, cycleDurationSeconds),
    occurrenceCount,
    requestedResidenceSeconds: targetSeconds,
    plannedAudibleResidenceSeconds: plannedAudibleResidence(occurrenceCount, cycleDurationSeconds, crossfadeDurationSeconds),
  };
}
