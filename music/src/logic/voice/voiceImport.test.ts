import { afterEach, describe, expect, it, vi } from "vitest";
import type { VoiceAsset } from "../../data/voiceLibraryTypes";
import { createVoiceImportDraft, importVoiceFiles, isSupportedVoiceImportFileName } from "./voiceImport";
import { extractAudioFingerprint } from "../audioImport";

vi.mock("../audioImport", () => ({
  extractAudioFingerprint: vi.fn(),
}));

const mockedExtractAudioFingerprint = vi.mocked(extractAudioFingerprint);
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

describe("voiceImport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("accepts supported audio file names and rejects non-audio files", () => {
    expect(isSupportedVoiceImportFileName("line.wav")).toBe(true);
    expect(isSupportedVoiceImportFileName("line.MP3")).toBe(true);
    expect(isSupportedVoiceImportFileName("notes.txt")).toBe(false);
  });

  it("seeds a draft from the file name and preserves an optional selected parent", () => {
    const file = new File(["audio"], "Downtown Local.wav", { type: "audio/wav" });
    const draft = createVoiceImportDraft(file, "parent_1");
    expect(draft.name).toBe("Downtown Local");
    expect(draft.source).toBe("imported");
    expect(draft.parentAssetId).toBe("parent_1");
    expect(draft.text).toBeNull();
  });

  it("imports new assets and variations, preserving source metadata and incrementing version within a lineage", async () => {
    mockedExtractAudioFingerprint.mockResolvedValue({ durationSeconds: 2.75 } as Awaited<ReturnType<typeof extractAudioFingerprint>>);
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ relPath: "voice/audio/new-root.wav" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ relPath: "voice/audio/new-variation.wav" }) }));

    const rootFile = new File(["audio"], "new-root.wav", { type: "audio/wav" });
    const variationFile = new File(["audio"], "new-variation.wav", { type: "audio/wav" });
    const drafts = [
      {
        ...createVoiceImportDraft(rootFile),
        source: "firefly" as const,
        sourceLabel: "Firefly",
        text: null,
      },
      {
        ...createVoiceImportDraft(variationFile, "root_existing"),
        name: "New Variation",
        source: "recorded" as const,
        sourceLabel: "Recorded",
        text: "Optional transcript",
        notes: "Alt take",
      },
    ];
    const existing = [
      asset("root_existing", { version: 1 }),
      asset("root_existing_v2", { parentAssetId: "root_existing", version: 2 }),
    ];

    const result = await importVoiceFiles(drafts, existing, NOW);

    expect(result.failed).toEqual([]);
    expect(result.imported).toHaveLength(2);
    expect(result.imported[0]).toMatchObject({
      name: "new-root",
      source: "firefly",
      sourceLabel: "Firefly",
      text: null,
      version: 1,
      durationMs: 2_750,
    });
    expect(result.imported[1]).toMatchObject({
      name: "New Variation",
      source: "recorded",
      sourceLabel: "Recorded",
      parentAssetId: "root_existing",
      version: 3,
      text: "Optional transcript",
      notes: "Alt take",
    });
  });

  it("reports failures without blocking successful imports", async () => {
    mockedExtractAudioFingerprint.mockResolvedValue({ durationSeconds: 1.25 } as Awaited<ReturnType<typeof extractAudioFingerprint>>);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ relPath: "voice/audio/success.wav" }) }));

    const success = createVoiceImportDraft(new File(["ok"], "success.wav", { type: "audio/wav" }));
    const fail = createVoiceImportDraft(new File(["bad"], "bad.txt", { type: "text/plain" }));

    const result = await importVoiceFiles([success, fail], [], NOW);

    expect(result.imported).toHaveLength(1);
    expect(result.failed).toEqual([{ fileName: "bad.txt", error: "Unsupported audio format." }]);
  });
});
