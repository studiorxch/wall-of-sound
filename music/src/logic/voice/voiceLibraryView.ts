import type {
  VoiceAsset,
  VoiceColumnId,
  VoiceGroup,
  VoiceLibraryFilters,
  VoiceProfile,
  VoiceSortKey,
} from "../../data/voiceLibraryTypes";

export interface VoiceFilterOption {
  id: string;
  label: string;
  colorToken: string | null;
  count: number;
}

export interface VoiceDisplayContext {
  groupNameById: Map<string, string>;
  voiceNameById: Map<string, string>;
}

export function buildVoiceDisplayContext(
  groups: VoiceGroup[],
  profiles: VoiceProfile[],
): VoiceDisplayContext {
  return {
    groupNameById: new Map(groups.map((group) => [group.id, group.name])),
    voiceNameById: new Map(profiles.map((profile) => [profile.id, profile.name])),
  };
}

function labelForGroup(asset: VoiceAsset, context: VoiceDisplayContext): string {
  return asset.groupId ? (context.groupNameById.get(asset.groupId) ?? "") : "";
}

function labelForVoice(asset: VoiceAsset, context: VoiceDisplayContext): string {
  return asset.voiceProfileId ? (context.voiceNameById.get(asset.voiceProfileId) ?? "") : "";
}

export function matchesVoiceSearch(
  asset: VoiceAsset,
  queryText: string,
  context: VoiceDisplayContext,
): boolean {
  const query = queryText.trim().toLowerCase();
  if (!query) return true;
  const haystack = [
    asset.name,
    asset.fileName,
    asset.text ?? "",
    labelForGroup(asset, context),
    labelForVoice(asset, context),
    asset.sourceLabel ?? "",
    asset.provider ?? "",
    asset.notes ?? "",
  ].join("\n").toLowerCase();
  return haystack.includes(query);
}

export function applyVoicePropertyFilters(
  assets: VoiceAsset[],
  filters: VoiceLibraryFilters,
): VoiceAsset[] {
  return assets.filter((asset) => {
    if (filters.groupIds.length > 0 && (!asset.groupId || !filters.groupIds.includes(asset.groupId))) return false;
    if (filters.voiceProfileIds.length > 0 && (!asset.voiceProfileId || !filters.voiceProfileIds.includes(asset.voiceProfileId))) return false;
    return true;
  });
}

export function filterVoiceAssets(
  assets: VoiceAsset[],
  queryText: string,
  filters: VoiceLibraryFilters,
  context: VoiceDisplayContext,
): VoiceAsset[] {
  return applyVoicePropertyFilters(assets, filters).filter((asset) => matchesVoiceSearch(asset, queryText, context));
}

function compareNullableNumber(a: number | null, b: number | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a - b;
}

function compareNullableString(a: string | null, b: string | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

export function sortValueForVoiceAsset(
  asset: VoiceAsset,
  columnId: Exclude<VoiceColumnId, "play">,
  context: VoiceDisplayContext,
): string | number | null {
  switch (columnId) {
    case "name": return asset.name;
    case "text": return asset.text;
    case "duration": return asset.durationMs;
    case "rating": return asset.rating;
    case "group": return labelForGroup(asset, context) || null;
    case "voice": return labelForVoice(asset, context) || null;
    case "source": return asset.sourceLabel ?? asset.source;
    case "version": return asset.version;
    case "provider": return asset.provider;
    case "model": return asset.model;
    case "created": return asset.createdAt;
    case "modified": return asset.updatedAt;
  }
}

export function applyVoiceSort(
  assets: VoiceAsset[],
  sort: VoiceSortKey | null,
  context: VoiceDisplayContext,
): VoiceAsset[] {
  if (!sort) return assets;
  const withIndex = assets.map((asset, index) => ({ asset, index }));
  withIndex.sort((left, right) => {
    const a = sortValueForVoiceAsset(left.asset, sort.columnId, context);
    const b = sortValueForVoiceAsset(right.asset, sort.columnId, context);
    let comparison: number;
    if (typeof a === "number" || typeof b === "number" || a == null || b == null) {
      comparison = compareNullableNumber(typeof a === "number" ? a : null, typeof b === "number" ? b : null);
    } else {
      comparison = compareNullableString(a, b);
    }
    if (comparison === 0) return left.index - right.index;
    return sort.direction === "asc" ? comparison : -comparison;
  });
  return withIndex.map((entry) => entry.asset);
}

export function cycleVoiceSort(
  current: VoiceSortKey | null,
  columnId: Exclude<VoiceColumnId, "play">,
): VoiceSortKey | null {
  if (!current || current.columnId !== columnId) return { columnId, direction: "asc" };
  if (current.direction === "asc") return { columnId, direction: "desc" };
  return null;
}

export function buildVoiceFilterOptions(
  assets: VoiceAsset[],
  groups: VoiceGroup[],
  profiles: VoiceProfile[],
): { groups: VoiceFilterOption[]; voices: VoiceFilterOption[] } {
  const groupCounts = new Map<string, number>();
  const voiceCounts = new Map<string, number>();
  for (const asset of assets) {
    if (asset.groupId) groupCounts.set(asset.groupId, (groupCounts.get(asset.groupId) ?? 0) + 1);
    if (asset.voiceProfileId) voiceCounts.set(asset.voiceProfileId, (voiceCounts.get(asset.voiceProfileId) ?? 0) + 1);
  }
  return {
    groups: groups
      .map((group) => ({ id: group.id, label: group.name, colorToken: group.colorToken, count: groupCounts.get(group.id) ?? 0 }))
      .filter((group) => group.count > 0),
    voices: profiles
      .map((profile) => ({ id: profile.id, label: profile.name, colorToken: profile.colorToken, count: voiceCounts.get(profile.id) ?? 0 }))
      .filter((profile) => profile.count > 0),
  };
}
