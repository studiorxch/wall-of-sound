import { describe, expect, it } from "vitest";
import type { VoiceAsset, VoiceGroup, VoiceProfile } from "../../data/voiceLibraryTypes";
import {
  DEFAULT_VOICE_GROUPS,
  VOICE_COLUMN_REGISTRY,
  createDefaultVoiceGroups,
  createVoiceAsset,
  createVoiceProfile,
  defaultVoiceLibraryPreferences,
  nextVoiceAssetVersion,
  reconcileVoiceLibraryPreferences,
  validateVoiceReferences,
} from "./voiceLibraryState";

const NOW = "2026-08-29T12:00:00.000Z";

function group(id: string, name: string): VoiceGroup {
  return { id, name, colorToken: "sky", createdAt: NOW, updatedAt: NOW };
}

function profile(id: string, name: string): VoiceProfile {
  return {
    id,
    name,
    colorToken: "amber",
    identity: null,
    customIdentityLabel: null,
    presentation: null,
    language: null,
    provider: null,
    providerVoiceId: null,
    model: null,
    notes: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function asset(id: string, overrides: Partial<VoiceAsset> = {}): VoiceAsset {
  return {
    id,
    name: `Asset ${id}`,
    text: null,
    durationMs: 1_000,
    rating: null,
    groupId: null,
    voiceProfileId: null,
    source: "imported",
    sourceLabel: "Imported",
    provider: null,
    providerVoiceId: null,
    model: null,
    filePath: `voice/audio/${id}.wav`,
    fileName: `${id}.wav`,
    parentAssetId: null,
    version: 1,
    notes: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

describe("defaultVoiceLibraryPreferences", () => {
  it("seeds every known column in registry order and keeps required columns visible", () => {
    const prefs = defaultVoiceLibraryPreferences(NOW);
    expect(prefs.columnOrder).toEqual(VOICE_COLUMN_REGISTRY.map((column) => column.id));
    for (const column of VOICE_COLUMN_REGISTRY.filter((item) => item.required)) {
      expect(prefs.columns.find((item) => item.id === column.id)?.visible).toBe(true);
    }
    expect(prefs.sort).toEqual({ columnId: "modified", direction: "desc" });
  });
});

describe("reconcileVoiceLibraryPreferences", () => {
  it("drops unknown columns, restores missing columns, and forces required columns visible", () => {
    const prefs = reconcileVoiceLibraryPreferences({
      columnOrder: ["group", "unknown", "name", "play", "group"],
      columns: [
        { id: "group", visible: true },
        { id: "name", visible: false },
        { id: "play", visible: false },
        { id: "source", visible: true },
      ],
      sort: { columnId: "source", direction: "asc" },
      filters: { groupIds: ["g1"], voiceProfileIds: ["p1"] },
      updatedAt: NOW,
    }, NOW);

    expect(prefs.columnOrder).toEqual(["group", "name", "play", "text", "duration", "rating", "voice", "source", "version", "provider", "model", "created", "modified"]);
    expect(prefs.columns.find((item) => item.id === "name")?.visible).toBe(true);
    expect(prefs.columns.find((item) => item.id === "play")?.visible).toBe(true);
    expect(prefs.columns.find((item) => item.id === "source")?.visible).toBe(true);
    expect(prefs.sort).toEqual({ columnId: "source", direction: "asc" });
    expect(prefs.filters).toEqual({ groupIds: ["g1"], voiceProfileIds: ["p1"] });
  });

  it("falls back to defaults for malformed input", () => {
    const prefs = reconcileVoiceLibraryPreferences("bad-input", NOW);
    expect(prefs).toEqual(defaultVoiceLibraryPreferences(NOW));
  });
});

describe("createDefaultVoiceGroups", () => {
  it("seeds the default reusable VOICE groups without using color as identity", () => {
    const groups = createDefaultVoiceGroups(NOW);
    expect(groups).toHaveLength(DEFAULT_VOICE_GROUPS.length);
    expect(groups.map((item) => item.name)).toEqual(DEFAULT_VOICE_GROUPS.map((item) => item.name));
    expect(new Set(groups.map((item) => item.id)).size).toBe(groups.length);
  });
});

describe("createVoiceProfile / createVoiceAsset", () => {
  it("creates trimmed reusable profile and asset records with timestamps", () => {
    const createdProfile = createVoiceProfile({
      name: "  Narrator  ",
      colorToken: "rose",
      identity: "woman",
      customIdentityLabel: null,
      presentation: "neutral",
      language: "en-US",
      provider: null,
      providerVoiceId: null,
      model: null,
      notes: null,
    }, NOW);
    const createdAsset = createVoiceAsset({
      name: "  Station ID  ",
      text: "Downtown local arriving",
      durationMs: 2_500,
      rating: 4,
      groupId: null,
      voiceProfileId: createdProfile.id,
      source: "generated",
      sourceLabel: "Generated",
      provider: "macos-say",
      providerVoiceId: "Samantha",
      model: "macos-say",
      filePath: "voice/audio/station-id.wav",
      fileName: "station-id.wav",
      parentAssetId: null,
      version: 1,
      notes: "trim me",
    }, NOW);
    expect(createdProfile.name).toBe("Narrator");
    expect(createdProfile.createdAt).toBe(NOW);
    expect(createdAsset.name).toBe("Station ID");
    expect(createdAsset.voiceProfileId).toBe(createdProfile.id);
    expect(createdAsset.updatedAt).toBe(NOW);
  });
});

describe("nextVoiceAssetVersion", () => {
  it("returns 1 for a new root asset and increments across an existing lineage", () => {
    const assets = [
      asset("root", { version: 1 }),
      asset("child", { parentAssetId: "root", version: 2 }),
      asset("sibling", { parentAssetId: "root", version: 4 }),
    ];
    expect(nextVoiceAssetVersion(assets, null)).toBe(1);
    expect(nextVoiceAssetVersion(assets, "root")).toBe(5);
  });
});

describe("validateVoiceReferences", () => {
  it("nulls invalid group, profile, and parent references without touching valid ones", () => {
    const groups = [group("g1", "Radio")];
    const profiles = [profile("p1", "Host")];
    const assets = [
      asset("a1", { groupId: "g1", voiceProfileId: "p1" }),
      asset("a2", { groupId: "missing-group", voiceProfileId: "missing-profile", parentAssetId: "missing-parent" }),
    ];

    const validated = validateVoiceReferences(assets, groups, profiles);

    expect(validated[0].groupId).toBe("g1");
    expect(validated[0].voiceProfileId).toBe("p1");
    expect(validated[1].groupId).toBeNull();
    expect(validated[1].voiceProfileId).toBeNull();
    expect(validated[1].parentAssetId).toBeNull();
  });
});
