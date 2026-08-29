import type {
  GeneratedSpeechResult,
  SpeechGenerationRequest,
  SpeechProviderDescriptor,
  SpeechProviderVoiceOption,
  VoiceAsset,
  VoiceProfile,
} from "../../data/voiceLibraryTypes";
import { createVoiceAsset, nextVoiceAssetVersion } from "./voiceLibraryState";

const VOICE_GENERATED_DESTINATION = "voice/audio";

export async function fetchSpeechProviders(): Promise<SpeechProviderDescriptor[]> {
  const response = await fetch("/voice-generation/providers");
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = (await response.json()) as { providers?: SpeechProviderDescriptor[] };
  return payload.providers ?? [];
}

export async function fetchSpeechProviderVoices(providerId: string): Promise<SpeechProviderVoiceOption[]> {
  const response = await fetch(`/voice-generation/voices?provider=${encodeURIComponent(providerId)}`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = (await response.json()) as { voices?: SpeechProviderVoiceOption[] };
  return payload.voices ?? [];
}

export async function generateSpeechPreview(
  providerId: string,
  request: SpeechGenerationRequest,
  voiceProfile: VoiceProfile,
): Promise<GeneratedSpeechResult> {
  const response = await fetch("/voice-generation/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      providerId,
      text: request.text,
      voiceProfileId: request.voiceProfileId,
      providerVoiceId: voiceProfile.providerVoiceId ?? voiceProfile.name,
      model: voiceProfile.model ?? null,
    }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(payload.error ?? `HTTP ${response.status}`);
  }
  const blob = await response.blob();
  return {
    audioData: blob,
    mimeType: response.headers.get("Content-Type") ?? "audio/aiff",
    provider: response.headers.get("X-Voice-Provider") ?? providerId,
    providerVoiceId: response.headers.get("X-Voice-Provider-Voice") ?? (voiceProfile.providerVoiceId ?? voiceProfile.name),
    model: response.headers.get("X-Voice-Model"),
  };
}

export async function saveGeneratedVoiceAudio(
  audio: Blob,
  fileName: string,
): Promise<{ filePath: string; fileName: string }> {
  const response = await fetch(`/library-import?filename=${encodeURIComponent(fileName)}&dest=${VOICE_GENERATED_DESTINATION}`, {
    method: "POST",
    body: audio,
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(payload.error ?? `HTTP ${response.status}`);
  }
  const payload = (await response.json()) as { relPath: string };
  return {
    filePath: payload.relPath,
    fileName: payload.relPath.split("/").pop() ?? fileName,
  };
}

export function buildGeneratedVoiceAsset(
  existingAssets: VoiceAsset[],
  savedAudio: { filePath: string; fileName: string },
  voiceProfile: VoiceProfile,
  generated: GeneratedSpeechResult,
  input: {
    name: string;
    text: string;
    durationMs: number;
    groupId: string | null;
    parentAssetId: string | null;
    notes: string | null;
  },
  now: string = new Date().toISOString(),
): VoiceAsset {
  return createVoiceAsset(
    {
      name: input.name,
      text: input.text,
      durationMs: input.durationMs,
      rating: null,
      groupId: input.groupId,
      voiceProfileId: voiceProfile.id,
      source: "generated",
      sourceLabel: "Generated",
      provider: generated.provider,
      providerVoiceId: generated.providerVoiceId,
      model: generated.model,
      filePath: savedAudio.filePath,
      fileName: savedAudio.fileName,
      parentAssetId: input.parentAssetId,
      version: nextVoiceAssetVersion(existingAssets, input.parentAssetId),
      notes: input.notes,
    },
    now,
  );
}
