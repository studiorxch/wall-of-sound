// 0718B_RADIO_Web_Publication_Asset_Export_Bridge — spec test 21: adding
// `radioWebExports` to the repair guard must be purely additive. A project
// saved before this build (real RadioLoop package bindings via
// legacyRadioLoopId, real 0718A RadioBanks/RadioDashboardReceipts, no
// radioWebExports field at all) must load with those records completely
// untouched and radioWebExports simply backfilled to an empty array —
// never dropped, never reset, never thrown on.

import { describe, it, expect } from "vitest";
import { repairStoredProject } from "./playProjectStorage";
import type { PlayProject } from "./playProjectTypes";
import type { RadioPlaylist } from "./radioPlaylistTypes";
import type { RadioInboxItem } from "./radioInboxTypes";
import type { RadioBank } from "./radioBankTypes";
import type { RadioDashboardReceipt } from "./radioDashboardReceiptTypes";
import type { RadioWebExportRecord } from "./radioWebBundleTypes";
import type { Track } from "./trackTypes";
import type { VoiceAsset, VoiceGroup, VoiceProfile } from "./voiceLibraryTypes";

const NOW = "2026-07-17T00:00:00.000Z";

function minimalProject(overrides: Partial<PlayProject> = {}): PlayProject {
  return {
    schemaVersion: "play-project-v2",
    libraryTracks: [],
    activePlaylistId: "",
    playlists: [],
    excludedTrackIds: [],
    ...overrides,
  } as PlayProject;
}

const PRE_0718B_RADIO_PLAYLIST: RadioPlaylist = {
  id: "radplaylist_1", title: "My Mix", version: "1", state: "PUBLISHED", entries: [],
  estimatedPublishBytes: 0, createdAt: NOW, updatedAt: NOW, publishedAt: NOW,
};

// A pre-0718B item carrying a real, already-published RadioLoop package
// binding — the exact "RadioLoop packages survive" fact this test proves.
const PRE_0718B_RADIO_INBOX_ITEM: RadioInboxItem = {
  id: "radinbox_1", kind: "loop", sourceFingerprint: "fp::1.00", state: "PUBLISHED",
  readiness: "READY", legacyRadioLoopId: "rloop_000001",
  assignedPlaylistIds: ["radplaylist_1"], createdAt: NOW, updatedAt: NOW,
};

const PRE_0718B_RADIO_BANK: RadioBank = {
  id: "radbank_1", title: "Field Recordings", state: "DRAFT", entries: [],
  createdAt: NOW, updatedAt: NOW,
} as RadioBank;

const PRE_0718B_RECEIPT: RadioDashboardReceipt = {
  id: "radreceipt_1", kind: "asset", targetId: "radinbox_1", receivedAt: NOW,
};

describe("repairStoredProject — 0718B radioWebExports addition", () => {
  it("backfills a missing radioWebExports to an empty array on a pre-0718B project", () => {
    const legacy = minimalProject({
      radioPlaylists: [PRE_0718B_RADIO_PLAYLIST],
      radioInboxItems: [PRE_0718B_RADIO_INBOX_ITEM],
      radioBanks: [PRE_0718B_RADIO_BANK],
      radioDashboardReceipts: [PRE_0718B_RECEIPT],
    });
    // Simulate a real pre-0718B saved project, which never had this field.
    delete (legacy as Partial<PlayProject>).radioWebExports;

    const repaired = repairStoredProject(legacy);

    expect(repaired.radioWebExports).toEqual([]);
  });

  it("never touches pre-existing RadioLoop package bindings, RadioPlaylists, RadioBanks, or RadioDashboardReceipts", () => {
    const legacy = minimalProject({
      radioPlaylists: [PRE_0718B_RADIO_PLAYLIST],
      radioInboxItems: [PRE_0718B_RADIO_INBOX_ITEM],
      radioBanks: [PRE_0718B_RADIO_BANK],
      radioDashboardReceipts: [PRE_0718B_RECEIPT],
    });
    delete (legacy as Partial<PlayProject>).radioWebExports;

    const repaired = repairStoredProject(legacy);

    expect(repaired.radioPlaylists).toEqual([PRE_0718B_RADIO_PLAYLIST]);
    expect(repaired.radioInboxItems).toEqual([PRE_0718B_RADIO_INBOX_ITEM]);
    expect(repaired.radioInboxItems?.[0].legacyRadioLoopId).toBe("rloop_000001");
    expect(repaired.radioBanks).toEqual([PRE_0718B_RADIO_BANK]);
    expect(repaired.radioDashboardReceipts).toEqual([PRE_0718B_RECEIPT]);
  });

  it("preserves an existing, real radioWebExports array unchanged (idempotent, not reset)", () => {
    const record: RadioWebExportRecord = {
      id: "radweb_1", radioPlaylistId: "radplaylist_1", slug: "my-mix", bundleVersion: 1,
      exportedAt: NOW, contentSignature: "sig1", totalByteSize: 4_200_000, totalDurationSeconds: 210,
      entryCount: 1, validation: { ok: true, checkedAt: NOW }, exportPath: "/library/music/RadioWebExports/my-mix/v1",
    };
    const project = minimalProject({ radioWebExports: [record] });

    const repaired = repairStoredProject(project);

    expect(repaired.radioWebExports).toEqual([record]);
  });

  it("repairs a malformed (non-array) radioWebExports to an empty array rather than throwing", () => {
    const corrupted = minimalProject();
    (corrupted as unknown as Record<string, unknown>).radioWebExports = "not-an-array";

    const repaired = repairStoredProject(corrupted);

    expect(repaired.radioWebExports).toEqual([]);
  });
});

// MUSIC P0 Clean Library Foundation — Step C (0826B): interrupted-analysis
// recovery. A track left in "queued"/"analyzing" by a batch that never
// finished (crash/restart/tab close) must load back to "not_analyzed", never
// stay permanently stuck — since the in-memory in-flight guard
// (App.tsx's dspInFlightRef) is always empty on a fresh load, ANY track
// found in one of these two transient states at load time is, by
// definition, orphaned from a previous session.
function trackWith(overrides: Partial<Track> & { trackId: string }): Track {
  return {
    title: "T", artist: "A", durationSeconds: 100, energy: 0.5, energySource: "manual",
    sourceOwner: "studiorich",
    ...overrides,
  } as Track;
}

describe("repairStoredProject — Step C interrupted-analysis recovery", () => {
  it("resets a track stuck in 'queued' back to not_analyzed", () => {
    const project = minimalProject({ libraryTracks: [trackWith({ trackId: "t1", analysisStatus: "queued" })] });
    const repaired = repairStoredProject(project);
    expect(repaired.libraryTracks[0].analysisStatus).toBe("not_analyzed");
  });

  it("resets a track stuck in 'analyzing' back to not_analyzed", () => {
    const project = minimalProject({ libraryTracks: [trackWith({ trackId: "t1", analysisStatus: "analyzing" })] });
    const repaired = repairStoredProject(project);
    expect(repaired.libraryTracks[0].analysisStatus).toBe("not_analyzed");
  });

  it("never touches a track already in a terminal analysis state", () => {
    for (const status of ["not_analyzed", "analyzed", "partial", "stale", "review_needed", "failed"] as const) {
      const project = minimalProject({ libraryTracks: [trackWith({ trackId: "t1", analysisStatus: status })] });
      const repaired = repairStoredProject(project);
      expect(repaired.libraryTracks[0].analysisStatus).toBe(status);
    }
  });

  it("does not disturb notes/labels/assets on a recovered track — purely a status reset", () => {
    const project = minimalProject({
      libraryTracks: [trackWith({
        trackId: "t1", analysisStatus: "analyzing",
        notes: "great track", labels: ["Episode 2"],
        assets: [{ assetId: "a1", format: "wav", fileName: "t.wav", filePath: "t.wav", checksum: null, sourceOwner: "studiorich", addedAt: "" }],
      })],
    });
    const repaired = repairStoredProject(project);
    const t = repaired.libraryTracks[0];
    expect(t.analysisStatus).toBe("not_analyzed");
    expect(t.notes).toBe("great track");
    expect(t.labels).toEqual(["Episode 2"]);
    expect(t.assets).toHaveLength(1);
  });
});

const VOICE_GROUP: VoiceGroup = {
  id: "voice_group_1",
  name: "Radio",
  colorToken: "amber",
  createdAt: NOW,
  updatedAt: NOW,
};

const VOICE_PROFILE: VoiceProfile = {
  id: "voice_profile_1",
  name: "Host",
  colorToken: "sky",
  identity: "woman",
  customIdentityLabel: null,
  presentation: "neutral",
  language: "en-US",
  provider: null,
  providerVoiceId: null,
  model: null,
  notes: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const VOICE_ASSET: VoiceAsset = {
  id: "voice_asset_1",
  name: "Station ID",
  text: "Welcome aboard.",
  durationMs: 1800,
  rating: 4,
  groupId: VOICE_GROUP.id,
  voiceProfileId: VOICE_PROFILE.id,
  source: "generated",
  sourceLabel: "Generated",
  provider: "macos-say",
  providerVoiceId: "Samantha",
  model: "macos-say",
  filePath: "voice/audio/station-id.wav",
  fileName: "station-id.wav",
  parentAssetId: null,
  version: 1,
  notes: "Live ready",
  createdAt: NOW,
  updatedAt: NOW,
};

describe("repairStoredProject — 0829 VOICE library addition", () => {
  it("backfills missing VOICE collections and preferences without disturbing the rest of the project", () => {
    const legacy = minimalProject();
    delete (legacy as Partial<PlayProject>).voiceAssets;
    delete (legacy as Partial<PlayProject>).voiceGroups;
    delete (legacy as Partial<PlayProject>).voiceProfiles;
    delete (legacy as Partial<PlayProject>).voiceLibraryPreferences;

    const repaired = repairStoredProject(legacy);

    expect(repaired.voiceAssets).toEqual([]);
    expect(repaired.voiceProfiles).toEqual([]);
    expect(repaired.voiceGroups?.length).toBeGreaterThan(0);
    expect(repaired.voiceLibraryPreferences?.columnOrder.length).toBeGreaterThan(0);
  });

  it("preserves valid existing VOICE records and repairs invalid references to null", () => {
    const project = minimalProject({
      voiceAssets: [
        VOICE_ASSET,
        {
          ...VOICE_ASSET,
          id: "voice_asset_2",
          groupId: "missing-group",
          voiceProfileId: "missing-profile",
          parentAssetId: "missing-parent",
        },
      ],
      voiceGroups: [VOICE_GROUP],
      voiceProfiles: [VOICE_PROFILE],
      voiceLibraryPreferences: {
        version: 1,
        columnOrder: ["source", "name", "play"],
        columns: [
          { id: "source", visible: true },
          { id: "name", visible: false },
          { id: "play", visible: false },
        ],
        sort: { columnId: "source", direction: "asc" },
        filters: { groupIds: [VOICE_GROUP.id], voiceProfileIds: [VOICE_PROFILE.id] },
        updatedAt: NOW,
      },
    });

    const repaired = repairStoredProject(project);

    expect(repaired.voiceAssets?.[0]).toEqual(VOICE_ASSET);
    expect(repaired.voiceAssets?.[1].groupId).toBeNull();
    expect(repaired.voiceAssets?.[1].voiceProfileId).toBeNull();
    expect(repaired.voiceAssets?.[1].parentAssetId).toBeNull();
    expect(repaired.voiceLibraryPreferences?.columns.find((column) => column.id === "name")?.visible).toBe(true);
    expect(repaired.voiceLibraryPreferences?.columns.find((column) => column.id === "play")?.visible).toBe(true);
  });
});
