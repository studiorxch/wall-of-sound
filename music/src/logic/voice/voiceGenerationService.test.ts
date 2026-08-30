import { afterEach, describe, expect, it, vi } from "vitest";
import { VOICE_PROVIDER_PREVIEW_ROUTE, type VoiceAsset, type VoiceProfile } from "../../data/voiceLibraryTypes";
import {
  buildGeneratedVoiceAsset,
  fetchSpeechProviders,
  fetchSpeechProviderVoices,
  generateProviderVoicePreview,
  generateSpeechPreview,
  saveGeneratedVoiceAudio,
} from "./voiceGenerationService";

const NOW = "2026-08-29T12:00:00.000Z";

const PROFILE: VoiceProfile = {
  id: "profile_1",
  name: "Conductor",
  colorToken: "sky",
  identity: "woman",
  customIdentityLabel: null,
  presentation: "neutral",
  language: "en-US",
  provider: "macos-say",
  providerVoiceId: "Samantha",
  model: "macos-say",
  notes: null,
  createdAt: NOW,
  updatedAt: NOW,
};

function asset(id: string, overrides: Partial<VoiceAsset> = {}): VoiceAsset {
  return {
    id,
    name: id,
    text: null,
    durationMs: 1_000,
    rating: null,
    groupId: null,
    voiceProfileId: PROFILE.id,
    source: "generated",
    sourceLabel: "Generated",
    provider: "macos-say",
    providerVoiceId: "Samantha",
    model: "macos-say",
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

describe("voiceGenerationService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("loads provider and provider-voice lists through the adapter boundary", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ providers: [{ id: "macos-say", displayName: "macOS Say", available: true }] }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ voices: [{ id: "Samantha", label: "Samantha", language: "en_US" }] }), { status: 200, headers: { "Content-Type": "application/json" } })));

    await expect(fetchSpeechProviders()).resolves.toEqual([{ id: "macos-say", displayName: "macOS Say", available: true }]);
    await expect(fetchSpeechProviderVoices("macos-say")).resolves.toEqual([{ id: "Samantha", label: "Samantha", language: "en_US" }]);
  });

  it("returns an empty provider list cleanly when no provider is configured", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ providers: [] }), { status: 200, headers: { "Content-Type": "application/json" } })));
    await expect(fetchSpeechProviders()).resolves.toEqual([]);
  });

  it("returns preview audio and provider metadata on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(new Blob(["audio-bytes"], { type: "audio/wav" }), {
        status: 200,
        headers: {
          "Content-Type": "audio/wav",
          "X-Voice-Provider": "macos-say",
          "X-Voice-Provider-Voice": "Samantha",
          "X-Voice-Model": "macos-say",
        },
      }),
    ));

    const result = await generateSpeechPreview("macos-say", { text: "Next stop", voiceProfileId: PROFILE.id }, PROFILE);

    expect(result.provider).toBe("macos-say");
    expect(result.providerVoiceId).toBe("Samantha");
    expect(result.model).toBe("macos-say");
    expect(result.mimeType).toBe("audio/wav");
    expect(result.audioData).toBeInstanceOf(Blob);
  });

  it("auditions a provider voice without creating or saving a library asset", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Blob(["audio-bytes"], { type: "audio/wav" }), {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "X-Voice-Provider": "macos-say",
        "X-Voice-Provider-Voice": "Samantha",
        "X-Voice-Model": "macos-say",
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateProviderVoicePreview("macos-say", "Samantha")).resolves.toMatchObject({
      provider: "macos-say",
      providerVoiceId: "Samantha",
      model: "macos-say",
    });
    expect(fetchMock).toHaveBeenCalledWith(VOICE_PROVIDER_PREVIEW_ROUTE, expect.objectContaining({ method: "POST" }));
    expect(fetchMock.mock.calls.some(([route]) => String(route).startsWith("/library-import"))).toBe(false);
  });

  it("surfaces a provider-voice preview failure without creating an asset", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "preview unavailable" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    })));

    await expect(generateProviderVoicePreview("macos-say", "Samantha")).rejects.toThrow("preview unavailable");
  });

  it("includes the preview route in diagnostics when the endpoint cannot return JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not found", { status: 404 })));

    await expect(generateProviderVoicePreview("macos-say", "Samantha")).rejects.toThrow(`404) at ${VOICE_PROVIDER_PREVIEW_ROUTE}`);
  });

  it("surfaces provider failures without fabricating a preview", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "provider unavailable" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }),
    ));

    await expect(generateSpeechPreview("macos-say", { text: "Next stop", voiceProfileId: PROFILE.id }, PROFILE)).rejects.toThrow("provider unavailable");
  });

  it("saves generated audio through the shared library import endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ relPath: "voice/audio/generated-preview.wav" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ));

    await expect(saveGeneratedVoiceAudio(new Blob(["audio"], { type: "audio/wav" }), "generated-preview.wav")).resolves.toEqual({
      filePath: "voice/audio/generated-preview.wav",
      fileName: "generated-preview.wav",
    });
  });

  it("builds a saved VOICE asset with source, provider, and lineage metadata preserved", () => {
    const next = buildGeneratedVoiceAsset(
      [asset("root", { version: 1 }), asset("variation", { parentAssetId: "root", version: 2 })],
      { filePath: "voice/audio/platform.wav", fileName: "platform.wav" },
      PROFILE,
      {
        audioData: new Blob(["audio"]),
        mimeType: "audio/wav",
        provider: "macos-say",
        providerVoiceId: "Samantha",
        model: "macos-say",
      },
      {
        name: "Platform Announcement",
        text: "Transfer is available.",
        durationMs: 2_100,
        groupId: "group_1",
        parentAssetId: "root",
        notes: "Evening version",
      },
      NOW,
    );

    expect(next).toMatchObject({
      name: "Platform Announcement",
      source: "generated",
      sourceLabel: "Generated",
      provider: "macos-say",
      providerVoiceId: "Samantha",
      model: "macos-say",
      voiceProfileId: PROFILE.id,
      parentAssetId: "root",
      version: 3,
      filePath: "voice/audio/platform.wav",
      fileName: "platform.wav",
      text: "Transfer is available.",
    });
  });
});
