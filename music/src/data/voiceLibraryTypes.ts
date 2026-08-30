export type VoiceAssetSource =
  | "generated"
  | "imported"
  | "ableton"
  | "firefly"
  | "recorded"
  | "other";

export interface VoiceAsset {
  id: string;
  name: string;
  text: string | null;
  durationMs: number;
  rating: number | null;
  groupId: string | null;
  voiceProfileId: string | null;
  source: VoiceAssetSource;
  sourceLabel: string | null;
  provider: string | null;
  providerVoiceId: string | null;
  model: string | null;
  filePath: string;
  fileName: string;
  parentAssetId: string | null;
  version: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VoiceGroup {
  id: string;
  name: string;
  colorToken: string | null;
  createdAt: string;
  updatedAt: string;
}

export type VoiceIdentity =
  | "woman"
  | "man"
  | "non-binary"
  | "agender"
  | "unspecified"
  | "custom";

export type VoicePresentation =
  | "feminine"
  | "masculine"
  | "neutral"
  | "androgynous"
  | "synthetic"
  | "unspecified";

export interface VoiceProfile {
  id: string;
  name: string;
  colorToken: string | null;
  identity: VoiceIdentity | null;
  customIdentityLabel: string | null;
  presentation: VoicePresentation | null;
  language: string | null;
  provider: string | null;
  providerVoiceId: string | null;
  model: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export type VoiceColumnId =
  | "play"
  | "name"
  | "text"
  | "duration"
  | "rating"
  | "group"
  | "voice"
  | "source"
  | "version"
  | "provider"
  | "model"
  | "created"
  | "modified";

export interface VoiceColumnPreference {
  id: VoiceColumnId;
  visible: boolean;
}

export type VoiceSortDirection = "asc" | "desc";

export interface VoiceSortKey {
  columnId: Exclude<VoiceColumnId, "play">;
  direction: VoiceSortDirection;
}

export interface VoiceLibraryFilters {
  groupIds: string[];
  voiceProfileIds: string[];
}

export interface VoiceLibraryPreferences {
  version: number;
  columnOrder: VoiceColumnId[];
  columns: VoiceColumnPreference[];
  sort: VoiceSortKey | null;
  filters: VoiceLibraryFilters;
  updatedAt: string;
}

export interface SpeechGenerationRequest {
  text: string;
  voiceProfileId: string;
}

export interface GeneratedSpeech {
  audioData: ArrayBuffer | Blob;
  mimeType: string;
  provider: string;
  providerVoiceId: string | null;
  model: string | null;
}

export interface SpeechProviderDescriptor {
  id: string;
  displayName: string;
  available: boolean;
  reasonUnavailable?: string | null;
  previewText?: string | null;
}

/** Provider-supplied metadata. "unknown" is intentional: presentation is never inferred from names. */
export type SpeechProviderVoicePresentation = "female" | "male" | "neutral_other" | "unknown";

export const VOICE_PROVIDER_PREVIEW_ROUTE = "/voice-generation/preview";

export interface SpeechProviderVoiceOption {
  id: string;
  label: string;
  language: string | null;
  description?: string | null;
  sampleText?: string | null;
  presentation?: SpeechProviderVoicePresentation;
}

export interface GeneratedSpeechResult extends Omit<GeneratedSpeech, "audioData"> {
  audioData: Blob;
}
