import { describe, expect, it } from "vitest";
import type { VoiceAsset } from "../../data/voiceLibraryTypes";
import { buildVoiceDisplayContext, filterVoiceAssets } from "./voiceLibraryView";
import { editVoiceAssetMetadata } from "./voiceAssetMetadata";

const NOW = "2026-08-30T12:00:00.000Z";
const IMPORTED: VoiceAsset = {
  id: "voice_import_1", name: "firefly-take", text: null, durationMs: 2_000, rating: 4,
  groupId: null, voiceProfileId: null, source: "firefly", sourceLabel: "Firefly", provider: null,
  providerVoiceId: null, model: null, filePath: "voice/audio/firefly-take.wav", fileName: "firefly-take.wav",
  parentAssetId: "voice_parent", version: 3, notes: "Imported", createdAt: NOW, updatedAt: NOW,
};

describe("editVoiceAssetMetadata", () => {
  it("edits a VOICE asset name without changing file, source, provider, or lineage metadata", () => {
    const result = editVoiceAssetMetadata(IMPORTED, { name: "  Arrival Chime  ", text: "" }, "2026-08-30T12:05:00.000Z");
    expect(result).toMatchObject({ ok: true, asset: { name: "Arrival Chime", text: null, filePath: IMPORTED.filePath, fileName: IMPORTED.fileName, source: "firefly", provider: null, parentAssetId: "voice_parent", version: 3 } });
  });

  it("adds a transcript to an imported asset and makes it immediately searchable", () => {
    const result = editVoiceAssetMetadata(IMPORTED, { name: IMPORTED.name, text: "Welcome to Platform Seven" }, NOW);
    if (!result.ok) throw new Error(result.error);

    const matching = filterVoiceAssets([result.asset], "platform seven", { groupIds: [], voiceProfileIds: [] }, buildVoiceDisplayContext([], []));
    expect(matching).toEqual([result.asset]);
  });

  it("cancelling an edit leaves the original record untouched, while invalid saves retain the caller draft", () => {
    expect(editVoiceAssetMetadata(IMPORTED, { name: "  ", text: "new words" }, NOW)).toEqual({ ok: false, error: "Name is required." });
    expect(IMPORTED.name).toBe("firefly-take");
    expect(IMPORTED.text).toBeNull();
  });
});
