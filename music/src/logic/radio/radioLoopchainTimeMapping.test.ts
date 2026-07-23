import { describe, expect, it } from "vitest";
import { chainTimeToOccurrence, occurrenceSourceTimeToChainTime } from "./radioLoopchainTimeMapping";
import { buildLoopchainSchedule, type LoopchainBlockPlan } from "../../audio/loopchainPlaybackEngine";
import type { LoopchainBlock, LoopchainJunction } from "../../data/radioLoopchainTypes";

function block(id: string, overrides: Partial<LoopchainBlock> = {}): LoopchainBlock {
  return {
    id,
    sourceTrackId: "ext_mr9smtpl_wb0b",
    sectionId: `sec_${id}`,
    repeatMode: { mode: "repeatCount", count: 3 },
    crossfadeDurationSeconds: 2,
    ...overrides,
  };
}

function plan(b: LoopchainBlock, cycleDurationSeconds: number, sourceOffsetSeconds = 0): LoopchainBlockPlan {
  return { block: b, sourceTrackId: b.sourceTrackId, cycleDurationSeconds, sourceOffsetSeconds };
}

describe("chainTimeToOccurrence", () => {
  it("resolves a point well inside a single occurrence (before any overlap)", () => {
    const b = block("b1", { repeatMode: { mode: "repeatCount", count: 3 }, crossfadeDurationSeconds: 2 });
    const schedule = buildLoopchainSchedule([plan(b, 10)], []);
    // occurrences: [0,10) [8,18) [16,26)
    const loc = chainTimeToOccurrence(schedule, 3);
    expect(loc).not.toBeNull();
    expect(loc!.occurrence.occurrenceId).toBe("b1::occ0");
    expect(loc!.occurrenceLocalSeconds).toBe(3);
    expect(loc!.sourceTimeSeconds).toBe(3); // sourceOffsetSeconds 0 + 3
    expect(loc!.isInOverlap).toBe(false);
  });

  it("prefers the incoming (higher globalIndex) occurrence at an overlap boundary", () => {
    const b = block("b1", { repeatMode: { mode: "repeatCount", count: 3 }, crossfadeDurationSeconds: 2 });
    const schedule = buildLoopchainSchedule([plan(b, 10)], []);
    // t=9 is inside occ0 [0,10) AND occ1 [8,18) — both true overlap candidates
    const loc = chainTimeToOccurrence(schedule, 9);
    expect(loc!.occurrence.occurrenceId).toBe("b1::occ1"); // higher globalIndex wins
    expect(loc!.isInOverlap).toBe(true); // occ1's own fade-in window is [8,10)
  });

  it("resolves correctly during a cross-block junction transition", () => {
    const b1 = block("b1", { repeatMode: { mode: "repeatCount", count: 2 }, crossfadeDurationSeconds: 1 });
    const b2 = block("b2", { repeatMode: { mode: "repeatCount", count: 1 }, crossfadeDurationSeconds: 1 });
    const junction: LoopchainJunction = { id: "j1", outgoingBlockId: "b1", incomingBlockId: "b2", crossfadeDurationSeconds: 4 };
    const schedule = buildLoopchainSchedule([plan(b1, 10), plan(b2, 8)], [junction]);
    // b1o1 starts at 9, b2o0 starts at 9 + (10-4) = 15; b1o1 ends at 19
    const midJunction = chainTimeToOccurrence(schedule, 16);
    expect(midJunction!.occurrence.blockId).toBe("b2"); // incoming block wins the overlap
    expect(midJunction!.isInOverlap).toBe(true);
  });

  it("resolves correctly after all overlaps (last occurrence, past its own fade-in)", () => {
    const b = block("b1", { repeatMode: { mode: "repeatCount", count: 3 }, crossfadeDurationSeconds: 2 });
    const schedule = buildLoopchainSchedule([plan(b, 10)], []);
    const loc = chainTimeToOccurrence(schedule, 20); // occ2 [16,26), local=4, fadeIn window [16,18)
    expect(loc!.occurrence.occurrenceId).toBe("b1::occ2");
    expect(loc!.isInOverlap).toBe(false);
  });

  it("resolves the exact end of the chain (inclusive boundary)", () => {
    const b = block("b1", { repeatMode: { mode: "repeatCount", count: 2 }, crossfadeDurationSeconds: 2 });
    const schedule = buildLoopchainSchedule([plan(b, 10)], []);
    const loc = chainTimeToOccurrence(schedule, schedule.totalChainDurationSeconds);
    expect(loc).not.toBeNull();
    expect(loc!.occurrence.occurrenceId).toBe("b1::occ1");
  });

  it("returns null outside [0, totalChainDurationSeconds]", () => {
    const b = block("b1", { repeatMode: { mode: "repeatCount", count: 2 } });
    const schedule = buildLoopchainSchedule([plan(b, 10)], []);
    expect(chainTimeToOccurrence(schedule, -1)).toBeNull();
    expect(chainTimeToOccurrence(schedule, schedule.totalChainDurationSeconds + 1)).toBeNull();
  });
});

describe("occurrenceSourceTimeToChainTime", () => {
  it("is the exact inverse of chainTimeToOccurrence for a resolved location", () => {
    const b = block("b1", { repeatMode: { mode: "repeatCount", count: 3 }, crossfadeDurationSeconds: 2 });
    const schedule = buildLoopchainSchedule([plan(b, 10)], []);
    const original = 20;
    const loc = chainTimeToOccurrence(schedule, original)!;
    const roundTripped = occurrenceSourceTimeToChainTime(schedule, loc.occurrence.occurrenceId, loc.sourceTimeSeconds);
    expect(roundTripped).toBeCloseTo(original);
  });

  it("round-trips correctly during an overlap window too", () => {
    const b = block("b1", { repeatMode: { mode: "repeatCount", count: 3 }, crossfadeDurationSeconds: 2 });
    const schedule = buildLoopchainSchedule([plan(b, 10)], []);
    const original = 9; // resolves to occ1 per the tie-break rule
    const loc = chainTimeToOccurrence(schedule, original)!;
    expect(loc.occurrence.occurrenceId).toBe("b1::occ1");
    const roundTripped = occurrenceSourceTimeToChainTime(schedule, loc.occurrence.occurrenceId, loc.sourceTimeSeconds);
    expect(roundTripped).toBeCloseTo(original);
  });

  it("returns null for a stale/unknown occurrenceId", () => {
    const b = block("b1", { repeatMode: { mode: "repeatCount", count: 2 } });
    const schedule = buildLoopchainSchedule([plan(b, 10)], []);
    expect(occurrenceSourceTimeToChainTime(schedule, "does-not-exist", 5)).toBeNull();
  });

  it("maps a source-track-absolute silence marker onto the chain timeline", () => {
    const b = block("b1", { repeatMode: { mode: "repeatCount", count: 1 } }, );
    const schedule = buildLoopchainSchedule([plan(b, 10, 3)], []); // sourceOffsetSeconds=3
    // A detected audible-end marker at absolute source time 12 (i.e. 9s into this occurrence)
    const chainTime = occurrenceSourceTimeToChainTime(schedule, "b1::occ0", 12);
    expect(chainTime).toBeCloseTo(9); // chainStartSeconds(0) + (12 - 3)
  });
});
