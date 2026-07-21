import { describe, it, expect } from "vitest";
import { computePublishPatch, computeUnpublishPatch, radioPlaylistStateLabel } from "./radioPlaylistPublicationState";
import type { RadioPlaylist } from "../../data/radioPlaylistTypes";

const NOW = "2026-07-18T00:00:00.000Z";
const LATER = "2026-07-18T01:00:00.000Z";

function playlist(overrides: Partial<RadioPlaylist> = {}): RadioPlaylist {
  return {
    id: "radplaylist_1", sourceMusicPlaylistId: "pl_1", title: "Set", version: "1",
    state: "READY", entries: [], estimatedPublishBytes: 0, createdAt: NOW, updatedAt: NOW,
    ...overrides,
  };
}

describe("radioPlaylistStateLabel — honest local-only language", () => {
  it("never renders PUBLISHED as the word 'Published'", () => {
    const label = radioPlaylistStateLabel("PUBLISHED");
    expect(label).not.toMatch(/^Published$/);
    expect(label.toLowerCase()).not.toBe("published");
    expect(label).toBe("Marked Ready for Publishing");
  });

  it("labels the other states plainly", () => {
    expect(radioPlaylistStateLabel("DRAFT")).toBe("Draft");
    expect(radioPlaylistStateLabel("PREPARING")).toBe("Preparing");
    expect(radioPlaylistStateLabel("READY")).toBe("Ready");
    expect(radioPlaylistStateLabel("RETIRED")).toBe("Retired");
  });
});

describe("computePublishPatch", () => {
  it("sets state/publishedAt and clears unpublishedAt on the target", () => {
    const target = playlist({ unpublishedAt: "2026-07-17T00:00:00.000Z" });
    const result = computePublishPatch(target, [target], LATER);
    expect(result.targetPatch).toEqual({ state: "PUBLISHED", publishedAt: LATER, unpublishedAt: undefined });
  });

  it("supersedes a prior marked-ready sibling of the same lineage, reverting it to READY (never deleting it)", () => {
    const target = playlist({ id: "radplaylist_new", sourceMusicPlaylistId: "pl_1" });
    const sibling = playlist({ id: "radplaylist_old", sourceMusicPlaylistId: "pl_1", state: "PUBLISHED", publishedAt: NOW });
    const unrelated = playlist({ id: "radplaylist_other", sourceMusicPlaylistId: "pl_2", state: "PUBLISHED", publishedAt: NOW });

    const result = computePublishPatch(target, [target, sibling, unrelated], LATER);

    expect(result.othersToUnpublish).toEqual([{ id: "radplaylist_old", patch: { state: "READY", unpublishedAt: LATER } }]);
  });

  it("a sibling of a different lineage is never touched", () => {
    const target = playlist({ id: "radplaylist_new", sourceMusicPlaylistId: "pl_1" });
    const unrelated = playlist({ id: "radplaylist_other", sourceMusicPlaylistId: "pl_2", state: "PUBLISHED" });
    const result = computePublishPatch(target, [target, unrelated], LATER);
    expect(result.othersToUnpublish).toEqual([]);
  });
});

describe("computeUnpublishPatch", () => {
  it("sets state back to READY and stamps unpublishedAt", () => {
    const target = playlist({ state: "PUBLISHED", publishedAt: NOW });
    const patch = computeUnpublishPatch(target, LATER);
    expect(patch).toEqual({ state: "READY", unpublishedAt: LATER });
  });

  it("never clears publishedAt — proving packages/history/entries remain intact at the pure-function level", () => {
    const target = playlist({ state: "PUBLISHED", publishedAt: NOW, entries: [{ id: "e1", inboxItemId: "i1", order: 0, locked: false, includedInPublish: true, stemPolicy: "none" }] });
    const patch = computeUnpublishPatch(target, LATER);
    expect(patch).not.toHaveProperty("publishedAt");
    expect(patch).not.toHaveProperty("entries");
    // Applying the patch onto the record preserves publishedAt/entries.
    const applied: RadioPlaylist = { ...target, ...patch };
    expect(applied.publishedAt).toBe(NOW);
    expect(applied.entries.length).toBe(1);
  });

  it("the playlist can be re-marked ready after being unpublished", () => {
    const target = playlist({ state: "PUBLISHED", publishedAt: NOW });
    const unpublished: RadioPlaylist = { ...target, ...computeUnpublishPatch(target, LATER) };
    expect(unpublished.state).toBe("READY");
    const republished = computePublishPatch(unpublished, [unpublished], "2026-07-18T02:00:00.000Z");
    expect(republished.targetPatch.state).toBe("PUBLISHED");
  });
});
