import { describe, it, expect } from "vitest";
import { resolveRadioExportDjTransitions } from "./radioDjTransitionBridge";
import type { RadioPlaylist } from "../../data/radioPlaylistTypes";
import type { PlaylistRecord } from "../../data/playProjectTypes";
import type { Track } from "../../data/trackTypes";
import type { DjTransitionPlan } from "../../data/djTransitionTypes";

function makeRadioPlaylist(overrides: Partial<RadioPlaylist> = {}): RadioPlaylist {
  return {
    id: "radplaylist_1",
    sourceMusicPlaylistId: "music_pl_1",
    title: "Station",
    version: "1",
    state: "DRAFT",
    entries: [],
    estimatedPublishBytes: 0,
    createdAt: "2026-08-07T00:00:00.000Z",
    updatedAt: "2026-08-07T00:00:00.000Z",
    ...overrides,
  };
}

function makeSourcePlaylist(overrides: Partial<PlaylistRecord> = {}): PlaylistRecord {
  return {
    playlistId: "music_pl_1",
    title: "Friday Set",
    slots: [
      { slotId: "slot_0", slotIndex: 0, assignedTrackId: "t1", startTimeSeconds: 0, targetEnergy: 0.5, targetBpm: 120, warningLevel: "none", warningMessages: [] },
      { slotId: "slot_1", slotIndex: 1, assignedTrackId: "t2", startTimeSeconds: 180, targetEnergy: 0.5, targetBpm: 120, warningLevel: "none", warningMessages: [] },
      { slotId: "slot_2", slotIndex: 2, assignedTrackId: "t3", startTimeSeconds: 360, targetEnergy: 0.5, targetBpm: 120, warningLevel: "none", warningMessages: [] },
    ],
    curve: {} as PlaylistRecord["curve"],
    locks: [],
    orphans: [],
    targetDurationMinutes: 10,
    createdAt: "2026-08-07T00:00:00.000Z",
    updatedAt: "2026-08-07T00:00:00.000Z",
    ...overrides,
  } as PlaylistRecord;
}

function makeTrack(trackId: string, sourceFingerprint: string): Track {
  return {
    trackId,
    title: trackId,
    artist: "Artist",
    durationSeconds: 180,
    energy: 0.5,
    energySource: "manual",
    sourceOwner: "studiorich",
    genres: [],
    moodTags: [],
    moodSuggestions: [],
    sourcePoolIds: [],
    grouping: "",
    albumArtist: "",
    archiveStatus: "library",
    playbackBounds: {
      version: "playback-bounds-v1",
      sourceFingerprint,
      sourceDurationSeconds: 180,
      audibleStartSeconds: 0,
      preferredStartSeconds: 0,
      preferredEndSeconds: 180,
      audibleEndSeconds: 180,
      leadingSilenceSeconds: 0,
      trailingSilenceSeconds: 0,
      effectiveDurationSeconds: 180,
      startClassification: "musical_intro",
      endClassification: "musical_outro",
      startConfidence: 1,
      endConfidence: 1,
      overallConfidence: 1,
      source: "detected",
      detectorVersion: "playback-bounds-v1",
      analyzedAt: "2026-08-07T00:00:00.000Z",
      warnings: [],
    },
  } as unknown as Track;
}

function makePlan(overrides: Partial<DjTransitionPlan> = {}): DjTransitionPlan {
  return {
    id: "dj_1",
    playlistId: "music_pl_1",
    outgoingSlotId: "slot_0",
    incomingSlotId: "slot_1",
    outgoingTrackId: "t1",
    incomingTrackId: "t2",
    outgoingSourceFingerprint: "fp1",
    incomingSourceFingerprint: "fp2",
    analysisRevisionKey: "||2026-08-07T00:00:00.000Z::||2026-08-07T00:00:00.000Z",
    family: "clean_cut",
    trust: "trusted_rhythmic",
    timeBasis: "seconds",
    outgoingCue: { seconds: 10, beatIndex: null, barIndex: null, phraseIndex: null, regionId: null, manuallyAdjusted: false },
    incomingCue: { seconds: 0, beatIndex: null, barIndex: null, phraseIndex: null, regionId: null, manuallyAdjusted: false },
    overlapBars: null,
    overlapSeconds: 0,
    tempoAdjustmentPercentA: 0,
    tempoAdjustmentPercentB: 0,
    pulseRatio: null,
    automation: { outgoingGain: [], incomingGain: [], outgoingEq: [], incomingEq: [], bassTransferProgress: null },
    doNotLayer: false,
    warnings: [],
    explanation: [],
    origin: "manual",
    evidenceState: "approved",
    rehearsals: [],
    listeningContext: null,
    activeStemSetId: null,
    activeStemRoles: [],
    approvedAt: "2026-08-07T00:00:00.000Z",
    createdAt: "2026-08-07T00:00:00.000Z",
    updatedAt: "2026-08-07T00:00:00.000Z",
    ...overrides,
  };
}

describe("resolveRadioExportDjTransitions", () => {
  it("maps exactly one RADIO export adjacency back to exactly one source MUSIC slot pair", () => {
    const sourcePlaylist = makeSourcePlaylist({ djTransitionPlans: [makePlan()] });
    const resolved = resolveRadioExportDjTransitions(
      makeRadioPlaylist(),
      [
        { entryId: "entry_1", sourceTrackId: "t1" },
        { entryId: "entry_2", sourceTrackId: "t2" },
      ],
      [sourcePlaylist],
      [makeTrack("t1", "fp1"), makeTrack("t2", "fp2")],
      [],
    );
    expect(resolved.get("entry_2")?.djTransitionPlan.id).toBe("dj_1");
  });

  it("fails closed when duplicate source adjacencies match the same track pair", () => {
    const duplicated = makeSourcePlaylist({
      slots: [
        { slotId: "slot_0", slotIndex: 0, assignedTrackId: "t1", startTimeSeconds: 0, targetEnergy: 0.5, targetBpm: 120, warningLevel: "none", warningMessages: [] },
        { slotId: "slot_1", slotIndex: 1, assignedTrackId: "t2", startTimeSeconds: 180, targetEnergy: 0.5, targetBpm: 120, warningLevel: "none", warningMessages: [] },
        { slotId: "slot_2", slotIndex: 2, assignedTrackId: "t1", startTimeSeconds: 360, targetEnergy: 0.5, targetBpm: 120, warningLevel: "none", warningMessages: [] },
        { slotId: "slot_3", slotIndex: 3, assignedTrackId: "t2", startTimeSeconds: 540, targetEnergy: 0.5, targetBpm: 120, warningLevel: "none", warningMessages: [] },
      ],
      djTransitionPlans: [makePlan()],
    });
    const resolved = resolveRadioExportDjTransitions(
      makeRadioPlaylist(),
      [
        { entryId: "entry_1", sourceTrackId: "t1" },
        { entryId: "entry_2", sourceTrackId: "t2" },
      ],
      [duplicated],
      [makeTrack("t1", "fp1"), makeTrack("t2", "fp2")],
      [],
    );
    expect(resolved.size).toBe(0);
  });

  it("fails closed when source lineage is missing", () => {
    const resolved = resolveRadioExportDjTransitions(
      makeRadioPlaylist({ sourceMusicPlaylistId: undefined }),
      [
        { entryId: "entry_1", sourceTrackId: "t1" },
        { entryId: "entry_2", sourceTrackId: "t2" },
      ],
      [makeSourcePlaylist({ djTransitionPlans: [makePlan()] })],
      [makeTrack("t1", "fp1"), makeTrack("t2", "fp2")],
      [],
    );
    expect(resolved.size).toBe(0);
  });

  it("fails closed when the RADIO export adjacency does not exist in the source playlist", () => {
    const sourcePlaylist = makeSourcePlaylist({ djTransitionPlans: [makePlan()] });
    const resolved = resolveRadioExportDjTransitions(
      makeRadioPlaylist(),
      [
        { entryId: "entry_1", sourceTrackId: "t1" },
        { entryId: "entry_2", sourceTrackId: "t3" },
      ],
      [sourcePlaylist],
      [makeTrack("t1", "fp1"), makeTrack("t3", "fp3")],
      [],
    );
    expect(resolved.size).toBe(0);
  });

  it("fails closed when the matching plan is unapproved", () => {
    const sourcePlaylist = makeSourcePlaylist({ djTransitionPlans: [makePlan({ evidenceState: "revised", approvedAt: null })] });
    const resolved = resolveRadioExportDjTransitions(
      makeRadioPlaylist(),
      [
        { entryId: "entry_1", sourceTrackId: "t1" },
        { entryId: "entry_2", sourceTrackId: "t2" },
      ],
      [sourcePlaylist],
      [makeTrack("t1", "fp1"), makeTrack("t2", "fp2")],
      [],
    );
    expect(resolved.size).toBe(0);
  });
});
