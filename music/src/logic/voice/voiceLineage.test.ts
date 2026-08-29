import { describe, expect, it } from "vitest";
import type { VoiceAsset } from "../../data/voiceLibraryTypes";
import { applyVoiceAssetDeletion } from "./voiceLineage";

const NOW = "2026-08-29T12:00:00.000Z";

function asset(id: string, overrides: Partial<VoiceAsset> = {}): VoiceAsset {
  return {
    id,
    name: id,
    text: null,
    durationMs: 1_000,
    rating: null,
    groupId: null,
    voiceProfileId: null,
    source: "imported",
    sourceLabel: "Imported",
    provider: null,
    providerVoiceId: null,
    model: null,
    filePath: `voice/audio/${id}.wav`,
    fileName: `${id}.wav`,
    parentAssetId: null,
    version: 1,
    notes: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("applyVoiceAssetDeletion", () => {
  it("removes selected records and detaches surviving children whose parent was removed", () => {
    const input = [
      asset("root"),
      asset("child", { parentAssetId: "root", version: 2 }),
      asset("grandchild", { parentAssetId: "child", version: 3 }),
      asset("other"),
    ];

    const result = applyVoiceAssetDeletion(input, ["root"]);

    expect(result.removedIds).toEqual(["root"]);
    expect(result.detachedChildIds).toEqual(["child"]);
    expect(result.assets.find((item) => item.id === "child")?.parentAssetId).toBeNull();
    expect(result.assets.find((item) => item.id === "grandchild")?.parentAssetId).toBe("child");
    expect(result.assets.map((item) => item.id)).toEqual(["child", "grandchild", "other"]);
  });

  it("supports deleting multiple records at once", () => {
    const input = [asset("a"), asset("b", { parentAssetId: "a" }), asset("c")];
    const result = applyVoiceAssetDeletion(input, ["a", "c"]);
    expect(result.removedIds).toEqual(["a", "c"]);
    expect(result.assets.map((item) => item.id)).toEqual(["b"]);
    expect(result.assets[0].parentAssetId).toBeNull();
  });
});
