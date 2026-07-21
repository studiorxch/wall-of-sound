import { describe, expect, it } from "vitest";
import { expandBlockToOccurrences, LoopchainExpansionError } from "./radioLoopchainExpansion";
import type { LoopchainBlock } from "../../data/radioLoopchainTypes";

function block(overrides: Partial<LoopchainBlock> = {}): LoopchainBlock {
  return {
    id: "b1",
    sourceTrackId: "ext_mr9smtpl_wb0b",
    sectionId: "songsec_mru7euhj_bgtflb",
    repeatMode: { mode: "repeatCount", count: 4 },
    crossfadeDurationSeconds: 2,
    ...overrides,
  };
}

describe("expandBlockToOccurrences — repeatCount", () => {
  it("produces exactly `count` occurrences", () => {
    const result = expandBlockToOccurrences(block({ repeatMode: { mode: "repeatCount", count: 12 } }), 14.7, 23.53);
    expect(result.occurrenceCount).toBe(12);
    expect(result.occurrences).toHaveLength(12);
    result.occurrences.forEach((occ, i) => {
      expect(occ.occurrenceIndex).toBe(i);
      expect(occ.sourceOffsetSeconds).toBe(23.53);
      expect(occ.durationSeconds).toBe(14.7);
    });
  });

  it("reports planned audible residence accounting for crossfade overlap", () => {
    // 5 cycles of 10s each, 2s crossfade: 10 + 4*(10-2) = 42
    const result = expandBlockToOccurrences(block({ repeatMode: { mode: "repeatCount", count: 5 }, crossfadeDurationSeconds: 2 }), 10, 0);
    expect(result.plannedAudibleResidenceSeconds).toBe(42);
    expect(result.requestedResidenceSeconds).toBeUndefined();
  });

  it("rejects a non-positive or non-integer count", () => {
    expect(() => expandBlockToOccurrences(block({ repeatMode: { mode: "repeatCount", count: 0 } }), 10, 0)).toThrow(LoopchainExpansionError);
    expect(() => expandBlockToOccurrences(block({ repeatMode: { mode: "repeatCount", count: 2.5 } }), 10, 0)).toThrow(LoopchainExpansionError);
  });
});

describe("expandBlockToOccurrences — targetResidenceSeconds (corrected complete-cycle math)", () => {
  it("never plans a shorter audible residence than requested — the bug the naive ceil(target/cycle) formula produced", () => {
    // cycle=10s, crossfade=4s, target=95s.
    // naive ceil(95/10) = 10 occurrences -> audible = 10 + 9*(10-4) = 64s < 95s (WRONG, would have failed the requirement).
    // corrected: smallest N such that 10 + (N-1)*6 >= 95 -> N-1 >= 14.166 -> N=16 -> audible = 10+15*6=100 >= 95.
    const result = expandBlockToOccurrences(
      block({ repeatMode: { mode: "targetResidenceSeconds", seconds: 95 }, crossfadeDurationSeconds: 4 }),
      10,
      0,
    );
    expect(result.occurrenceCount).toBe(16);
    expect(result.plannedAudibleResidenceSeconds).toBe(100);
    expect(result.plannedAudibleResidenceSeconds).toBeGreaterThanOrEqual(95);
    expect(result.requestedResidenceSeconds).toBe(95);
  });

  it("rounds up to a whole cycle, never truncating the final occurrence", () => {
    // cycle=20s, crossfade=5s (adds 15s/cycle after the first), target=40s.
    // N=1 -> 20s (< 40). N=2 -> 35s (< 40). N=3 -> 50s (>= 40). Answer: 3, never a partial 3rd cycle.
    const result = expandBlockToOccurrences(
      block({ repeatMode: { mode: "targetResidenceSeconds", seconds: 40 }, crossfadeDurationSeconds: 5 }),
      20,
      0,
    );
    expect(result.occurrenceCount).toBe(3);
    expect(result.occurrences).toHaveLength(3);
    expect(result.occurrences.every((o) => o.durationSeconds === 20)).toBe(true);
    expect(result.plannedAudibleResidenceSeconds).toBe(50);
  });

  it("needs only a single occurrence when the cycle alone already meets the target", () => {
    const result = expandBlockToOccurrences(
      block({ repeatMode: { mode: "targetResidenceSeconds", seconds: 8 }, crossfadeDurationSeconds: 1 }),
      10,
      0,
    );
    expect(result.occurrenceCount).toBe(1);
    expect(result.plannedAudibleResidenceSeconds).toBe(10);
  });

  it("rejects a non-positive target", () => {
    expect(() => expandBlockToOccurrences(block({ repeatMode: { mode: "targetResidenceSeconds", seconds: 0 } }), 10, 0)).toThrow(LoopchainExpansionError);
  });
});

describe("expandBlockToOccurrences — guard clauses", () => {
  it("rejects crossfadeDurationSeconds equal to cycleDurationSeconds", () => {
    expect(() => expandBlockToOccurrences(block({ crossfadeDurationSeconds: 10 }), 10, 0)).toThrow(LoopchainExpansionError);
  });

  it("rejects crossfadeDurationSeconds greater than cycleDurationSeconds", () => {
    expect(() => expandBlockToOccurrences(block({ crossfadeDurationSeconds: 15 }), 10, 0)).toThrow(LoopchainExpansionError);
  });

  it("rejects a negative crossfade", () => {
    expect(() => expandBlockToOccurrences(block({ crossfadeDurationSeconds: -1 }), 10, 0)).toThrow(LoopchainExpansionError);
  });

  it("rejects a non-positive cycle duration", () => {
    expect(() => expandBlockToOccurrences(block(), 0, 0)).toThrow(LoopchainExpansionError);
    expect(() => expandBlockToOccurrences(block(), -5, 0)).toThrow(LoopchainExpansionError);
  });

  it("allows a zero crossfade (hard-cut repeats, no overlap)", () => {
    const result = expandBlockToOccurrences(block({ repeatMode: { mode: "repeatCount", count: 3 }, crossfadeDurationSeconds: 0 }), 10, 0);
    expect(result.plannedAudibleResidenceSeconds).toBe(30);
  });
});
