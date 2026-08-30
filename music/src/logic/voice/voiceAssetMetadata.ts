import type { VoiceAsset } from "../../data/voiceLibraryTypes";

export interface VoiceAssetMetadataInput {
  name: string;
  text: string;
}

export type VoiceAssetMetadataResult =
  | { ok: true; asset: VoiceAsset }
  | { ok: false; error: string };

/** Updates display metadata only; audio location, source, provider, and lineage remain immutable here. */
export function editVoiceAssetMetadata(
  asset: VoiceAsset,
  input: VoiceAssetMetadataInput,
  now: string = new Date().toISOString(),
): VoiceAssetMetadataResult {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Name is required." };

  return {
    ok: true,
    asset: {
      ...asset,
      name,
      text: input.text.trim() || null,
      updatedAt: now,
    },
  };
}

export function replaceVoiceAssetMetadata(
  assets: VoiceAsset[],
  assetId: string,
  input: VoiceAssetMetadataInput,
  now: string = new Date().toISOString(),
): VoiceAssetMetadataResult | null {
  const asset = assets.find((candidate) => candidate.id === assetId);
  if (!asset) return null;
  const result = editVoiceAssetMetadata(asset, input, now);
  if (!result.ok) return result;
  return { ok: true, asset: result.asset };
}
