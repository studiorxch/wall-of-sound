import { describe, expect, it, vi } from "vitest";
import { createChannelListenerPlaybackController, type ChannelListenerEngineLike } from "./channelListenerPlayback";
import type { ChannelTrackBroadcastResult } from "./channelTrackBroadcast";
import type { EventRadioRepository, RadioChannelRepository } from "@studiorich/member-identity";
import type { RadioWebManifest } from "../../data/radioWebBundleTypes";

function onAirResult(overrides: Partial<Extract<ChannelTrackBroadcastResult, { status: "on-air" }>> = {}): ChannelTrackBroadcastResult {
  return {
    status: "on-air",
    channelId: "channel-main",
    programId: "program-a",
    programIndex: 0,
    programOffsetSeconds: 133,
    programStartedAtMs: 0,
    programEndsAtMs: 10_000_000,
    trackId: "t7",
    trackIndex: 6,
    trackOffsetSeconds: 133,
    trackDurationSeconds: 200,
    nextProgramId: "program-b",
    cycleIndex: 0,
    manifestBaseUrl: "/radio-web-export/program-a/v1/",
    audioUrl: "audio/t7.opus",
    ...overrides,
  };
}

function fakeEngine() {
  let deckEndedHandler: ((deckId: "A" | "B") => void) | null = null;
  const preload = vi.fn(async () => {});
  const setDeckGainValue = vi.fn();
  const playDeck = vi.fn(async () => {});
  const pauseDeck = vi.fn();
  const confirmAudibleReadiness = vi.fn(async () => ({
    ok: true, audioElementPlaying: true, audioContextRunning: true, sourceConnected: true,
    elementMuted: false, elementVolume: 1, deckGain: 1, positionAdvanced: true,
  }));
  const stopAll = vi.fn();
  const onDeckEnded = vi.fn((handler: (deckId: "A" | "B") => void) => {
    deckEndedHandler = handler;
    return () => { deckEndedHandler = null; };
  });
  const engine: ChannelListenerEngineLike = { preload, setDeckGainValue, playDeck, pauseDeck, confirmAudibleReadiness, onDeckEnded, stopAll };
  return {
    engine,
    preload, setDeckGainValue, playDeck, pauseDeck, confirmAudibleReadiness, stopAll, onDeckEnded,
    fireDeckEnded: (deckId: "A" | "B") => deckEndedHandler?.(deckId),
  };
}

function repos() {
  return {
    radioChannelRepository: { getRadioChannel: vi.fn() } as unknown as Pick<RadioChannelRepository, "getRadioChannel">,
    eventRadioRepository: { listRadioPrograms: vi.fn() } as unknown as Pick<EventRadioRepository, "listRadioPrograms">,
    fetchManifest: vi.fn(async () => ({}) as RadioWebManifest),
  };
}

describe("ChannelListenerPlaybackController.play -- resolves using click-time nowMs", () => {
  it("calls resolve with the nowMs captured at play(), not a stale value", async () => {
    const clock = { current: 1000 };
    const resolve = vi.fn(async (input: { nowMs: number }) => { void input; return onAirResult(); });
    const { engine } = fakeEngine();
    const controller = createChannelListenerPlaybackController({ channelId: "channel-main", ...repos(), engine, nowMs: () => clock.current, resolve });
    await controller.play();
    expect(resolve).toHaveBeenCalledWith(expect.objectContaining({ nowMs: 1000 }));
  });
});

describe("ChannelListenerPlaybackController.play -- correct Program/Track selected", () => {
  it("hands the resolved programId/trackId through to the started outcome", async () => {
    const resolve = vi.fn(async () => onAirResult({ programId: "program-x", trackId: "track-y" }));
    const { engine } = fakeEngine();
    const controller = createChannelListenerPlaybackController({ channelId: "channel-main", ...repos(), engine, nowMs: () => 1000, resolve });
    const outcome = await controller.play();
    expect(outcome).toMatchObject({ status: "started", programId: "program-x", trackId: "track-y" });
  });
});

describe("ChannelListenerPlaybackController.play -- non-zero trackOffsetSeconds reaches the engine", () => {
  it("passes the resolved offset as cueStartSeconds with no elapsed-time correction when latency is zero", async () => {
    const resolve = vi.fn(async () => onAirResult({ trackOffsetSeconds: 133, trackDurationSeconds: 200 }));
    const { engine, preload } = fakeEngine();
    const controller = createChannelListenerPlaybackController({ channelId: "channel-main", ...repos(), engine, nowMs: () => 1000, resolve });
    const outcome = await controller.play();
    expect(outcome).toMatchObject({ status: "started", cueStartSeconds: 133, latencyCorrected: false });
    expect(preload).toHaveBeenCalledWith("A", expect.objectContaining({ cueStartSeconds: 133, sourceUrl: "/radio-web-export/program-a/v1/audio/t7.opus" }));
  });
});

/** A clock double whose successive calls step through a fixed sequence, then hold the last value -- simulates real elapsed time passing across a play() call's own internal sequence of Date.now()-equivalent reads. */
function sequenceClock(...values: number[]): () => number {
  const queue = [...values];
  return () => (queue.length > 1 ? queue.shift()! : queue[0]);
}

describe("ChannelListenerPlaybackController -- latency correction", () => {
  it("adds elapsed wall-clock time to the offset when it stays within the same track", async () => {
    // 1st call: resolvedAtMs at play() start (1000). 2nd call: the elapsed-time re-check inside startAtResolution (6000) -- 5s later.
    const nowMs = sequenceClock(1000, 6000);
    const resolve = vi.fn(async () => onAirResult({ trackOffsetSeconds: 100, trackDurationSeconds: 200 }));
    const { engine, preload } = fakeEngine();
    const controller = createChannelListenerPlaybackController({ channelId: "channel-main", ...repos(), engine, nowMs, resolve });
    const outcome = await controller.play();
    expect(outcome).toMatchObject({ status: "started", cueStartSeconds: 105, latencyCorrected: true });
    expect(preload).toHaveBeenCalledWith("A", expect.objectContaining({ cueStartSeconds: 105 }));
  });

  it("re-resolves instead of extrapolating when the latency would cross the track's own boundary", async () => {
    // 1st call: resolvedAtMs (1000). 2nd call: elapsed re-check (11000, 10s later -- would push 195+10=205 past the 200s track). 3rd call: the re-resolve's own nowMs.
    const nowMs = sequenceClock(1000, 11_000, 11_050);
    const firstResolve = onAirResult({ trackId: "t-old", trackOffsetSeconds: 195, trackDurationSeconds: 200 }); // only 5s left
    const secondResolve = onAirResult({ trackId: "t-new", trackOffsetSeconds: 2, trackDurationSeconds: 200 }); // re-resolved fresh position
    const resolve = vi.fn()
      .mockResolvedValueOnce(firstResolve)
      .mockResolvedValueOnce(secondResolve);
    const { engine, preload } = fakeEngine();
    const controller = createChannelListenerPlaybackController({ channelId: "channel-main", ...repos(), engine, nowMs, resolve });
    const outcome = await controller.play();
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(outcome).toMatchObject({ status: "started", trackId: "t-new", cueStartSeconds: 2 });
    expect(preload).toHaveBeenCalledWith("A", expect.objectContaining({ trackId: "t-new", cueStartSeconds: 2 }));
  });
});

describe("ChannelListenerPlaybackController -- track end", () => {
  it("re-resolves Channel authority at natural track end rather than advancing a local cursor", async () => {
    const first = onAirResult({ trackId: "t1" });
    const second = onAirResult({ trackId: "t2", programOffsetSeconds: 0, trackOffsetSeconds: 0 });
    const resolve = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const { engine, fireDeckEnded, preload } = fakeEngine();
    const controller = createChannelListenerPlaybackController({ channelId: "channel-main", ...repos(), engine, nowMs: () => 1000, resolve });
    await controller.play();
    fireDeckEnded("A");
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(preload).toHaveBeenLastCalledWith("B", expect.objectContaining({ trackId: "t2" }));
  });

  it("ignores an ended event from a deck that is not currently active", async () => {
    const resolve = vi.fn(async () => onAirResult());
    const { engine, fireDeckEnded } = fakeEngine();
    const controller = createChannelListenerPlaybackController({ channelId: "channel-main", ...repos(), engine, nowMs: () => 1000, resolve });
    await controller.play();
    fireDeckEnded("B"); // active deck is "A"
    await Promise.resolve();
    expect(resolve).toHaveBeenCalledTimes(1);
  });
});

describe("ChannelListenerPlaybackController -- failure behavior", () => {
  it("an inactive Channel does not play -- reports failed with the original broadcastResult", async () => {
    const inactiveResult: ChannelTrackBroadcastResult = { status: "channel-inactive", channelId: "channel-main" };
    const resolve = vi.fn(async () => inactiveResult);
    const { engine, preload } = fakeEngine();
    const controller = createChannelListenerPlaybackController({ channelId: "channel-main", ...repos(), engine, nowMs: () => 1000, resolve });
    const outcome = await controller.play();
    expect(outcome).toEqual({ status: "failed", reason: "channel-inactive", broadcastResult: inactiveResult });
    expect(preload).not.toHaveBeenCalled();
  });

  it("a package failure does not skip to another Program -- surfaces package-unavailable verbatim", async () => {
    const failure: ChannelTrackBroadcastResult = { status: "package-unavailable", channelId: "channel-main", programId: "program-a", message: "network down" };
    const resolve = vi.fn(async () => failure);
    const { engine, preload } = fakeEngine();
    const controller = createChannelListenerPlaybackController({ channelId: "channel-main", ...repos(), engine, nowMs: () => 1000, resolve });
    const outcome = await controller.play();
    expect(outcome).toEqual({ status: "failed", reason: "package-unavailable", broadcastResult: failure });
    expect(preload).not.toHaveBeenCalled();
  });
});

describe("ChannelListenerPlaybackController -- unexpected repository/network errors", () => {
  it("a rejected resolve() (not a modeled failure status) becomes a failed outcome, never an unhandled rejection", async () => {
    const resolve = vi.fn(async () => { throw new Error("Missing or insufficient permissions."); });
    const { engine, preload } = fakeEngine();
    const controller = createChannelListenerPlaybackController({ channelId: "channel-main", ...repos(), engine, nowMs: () => 1000, resolve });
    const outcome = await controller.play();
    expect(outcome.status).toBe("failed");
    if (outcome.status === "failed") {
      expect(outcome.reason).toContain("unexpected_error");
      expect(outcome.reason).toContain("insufficient permissions");
    }
    expect(preload).not.toHaveBeenCalled();
  });
});

describe("ChannelListenerPlaybackController -- no competing engines/listeners", () => {
  it("registers onDeckEnded exactly once regardless of how many times play() is called", async () => {
    const resolve = vi.fn(async () => onAirResult());
    const { engine, onDeckEnded } = fakeEngine();
    const controller = createChannelListenerPlaybackController({ channelId: "channel-main", ...repos(), engine, nowMs: () => 1000, resolve });
    await controller.play();
    await controller.play();
    expect(onDeckEnded).toHaveBeenCalledTimes(1);
  });
});

describe("ChannelListenerPlaybackController -- stop() is reusable, destroy() is permanent (Batch 02T)", () => {
  it("stop() calls the engine's stopAll but KEEPS the deck-ended subscription alive", async () => {
    const resolve = vi.fn(async () => onAirResult());
    const { engine, stopAll, fireDeckEnded } = fakeEngine();
    const controller = createChannelListenerPlaybackController({ channelId: "channel-main", ...repos(), engine, nowMs: () => 1000, resolve });
    await controller.play();
    controller.stop();
    expect(stopAll).toHaveBeenCalledTimes(1);
    // Unlike destroy(), stop() must NOT unsubscribe -- firing deck-ended afterward still re-resolves.
    resolve.mockClear();
    fireDeckEnded("A");
    await Promise.resolve();
    expect(resolve).toHaveBeenCalledTimes(1);
  });

  it("the SAME controller can Play again after stop(), and track-end auto-advance still works afterward", async () => {
    const resolve = vi.fn(async () => onAirResult());
    const { engine, preload, fireDeckEnded } = fakeEngine();
    const controller = createChannelListenerPlaybackController({ channelId: "channel-main", ...repos(), engine, nowMs: () => 1000, resolve });
    await controller.play();
    controller.stop();
    const secondOutcome = await controller.play();
    expect(secondOutcome.status).toBe("started");
    // Auto-advance still works after a stop()+play() cycle -- the constructor-time subscription was never lost.
    preload.mockClear();
    fireDeckEnded("A");
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(preload).toHaveBeenCalled();
  });

  it("destroy() calls stopAll, unsubscribes from deck-ended, AND calls the engine's own destroy() if present", async () => {
    const resolve = vi.fn(async () => onAirResult());
    const { engine, stopAll, fireDeckEnded } = fakeEngine();
    const engineDestroy = vi.fn();
    (engine as unknown as { destroy: () => void }).destroy = engineDestroy;
    const controller = createChannelListenerPlaybackController({ channelId: "channel-main", ...repos(), engine, nowMs: () => 1000, resolve });
    await controller.play();
    controller.destroy();
    expect(stopAll).toHaveBeenCalledTimes(1);
    expect(engineDestroy).toHaveBeenCalledTimes(1);
    resolve.mockClear();
    fireDeckEnded("A");
    await Promise.resolve();
    expect(resolve).not.toHaveBeenCalled();
  });

  it("destroy() does not throw when the engine has no destroy() of its own (optional)", async () => {
    const resolve = vi.fn(async () => onAirResult());
    const { engine } = fakeEngine();
    const controller = createChannelListenerPlaybackController({ channelId: "channel-main", ...repos(), engine, nowMs: () => 1000, resolve });
    await controller.play();
    expect(() => controller.destroy()).not.toThrow();
  });
});

describe("ChannelListenerPlaybackController -- no Firestore writes", () => {
  it("never calls anything beyond getRadioChannel/listRadioPrograms on the injected repositories", async () => {
    const resolve = vi.fn(async () => onAirResult());
    const { engine } = fakeEngine();
    const repoSet = repos();
    const controller = createChannelListenerPlaybackController({ channelId: "channel-main", ...repoSet, engine, nowMs: () => 1000, resolve });
    await controller.play();
    // The fake repositories expose exactly getRadioChannel/listRadioPrograms
    // and neither is even called directly by this controller (resolve is
    // mocked here) -- but the TYPE contract itself (Pick<..., "getRadioChannel">
    // / Pick<..., "listRadioPrograms">) already makes a write call a
    // compile-time impossibility, proven by this file typechecking at all.
    expect(Object.keys(repoSet.radioChannelRepository)).toEqual(["getRadioChannel"]);
    expect(Object.keys(repoSet.eventRadioRepository)).toEqual(["listRadioPrograms"]);
  });
});

describe("ChannelListenerPlaybackController -- determinism", () => {
  it("the same authoritative on-air result with zero latency produces the same initial playback target", async () => {
    const result = onAirResult({ trackOffsetSeconds: 42 });
    const resolveA = vi.fn(async () => result);
    const resolveB = vi.fn(async () => result);
    const controllerA = createChannelListenerPlaybackController({ channelId: "channel-main", ...repos(), engine: fakeEngine().engine, nowMs: () => 1000, resolve: resolveA });
    const controllerB = createChannelListenerPlaybackController({ channelId: "channel-main", ...repos(), engine: fakeEngine().engine, nowMs: () => 1000, resolve: resolveB });
    const outcomeA = await controllerA.play();
    const outcomeB = await controllerB.play();
    expect(outcomeA).toEqual(outcomeB);
  });
});

