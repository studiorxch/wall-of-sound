import type {
  VoiceAsset,
  VoiceColumnId,
  VoiceGroup,
  VoiceLibraryPreferences,
  VoiceProfile,
} from "../../data/voiceLibraryTypes";

export interface VoiceColumnDef {
  id: VoiceColumnId;
  label: string;
  sortable: boolean;
  filterable: boolean;
  defaultVisible: boolean;
  required: boolean;
}

export const VOICE_LIBRARY_PREFERENCES_VERSION = 1;

export const VOICE_COLUMN_REGISTRY: VoiceColumnDef[] = [
  { id: "play", label: "Play", sortable: false, filterable: false, defaultVisible: true, required: true },
  { id: "name", label: "Name", sortable: true, filterable: false, defaultVisible: true, required: true },
  { id: "text", label: "Text", sortable: true, filterable: false, defaultVisible: true, required: true },
  { id: "duration", label: "Duration", sortable: true, filterable: false, defaultVisible: true, required: true },
  { id: "rating", label: "Rating", sortable: true, filterable: false, defaultVisible: true, required: true },
  { id: "group", label: "Group", sortable: true, filterable: true, defaultVisible: true, required: true },
  { id: "voice", label: "Voice", sortable: true, filterable: true, defaultVisible: true, required: true },
  { id: "source", label: "Source", sortable: true, filterable: false, defaultVisible: false, required: false },
  { id: "version", label: "Version", sortable: true, filterable: false, defaultVisible: false, required: false },
  { id: "provider", label: "Provider", sortable: true, filterable: false, defaultVisible: false, required: false },
  { id: "model", label: "Model", sortable: true, filterable: false, defaultVisible: false, required: false },
  { id: "created", label: "Created", sortable: true, filterable: false, defaultVisible: false, required: false },
  { id: "modified", label: "Modified", sortable: true, filterable: false, defaultVisible: false, required: false },
];

const COLUMN_BY_ID = new Map(VOICE_COLUMN_REGISTRY.map((column) => [column.id, column]));

export const DEFAULT_VOICE_GROUPS: ReadonlyArray<Pick<VoiceGroup, "name" | "colorToken">> = [
  { name: "Podcast", colorToken: "sky" },
  { name: "Radio", colorToken: "amber" },
  { name: "Subway", colorToken: "green" },
  { name: "Experiment", colorToken: "rose" },
  { name: "Narration", colorToken: "slate" },
  { name: "Promo", colorToken: "violet" },
  { name: "Resident", colorToken: "teal" },
];

export const VOICE_COLOR_TOKENS = [
  "slate",
  "sky",
  "amber",
  "green",
  "rose",
  "violet",
  "teal",
  "orange",
  "blue",
  "pink",
] as const;

export type VoiceColorToken = (typeof VOICE_COLOR_TOKENS)[number];

function nowIso(): string {
  return new Date().toISOString();
}

function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultVoiceLibraryPreferences(now: string = nowIso()): VoiceLibraryPreferences {
  return {
    version: VOICE_LIBRARY_PREFERENCES_VERSION,
    columnOrder: VOICE_COLUMN_REGISTRY.map((column) => column.id),
    columns: VOICE_COLUMN_REGISTRY.map((column) => ({ id: column.id, visible: column.defaultVisible })),
    sort: { columnId: "modified", direction: "desc" },
    filters: { groupIds: [], voiceProfileIds: [] },
    updatedAt: now,
  };
}

export function reconcileVoiceLibraryPreferences(
  stored: unknown,
  now: string = nowIso(),
): VoiceLibraryPreferences {
  if (!stored || typeof stored !== "object") return defaultVoiceLibraryPreferences(now);
  const raw = stored as Partial<VoiceLibraryPreferences>;
  const seen = new Set<VoiceColumnId>();
  const order: VoiceColumnId[] = [];
  if (Array.isArray(raw.columnOrder)) {
    for (const id of raw.columnOrder) {
      if (COLUMN_BY_ID.has(id) && !seen.has(id)) {
        order.push(id);
        seen.add(id);
      }
    }
  }
  for (const column of VOICE_COLUMN_REGISTRY) {
    if (!seen.has(column.id)) order.push(column.id);
  }
  const columns = order.map((id) => {
    const storedPreference = Array.isArray(raw.columns) ? raw.columns.find((column) => column?.id === id) : undefined;
    const definition = COLUMN_BY_ID.get(id);
    return {
      id,
      visible: definition?.required
        ? true
        : (typeof storedPreference?.visible === "boolean" ? storedPreference.visible : (definition?.defaultVisible ?? true)),
    };
  });
  const sort = raw.sort && COLUMN_BY_ID.has(raw.sort.columnId)
    && (raw.sort.direction === "asc" || raw.sort.direction === "desc")
    ? raw.sort
    : defaultVoiceLibraryPreferences(now).sort;
  const groupIds = Array.isArray(raw.filters?.groupIds) ? raw.filters.groupIds.filter((id): id is string => typeof id === "string") : [];
  const voiceProfileIds = Array.isArray(raw.filters?.voiceProfileIds)
    ? raw.filters.voiceProfileIds.filter((id): id is string => typeof id === "string")
    : [];
  return {
    version: VOICE_LIBRARY_PREFERENCES_VERSION,
    columnOrder: order,
    columns,
    sort,
    filters: { groupIds, voiceProfileIds },
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : now,
  };
}

export function createVoiceGroup(
  input: { name: string; colorToken: string | null },
  now: string = nowIso(),
): VoiceGroup {
  return {
    id: createId("voice_group"),
    name: input.name.trim(),
    colorToken: input.colorToken,
    createdAt: now,
    updatedAt: now,
  };
}

export function createDefaultVoiceGroups(now: string = nowIso()): VoiceGroup[] {
  return DEFAULT_VOICE_GROUPS.map((group) => createVoiceGroup(group, now));
}

export function createVoiceProfile(
  input: Omit<VoiceProfile, "id" | "createdAt" | "updatedAt">,
  now: string = nowIso(),
): VoiceProfile {
  return {
    ...input,
    name: input.name.trim(),
    id: createId("voice_profile"),
    createdAt: now,
    updatedAt: now,
  };
}

export function createVoiceAsset(
  input: Omit<VoiceAsset, "id" | "createdAt" | "updatedAt">,
  now: string = nowIso(),
): VoiceAsset {
  return {
    ...input,
    name: input.name.trim(),
    id: createId("voice_asset"),
    createdAt: now,
    updatedAt: now,
  };
}

export function nextVoiceAssetVersion(
  assets: VoiceAsset[],
  parentAssetId: string | null,
): number {
  if (!parentAssetId) return 1;
  const related = assets.filter((asset) => asset.id === parentAssetId || asset.parentAssetId === parentAssetId);
  const highest = related.reduce((max, asset) => Math.max(max, asset.version), 0);
  return highest + 1;
}

export function validateVoiceReferences(
  assets: VoiceAsset[],
  groups: VoiceGroup[],
  profiles: VoiceProfile[],
): VoiceAsset[] {
  const groupIds = new Set(groups.map((group) => group.id));
  const profileIds = new Set(profiles.map((profile) => profile.id));
  const assetIds = new Set(assets.map((asset) => asset.id));
  return assets.map((asset) => ({
    ...asset,
    groupId: asset.groupId && groupIds.has(asset.groupId) ? asset.groupId : null,
    voiceProfileId: asset.voiceProfileId && profileIds.has(asset.voiceProfileId) ? asset.voiceProfileId : null,
    parentAssetId: asset.parentAssetId && assetIds.has(asset.parentAssetId) ? asset.parentAssetId : null,
  }));
}
