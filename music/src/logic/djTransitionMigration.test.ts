import { describe, it, expect } from "vitest";
import type { PlaylistTransitionPlan, PlaylistTransitionEvidence } from "../data/playlistTransitionTypes";
import { migrateLegacyTransitionPlan } from "./djTransitionMigration";

function makeEvidence(overrides: Partial<PlaylistTransitionEvidence> = {}): PlaylistTransitionEvidence {
  return {
    fromBeatMapTrusted: false,
    toBeatMapTrusted: false,
    fromBarGridTrusted: false,
    toBarGridTrusted: false,
    fromPlaybackBoundsTrusted: true,
    toPlaybackBoundsTrusted: true,
    fromOutroRegionAvailable: false,
    toIntroRegionAvailable: false,
    outgoingAvailableSeconds: 20,
    incomingAvailableSeconds: 20,
    selectedFromBoundary: "audible_end",
    selectedToBoundary: "audible_start",
    ...overrides,
  };
}

function makeLegacyPlan(overrides: Partial<PlaylistTransitionPlan> = {}): PlaylistTransitionPlan {
  return {
    transitionId: "t1__t2",
    playlistId: "pl1",
    fromSlotId: "slot-a",
    toSlotId: "slot-b",
    fromTrackId: "track-a",
    toTrackId: "track-b",
    fromPosition: 0,
    toPosition: 1,
    outgoingCueSeconds: 180,
    outgoingEndSeconds: 200,
    incomingCueSeconds: 0,
    transitionDurationSeconds: 8,
    syncMode: "timed_crossfade",
    bpmFit: 0.5, keyFit: 0.5, beatMapFit: 0, playbackBoundsFit: 0.8, phraseFit: 0, energyContinuityFit: 0.5,
    confidence: 0.6,
    status: "ready_with_fallback",
    warnings: [],
    evidence: makeEvidence(),
    tempoRelationship: "unknown",
    detectorVersion: "playlist-transition-v1",
    preparedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("migrateLegacyTransitionPlan", () => {
  it("produces a free-time perceptual handoff when the legacy plan never trusted rhythmic alignment", () => {
    const plan = migrateLegacyTransitionPlan({
      legacyPlan: makeLegacyPlan(),
      outgoingSourceFingerprint: "fp-a",
      incomingSourceFingerprint: "fp-b",
      analysisRevisionKey: "rev-1",
      nowIso: "2026-07-22T00:00:00Z",
      idFactory: () => "dj-1",
    });

    expect(plan.family).toBe("free_time_perceptual_handoff");
    expect(plan.trust).toBe("free_time_or_incompatible");
    expect(plan.timeBasis).toBe("seconds");
    expect(plan.overlapBars).toBeNull();
    expect(plan.outgoingCue.barIndex).toBeNull();
    expect(plan.outgoingCue.beatIndex).toBeNull();
    expect(plan.outgoingCue.phraseIndex).toBeNull();
    expect(plan.automation.bassTransferProgress).toBeNull();
    expect(plan.origin).toBe("automatic");
    expect(plan.evidenceState).toBe("proposed");
    expect(plan.approvedAt).toBeNull();
  });

  it("only claims short_rhythmic_blend when the legacy plan used a rhythmic sync mode AND trusted both beat maps", () => {
    const provenPlan = migrateLegacyTransitionPlan({
      legacyPlan: makeLegacyPlan({
        syncMode: "beat_sync",
        evidence: makeEvidence({ fromBeatMapTrusted: true, toBeatMapTrusted: true }),
      }),
      outgoingSourceFingerprint: "fp-a",
      incomingSourceFingerprint: "fp-b",
      analysisRevisionKey: "rev-1",
      nowIso: "2026-07-22T00:00:00Z",
      idFactory: () => "dj-2",
    });
    expect(provenPlan.family).toBe("short_rhythmic_blend");
    expect(provenPlan.trust).toBe("partially_trusted");

    // High confidence alone (e.g. from bpmFit/keyFit) must not be enough —
    // a timed_crossfade fallback never proves rhythmic alignment even at
    // high confidence.
    const highConfidenceButUnproven = migrateLegacyTransitionPlan({
      legacyPlan: makeLegacyPlan({ syncMode: "timed_crossfade", confidence: 0.95 }),
      outgoingSourceFingerprint: "fp-a",
      incomingSourceFingerprint: "fp-b",
      analysisRevisionKey: "rev-1",
      nowIso: "2026-07-22T00:00:00Z",
      idFactory: () => "dj-3",
    });
    expect(highConfidenceButUnproven.family).toBe("free_time_perceptual_handoff");

    // A rhythmic sync mode without both sides trusted also does not count.
    const halfTrusted = migrateLegacyTransitionPlan({
      legacyPlan: makeLegacyPlan({
        syncMode: "bar_sync",
        evidence: makeEvidence({ fromBeatMapTrusted: true, toBeatMapTrusted: false }),
      }),
      outgoingSourceFingerprint: "fp-a",
      incomingSourceFingerprint: "fp-b",
      analysisRevisionKey: "rev-1",
      nowIso: "2026-07-22T00:00:00Z",
      idFactory: () => "dj-4",
    });
    expect(halfTrusted.family).toBe("free_time_perceptual_handoff");
  });

  it("never invents beats/bars/phrases or a bass-transfer point regardless of legacy plan shape", () => {
    const plan = migrateLegacyTransitionPlan({
      legacyPlan: makeLegacyPlan({
        syncMode: "bar_sync",
        outgoingBarIndex: 12,
        incomingBarIndex: 0,
        transitionBars: 8,
        evidence: makeEvidence({ fromBeatMapTrusted: true, toBeatMapTrusted: true, fromBarGridTrusted: true, toBarGridTrusted: true }),
      }),
      outgoingSourceFingerprint: "fp-a",
      incomingSourceFingerprint: "fp-b",
      analysisRevisionKey: "rev-1",
      nowIso: "2026-07-22T00:00:00Z",
      idFactory: () => "dj-5",
    });

    expect(plan.outgoingCue.barIndex).toBeNull();
    expect(plan.incomingCue.barIndex).toBeNull();
    expect(plan.overlapBars).toBeNull();
    expect(plan.automation.bassTransferProgress).toBeNull();
    expect(plan.automation.outgoingEq).toEqual([]);
    expect(plan.automation.incomingEq).toEqual([]);
  });

  it("carries the legacy duration and cue seconds through directly", () => {
    const plan = migrateLegacyTransitionPlan({
      legacyPlan: makeLegacyPlan({ outgoingCueSeconds: 175.5, incomingCueSeconds: 2.25, transitionDurationSeconds: 12 }),
      outgoingSourceFingerprint: "fp-a",
      incomingSourceFingerprint: "fp-b",
      analysisRevisionKey: "rev-1",
      nowIso: "2026-07-22T00:00:00Z",
      idFactory: () => "dj-6",
    });
    expect(plan.outgoingCue.seconds).toBe(175.5);
    expect(plan.incomingCue.seconds).toBe(2.25);
    expect(plan.overlapSeconds).toBe(12);
  });

  it("keys the migrated plan by playlist adjacency, matching the legacy plan's slot ids", () => {
    const plan = migrateLegacyTransitionPlan({
      legacyPlan: makeLegacyPlan({ playlistId: "pl-42", fromSlotId: "slot-x", toSlotId: "slot-y" }),
      outgoingSourceFingerprint: "fp-a",
      incomingSourceFingerprint: "fp-b",
      analysisRevisionKey: "rev-1",
      nowIso: "2026-07-22T00:00:00Z",
      idFactory: () => "dj-7",
    });
    expect(plan.playlistId).toBe("pl-42");
    expect(plan.outgoingSlotId).toBe("slot-x");
    expect(plan.incomingSlotId).toBe("slot-y");
  });
});
