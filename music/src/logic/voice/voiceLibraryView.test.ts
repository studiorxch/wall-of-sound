import { describe, expect, it } from "vitest";
import type { VoiceAsset, VoiceGroup, VoiceProfile } from "../../data/voiceLibraryTypes";
import {
  applyVoicePropertyFilters,
  applyVoiceSort,
  buildVoiceDisplayContext,
  buildVoiceFilterOptions,
  cycleVoiceSort,
  filterVoiceAssets,
  matchesVoiceSearch,
} from "./voiceLibraryView";

const NOW = "2026-08-29T12:00:00.000Z";

const GROUPS: VoiceGroup[] = [
  { id: "g1", name: "Subway", colorToken: "green", createdAt: NOW, updatedAt: NOW },
  { id: "g2", name: "Radio", colorToken: "amber", createdAt: NOW, updatedAt: NOW },
];

const PROFILES: VoiceProfile[] = [
  {
    id: "p1", name: "Conductor", colorToken: "sky", identity: null, customIdentityLabel: null,
    presentation: null, language: "en-US", provider: null, providerVoiceId: null, model: null, notes: null, createdAt: NOW, updatedAt: NOW,
  },
  {
    id: "p2", name: "Host", colorToken: "rose", identity: null, customIdentityLabel: null,
    presentation: null, language: "en-US", provider: null, providerVoiceId: null, model: null, notes: null, createdAt: NOW, updatedAt: NOW,
  },
];

const ASSETS: VoiceAsset[] = [
  {
    id: "a1", name: "Downtown Local", text: "Stand clear of the closing doors", durationMs: 3_000, rating: 5,
    groupId: "g1", voiceProfileId: "p1", source: "generated", sourceLabel: "Generated", provider: "macos-say",
    providerVoiceId: "Samantha", model: "macos-say", filePath: "voice/audio/downtown.wav", fileName: "downtown.wav",
    parentAssetId: null, version: 1, notes: "Rush hour", createdAt: "2026-08-28T09:00:00.000Z", updatedAt: "2026-08-29T09:00:00.000Z",
  },
  {
    id: "a2", name: "Night Service", text: null, durationMs: 1_500, rating: null,
    groupId: "g2", voiceProfileId: "p2", source: "imported", sourceLabel: "Firefly", provider: null,
    providerVoiceId: null, model: null, filePath: "voice/audio/night.wav", fileName: "night.wav",
    parentAssetId: null, version: 1, notes: "Late night PSA", createdAt: "2026-08-27T09:00:00.000Z", updatedAt: "2026-08-27T09:00:00.000Z",
  },
  {
    id: "a3", name: "Spare", text: "Static placeholder", durationMs: 2_000, rating: 3,
    groupId: "g1", voiceProfileId: null, source: "recorded", sourceLabel: "Recorded", provider: null,
    providerVoiceId: null, model: null, filePath: "voice/audio/spare.wav", fileName: "spare.wav",
    parentAssetId: null, version: 2, notes: null, createdAt: "2026-08-26T09:00:00.000Z", updatedAt: "2026-08-26T09:00:00.000Z",
  },
];

const CONTEXT = buildVoiceDisplayContext(GROUPS, PROFILES);

describe("matchesVoiceSearch", () => {
  it("matches transcript, group, voice, provider, filename, and notes fields", () => {
    expect(matchesVoiceSearch(ASSETS[0], "closing doors", CONTEXT)).toBe(true);
    expect(matchesVoiceSearch(ASSETS[0], "subway", CONTEXT)).toBe(true);
    expect(matchesVoiceSearch(ASSETS[0], "conductor", CONTEXT)).toBe(true);
    expect(matchesVoiceSearch(ASSETS[0], "macos-say", CONTEXT)).toBe(true);
    expect(matchesVoiceSearch(ASSETS[1], "night.wav", CONTEXT)).toBe(true);
    expect(matchesVoiceSearch(ASSETS[1], "psa", CONTEXT)).toBe(true);
    expect(matchesVoiceSearch(ASSETS[1], "missing", CONTEXT)).toBe(false);
  });
});

describe("applyVoicePropertyFilters / filterVoiceAssets", () => {
  it("supports group-only, voice-only, and combined group+voice filtering", () => {
    expect(applyVoicePropertyFilters(ASSETS, { groupIds: ["g1"], voiceProfileIds: [] }).map((asset) => asset.id)).toEqual(["a1", "a3"]);
    expect(applyVoicePropertyFilters(ASSETS, { groupIds: [], voiceProfileIds: ["p2"] }).map((asset) => asset.id)).toEqual(["a2"]);
    expect(filterVoiceAssets(ASSETS, "", { groupIds: ["g1"], voiceProfileIds: ["p1"] }, CONTEXT).map((asset) => asset.id)).toEqual(["a1"]);
  });

  it("layers free-text search on top of property filters", () => {
    const filtered = filterVoiceAssets(ASSETS, "static", { groupIds: ["g1"], voiceProfileIds: [] }, CONTEXT);
    expect(filtered.map((asset) => asset.id)).toEqual(["a3"]);
  });
});

describe("cycleVoiceSort", () => {
  it("cycles none -> asc -> desc -> none for the same column", () => {
    let key = cycleVoiceSort(null, "duration");
    expect(key).toEqual({ columnId: "duration", direction: "asc" });
    key = cycleVoiceSort(key, "duration");
    expect(key).toEqual({ columnId: "duration", direction: "desc" });
    key = cycleVoiceSort(key, "duration");
    expect(key).toBeNull();
  });
});

describe("applyVoiceSort", () => {
  it("sorts ascending and descending with nulls last and keeps stable tie ordering", () => {
    const byRatingAsc = applyVoiceSort(ASSETS, { columnId: "rating", direction: "asc" }, CONTEXT);
    expect(byRatingAsc.map((asset) => asset.id)).toEqual(["a3", "a1", "a2"]);

    const byModifiedDesc = applyVoiceSort(ASSETS, { columnId: "modified", direction: "desc" }, CONTEXT);
    expect(byModifiedDesc.map((asset) => asset.id)).toEqual(["a1", "a2", "a3"]);

    const tied = [
      { ...ASSETS[0], id: "t1", name: "Equal" },
      { ...ASSETS[0], id: "t2", name: "Equal" },
    ];
    const sorted = applyVoiceSort(tied, { columnId: "name", direction: "asc" }, CONTEXT);
    expect(sorted.map((asset) => asset.id)).toEqual(["t1", "t2"]);
  });
});

describe("buildVoiceFilterOptions", () => {
  it("counts only populated groups and profiles for filter menus", () => {
    const options = buildVoiceFilterOptions(ASSETS, GROUPS, PROFILES);
    expect(options.groups).toEqual([
      { id: "g1", label: "Subway", colorToken: "green", count: 2 },
      { id: "g2", label: "Radio", colorToken: "amber", count: 1 },
    ]);
    expect(options.voices).toEqual([
      { id: "p1", label: "Conductor", colorToken: "sky", count: 1 },
      { id: "p2", label: "Host", colorToken: "rose", count: 1 },
    ]);
  });
});
