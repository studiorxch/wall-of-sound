import type { VoiceAsset } from "../../data/voiceLibraryTypes";

export interface VoiceDeletionResult {
  assets: VoiceAsset[];
  removedIds: string[];
  detachedChildIds: string[];
}

export function applyVoiceAssetDeletion(
  assets: VoiceAsset[],
  removeIds: string[],
): VoiceDeletionResult {
  const removeSet = new Set(removeIds);
  const detachedChildIds: string[] = [];
  const remaining = assets
    .filter((asset) => !removeSet.has(asset.id))
    .map((asset) => {
      if (asset.parentAssetId && removeSet.has(asset.parentAssetId)) {
        detachedChildIds.push(asset.id);
        return { ...asset, parentAssetId: null };
      }
      return asset;
    });
  return {
    assets: remaining,
    removedIds: assets.filter((asset) => removeSet.has(asset.id)).map((asset) => asset.id),
    detachedChildIds,
  };
}
