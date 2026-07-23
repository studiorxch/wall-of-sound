import { describe, expect, it } from "vitest";
import { computeCueWindow } from "./radioLoopchainCueWindow";
import { buildLoopchainSchedule, type LoopchainBlockPlan } from "../../audio/loopchainPlaybackEngine";
import type { LoopchainBlock, LoopchainJunction } from "../../data/radioLoopchainTypes";

function block(id: string, overrides: Partial<LoopchainBlock> = {}): LoopchainBlock {
  return {
    id, sourceTrackId: "t1", sectionId: `sec_${id}`,
    repeatMode: { mode: "repeatCount", count: 1 }, crossfadeDurationSeconds: 2,
    ...overrides,
  };
}
function plan(b: LoopchainBlock, cycleDurationSeconds: number): LoopchainBlockPlan {
  return { block: b, sourceTrackId: b.sourceTrackId, cycleDurationSeconds, sourceOffsetSeconds: 0 };
}

describe("computeCueWindow", () => {
  it("computes lead-in, overlap, and tail around the junction crossfade", () => {
    const b1 = block("b1", { repeatMode: { mode: "repeatCount", count: 1 } });
    const b2 = block("b2", { repeatMode: { mode: "repeatCount", count: 1 } });
    const junction: LoopchainJunction = { id: "j1", outgoingBlockId: "b1", incomingBlockId: "b2", crossfadeDurationSeconds: 4 };
    const schedule = buildLoopchainSchedule([plan(b1, 20), plan(b2, 20)], [junction]);
    // b1: [0,20), overlap starts at 20-4=16; b2 starts at 16, ends at 36
    const cue = computeCueWindow(schedule, junction, 5);
    expect(cue).not.toBeNull();
    expect(cue!.startChainSeconds).toBeCloseTo(11); // 16 - 5
    expect(cue!.endChainSeconds).toBeCloseTo(25); // 20 + 5
  });

  it("clamps the lead-in to the outgoing occurrence's own start (never bleeds into an earlier block)", () => {
    const b1 = block("b1", { repeatMode: { mode: "repeatCount", count: 1 } });
    const b2 = block("b2", { repeatMode: { mode: "repeatCount", count: 1 } });
    const junction: LoopchainJunction = { id: "j1", outgoingBlockId: "b1", incomingBlockId: "b2", crossfadeDurationSeconds: 4 };
    const schedule = buildLoopchainSchedule([plan(b1, 10), plan(b2, 10)], [junction]);
    // b1: [0,10), overlap starts at 6 — a huge lead would go negative, clamp to 0
    const cue = computeCueWindow(schedule, junction, 100);
    expect(cue!.startChainSeconds).toBe(0);
  });

  it("clamps the tail to the incoming occurrence's own end (never bleeds into a later block)", () => {
    const b1 = block("b1", { repeatMode: { mode: "repeatCount", count: 1 } });
    const b2 = block("b2", { repeatMode: { mode: "repeatCount", count: 1 } });
    const b3 = block("b3", { repeatMode: { mode: "repeatCount", count: 1 } });
    const j1: LoopchainJunction = { id: "j1", outgoingBlockId: "b1", incomingBlockId: "b2", crossfadeDurationSeconds: 4 };
    const j2: LoopchainJunction = { id: "j2", outgoingBlockId: "b2", incomingBlockId: "b3", crossfadeDurationSeconds: 4 };
    const schedule = buildLoopchainSchedule([plan(b1, 10), plan(b2, 10), plan(b3, 10)], [j1, j2]);
    const cue = computeCueWindow(schedule, j1, 100);
    // b2 (incoming for j1) occupies some window ending before b3 begins — tail must not exceed b2's own end
    const b2Occurrence = schedule.occurrences.find((o) => o.blockId === "b2")!;
    expect(cue!.endChainSeconds).toBeLessThanOrEqual(b2Occurrence.chainEndSeconds);
  });

  it("returns null when a referenced block has no occurrences in the schedule (stale junction)", () => {
    const b1 = block("b1");
    const schedule = buildLoopchainSchedule([plan(b1, 10)], []);
    const staleJunction: LoopchainJunction = { id: "j1", outgoingBlockId: "b1", incomingBlockId: "does-not-exist", crossfadeDurationSeconds: 2 };
    expect(computeCueWindow(schedule, staleJunction)).toBeNull();
  });

  it("picks the outgoing block's LAST occurrence and incoming block's FIRST when either repeats", () => {
    const b1 = block("b1", { repeatMode: { mode: "repeatCount", count: 3 }, crossfadeDurationSeconds: 2 });
    const b2 = block("b2", { repeatMode: { mode: "repeatCount", count: 2 } });
    const junction: LoopchainJunction = { id: "j1", outgoingBlockId: "b1", incomingBlockId: "b2", crossfadeDurationSeconds: 3 };
    const schedule = buildLoopchainSchedule([plan(b1, 10), plan(b2, 10)], [junction]);
    const cue = computeCueWindow(schedule, junction, 2);
    const b1Occurrences = schedule.occurrences.filter((o) => o.blockId === "b1");
    const lastB1 = b1Occurrences[b1Occurrences.length - 1];
    expect(cue!.startChainSeconds).toBeGreaterThanOrEqual(lastB1.chainStartSeconds);
  });
});
