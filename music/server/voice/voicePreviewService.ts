import { generateMacOsSpeech, getMacOsSayProviderDescriptor } from "./macosSayProvider";
import { VOICE_PROVIDER_PREVIEW_ROUTE } from "../../src/data/voiceLibraryTypes";

export { VOICE_PROVIDER_PREVIEW_ROUTE };

export interface VoicePreviewAdapter {
  readonly id: string;
  readonly previewText: string | null | undefined;
  generate(text: string, providerVoiceId: string | null): ReturnType<typeof generateMacOsSpeech>;
}

function macOsSayPreviewAdapter(): VoicePreviewAdapter {
  const descriptor = getMacOsSayProviderDescriptor();
  return { id: descriptor.id, previewText: descriptor.previewText, generate: generateMacOsSpeech };
}

/** Generates in-memory preview bytes only; this service does not import or persist library assets. */
export async function generateProviderVoicePreviewAudio(
  providerId: string,
  providerVoiceId: string | null,
  adapter: VoicePreviewAdapter = macOsSayPreviewAdapter(),
) {
  if (providerId !== adapter.id) {
    throw new Error(`Unsupported VOICE preview provider: ${providerId || "(missing provider)"}.`);
  }
  return adapter.generate(adapter.previewText ?? "StudioRich VOICE library.", providerVoiceId);
}
