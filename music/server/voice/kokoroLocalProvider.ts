import type { SpeechProviderDescriptor, SpeechProviderVoiceOption, SpeechProviderVoicePresentation } from "../../src/data/voiceLibraryTypes";

export const KOKORO_LOCAL_PROVIDER_ID = "kokoro-local";
export const KOKORO_LOCAL_BASE_URL = process.env.KOKORO_LOCAL_BASE_URL ?? "http://127.0.0.1:8880";

type FetchLike = typeof fetch;

interface KokoroVoiceDefinition {
  id: string;
  language: string;
  presentation: SpeechProviderVoicePresentation;
}

// Kokoro's identifiers encode language and presentation. This explicit catalog avoids name-based inference.
const KOKORO_VOICE_CATALOG: KokoroVoiceDefinition[] = [
  ...["alloy", "aoede", "bella", "heart", "jessica", "kore", "nicole", "nova", "river", "sarah", "sky"].map((name) => ({ id: `af_${name}`, language: "en_US", presentation: "female" as const })),
  ...["adam", "echo", "eric", "fenrir", "liam", "michael", "onyx", "puck", "santa"].map((name) => ({ id: `am_${name}`, language: "en_US", presentation: "male" as const })),
  ...["alice", "emma", "isabella", "lily"].map((name) => ({ id: `bf_${name}`, language: "en_GB", presentation: "female" as const })),
  ...["daniel", "fable", "george", "lewis", "winston"].map((name) => ({ id: `bm_${name}`, language: "en_GB", presentation: "male" as const })),
  { id: "ef_dora", language: "es_ES", presentation: "female" }, { id: "em_alex", language: "es_ES", presentation: "male" }, { id: "em_santa", language: "es_ES", presentation: "male" },
  { id: "ff_siwis", language: "fr_FR", presentation: "female" },
  { id: "hf_alpha", language: "hi_IN", presentation: "female" }, { id: "hf_beta", language: "hi_IN", presentation: "female" }, { id: "hm_omega", language: "hi_IN", presentation: "male" }, { id: "hm_psi", language: "hi_IN", presentation: "male" },
  { id: "if_sara", language: "it_IT", presentation: "female" }, { id: "im_nicola", language: "it_IT", presentation: "male" },
  ...["alpha", "gongitsune", "nezumi", "tebukuro"].map((name) => ({ id: `jf_${name}`, language: "ja_JP", presentation: "female" as const })),
  { id: "jm_kumo", language: "ja_JP", presentation: "male" },
  { id: "pf_dora", language: "pt_BR", presentation: "female" }, { id: "pm_alex", language: "pt_BR", presentation: "male" }, { id: "pm_santa", language: "pt_BR", presentation: "male" },
  ...["xiaobei", "xiaoni", "xiaoxiao", "xiaoyi"].map((name) => ({ id: `zf_${name}`, language: "zh_CN", presentation: "female" as const })),
  ...["yunjian", "yunxi", "yunxia", "yunyang"].map((name) => ({ id: `zm_${name}`, language: "zh_CN", presentation: "male" as const })),
];

function titleCase(value: string): string {
  return value.replace(/(^|[_-])(\w)/g, (_whole, separator: string, character: string) => `${separator ? " " : ""}${character.toUpperCase()}`);
}

function kokoroUrl(path: string): string {
  return `${KOKORO_LOCAL_BASE_URL.replace(/\/$/, "")}${path}`;
}

async function readKokoroError(response: Response): Promise<string> {
  const body = await response.text().catch(() => "");
  return body || `HTTP ${response.status}`;
}

export async function getKokoroLocalProviderDescriptor(fetchImpl: FetchLike = fetch): Promise<SpeechProviderDescriptor> {
  try {
    const response = await fetchImpl(kokoroUrl("/health"), { signal: AbortSignal.timeout(1_500) });
    if (!response.ok) {
      return { id: KOKORO_LOCAL_PROVIDER_ID, displayName: "Kokoro Local", available: false, reasonUnavailable: `Local Kokoro service responded HTTP ${response.status}.` };
    }
    const payload = await response.json().catch(() => ({})) as { status?: string };
    if (payload.status && payload.status !== "ok") {
      return { id: KOKORO_LOCAL_PROVIDER_ID, displayName: "Kokoro Local", available: false, reasonUnavailable: `Local Kokoro service is ${payload.status}.` };
    }
    return { id: KOKORO_LOCAL_PROVIDER_ID, displayName: "Kokoro Local", available: true, previewText: "StudioRich VOICE library. Your next sound begins here." };
  } catch {
    return { id: KOKORO_LOCAL_PROVIDER_ID, displayName: "Kokoro Local", available: false, reasonUnavailable: "Local Kokoro service is not running at http://127.0.0.1:8880." };
  }
}

export function listKokoroLocalVoices(): SpeechProviderVoiceOption[] {
  return KOKORO_VOICE_CATALOG.map((voice) => ({
    id: voice.id,
    label: titleCase(voice.id.slice(3)),
    language: voice.language,
    presentation: voice.presentation,
  }));
}

export async function generateKokoroLocalSpeech(
  text: string,
  providerVoiceId: string | null,
  fetchImpl: FetchLike = fetch,
): Promise<{ mimeType: string; data: Buffer; providerVoiceId: string | null; model: string | null }> {
  const response = await fetchImpl(kokoroUrl("/v1/audio/speech"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "kokoro", voice: providerVoiceId ?? "af_heart", input: text, response_format: "wav" }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error(`Kokoro Local generation failed: ${await readKokoroError(response)}`);
  return {
    mimeType: response.headers.get("Content-Type") ?? "audio/wav",
    data: Buffer.from(await response.arrayBuffer()),
    providerVoiceId: providerVoiceId ?? "af_heart",
    model: "kokoro-82m-local",
  };
}
