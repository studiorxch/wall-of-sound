import { describe, expect, it } from "vitest";
import { reconcileJunctions } from "./radioLoopchainJunctions";
import type { LoopchainBlock, LoopchainJunction } from "../../data/radioLoopchainTypes";

function block(id: string, sectionId: string): LoopchainBlock {
  return { id, sourceTrackId: "ext_mr9smtpl_wb0b", sectionId, repeatMode: { mode: "repeatCount", count: 4 }, crossfadeDurationSeconds: 2 };
}

describe("reconcileJunctions", () => {
  it("creates one junction per adjacent pair for a fresh chain", () => {
    const blocks = [block("b1", "s1"), block("b2", "s2"), block("b3", "s3")];
    const junctions = reconcileJunctions(blocks, [], 3);
    expect(junctions).toHaveLength(2);
    expect(junctions[0]).toMatchObject({ outgoingBlockId: "b1", incomingBlockId: "b2", crossfadeDurationSeconds: 3 });
    expect(junctions[1]).toMatchObject({ outgoingBlockId: "b2", incomingBlockId: "b3", crossfadeDurationSeconds: 3 });
  });

  it("preserves a junction (including a customized crossfade) whose pair is still adjacent after reordering the rest of the chain", () => {
    const blocks = [block("b1", "s1"), block("b2", "s2"), block("b3", "s3")];
    const seeded = reconcileJunctions(blocks, [], 3);
    const customized = seeded.map((j) => (j.outgoingBlockId === "b1" ? { ...j, crossfadeDurationSeconds: 7 } : j));

    // reorder: b1,b2 stay adjacent; b3 moves before b1 (b3 <-> b1 now adjacent, b2<->b3 gone)
    const reordered = [block("b3", "s3"), block("b1", "s1"), block("b2", "s2")];
    const next = reconcileJunctions(reordered, customized, 3);

    const b1b2 = next.find((j) => j.outgoingBlockId === "b1" && j.incomingBlockId === "b2");
    expect(b1b2).toBeDefined();
    expect(b1b2!.crossfadeDurationSeconds).toBe(7);
    expect(b1b2!.id).toBe(customized.find((j) => j.outgoingBlockId === "b1" && j.incomingBlockId === "b2")!.id);
  });

  it("drops junctions whose pair is no longer adjacent and seeds a fresh default junction for the newly-adjacent pair", () => {
    const blocks = [block("b1", "s1"), block("b2", "s2"), block("b3", "s3")];
    const seeded = reconcileJunctions(blocks, [], 3);
    // remove b2: b1 and b3 become newly adjacent
    const afterRemoval = [block("b1", "s1"), block("b3", "s3")];
    const next = reconcileJunctions(afterRemoval, seeded, 3);

    expect(next).toHaveLength(1);
    expect(next[0].outgoingBlockId).toBe("b1");
    expect(next[0].incomingBlockId).toBe("b3");
    expect(next[0].crossfadeDurationSeconds).toBe(3);
    // it's a fresh junction, not a mutated survivor from the old (b1,b2)/(b2,b3) pairs
    expect(seeded.some((j) => j.id === next[0].id)).toBe(false);
  });

  it("never inherits junctions for a duplicated block, since a duplicate gets a fresh id", () => {
    const blocks = [block("b1", "s1"), block("b2", "s2")];
    const seeded = reconcileJunctions(blocks, [], 3);
    // duplicate b1 as b1-copy, inserted after b2
    const withDuplicate = [block("b1", "s1"), block("b2", "s2"), block("b1-copy", "s1")];
    const next = reconcileJunctions(withDuplicate, seeded, 3);

    expect(next).toHaveLength(2);
    const b1b2 = next.find((j) => j.outgoingBlockId === "b1" && j.incomingBlockId === "b2")!;
    expect(b1b2.id).toBe(seeded[0].id); // survivor kept
    const b2copy = next.find((j) => j.outgoingBlockId === "b2" && j.incomingBlockId === "b1-copy")!;
    expect(b2copy).toBeDefined();
    expect(seeded.some((j) => j.id === b2copy.id)).toBe(false); // fresh, not inherited
  });

  it("returns an empty list for a single-block chain", () => {
    expect(reconcileJunctions([block("b1", "s1")], [], 3)).toEqual([]);
  });

  it("returns an empty list for an empty chain, dropping all prior junctions", () => {
    const stale: LoopchainJunction[] = [{ id: "x", outgoingBlockId: "b1", incomingBlockId: "b2", crossfadeDurationSeconds: 3 }];
    expect(reconcileJunctions([], stale, 3)).toEqual([]);
  });
});
