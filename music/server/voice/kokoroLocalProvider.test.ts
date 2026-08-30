import { describe, expect, it, vi } from "vitest";
import { generateKokoroLocalSpeech, getKokoroLocalProviderDescriptor, KOKORO_LOCAL_PROVIDER_ID, listKokoroLocalVoices } from "./kokoroLocalProvider";

describe("Kokoro Local VOICE provider", () => {
  it("detects a ready local service without any API key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "ok" }), { status: 200 }));

    await expect(getKokoroLocalProviderDescriptor(fetchMock as typeof fetch)).resolves.toMatchObject({
      id: KOKORO_LOCAL_PROVIDER_ID,
      displayName: "Kokoro Local",
      available: true,
    });
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8880/health", expect.anything());
  });

  it("reports an unavailable local service while leaving provider fallback possible", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("connection refused"));

    await expect(getKokoroLocalProviderDescriptor(fetchMock as typeof fetch)).resolves.toMatchObject({
      id: KOKORO_LOCAL_PROVIDER_ID,
      available: false,
      reasonUnavailable: expect.stringContaining("not running"),
    });
  });

  it("exposes normalized voice metadata for the searchable provider browser", () => {
    const voices = listKokoroLocalVoices();
    expect(voices).toContainEqual(expect.objectContaining({ id: "af_bella", label: "Bella", language: "en_US", presentation: "female" }));
    expect(voices).toContainEqual(expect.objectContaining({ id: "bm_daniel", label: "Daniel", language: "en_GB", presentation: "male" }));
    expect(voices).toContainEqual(expect.objectContaining({ id: "jf_alpha", language: "ja_JP", presentation: "female" }));
  });

  it("generates unsaved WAV bytes through the local OpenAI-compatible endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "Content-Type": "audio/wav" } }));

    const result = await generateKokoroLocalSpeech("Preview only", "af_bella", fetchMock as typeof fetch);

    expect(result).toMatchObject({ mimeType: "audio/wav", providerVoiceId: "af_bella", model: "kokoro-82m-local" });
    expect(result.data).toEqual(Buffer.from([1, 2, 3]));
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:8880/v1/audio/speech", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ model: "kokoro", voice: "af_bella", input: "Preview only", response_format: "wav" });
  });

  it("surfaces useful local service generation errors", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("model loading", { status: 503 }));
    await expect(generateKokoroLocalSpeech("Hello", "af_bella", fetchMock as typeof fetch)).rejects.toThrow("Kokoro Local generation failed: model loading");
  });
});
