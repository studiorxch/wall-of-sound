import { describe, expect, it } from "vitest";
import {
  authorizeManualDeckGainWrite,
  clampPerformanceGain,
  gainsForPerformanceFader,
  performanceFaderPositionForGains,
  type ManualDeckGainWriteContext,
} from "./performanceGainControl";

function context(overrides: Partial<ManualDeckGainWriteContext> = {}): ManualDeckGainWriteContext {
  return {
    authority: "dual_deck_engine",
    sessionStatus: "playing",
    transitionClaimed: false,
    decks: {
      A: { trackId: "track-a", state: "playing" },
      B: { trackId: "track-b", state: "ready" },
    },
    ...overrides,
  };
}

describe("performance gain law", () => {
  it("clamps gain values and rejects non-finite input safely", () => {
    expect(clampPerformanceGain(-1)).toBe(0);
    expect(clampPerformanceGain(0.42)).toBe(0.42);
    expect(clampPerformanceGain(2)).toBe(1);
    expect(clampPerformanceGain(Number.NaN)).toBe(0);
  });

  it("maps fader endpoints and center through the approved equal-power law", () => {
    expect(gainsForPerformanceFader(0)).toEqual({ A: 1, B: 0 });
    const center = gainsForPerformanceFader(0.5);
    expect(center.A).toBeCloseTo(Math.SQRT1_2);
    expect(center.B).toBeCloseTo(Math.SQRT1_2);
    expect(gainsForPerformanceFader(1).A).toBeCloseTo(0);
    expect(gainsForPerformanceFader(1).B).toBe(1);
  });

  it("keeps combined channel power constant across the fader", () => {
    for (const position of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
      const gains = gainsForPerformanceFader(position);
      expect(gains.A ** 2 + gains.B ** 2).toBeCloseTo(1);
    }
  });

  it("projects actual arbitrary gains back to a directional macro position", () => {
    expect(performanceFaderPositionForGains(1, 0)).toBe(0);
    expect(performanceFaderPositionForGains(Math.SQRT1_2, Math.SQRT1_2)).toBeCloseTo(0.5);
    expect(performanceFaderPositionForGains(0, 1)).toBe(1);
    expect(performanceFaderPositionForGains(0, 0)).toBe(0.5);
    expect(performanceFaderPositionForGains(0.85, 0.45)).toBeGreaterThan(0);
  });
});

describe("manual gain authority", () => {
  it("allows independent and paired writes for loaded decks under engine authority", () => {
    expect(authorizeManualDeckGainWrite(context(), ["A"])).toEqual({ accepted: true });
    expect(authorizeManualDeckGainWrite(context(), ["A", "B"])).toEqual({ accepted: true });
  });

  it("rejects writes without engine authority or a prepared session", () => {
    expect(authorizeManualDeckGainWrite(context({ authority: "standard_player" }), ["A"])).toEqual({ accepted: false, reason: "wrong_authority" });
    expect(authorizeManualDeckGainWrite(context({ sessionStatus: null }), ["A"])).toEqual({ accepted: false, reason: "no_session" });
  });

  it("rejects both rendered transitioning state and the synchronous pre-render claim latch", () => {
    expect(authorizeManualDeckGainWrite(context({ sessionStatus: "transitioning" }), ["A"])).toEqual({ accepted: false, reason: "transition_claimed" });
    expect(authorizeManualDeckGainWrite(context({ transitionClaimed: true }), ["A", "B"])).toEqual({ accepted: false, reason: "transition_claimed" });
  });

  it("rejects missing, loading, ended, and error decks", () => {
    for (const state of ["empty", "loading", "ended", "error"] as const) {
      const decks = { ...context().decks!, B: { trackId: state === "empty" ? undefined : "track-b", state } };
      expect(authorizeManualDeckGainWrite(context({ decks }), ["B"])).toEqual({ accepted: false, reason: "deck_not_loaded" });
    }
  });
});
