import { describe, expect, it } from "vitest";
import { addBlock, reorderBlock, duplicateBlock, removeBlock, setBlockRepeatMode, formatBlockLabel } from "./radioLoopchainEditor";
import type { LoopchainDraft } from "../../data/radioLoopchainTypes";

function emptyDraft(): LoopchainDraft {
  return {
    id: "chain1",
    blocks: [],
    junctions: [],
    defaultCrossfadeDurationSeconds: 3,
    createdAt: "2026-07-21T00:00:00.000Z",
    updatedAt: "2026-07-21T00:00:00.000Z",
  };
}

const NOW = "2026-07-21T01:00:00.000Z";

describe("addBlock", () => {
  it("appends a block referencing the real section, using the chain default crossfade", () => {
    const draft = addBlock(emptyDraft(), { sourceTrackId: "t1", sectionId: "s1", repeatMode: { mode: "repeatCount", count: 4 } }, NOW);
    expect(draft.blocks).toHaveLength(1);
    expect(draft.blocks[0]).toMatchObject({ sourceTrackId: "t1", sectionId: "s1", crossfadeDurationSeconds: 3 });
    expect(draft.updatedAt).toBe(NOW);
  });

  it("creates a junction once a second block is added", () => {
    let draft = addBlock(emptyDraft(), { sourceTrackId: "t1", sectionId: "s1", repeatMode: { mode: "repeatCount", count: 4 } }, NOW);
    draft = addBlock(draft, { sourceTrackId: "t1", sectionId: "s2", repeatMode: { mode: "repeatCount", count: 4 } }, NOW);
    expect(draft.junctions).toHaveLength(1);
    expect(draft.junctions[0].outgoingBlockId).toBe(draft.blocks[0].id);
    expect(draft.junctions[0].incomingBlockId).toBe(draft.blocks[1].id);
  });
});

describe("reorderBlock", () => {
  it("moves a block and reconciles junctions to the new adjacency", () => {
    let draft = addBlock(emptyDraft(), { sourceTrackId: "t1", sectionId: "s1", repeatMode: { mode: "repeatCount", count: 1 } }, NOW);
    draft = addBlock(draft, { sourceTrackId: "t1", sectionId: "s2", repeatMode: { mode: "repeatCount", count: 1 } }, NOW);
    draft = addBlock(draft, { sourceTrackId: "t2", sectionId: "s3", repeatMode: { mode: "repeatCount", count: 1 } }, NOW);
    const [b1, b2, b3] = draft.blocks;
    draft = reorderBlock(draft, 0, 2, NOW); // b1 moves to the end: b2,b3,b1
    expect(draft.blocks.map((b) => b.id)).toEqual([b2.id, b3.id, b1.id]);
    expect(draft.junctions.map((j) => `${j.outgoingBlockId}->${j.incomingBlockId}`)).toEqual([
      `${b2.id}->${b3.id}`,
      `${b3.id}->${b1.id}`,
    ]);
  });

  it("is a no-op for an out-of-range index", () => {
    const draft = addBlock(emptyDraft(), { sourceTrackId: "t1", sectionId: "s1", repeatMode: { mode: "repeatCount", count: 1 } }, NOW);
    expect(reorderBlock(draft, 0, 5, NOW)).toBe(draft);
  });
});

describe("duplicateBlock", () => {
  it("inserts a fresh-id reference to the same section immediately after the original", () => {
    const draft = addBlock(emptyDraft(), { sourceTrackId: "t1", sectionId: "s1", repeatMode: { mode: "repeatCount", count: 4 } }, NOW);
    const original = draft.blocks[0];
    const next = duplicateBlock(draft, original.id, NOW);
    expect(next.blocks).toHaveLength(2);
    expect(next.blocks[1].sectionId).toBe(original.sectionId);
    expect(next.blocks[1].sourceTrackId).toBe(original.sourceTrackId);
    expect(next.blocks[1].id).not.toBe(original.id);
  });

  it("never gives the duplicate its own junctions inherited from the original", () => {
    let draft = addBlock(emptyDraft(), { sourceTrackId: "t1", sectionId: "s1", repeatMode: { mode: "repeatCount", count: 1 } }, NOW);
    draft = addBlock(draft, { sourceTrackId: "t1", sectionId: "s2", repeatMode: { mode: "repeatCount", count: 1 } }, NOW);
    const b1 = draft.blocks[0];
    const next = duplicateBlock(draft, b1.id, NOW);
    // chain is now b1, b1-copy, b2 -> junctions (b1,copy) and (copy,b2), both fresh
    expect(next.junctions).toHaveLength(2);
    expect(draft.junctions.some((j) => next.junctions.some((nj) => nj.id === j.id))).toBe(false);
  });
});

describe("removeBlock", () => {
  it("removes only the chain occurrence, leaving other blocks referencing the same section intact", () => {
    let draft = addBlock(emptyDraft(), { sourceTrackId: "t1", sectionId: "s1", repeatMode: { mode: "repeatCount", count: 1 } }, NOW);
    draft = addBlock(draft, { sourceTrackId: "t1", sectionId: "s1", repeatMode: { mode: "repeatCount", count: 1 } }, NOW);
    const [first] = draft.blocks;
    const next = removeBlock(draft, first.id, NOW);
    expect(next.blocks).toHaveLength(1);
    expect(next.blocks[0].sectionId).toBe("s1"); // the section reference itself is untouched
  });

  it("drops junctions attached to the removed block and bridges the gap", () => {
    let draft = addBlock(emptyDraft(), { sourceTrackId: "t1", sectionId: "s1", repeatMode: { mode: "repeatCount", count: 1 } }, NOW);
    draft = addBlock(draft, { sourceTrackId: "t1", sectionId: "s2", repeatMode: { mode: "repeatCount", count: 1 } }, NOW);
    draft = addBlock(draft, { sourceTrackId: "t1", sectionId: "s3", repeatMode: { mode: "repeatCount", count: 1 } }, NOW);
    const [b1, b2, b3] = draft.blocks;
    const next = removeBlock(draft, b2.id, NOW);
    expect(next.junctions).toHaveLength(1);
    expect(next.junctions[0]).toMatchObject({ outgoingBlockId: b1.id, incomingBlockId: b3.id });
  });
});

describe("setBlockRepeatMode", () => {
  it("updates only the targeted block's repeat mode", () => {
    let draft = addBlock(emptyDraft(), { sourceTrackId: "t1", sectionId: "s1", repeatMode: { mode: "repeatCount", count: 1 } }, NOW);
    draft = addBlock(draft, { sourceTrackId: "t1", sectionId: "s2", repeatMode: { mode: "repeatCount", count: 1 } }, NOW);
    const target = draft.blocks[1];
    const next = setBlockRepeatMode(draft, target.id, { mode: "targetResidenceSeconds", seconds: 90 }, NOW);
    expect(next.blocks[0].repeatMode).toEqual({ mode: "repeatCount", count: 1 });
    expect(next.blocks[1].repeatMode).toEqual({ mode: "targetResidenceSeconds", seconds: 90 });
  });
});

describe("formatBlockLabel", () => {
  it("formats a repeatCount block", () => {
    expect(formatBlockLabel("A", { mode: "repeatCount", count: 12 })).toBe("A ×12");
  });
  it("formats a targetResidenceSeconds block", () => {
    expect(formatBlockLabel("Body", { mode: "targetResidenceSeconds", seconds: 95 })).toBe("Body → 95s");
  });
});
