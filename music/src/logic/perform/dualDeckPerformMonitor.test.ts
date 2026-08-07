import { describe, expect, it } from "vitest";
import type { PlaybackDeckState, PlaylistPlaybackSession } from "../../audio/dualDeckTypes";
import type { CompleteSongAnalysis } from "../../data/songAnalysisTypes";
import type { DjTransitionPlan } from "../../data/djTransitionTypes";
import type { PlaylistRecord } from "../../data/playProjectTypes";
import type { Track } from "../../data/trackTypes";
import { buildDualDeckPerformMonitor, type BuildDualDeckPerformMonitorInput } from "./dualDeckPerformMonitor";

const NOW = "2026-08-07T00:00:00.000Z";

function track(trackId: string, fingerprint: string, trusted = true): Track {
  return {
    trackId, title: trackId, artist: "Artist", durationSeconds: 180, energy: 0.5, energySource: "manual",
    analysisUpdatedAt: NOW,
    cuePoints: [{ id: `${trackId}-generic`, timeSeconds: 7, label: "Memory" }],
    playbackBounds: {
      version: "playback-bounds-v1", sourceFingerprint: fingerprint, sourceDurationSeconds: 180,
      audibleStartSeconds: 0, preferredStartSeconds: 0, preferredEndSeconds: 180, audibleEndSeconds: 180,
      leadingSilenceSeconds: 0, trailingSilenceSeconds: 0, effectiveDurationSeconds: 180,
      startClassification: "musical_intro", endClassification: "musical_outro",
      startConfidence: 1, endConfidence: 1, overallConfidence: 1, source: "detected",
      detectorVersion: "playback-bounds-v1", analyzedAt: NOW, warnings: [],
    },
    beatMap: {
      version: "beat-map-v3", bpm: 120, firstBeatSeconds: 0, firstDownbeatSeconds: 0,
      beatTimesSeconds: Array.from({ length: 64 }, (_, index) => index * 0.5),
      barStartTimesSeconds: Array.from({ length: 16 }, (_, index) => index * 2),
      tempoStable: true, tempoStabilityScore: 1, tempoSegments: [], confidence: trusted ? 1 : 0.2,
      source: "detected", detectorVersion: "beat-map-v3", analyzedAt: NOW, warnings: [],
      confidenceComponents: {
        onsetStrength: trusted ? 1 : 0.2, onsetRegularity: trusted ? 1 : 0.2,
        beatPhaseFit: trusted ? 1 : 0.2, beatCoverage: trusted ? 1 : 0.2, beatContinuity: trusted ? 1 : 0.2,
        downbeatRecurrence: trusted ? 1 : 0.2, barAlignment: trusted ? 1 : 0.2,
        tempoStability: trusted ? 1 : 0.2, segmentConsistency: trusted ? 1 : 0.2,
        introRegionConfidence: trusted ? 1 : 0.2, outroRegionConfidence: trusted ? 1 : 0.2,
        priorAgreement: trusted ? 1 : 0.2, warningPenalty: 0, total: trusted ? 1 : 0.2,
      },
    },
  } as Track;
}

function analysis(trackId: string, fingerprint: string): CompleteSongAnalysis {
  return {
    id: `analysis-${trackId}`, sourceTrackId: trackId, sourceMediaFingerprint: fingerprint,
    decodedFrameCount: 7_938_000, sampleRate: 44_100, analyzerVersion: "song-analyzer-v1.1.0",
    configurationVersion: "song-analysis-config-v1.0.0", status: "READY_VERIFIED",
    sections: [{ id: `${trackId}-section`, sourceTrackId: trackId, structuralType: "body", displayLabel: "Body", startFrame: 0, endFrame: 1_411_200, confidence: 1, origin: "analyzer", verification: "verified" }],
    sectionRevisions: [], waveformSummary: { sampleCount: 2, minValues: [-0.5, -0.25], maxValues: [0.5, 0.25] },
    createdAt: NOW, updatedAt: NOW,
  } as CompleteSongAnalysis;
}

function deck(deckId: "A" | "B", role: "active" | "incoming", state: PlaybackDeckState["state"], trackId: string, slotId: string, gain: number): PlaybackDeckState {
  return { deckId, role, state, trackId, slotId, currentTimeSeconds: deckId === "A" ? 42 : 3, durationSeconds: 180, gain, muted: false };
}

function plan(overrides: Partial<DjTransitionPlan> = {}): DjTransitionPlan {
  return {
    id: "dj-1", playlistId: "playlist-1", outgoingSlotId: "slot-a", incomingSlotId: "slot-b",
    outgoingTrackId: "white-ropes", incomingTrackId: "beau-mot-plage", outgoingSourceFingerprint: "fp-a", incomingSourceFingerprint: "fp-b",
    analysisRevisionKey: `${NOW}|${NOW}|${NOW}::${NOW}|${NOW}|${NOW}`, family: "clean_cut", trust: "trusted_rhythmic", timeBasis: "beat",
    outgoingCue: { seconds: 160, beatIndex: 320, barIndex: 80, phraseIndex: 5, regionId: null, manuallyAdjusted: false },
    incomingCue: { seconds: 0, beatIndex: 0, barIndex: 0, phraseIndex: 0, regionId: null, manuallyAdjusted: false },
    overlapBars: 0, overlapSeconds: 0, tempoAdjustmentPercentA: 0, tempoAdjustmentPercentB: 0, pulseRatio: 1,
    automation: { outgoingGain: [], incomingGain: [], outgoingEq: [], incomingEq: [], bassTransferProgress: null },
    doNotLayer: true, warnings: [], explanation: [], origin: "automatic", evidenceState: "approved", rehearsals: [], listeningContext: null,
    activeStemSetId: null, activeStemRoles: [], approvedAt: NOW, createdAt: NOW, updatedAt: NOW, ...overrides,
  };
}

function input(overrides: Partial<BuildDualDeckPerformMonitorInput> = {}): BuildDualDeckPerformMonitorInput {
  const tracks = [track("white-ropes", "fp-a"), track("beau-mot-plage", "fp-b")];
  const playlist = {
    playlistId: "playlist-1", title: "Set", slots: [], curve: {}, locks: [], orphans: [], targetDurationMinutes: 10,
    createdAt: NOW, updatedAt: NOW, djTransitionPlans: [plan()],
  } as unknown as PlaylistRecord;
  const session = { activeDeckId: "A", incomingDeckId: "B", currentSlotId: "slot-a", status: "playing" } as PlaylistPlaybackSession;
  return {
    playlist,
    decks: { A: deck("A", "active", "playing", "white-ropes", "slot-a", 0.82), B: deck("B", "incoming", "ready", "beau-mot-plage", "slot-b", 0) },
    session,
    tracksById: new Map(tracks.map((item) => [item.trackId, item])),
    songAnalyses: [analysis("white-ropes", "fp-a"), analysis("beau-mot-plage", "fp-b")],
    djTransitionMode: "active",
    djActiveDiagnostics: null,
    ...overrides,
  };
}

describe("buildDualDeckPerformMonitor", () => {
  it("projects deck identity, playhead, gain, waveform, and generic cues only from live deck state", () => {
    const result = buildDualDeckPerformMonitor(input());
    expect(result.decks.A.track?.trackId).toBe("white-ropes");
    expect(result.decks.B.track?.trackId).toBe("beau-mot-plage");
    expect(result.decks.A.state.currentTimeSeconds).toBe(42);
    expect(result.decks.A.state.gain).toBe(0.82);
    expect(result.decks.A.waveform?.sampleCount).toBe(2);
    expect(result.decks.A.genericCues[0].label).toBe("Memory");
  });

  it("does not substitute playlist identity when a live deck has no track", () => {
    const base = input();
    const result = buildDualDeckPerformMonitor(input({ decks: { A: base.decks!.A, B: { deckId: "B", role: "incoming", state: "empty", currentTimeSeconds: 0, gain: 0, muted: false } } }));
    expect(result.decks.B.track).toBeNull();
    expect(result.transition.adjacency).toBeNull();
  });

  it("renders trusted timing and keeps untrusted timing explicitly unavailable", () => {
    const trusted = buildDualDeckPerformMonitor(input());
    expect(trusted.decks.A.timing.beats).not.toBeNull();
    expect(trusted.decks.A.timing.bars).not.toBeNull();
    expect(trusted.decks.A.timing.phrases).not.toBeNull();

    const base = input();
    const untrustedTrack = track("white-ropes", "fp-a", false);
    const untrusted = buildDualDeckPerformMonitor(input({ tracksById: new Map([[untrustedTrack.trackId, untrustedTrack], ["beau-mot-plage", base.tracksById.get("beau-mot-plage")!]]) }));
    expect(untrusted.decks.A.timing.beats).toBeNull();
    expect(untrusted.decks.A.timing.bars).toBeNull();
    expect(untrusted.decks.A.timing.phrases).toBeNull();
  });

  it("selects only one plan matching the exact live slot and track adjacency", () => {
    const exact = buildDualDeckPerformMonitor(input());
    expect(exact.transition.plan?.id).toBe("dj-1");
    expect(exact.transition.authority?.gate).toBe("authorized");
    expect(exact.transition.compiledStrategy).toBe("clean_cut_hard_cut");
    expect(exact.decks.A.transitionCue?.seconds).toBe(160);
    expect(exact.decks.A.genericCues[0].timeSeconds).toBe(7);

    const base = input();
    const wrongPlan = plan({ incomingSlotId: "different-slot" });
    const wrongPlaylist = { ...base.playlist!, djTransitionPlans: [wrongPlan] };
    const wrong = buildDualDeckPerformMonitor(input({ playlist: wrongPlaylist }));
    expect(wrong.transition.plan).toBeNull();
    expect(wrong.transition.authority?.gate).toBe("no_plan_for_pair");
  });

  it("fails closed on duplicate plans and reports canonical stale and approval gates", () => {
    const base = input();
    const duplicatePlaylist = { ...base.playlist!, djTransitionPlans: [plan(), plan({ id: "dj-2" })] };
    expect(buildDualDeckPerformMonitor(input({ playlist: duplicatePlaylist })).transition.plan).toBeNull();

    const stalePlaylist = { ...base.playlist!, djTransitionPlans: [plan({ outgoingSourceFingerprint: "old" })] };
    const stale = buildDualDeckPerformMonitor(input({ playlist: stalePlaylist }));
    expect(stale.transition.stale).toBe(true);
    expect(stale.transition.authority?.gate).toBe("stale");

    const proposedPlaylist = { ...base.playlist!, djTransitionPlans: [plan({ evidenceState: "proposed", approvedAt: null })] };
    expect(buildDualDeckPerformMonitor(input({ playlist: proposedPlaylist })).transition.authority?.gate).toBe("not_approved");

    const unsupportedPlaylist = { ...base.playlist!, djTransitionPlans: [plan({ family: "phrase_eq_blend" })] };
    expect(buildDualDeckPerformMonitor(input({ playlist: unsupportedPlaylist })).transition.authority?.gate).toBe("unsupported_family");
  });

  it("shows active execution only from matching real diagnostics and preserves exact legacy fallback reason", () => {
    const diagnostics = {
      legacyTransitionId: "slot-a__slot-b", djPlanId: "dj-1", authorized: true, gate: "authorized", reason: "All authority conditions passed.",
      compiledStrategy: "clean_cut_hard_cut", executed: true, executionFailureReason: null, legacyExecutedInstead: false, recordedAt: NOW,
    } as const;
    const active = buildDualDeckPerformMonitor(input({ djActiveDiagnostics: diagnostics })).transition;
    expect(active.actualExecution).toBe("active");
    expect(active.actualExecutionAdjacency).toBe("slot-a__slot-b");

    const fallback = { ...diagnostics, authorized: false, gate: "not_approved" as const, reason: "Plan evidenceState is proposed.", executed: false, compiledStrategy: null, legacyExecutedInstead: true };
    const result = buildDualDeckPerformMonitor(input({ djActiveDiagnostics: fallback }));
    expect(result.transition.actualExecution).toBe("legacy_fallback");
    expect(result.transition.actualExecutionReason).toBe("Plan evidenceState is proposed.");

    const runtimeFallback = buildDualDeckPerformMonitor(input({ djActiveDiagnostics: null, runtimeFallback: "review_hard_cut", fallbackReason: "plan_unsynced" }));
    expect(runtimeFallback.transition.actualExecution).toBe("legacy_fallback");
    expect(runtimeFallback.transition.actualExecutionReason).toBe("plan_unsynced");
  });
});
