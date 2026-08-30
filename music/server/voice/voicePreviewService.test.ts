import { describe, expect, it, vi } from "vitest";
import { VOICE_PROVIDER_PREVIEW_ROUTE, generateProviderVoicePreviewAudio, type VoicePreviewAdapter } from "./voicePreviewService";
import { KOKORO_LOCAL_PROVIDER_ID } from "./kokoroLocalProvider";

const previewAdapter = (generate = vi.fn().mockResolvedValue({
  mimeType: "audio/wav",
  data: Buffer.from("preview"),
  providerVoiceId: "Samantha",
  model: "macos-say",
})): VoicePreviewAdapter => ({
  id: "macos-say",
  previewText: "StudioRich VOICE library. Your next sound begins here.",
  generate,
});

describe("VOICE provider preview route service", () => {
  it("exports the endpoint consumed by the browser client", () => {
    expect(VOICE_PROVIDER_PREVIEW_ROUTE).toBe("/voice-generation/preview");
  });

  it("generates temporary preview audio through the selected provider without a library save", async () => {
    const generate = vi.fn().mockResolvedValue({ mimeType: "audio/wav", data: Buffer.from("preview"), providerVoiceId: "Samantha", model: "macos-say" });

    await expect(generateProviderVoicePreviewAudio("macos-say", "Samantha", previewAdapter(generate))).resolves.toMatchObject({
      mimeType: "audio/wav",
      providerVoiceId: "Samantha",
    });
    expect(generate).toHaveBeenCalledWith("StudioRich VOICE library. Your next sound begins here.", "Samantha");
  });

  it("returns a useful provider diagnostic when preview generation cannot be routed", async () => {
    await expect(generateProviderVoicePreviewAudio("other-provider", "voice_1", previewAdapter())).rejects.toThrow("Unsupported VOICE preview provider: other-provider.");
  });

  it("generates a Kokoro provider preview without a library save path", async () => {
    const kokoroGenerate = vi.fn().mockResolvedValue({ mimeType: "audio/wav", data: Buffer.from("preview"), providerVoiceId: "af_bella", model: "kokoro-82m-local" });

    await expect(generateProviderVoicePreviewAudio(KOKORO_LOCAL_PROVIDER_ID, "af_bella", previewAdapter(), kokoroGenerate)).resolves.toMatchObject({
      providerVoiceId: "af_bella",
      model: "kokoro-82m-local",
    });
    expect(kokoroGenerate).toHaveBeenCalledWith("StudioRich VOICE library. Your next sound begins here.", "af_bella");
  });
});
