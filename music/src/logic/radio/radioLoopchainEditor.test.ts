import { describe, expect, it } from "vitest";
import {
  addBlock, reorderBlock, duplicateBlock, removeBlock, setBlockRepeatMode, setBlockRepeatPreference,
  formatBlockLabel, hasExistingIntroOrOutroUse, type AddBlockInput,
} from "./radioLoopchainEditor";
import type { LoopchainDraft, LoopchainBlock } from "../../data/radioLoopchainTypes";
import type { SongStructuralType } from "../../data/songAnalysisTypes";

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

// Role lookup keyed by sectionId, mirroring how the real caller resolves a
// block's live structural role via songAnalyses — kept as a simple map here
// since these tests never need real section-revision resolution.
function roleResolver(roles: Record<string, SongStructuralType>) {
  return (block: LoopchainBlock): SongStructuralType | undefined => roles[block.sectionId];
}

function input(overrides: Partial<AddBlockInput> = {}): AddBlockInput {
  return { sourceTrackId: "t1", sectionId: "s1", repeatMode: { mode: "repeatCount", count: 4 }, structuralType: "body", ...overrides };
}

function expectOk(result: ReturnType<typeof addBlock>): LoopchainDraft {
  if (!result.ok) throw new Error(`expected ok:true, got rejection: ${result.reason}`);
  return result.draft;
}

describe("addBlock", () => {
  it("appends a block referencing the real section, using the chain default crossfade", () => {
    const result = addBlock(emptyDraft(), input({ sectionId: "s1" }), roleResolver({}), NOW);
    const draft = expectOk(result);
    expect(draft.blocks).toHaveLength(1);
    expect(draft.blocks[0]).toMatchObject({ sourceTrackId: "t1", sectionId: "s1", crossfadeDurationSeconds: 3 });
    expect(draft.updatedAt).toBe(NOW);
  });

  it("creates a junction once a second block is added", () => {
    let draft = expectOk(addBlock(emptyDraft(), input({ sectionId: "s1" }), roleResolver({}), NOW));
    draft = expectOk(addBlock(draft, input({ sectionId: "s2" }), roleResolver({}), NOW));
    expect(draft.junctions).toHaveLength(1);
    expect(draft.junctions[0].outgoingBlockId).toBe(draft.blocks[0].id);
    expect(draft.junctions[0].incomingBlockId).toBe(draft.blocks[1].id);
  });

  it("forces an intro block's repeatMode to 1x even if a different mode was requested", () => {
    const result = addBlock(
      emptyDraft(),
      input({ sectionId: "s1", structuralType: "intro", repeatMode: { mode: "repeatCount", count: 5 } }),
      roleResolver({ s1: "intro" }),
      NOW,
    );
    const draft = expectOk(result);
    expect(draft.blocks[0].repeatMode).toEqual({ mode: "repeatCount", count: 1 });
  });

  it("rejects adding a second intro block to the same chain", () => {
    const draft = expectOk(addBlock(emptyDraft(), input({ sectionId: "s1", structuralType: "intro" }), roleResolver({ s1: "intro" }), NOW));
    const result = addBlock(draft, input({ sectionId: "s2", structuralType: "intro" }), roleResolver({ s1: "intro", s2: "intro" }), NOW);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("intro_outro_already_used");
      expect(result.existingBlockId).toBe(draft.blocks[0].id);
    }
  });

  it("rejects adding a second outro block independently of intro", () => {
    const draft = expectOk(addBlock(emptyDraft(), input({ sectionId: "s1", structuralType: "outro" }), roleResolver({ s1: "outro" }), NOW));
    const result = addBlock(draft, input({ sectionId: "s2", structuralType: "outro" }), roleResolver({ s1: "outro", s2: "outro" }), NOW);
    expect(result.ok).toBe(false);
  });

  it("allows one intro AND one outro in the same chain (independently single-use, not combined)", () => {
    const draft = expectOk(addBlock(emptyDraft(), input({ sectionId: "s1", structuralType: "intro" }), roleResolver({ s1: "intro" }), NOW));
    const result = addBlock(draft, input({ sectionId: "s2", structuralType: "outro" }), roleResolver({ s1: "intro", s2: "outro" }), NOW);
    expect(result.ok).toBe(true);
  });

  it("never restricts non-intro/outro roles from repeating", () => {
    const draft = expectOk(addBlock(emptyDraft(), input({ sectionId: "s1", structuralType: "chorus" }), roleResolver({ s1: "chorus" }), NOW));
    const result = addBlock(draft, input({ sectionId: "s2", structuralType: "chorus" }), roleResolver({ s1: "chorus", s2: "chorus" }), NOW);
    expect(result.ok).toBe(true);
  });
});

describe("hasExistingIntroOrOutroUse", () => {
  it("returns false for non-intro/outro roles regardless of draft contents", () => {
    const draft = expectOk(addBlock(emptyDraft(), input({ sectionId: "s1", structuralType: "chorus" }), roleResolver({ s1: "chorus" }), NOW));
    expect(hasExistingIntroOrOutroUse(draft, "chorus", roleResolver({ s1: "chorus" }))).toBe(false);
  });
});

describe("reorderBlock", () => {
  it("moves a block and reconciles junctions to the new adjacency", () => {
    let draft = expectOk(addBlock(emptyDraft(), input({ sectionId: "s1" }), roleResolver({}), NOW));
    draft = expectOk(addBlock(draft, input({ sectionId: "s2" }), roleResolver({}), NOW));
    draft = expectOk(addBlock(draft, input({ sourceTrackId: "t2", sectionId: "s3" }), roleResolver({}), NOW));
    const [b1, b2, b3] = draft.blocks;
    draft = reorderBlock(draft, 0, 2, NOW); // b1 moves to the end: b2,b3,b1
    expect(draft.blocks.map((b) => b.id)).toEqual([b2.id, b3.id, b1.id]);
    expect(draft.junctions.map((j) => `${j.outgoingBlockId}->${j.incomingBlockId}`)).toEqual([
      `${b2.id}->${b3.id}`,
      `${b3.id}->${b1.id}`,
    ]);
  });

  it("is a no-op for an out-of-range index", () => {
    const draft = expectOk(addBlock(emptyDraft(), input({ sectionId: "s1" }), roleResolver({}), NOW));
    expect(reorderBlock(draft, 0, 5, NOW)).toBe(draft);
  });
});

describe("duplicateBlock", () => {
  it("inserts a fresh-id reference to the same section immediately after the original", () => {
    const draft = expectOk(addBlock(emptyDraft(), input({ sectionId: "s1" }), roleResolver({}), NOW));
    const original = draft.blocks[0];
    const next = expectOk(duplicateBlock(draft, original.id, roleResolver({}), NOW));
    expect(next.blocks).toHaveLength(2);
    expect(next.blocks[1].sectionId).toBe(original.sectionId);
    expect(next.blocks[1].sourceTrackId).toBe(original.sourceTrackId);
    expect(next.blocks[1].id).not.toBe(original.id);
  });

  it("never gives the duplicate its own junctions inherited from the original", () => {
    let draft = expectOk(addBlock(emptyDraft(), input({ sectionId: "s1" }), roleResolver({}), NOW));
    draft = expectOk(addBlock(draft, input({ sectionId: "s2" }), roleResolver({}), NOW));
    const b1 = draft.blocks[0];
    const next = expectOk(duplicateBlock(draft, b1.id, roleResolver({}), NOW));
    // chain is now b1, b1-copy, b2 -> junctions (b1,copy) and (copy,b2), both fresh
    expect(next.junctions).toHaveLength(2);
    expect(draft.junctions.some((j) => next.junctions.some((nj) => nj.id === j.id))).toBe(false);
  });

  it("rejects duplicating an intro block — same violation as adding a second one", () => {
    const draft = expectOk(addBlock(emptyDraft(), input({ sectionId: "s1", structuralType: "intro" }), roleResolver({ s1: "intro" }), NOW));
    const result = duplicateBlock(draft, draft.blocks[0].id, roleResolver({ s1: "intro" }), NOW);
    expect(result.ok).toBe(false);
  });

  it("is an unchanged no-op (ok:true) for an unknown blockId", () => {
    const draft = expectOk(addBlock(emptyDraft(), input({ sectionId: "s1" }), roleResolver({}), NOW));
    const result = duplicateBlock(draft, "does-not-exist", roleResolver({}), NOW);
    expect(result).toEqual({ ok: true, draft });
  });
});

describe("removeBlock", () => {
  it("removes only the chain occurrence, leaving other blocks referencing the same section intact", () => {
    let draft = expectOk(addBlock(emptyDraft(), input({ sectionId: "s1" }), roleResolver({}), NOW));
    draft = expectOk(addBlock(draft, input({ sectionId: "s1" }), roleResolver({}), NOW));
    const [first] = draft.blocks;
    const next = removeBlock(draft, first.id, NOW);
    expect(next.blocks).toHaveLength(1);
    expect(next.blocks[0].sectionId).toBe("s1"); // the section reference itself is untouched
  });

  it("drops junctions attached to the removed block and bridges the gap", () => {
    let draft = expectOk(addBlock(emptyDraft(), input({ sectionId: "s1" }), roleResolver({}), NOW));
    draft = expectOk(addBlock(draft, input({ sectionId: "s2" }), roleResolver({}), NOW));
    draft = expectOk(addBlock(draft, input({ sectionId: "s3" }), roleResolver({}), NOW));
    const [b1, b2, b3] = draft.blocks;
    const next = removeBlock(draft, b2.id, NOW);
    expect(next.junctions).toHaveLength(1);
    expect(next.junctions[0]).toMatchObject({ outgoingBlockId: b1.id, incomingBlockId: b3.id });
  });
});

describe("setBlockRepeatMode", () => {
  it("updates only the targeted block's repeat mode", () => {
    let draft = expectOk(addBlock(emptyDraft(), input({ sectionId: "s1" }), roleResolver({}), NOW));
    draft = expectOk(addBlock(draft, input({ sectionId: "s2" }), roleResolver({}), NOW));
    const target = draft.blocks[1];
    const next = setBlockRepeatMode(draft, target.id, { mode: "targetResidenceSeconds", seconds: 90 }, "body", NOW);
    expect(next.blocks[0].repeatMode).toEqual({ mode: "repeatCount", count: 4 }); // untouched block, unchanged from input()'s default
    expect(next.blocks[1].repeatMode).toEqual({ mode: "targetResidenceSeconds", seconds: 90 });
  });

  it("forces an intro block's repeatMode to 1x regardless of what's requested, ignoring the advanced disclosure entirely", () => {
    const draft = expectOk(addBlock(emptyDraft(), input({ sectionId: "s1", structuralType: "intro" }), roleResolver({ s1: "intro" }), NOW));
    const next = setBlockRepeatMode(draft, draft.blocks[0].id, { mode: "repeatCount", count: 7 }, "intro", NOW);
    expect(next.blocks[0].repeatMode).toEqual({ mode: "repeatCount", count: 1 });
  });

  it("forces an outro block's repeatMode to 1x regardless of a targetResidenceSeconds request", () => {
    const draft = expectOk(addBlock(emptyDraft(), input({ sectionId: "s1", structuralType: "outro" }), roleResolver({ s1: "outro" }), NOW));
    const next = setBlockRepeatMode(draft, draft.blocks[0].id, { mode: "targetResidenceSeconds", seconds: 60 }, "outro", NOW);
    expect(next.blocks[0].repeatMode).toEqual({ mode: "repeatCount", count: 1 });
  });
});

describe("setBlockRepeatPreference", () => {
  it("resolves and stores the concrete repeatMode alongside the preference label", () => {
    const draft = expectOk(addBlock(emptyDraft(), input({ sectionId: "s1", structuralType: "chorus" }), roleResolver({ s1: "chorus" }), NOW));
    const next = setBlockRepeatPreference(draft, draft.blocks[0].id, "high", "chorus", NOW);
    expect(next.blocks[0].repeatPreference).toBe("high");
    expect(next.blocks[0].repeatMode).toEqual({ mode: "repeatCount", count: 8 });
  });

  it("forces intro to 1x even via the preference path", () => {
    const draft = expectOk(addBlock(emptyDraft(), input({ sectionId: "s1", structuralType: "intro" }), roleResolver({ s1: "intro" }), NOW));
    const next = setBlockRepeatPreference(draft, draft.blocks[0].id, "high", "intro", NOW);
    expect(next.blocks[0].repeatMode).toEqual({ mode: "repeatCount", count: 1 });
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
