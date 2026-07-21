import { describe, expect, it } from "vitest";
import {
  buildLoopchainSchedule, occurrencesDueForScheduling, assignVoice, buildOccurrenceEnvelopes,
  LoopchainScheduleError, type LoopchainBlockPlan,
} from "./loopchainPlaybackEngine";
import type { LoopchainBlock, LoopchainJunction } from "../data/radioLoopchainTypes";

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

describe("assignVoice", () => {
  it("alternates strictly A/B by global occurrence index", () => {
    expect([0, 1, 2, 3, 4].map(assignVoice)).toEqual(["A", "B", "A", "B", "A"]);
  });
});

describe("buildLoopchainSchedule — single block (self-loop only)", () => {
  it("produces one occurrence per expanded repetition, overlapping by the block's own crossfade", () => {
    const b = block("b1", { repeatMode: { mode: "repeatCount", count: 3 }, crossfadeDurationSeconds: 2 });
    const schedule = buildLoopchainSchedule([plan(b, 10)], []);
    expect(schedule.occurrences).toHaveLength(3);
    const [o0, o1, o2] = schedule.occurrences;
    expect(o0.chainStartSeconds).toBe(0);
    expect(o0.chainEndSeconds).toBe(10);
    expect(o0.fadeInDurationSeconds).toBeUndefined(); // first occurrence in the whole chain — full gain from the start
    expect(o0.fadeOutDurationSeconds).toBe(2); // overlaps with o1's start

    expect(o1.chainStartSeconds).toBe(8); // 10 - 2 crossfade
    expect(o1.fadeInDurationSeconds).toBe(2);
    expect(o1.fadeOutDurationSeconds).toBe(2);

    expect(o2.chainStartSeconds).toBe(16); // 8 + (10-2)
    expect(o2.fadeInDurationSeconds).toBe(2);
    expect(o2.fadeOutDurationSeconds).toBeUndefined(); // last occurrence — no scheduled exit fade

    expect(schedule.totalChainDurationSeconds).toBe(26); // o2 ends at 16+10
  });

  it("never leaves a gap between consecutive occurrences (each new start is before the previous end)", () => {
    const b = block("b1", { repeatMode: { mode: "repeatCount", count: 5 }, crossfadeDurationSeconds: 3 });
    const schedule = buildLoopchainSchedule([plan(b, 12)], []);
    for (let i = 1; i < schedule.occurrences.length; i++) {
      const prev = schedule.occurrences[i - 1];
      const cur = schedule.occurrences[i];
      expect(cur.chainStartSeconds).toBeLessThan(prev.chainEndSeconds);
      expect(prev.chainEndSeconds - cur.chainStartSeconds).toBeCloseTo(3);
    }
  });
});

describe("buildLoopchainSchedule — multi-block (junction transitions)", () => {
  it("stitches two different blocks using the junction's own crossfade, not either block's self-loop crossfade", () => {
    const b1 = block("b1", { repeatMode: { mode: "repeatCount", count: 2 }, crossfadeDurationSeconds: 1 });
    const b2 = block("b2", { repeatMode: { mode: "repeatCount", count: 1 }, crossfadeDurationSeconds: 1 });
    const junction: LoopchainJunction = { id: "j1", outgoingBlockId: "b1", incomingBlockId: "b2", crossfadeDurationSeconds: 4 };
    const schedule = buildLoopchainSchedule([plan(b1, 10), plan(b2, 8)], [junction]);

    expect(schedule.occurrences).toHaveLength(3);
    const [b1o0, b1o1, b2o0] = schedule.occurrences;
    expect(b1o0.chainStartSeconds).toBe(0);
    expect(b1o1.chainStartSeconds).toBe(9); // 10 - 1 (b1's own crossfade)
    expect(b1o1.fadeOutDurationSeconds).toBe(4); // overwritten to the JUNCTION crossfade, not b1's self-loop crossfade
    expect(b2o0.chainStartSeconds).toBe(9 + (10 - 4)); // b1o1 start + (cycle - junction crossfade)
    expect(b2o0.fadeInDurationSeconds).toBe(4);
    expect(b2o0.blockId).toBe("b2");
  });

  it("throws when a junction is missing between two adjacent blocks", () => {
    const b1 = block("b1");
    const b2 = block("b2");
    expect(() => buildLoopchainSchedule([plan(b1, 10), plan(b2, 10)], [])).toThrow(LoopchainScheduleError);
  });

  it("assigns globally-increasing indices and alternating voices across block boundaries", () => {
    const b1 = block("b1", { repeatMode: { mode: "repeatCount", count: 2 } });
    const b2 = block("b2", { repeatMode: { mode: "repeatCount", count: 2 } });
    const junction: LoopchainJunction = { id: "j1", outgoingBlockId: "b1", incomingBlockId: "b2", crossfadeDurationSeconds: 2 };
    const schedule = buildLoopchainSchedule([plan(b1, 10), plan(b2, 10)], [junction]);
    expect(schedule.occurrences.map((o) => o.globalIndex)).toEqual([0, 1, 2, 3]);
    expect(schedule.occurrences.map((o) => o.voice)).toEqual(["A", "B", "A", "B"]);
  });

  it("propagates the block-specific expansion error (e.g. crossfade >= cycle) with the offending block id", () => {
    const b1 = block("b1", { crossfadeDurationSeconds: 10 });
    expect(() => buildLoopchainSchedule([plan(b1, 10)], [])).toThrow(/b1/);
  });
});

describe("occurrencesDueForScheduling", () => {
  it("returns only occurrences starting within the lookahead window that aren't already scheduled", () => {
    const b = block("b1", { repeatMode: { mode: "repeatCount", count: 4 }, crossfadeDurationSeconds: 2 });
    const schedule = buildLoopchainSchedule([plan(b, 10)], []);
    // starts: 0, 8, 16, 24
    const due = occurrencesDueForScheduling(schedule, 0, 9, new Set());
    expect(due.map((o) => o.chainStartSeconds)).toEqual([0, 8]);

    const dueLater = occurrencesDueForScheduling(schedule, 8.5, 9, new Set(["b1::occ0", "b1::occ1"]));
    expect(dueLater.map((o) => o.chainStartSeconds)).toEqual([16]);
  });

  it("excludes occurrences that have already fully ended before the current elapsed time", () => {
    const b = block("b1", { repeatMode: { mode: "repeatCount", count: 2 }, crossfadeDurationSeconds: 2 });
    const schedule = buildLoopchainSchedule([plan(b, 10)], []);
    const due = occurrencesDueForScheduling(schedule, 15, 100, new Set());
    // o0 ends at 10 (< 15, excluded); o1 (8..18) still overlaps 15, included
    expect(due.map((o) => o.occurrenceIndexInBlock)).toEqual([1]);
  });

  it("never re-returns an occurrence already marked scheduled", () => {
    const b = block("b1", { repeatMode: { mode: "repeatCount", count: 2 }, crossfadeDurationSeconds: 2 });
    const schedule = buildLoopchainSchedule([plan(b, 10)], []);
    const due = occurrencesDueForScheduling(schedule, 0, 100, new Set(schedule.occurrences.map((o) => o.occurrenceId)));
    expect(due).toEqual([]);
  });
});

describe("buildOccurrenceEnvelopes", () => {
  it("builds fade-in and fade-out envelopes anchored to the occurrence's own chain timing", () => {
    const b = block("b1", { repeatMode: { mode: "repeatCount", count: 3 }, crossfadeDurationSeconds: 2 });
    const schedule = buildLoopchainSchedule([plan(b, 10)], []);
    const middle = schedule.occurrences[1]; // start 8, end 18, fadeIn 2, fadeOut 2
    const { fadeIn, fadeOut } = buildOccurrenceEnvelopes(middle);
    expect(fadeIn).toEqual({ startTimeContextSeconds: 8, endTimeContextSeconds: 10, startGain: 0, endGain: 1, curve: "equal_power" });
    expect(fadeOut).toEqual({ startTimeContextSeconds: 16, endTimeContextSeconds: 18, startGain: 1, endGain: 0, curve: "equal_power" });
  });

  it("omits fade-in for the very first occurrence and fade-out for the very last", () => {
    const b = block("b1", { repeatMode: { mode: "repeatCount", count: 2 }, crossfadeDurationSeconds: 2 });
    const schedule = buildLoopchainSchedule([plan(b, 10)], []);
    expect(buildOccurrenceEnvelopes(schedule.occurrences[0]).fadeIn).toBeUndefined();
    expect(buildOccurrenceEnvelopes(schedule.occurrences[schedule.occurrences.length - 1]).fadeOut).toBeUndefined();
  });
});

describe("distinct occurrence identity — no shared gain-node identity across occurrences", () => {
  it("every scheduled occurrence in a chain has a unique occurrenceId, proving no two occurrences could ever share one node pair", () => {
    const b1 = block("b1", { repeatMode: { mode: "repeatCount", count: 5 } });
    const b2 = block("b2", { repeatMode: { mode: "repeatCount", count: 5 } });
    const junction: LoopchainJunction = { id: "j1", outgoingBlockId: "b1", incomingBlockId: "b2", crossfadeDurationSeconds: 2 };
    const schedule = buildLoopchainSchedule([plan(b1, 10), plan(b2, 10)], [junction]);
    const ids = schedule.occurrences.map((o) => o.occurrenceId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
