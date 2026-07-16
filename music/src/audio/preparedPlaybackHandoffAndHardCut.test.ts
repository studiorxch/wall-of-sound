// Prepared Playback Handoff and Hard-Cut Repair (0714_MUSIC_Prepared_
// Playback_Handoff_And_Hard_Cut_Repair v1.0.0) — tests for all pure decision
// logic (§22). The engine's real audible-readiness confirmation and
// executeHardCut() itself use HTMLAudioElement/AudioContext, unavailable in
// this project's node test environment (no jsdom) — that real-audio
// behavior is covered by live browser verification instead (see completion
// report), matching the existing convention in dualDeckPlayback.test.ts.

import { describe, it, expect } from "vitest";
import { evaluateAudibleReadiness, type RawReadinessSignals } from "./handoffReadiness";
import { decideRuntimeTransitionPolicy } from "./transitionFallback";

function baseSignals(overrides: Partial<RawReadinessSignals> = {}): RawReadinessSignals {
  return {
    audioContextState: "running",
    audioElementPaused: false,
    elementMuted: false,
    elementVolume: 1,
    deckGain: 1,
    sourceConnected: true,
    positionBeforeSeconds: 10,
    positionAfterSeconds: 10.2,
    playRejected: false,
    sourceLoadFailed: false,
    ...overrides,
  };
}

describe("evaluateAudibleReadiness — handoff readiness contract (§4, §5)", () => {
  it("passes when every audible-output condition holds and position advances", () => {
    const r = evaluateAudibleReadiness(baseSignals());
    expect(r.ok).toBe(true);
    expect(r.failureReason).toBeUndefined();
  });

  it("fails with audio_context_suspended when the AudioContext is not running", () => {
    const r = evaluateAudibleReadiness(baseSignals({ audioContextState: "suspended" }));
    expect(r.ok).toBe(false);
    expect(r.failureReason).toBe("audio_context_suspended");
  });

  it("fails with audio_element_not_playing when the media element is paused", () => {
    const r = evaluateAudibleReadiness(baseSignals({ audioElementPaused: true }));
    expect(r.ok).toBe(false);
    expect(r.failureReason).toBe("audio_element_not_playing");
  });

  it("fails with audio_element_muted when the media element is muted", () => {
    const r = evaluateAudibleReadiness(baseSignals({ elementMuted: true }));
    expect(r.ok).toBe(false);
    expect(r.failureReason).toBe("audio_element_muted");
  });

  it("fails with audio_element_zero_volume when element volume is zero", () => {
    const r = evaluateAudibleReadiness(baseSignals({ elementVolume: 0 }));
    expect(r.ok).toBe(false);
    expect(r.failureReason).toBe("audio_element_zero_volume");
  });

  it("fails with gain_zero when the deck gain path is zero", () => {
    const r = evaluateAudibleReadiness(baseSignals({ deckGain: 0 }));
    expect(r.ok).toBe(false);
    expect(r.failureReason).toBe("gain_zero");
  });

  it("fails with source_not_connected when the graph is not wired", () => {
    const r = evaluateAudibleReadiness(baseSignals({ sourceConnected: false }));
    expect(r.ok).toBe(false);
    expect(r.failureReason).toBe("source_not_connected");
  });

  it("fails with position_not_advancing when currentTime never moves — the exact case that proves engine-state-says-playing is not audible readiness", () => {
    const r = evaluateAudibleReadiness(baseSignals({ positionBeforeSeconds: 10, positionAfterSeconds: 10 }));
    expect(r.ok).toBe(false);
    expect(r.failureReason).toBe("position_not_advancing");
    // every OTHER condition can be true — this is the specific defect-A case
    expect(r.audioContextRunning).toBe(true);
    expect(r.audioElementPlaying).toBe(true);
  });

  it("fails with play_rejected when the play() promise was rejected, independent of other signals", () => {
    const r = evaluateAudibleReadiness(baseSignals({ playRejected: true, audioContextState: "running" }));
    expect(r.ok).toBe(false);
    expect(r.failureReason).toBe("play_rejected");
  });

  it("fails with source_load_failed when the deck errored before readiness could be checked", () => {
    const r = evaluateAudibleReadiness(baseSignals({ sourceLoadFailed: true }));
    expect(r.ok).toBe(false);
    expect(r.failureReason).toBe("source_load_failed");
  });

  it("checks failure reasons in a fixed priority order (play_rejected wins over a merely-suspended context)", () => {
    const r = evaluateAudibleReadiness(baseSignals({ playRejected: true, audioContextState: "suspended" }));
    expect(r.failureReason).toBe("play_rejected");
  });
});

describe("decideRuntimeTransitionPolicy — needs_review / blocked runtime policy (§17, §18)", () => {
  it("uses a conservative hard cut for needs_review, never the resolved sync-capable mode", () => {
    const result = decideRuntimeTransitionPolicy({ status: "needs_review" }, "beat_sync", true);
    expect(result.mode).toBe("hard_cut");
    expect(result.runtimeFallback).toBe("review_hard_cut");
    expect(result.stopWithError).toBe(false);
  });

  it("uses a conservative hard cut for a blocked adjacency when the incoming track is playable", () => {
    const result = decideRuntimeTransitionPolicy({ status: "blocked" }, "timed_crossfade", true);
    expect(result.mode).toBe("hard_cut");
    expect(result.runtimeFallback).toBe("blocked_standard_fallback");
    expect(result.stopWithError).toBe(false);
  });

  it("stops with an explicit error when a blocked adjacency has no playable fallback", () => {
    const result = decideRuntimeTransitionPolicy({ status: "blocked" }, "timed_crossfade", false);
    expect(result.stopWithError).toBe(true);
    expect(result.runtimeFallback).toBe("blocked_standard_fallback");
  });

  it("passes through the resolved mode unchanged for ready/ready_with_fallback plans", () => {
    const ready = decideRuntimeTransitionPolicy({ status: "ready" }, "timed_crossfade", true);
    expect(ready.mode).toBe("timed_crossfade");
    expect(ready.runtimeFallback).toBe("none");
    expect(ready.stopWithError).toBe(false);

    const readyFallback = decideRuntimeTransitionPolicy({ status: "ready_with_fallback" }, "gapless", true);
    expect(readyFallback.mode).toBe("gapless");
    expect(readyFallback.runtimeFallback).toBe("none");
  });

  it("one blocked plan's policy decision is independent of other adjacencies (pure function, no shared state)", () => {
    const blocked = decideRuntimeTransitionPolicy({ status: "blocked" }, "timed_crossfade", false);
    const unrelatedReady = decideRuntimeTransitionPolicy({ status: "ready" }, "timed_crossfade", true);
    expect(blocked.stopWithError).toBe(true);
    expect(unrelatedReady.stopWithError).toBe(false);
  });
});
