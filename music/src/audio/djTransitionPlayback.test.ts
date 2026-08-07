import { describe, it, expect, vi } from "vitest";
import type { DualDeckPlaybackEngine } from "./DualDeckPlaybackEngine";
import type { DjTransitionPlan, TransitionFamily } from "../data/djTransitionTypes";
import type { PlaylistTransitionPlan } from "../data/playlistTransitionTypes";
import { shouldPreloadNextTrack } from "./transitionScheduler";
import { compileDjTransition, executeCompiledDjTransition, projectCompiledTransitionOntoLegacyPlan } from "./djTransitionPlayback";

function makePlan(overrides: Partial<DjTransitionPlan> = {}): DjTransitionPlan {
  return {
    id: "dj-1", playlistId: "pl-1", outgoingSlotId: "slot-a", incomingSlotId: "slot-b",
    outgoingTrackId: "track-a", incomingTrackId: "track-b",
    outgoingSourceFingerprint: "fp-a", incomingSourceFingerprint: "fp-b", analysisRevisionKey: "rev-1",
    family: "clean_cut", trust: "manually_authored", timeBasis: "seconds",
    outgoingCue: { seconds: 200, beatIndex: null, barIndex: null, phraseIndex: null, regionId: "out-region", manuallyAdjusted: false },
    incomingCue: { seconds: 0, beatIndex: null, barIndex: null, phraseIndex: null, regionId: "in-region", manuallyAdjusted: false },
    overlapBars: null, overlapSeconds: 0.5, tempoAdjustmentPercentA: 0, tempoAdjustmentPercentB: 0, pulseRatio: null,
    automation: { outgoingGain: [], incomingGain: [], outgoingEq: [], incomingEq: [], bassTransferProgress: null },
    doNotLayer: true, warnings: [], explanation: [],
    origin: "manual", evidenceState: "approved", rehearsals: [], listeningContext: null,
    activeStemSetId: null, activeStemRoles: [],
    approvedAt: "2026-07-22T00:00:00Z", createdAt: "2026-07-22T00:00:00Z", updatedAt: "2026-07-22T00:00:00Z",
    ...overrides,
  };
}

describe("compileDjTransition", () => {
  it("compiles a clean_cut plan to the clean_cut_hard_cut strategy", () => {
    const result = compileDjTransition(makePlan());
    expect(result.compiled).toBe(true);
    if (result.compiled) {
      expect(result.strategy).toBe("clean_cut_hard_cut");
      expect(result.djPlanId).toBe("dj-1");
    }
  });

  it("fails to compile every family this build has no real execution path for", () => {
    const unsupported: TransitionFamily[] = [
      "phrase_eq_blend", "short_rhythmic_blend", "loop_assisted_handoff", "stem_assisted_transition",
      "effect_handoff", "reset_bridge", "do_not_place_adjacent", "free_time_perceptual_handoff",
    ];
    for (const family of unsupported) {
      const result = compileDjTransition(makePlan({ family }));
      expect(result.compiled).toBe(false);
      if (!result.compiled) expect(result.reason).toContain(family);
    }
  });

  it("compiles phrase_level_blend to the minimal equal-power runtime contract", () => {
    const result = compileDjTransition(makePlan({
      family: "phrase_level_blend", timeBasis: "phrase", overlapBars: 16, overlapSeconds: 12.8,
      outgoingCue: { ...makePlan().outgoingCue, seconds: 120 },
      incomingCue: { ...makePlan().incomingCue, seconds: 32 },
    }));
    expect(result).toEqual({
      compiled: true, djPlanId: "dj-1", strategy: "phrase_level_blend_equal_power",
      outgoingCueSeconds: 120, incomingCueSeconds: 32, durationSeconds: 12.8, runwayBars: 16,
    });
  });

  it("projects authorized DJ timing onto the existing preload schedule without mutating persistence", () => {
    const legacyPlan = {
      transitionId: "legacy", outgoingCueSeconds: 180, incomingCueSeconds: 0, transitionDurationSeconds: 0.5,
    } as PlaylistTransitionPlan;
    const compiled = compileDjTransition(makePlan({
      family: "phrase_level_blend", timeBasis: "phrase", overlapBars: 8, overlapSeconds: 8,
      outgoingCue: { ...makePlan().outgoingCue, seconds: 120 }, incomingCue: { ...makePlan().incomingCue, seconds: 24 },
    }));
    expect(compiled.compiled).toBe(true);
    if (!compiled.compiled) return;
    const projected = projectCompiledTransitionOntoLegacyPlan(compiled, legacyPlan);
    expect(projected).toMatchObject({ transitionId: "dj-1", outgoingCueSeconds: 120, incomingCueSeconds: 24, transitionDurationSeconds: 8 });
    expect(legacyPlan).toMatchObject({ transitionId: "legacy", outgoingCueSeconds: 180 });
    expect(shouldPreloadNextTrack(106, projected, 15)).toBe(true);
    expect(shouldPreloadNextTrack(106, legacyPlan, 15)).toBe(false);
  });

  it("executes the phrase blend through the existing runTransition primitive", async () => {
    const runTransition = vi.fn(async () => undefined);
    const engine = { runTransition } as unknown as DualDeckPlaybackEngine;
    const legacyPlan = {
      transitionId: "legacy", outgoingCueSeconds: 180, incomingCueSeconds: 0, transitionDurationSeconds: 0.5,
    } as PlaylistTransitionPlan;
    const compiled = compileDjTransition(makePlan({
      family: "phrase_level_blend", timeBasis: "phrase", overlapBars: 16, overlapSeconds: 12.8,
      outgoingCue: { ...makePlan().outgoingCue, seconds: 120 }, incomingCue: { ...makePlan().incomingCue, seconds: 32 },
    }));
    expect(compiled.compiled).toBe(true);
    if (!compiled.compiled) return;
    await expect(executeCompiledDjTransition(engine, compiled, "A", "B", "scheduled", legacyPlan)).resolves.toMatchObject({
      executed: true, strategy: "phrase_level_blend_equal_power",
    });
    expect(runTransition).toHaveBeenCalledOnce();
    expect(runTransition).toHaveBeenCalledWith(
      expect.objectContaining({ transitionId: "dj-1", outgoingCueSeconds: 120, incomingCueSeconds: 32, transitionDurationSeconds: 12.8 }),
      "timed_crossfade", "A", "B",
    );
  });
});
