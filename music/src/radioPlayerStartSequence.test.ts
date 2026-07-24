import { describe, it, expect, vi } from "vitest";
import {
  restoreGainAndStartDeck, startFirstAvailableTrack, tryAcquireStartLock,
  type StartDeckEngineLike,
} from "./radioPlayerStartSequence";
import type { EngineAudibleReadiness } from "./audio/dualDeckTypes";
import type { RadioWebManifestEntry } from "./data/radioWebBundleTypes";

function okReadiness(overrides: Partial<EngineAudibleReadiness> = {}): EngineAudibleReadiness {
  return {
    ok: true, audioElementPlaying: true, audioContextRunning: true, sourceConnected: true,
    elementMuted: false, elementVolume: 1, deckGain: 1, positionAdvanced: true,
    ...overrides,
  };
}

function failReadiness(reason: EngineAudibleReadiness["failureReason"]): EngineAudibleReadiness {
  return okReadiness({ ok: false, failureReason: reason, deckGain: reason === "gain_zero" ? 0 : 1, positionAdvanced: reason !== "position_not_advancing" });
}

function makeFakeEngine(overrides: Partial<StartDeckEngineLike> = {}): StartDeckEngineLike & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    preload: vi.fn(async (deckId) => { calls.push(`preload:${deckId}`); }),
    setDeckGainValue: vi.fn((deckId, value) => { calls.push(`gain:${deckId}:${value}`); }),
    playDeck: vi.fn(async (deckId) => { calls.push(`play:${deckId}`); }),
    pauseDeck: vi.fn((deckId) => { calls.push(`pause:${deckId}`); }),
    confirmAudibleReadiness: vi.fn(async (deckId) => { calls.push(`readiness:${deckId}`); return okReadiness(); }),
    ...overrides,
  };
}

function makeEntry(overrides: Partial<RadioWebManifestEntry> = {}): RadioWebManifestEntry {
  return {
    radioTrackId: "rtrack_000001", packageVersion: 1, audioUrl: "audio/rtrack_000001-v1.opus",
    durationSeconds: 200, byteSize: 4000000, sha256: "abc", title: "Track One", artist: "Artist",
    ...overrides,
  };
}

describe("restoreGainAndStartDeck", () => {
  it("restores gain to 1 before calling playDeck (call order)", async () => {
    const engine = makeFakeEngine();
    await restoreGainAndStartDeck(engine, "A");
    const gainIdx = engine.calls.indexOf("gain:A:1");
    const playIdx = engine.calls.indexOf("play:A");
    expect(gainIdx).toBeGreaterThanOrEqual(0);
    expect(playIdx).toBeGreaterThan(gainIdx);
  });

  it("does not report ok until confirmAudibleReadiness itself resolves ok", async () => {
    const engine = makeFakeEngine({ confirmAudibleReadiness: vi.fn(async () => failReadiness("position_not_advancing")) });
    const outcome = await restoreGainAndStartDeck(engine, "A");
    expect(outcome.ok).toBe(false);
    expect(outcome.failureReason).toBe("position_not_advancing");
  });

  it("catches a rejected playDeck() promise instead of throwing, and preserves the original reason", async () => {
    const engine = makeFakeEngine({ playDeck: vi.fn(async () => { throw new Error("NotAllowedError"); }) });
    const outcome = await restoreGainAndStartDeck(engine, "A");
    expect(outcome.ok).toBe(false);
    expect(outcome.failureReason).toContain("NotAllowedError");
  });

  it("aborts (pauses + zeroes gain) the deck on a rejected playDeck, without losing the original reason", async () => {
    const engine = makeFakeEngine({ playDeck: vi.fn(async () => { throw new Error("boom"); }) });
    const outcome = await restoreGainAndStartDeck(engine, "A");
    expect(engine.pauseDeck).toHaveBeenCalledWith("A");
    expect(engine.setDeckGainValue).toHaveBeenLastCalledWith("A", 0);
    expect(outcome.failureReason).toContain("boom");
  });

  it("aborts (pauses + zeroes gain) the deck on a failed readiness check, preserving the exact readiness failureReason", async () => {
    const engine = makeFakeEngine({ confirmAudibleReadiness: vi.fn(async () => failReadiness("gain_zero")) });
    const outcome = await restoreGainAndStartDeck(engine, "A");
    expect(engine.pauseDeck).toHaveBeenCalledWith("A");
    expect(engine.setDeckGainValue).toHaveBeenLastCalledWith("A", 0);
    expect(outcome.failureReason).toBe("gain_zero");
    expect(outcome.readiness?.ok).toBe(false);
  });

  it("reports the full EngineAudibleReadiness signal set on success (gain, context, element-playing, position all real)", async () => {
    const engine = makeFakeEngine();
    const outcome = await restoreGainAndStartDeck(engine, "A");
    expect(outcome.ok).toBe(true);
    expect(outcome.readiness).toEqual(okReadiness());
  });
});

describe("startFirstAvailableTrack", () => {
  it("skips a failing track 1 and starts track 2 using the SAME engine instance (no second engine constructed)", async () => {
    let readinessCallCount = 0;
    const engine = makeFakeEngine({
      confirmAudibleReadiness: vi.fn(async (deckId) => {
        readinessCallCount++;
        engine.calls.push(`readiness:${deckId}`);
        // Only the FIRST call (for track 1's attempt) fails.
        return readinessCallCount === 1 ? failReadiness("position_not_advancing") : okReadiness();
      }),
    });
    const entries = [makeEntry({ radioTrackId: "rtrack_1", title: "Track One" }), makeEntry({ radioTrackId: "rtrack_2", title: "Track Two" })];
    const result = await startFirstAvailableTrack(engine, entries, "A", (e) => `/audio/${e.radioTrackId}.opus`);
    expect(result.startedIndex).toBe(1);
    expect(result.skipped).toEqual([{ index: 0, title: "Track One", reason: "position_not_advancing" }]);
    // Same engine/deck reused for both attempts — never a second engine.
    expect(engine.preload).toHaveBeenCalledTimes(2);
  });

  it("skips a track whose preload itself rejects, without throwing", async () => {
    let preloadCalls = 0;
    const engine = makeFakeEngine({
      preload: vi.fn(async () => {
        preloadCalls++;
        if (preloadCalls === 1) throw new Error("source_error");
      }),
    });
    const entries = [makeEntry({ title: "Broken Track" }), makeEntry({ title: "Good Track" })];
    const result = await startFirstAvailableTrack(engine, entries, "A", () => "/audio/x.opus");
    expect(result.startedIndex).toBe(1);
    expect(result.skipped).toEqual([{ index: 0, title: "Broken Track", reason: "preload_failed: source_error" }]);
  });

  it("reports skipped entries as skipped, never as started", async () => {
    const engine = makeFakeEngine({ confirmAudibleReadiness: vi.fn(async () => failReadiness("gain_zero")) });
    const entries = [makeEntry({ title: "Only Track" })];
    const result = await startFirstAvailableTrack(engine, entries, "A", () => "/audio/x.opus");
    expect(result.startedIndex).toBeNull();
    expect(result.skipped).toEqual([{ index: 0, title: "Only Track", reason: "gain_zero" }]);
  });

  it("never constructs or references a second engine across the whole retry loop", async () => {
    const engine = makeFakeEngine({ confirmAudibleReadiness: vi.fn(async () => failReadiness("position_not_advancing")) });
    const entries = [makeEntry({ title: "A" }), makeEntry({ title: "B" }), makeEntry({ title: "C" })];
    const result = await startFirstAvailableTrack(engine, entries, "A", () => "/audio/x.opus");
    expect(result.startedIndex).toBeNull();
    expect(result.skipped).toHaveLength(3);
    // Every attempt used deck "A" on the one injected engine instance.
    expect(engine.calls.filter((c) => c.startsWith("preload:A"))).toHaveLength(3);
  });
});

describe("tryAcquireStartLock", () => {
  it("allows exactly the first of two synchronous calls sharing the same lock", () => {
    const lock = { current: false };
    expect(tryAcquireStartLock(lock)).toBe(true);
    expect(tryAcquireStartLock(lock)).toBe(false);
    expect(tryAcquireStartLock(lock)).toBe(false);
  });

  it("a fresh lock is reusable after being explicitly reset", () => {
    const lock = { current: false };
    expect(tryAcquireStartLock(lock)).toBe(true);
    lock.current = false;
    expect(tryAcquireStartLock(lock)).toBe(true);
  });
});
