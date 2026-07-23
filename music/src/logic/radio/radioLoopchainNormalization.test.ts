import { describe, expect, it } from "vitest";
import { normalizeIntroOutroSingleUse } from "./radioLoopchainNormalization";
import { reconcileJunctions } from "./radioLoopchainJunctions";
import type { LoopchainDraft, LoopchainBlock } from "../../data/radioLoopchainTypes";
import type { SongStructuralType } from "../../data/songAnalysisTypes";

function b(id: string, sectionId: string, repeatMode: LoopchainBlock["repeatMode"] = { mode: "repeatCount", count: 1 }): LoopchainBlock {
  return { id, sourceTrackId: "t1", sectionId, repeatMode, crossfadeDurationSeconds: 3 };
}

function draftFrom(blocks: LoopchainBlock[]): LoopchainDraft {
  return {
    id: "chain1",
    blocks,
    junctions: reconcileJunctions(blocks, [], 3),
    defaultCrossfadeDurationSeconds: 3,
    createdAt: "2026-07-21T00:00:00.000Z",
    updatedAt: "2026-07-21T00:00:00.000Z",
  };
}

function roleResolver(roles: Record<string, SongStructuralType>) {
  return (block: LoopchainBlock): SongStructuralType | undefined => roles[block.sectionId];
}

describe("normalizeIntroOutroSingleUse", () => {
  it("collapses a duplicate intro to the first in chain order, removing the rest", () => {
    const blocks = [b("b1", "intro_sec"), b("b2", "body_sec"), b("b3", "intro_sec")];
    const draft = draftFrom(blocks);
    const resolve = roleResolver({ intro_sec: "intro", body_sec: "body" });
    const { draft: repaired, warnings } = normalizeIntroOutroSingleUse(draft, resolve);
    expect(repaired.blocks.map((x) => x.id)).toEqual(["b1", "b2"]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ role: "intro", removedDuplicateBlockIds: ["b3"], repeatCountClampedBlockIds: [] });
  });

  it("collapses a duplicate outro independently of intro", () => {
    const blocks = [b("b1", "outro_sec"), b("b2", "body_sec"), b("b3", "outro_sec")];
    const draft = draftFrom(blocks);
    const resolve = roleResolver({ outro_sec: "outro", body_sec: "body" });
    const { draft: repaired, warnings } = normalizeIntroOutroSingleUse(draft, resolve);
    expect(repaired.blocks.map((x) => x.id)).toEqual(["b1", "b2"]);
    expect(warnings[0].role).toBe("outro");
  });

  it("never relabels the surviving section's structuralType/sectionId", () => {
    const blocks = [b("b1", "intro_sec"), b("b2", "intro_sec")];
    const draft = draftFrom(blocks);
    const resolve = roleResolver({ intro_sec: "intro" });
    const { draft: repaired } = normalizeIntroOutroSingleUse(draft, resolve);
    expect(repaired.blocks[0].sectionId).toBe("intro_sec");
  });

  it("clamps a surviving intro block's illegal repeat count to 1x and reports it", () => {
    const blocks = [b("b1", "intro_sec", { mode: "repeatCount", count: 3 }), b("b2", "body_sec")];
    const draft = draftFrom(blocks);
    const resolve = roleResolver({ intro_sec: "intro", body_sec: "body" });
    const { draft: repaired, warnings } = normalizeIntroOutroSingleUse(draft, resolve);
    expect(repaired.blocks[0].repeatMode).toEqual({ mode: "repeatCount", count: 1 });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ role: "intro", removedDuplicateBlockIds: [], repeatCountClampedBlockIds: ["b1"] });
  });

  it("clamps a surviving outro block's targetResidenceSeconds mode to 1x repeatCount", () => {
    const blocks = [b("b1", "body_sec"), b("b2", "outro_sec", { mode: "targetResidenceSeconds", seconds: 30 })];
    const draft = draftFrom(blocks);
    const resolve = roleResolver({ outro_sec: "outro", body_sec: "body" });
    const { draft: repaired } = normalizeIntroOutroSingleUse(draft, resolve);
    expect(repaired.blocks[1].repeatMode).toEqual({ mode: "repeatCount", count: 1 });
  });

  it("handles both a duplicate AND an illegal repeat count on the same role in one pass", () => {
    const blocks = [
      b("b1", "intro_sec", { mode: "repeatCount", count: 4 }),
      b("b2", "body_sec"),
      b("b3", "intro_sec"),
    ];
    const draft = draftFrom(blocks);
    const resolve = roleResolver({ intro_sec: "intro", body_sec: "body" });
    const { draft: repaired, warnings } = normalizeIntroOutroSingleUse(draft, resolve);
    expect(repaired.blocks.map((x) => x.id)).toEqual(["b1", "b2"]);
    expect(repaired.blocks[0].repeatMode).toEqual({ mode: "repeatCount", count: 1 });
    expect(warnings[0]).toMatchObject({ role: "intro", removedDuplicateBlockIds: ["b3"], repeatCountClampedBlockIds: ["b1"] });
  });

  it("produces no warnings and an unchanged draft for an already-valid chain", () => {
    const blocks = [b("b1", "intro_sec"), b("b2", "body_sec"), b("b3", "outro_sec")];
    const draft = draftFrom(blocks);
    const resolve = roleResolver({ intro_sec: "intro", body_sec: "body", outro_sec: "outro" });
    const { draft: repaired, warnings } = normalizeIntroOutroSingleUse(draft, resolve);
    expect(warnings).toEqual([]);
    expect(repaired.blocks.map((x) => x.id)).toEqual(["b1", "b2", "b3"]);
  });

  it("leaves junctions correctly reconciled after removing a duplicate", () => {
    const blocks = [b("b1", "intro_sec"), b("b2", "intro_sec"), b("b3", "body_sec")];
    const draft = draftFrom(blocks);
    const resolve = roleResolver({ intro_sec: "intro", body_sec: "body" });
    const { draft: repaired } = normalizeIntroOutroSingleUse(draft, resolve);
    expect(repaired.junctions).toHaveLength(1);
    expect(repaired.junctions[0]).toMatchObject({ outgoingBlockId: "b1", incomingBlockId: "b3" });
  });

  it("older drafts with no intro/outro sections at all hydrate safely with no warnings", () => {
    const blocks = [b("b1", "verse_sec"), b("b2", "chorus_sec")];
    const draft = draftFrom(blocks);
    const resolve = roleResolver({ verse_sec: "verse", chorus_sec: "chorus" });
    const { draft: repaired, warnings } = normalizeIntroOutroSingleUse(draft, resolve);
    expect(warnings).toEqual([]);
    expect(repaired.blocks).toHaveLength(2);
  });
});
