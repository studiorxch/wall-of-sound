// 0717D_RADIO_Playlist_Inbox_and_Performance_Foundation — the five
// waveform-preparation proofs the plan requires: full-playlist completion,
// zero-redecode reopening, per-track stale isolation, default-concurrency-1
// with a meaningful override, and resumability after cancellation. The
// mock `ensureSongAnalysisReady` below stands in for the real
// songAnalysisOrchestrator (already covered by songAnalysisOrchestrator.test.ts)
// so these tests isolate the batch driver's own scheduling behavior.

import { describe, it, expect, vi } from "vitest";
import { prepareMissingAnalysesForPlaylist, type EnsureSongAnalysisReadyFn } from "./radioPlaylistWaveformPreparation";
import type { Track } from "../../data/trackTypes";
import type { CompleteSongAnalysis } from "../../data/songAnalysisTypes";

function track(trackId: string): Track {
  return { trackId, title: trackId } as unknown as Track;
}

function fakeAnalysis(trackId: string): CompleteSongAnalysis {
  return {
    id: `songana_${trackId}`, sourceTrackId: trackId, sourceMediaFingerprint: "x::1.00",
    decodedFrameCount: 6000, sampleRate: 8000, analyzerVersion: "v", configurationVersion: "v",
    status: "READY_PROVISIONAL", sections: [], sectionRevisions: [], createdAt: "t0", updatedAt: "t0",
    waveformSummary: { sampleCount: 640, minValues: new Array(640).fill(-0.1), maxValues: new Array(640).fill(0.1) },
  };
}

// Stands in for the real ensureSongAnalysisReady's own cache boundary: a
// track already in `analyzed` resolves instantly with no "work" performed
// (decodeCount untouched); everything else does two real async ticks of
// "work" (enough for a concurrency>1 pool to genuinely overlap calls) and
// is added to `analyzed` before resolving, so a second pass over the same
// mock is a true zero-decode reopen.
function makeEnsureMock(alreadyAnalyzed: string[] = []) {
  const analyzed = new Set(alreadyAnalyzed);
  const store = new Map<string, CompleteSongAnalysis>();
  const decodedTrackIds: string[] = [];
  let inFlight = 0;
  let maxInFlight = 0;

  const fn = vi.fn(async (t: Track) => {
    if (analyzed.has(t.trackId)) {
      const existing = store.get(t.trackId) ?? fakeAnalysis(t.trackId);
      store.set(t.trackId, existing);
      return existing;
    }
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    inFlight -= 1;

    decodedTrackIds.push(t.trackId);
    analyzed.add(t.trackId);
    const result = fakeAnalysis(t.trackId);
    store.set(t.trackId, result);
    return result;
  }) as unknown as EnsureSongAnalysisReadyFn;

  return { fn, analyzed, store, decodedTrackIds, maxInFlight: () => maxInFlight };
}

describe("prepareMissingAnalysesForPlaylist — full playlist completion", () => {
  it("a 30-track playlist ends with every track holding a real waveformSummary-bearing analysis", async () => {
    const tracks = Array.from({ length: 30 }, (_, i) => track(`t${i}`));
    const mock = makeEnsureMock();

    await prepareMissingAnalysesForPlaylist(tracks, mock.fn);

    expect(mock.store.size).toBe(30);
    for (const t of tracks) {
      const analysis = mock.store.get(t.trackId);
      expect(analysis?.waveformSummary).toBeDefined();
      expect(analysis!.waveformSummary!.minValues.length).toBe(640);
    }
    expect(mock.decodedTrackIds.length).toBe(30);
  });
});

describe("prepareMissingAnalysesForPlaylist — reopening costs nothing", () => {
  it("re-running preparation on an already-fully-prepared playlist performs zero additional decodes", async () => {
    const tracks = Array.from({ length: 12 }, (_, i) => track(`t${i}`));
    const mock = makeEnsureMock();

    await prepareMissingAnalysesForPlaylist(tracks, mock.fn);
    expect(mock.decodedTrackIds.length).toBe(12);

    await prepareMissingAnalysesForPlaylist(tracks, mock.fn);
    // The driver still calls ensureSongAnalysisReady once per track (it has
    // no cache of its own), but the mock's own fast path means no track
    // does real "work" the second time.
    expect(mock.fn).toHaveBeenCalledTimes(24);
    expect(mock.decodedTrackIds.length).toBe(12);
  });
});

describe("prepareMissingAnalysesForPlaylist — stale identity isolates to one track", () => {
  it("only the track missing from the cache gets prepared; its siblings are untouched", async () => {
    const tracks = [track("a"), track("b"), track("c")];
    // "a" and "c" already carry a valid summary (as if their identity were
    // unchanged); "b" is the one whose stored summary was just invalidated
    // (e.g. by a changed source fingerprint) and needs fresh preparation.
    const mock = makeEnsureMock(["a", "c"]);

    await prepareMissingAnalysesForPlaylist(tracks, mock.fn);

    expect(mock.decodedTrackIds).toEqual(["b"]);
    expect(mock.fn).toHaveBeenCalledTimes(3);
  });
});

describe("prepareMissingAnalysesForPlaylist — concurrency", () => {
  it("defaults to exactly 1 simultaneous in-flight call when no concurrency option is passed", async () => {
    const tracks = Array.from({ length: 8 }, (_, i) => track(`t${i}`));
    const mock = makeEnsureMock();

    await prepareMissingAnalysesForPlaylist(tracks, mock.fn);

    expect(mock.maxInFlight()).toBe(1);
  });

  it("when concurrency is explicitly configured above 1, simultaneous in-flight calls never exceed that configured limit (not asserted against 1)", async () => {
    const tracks = Array.from({ length: 12 }, (_, i) => track(`t${i}`));
    const mock = makeEnsureMock();

    await prepareMissingAnalysesForPlaylist(tracks, mock.fn, { concurrency: 3 });

    expect(mock.maxInFlight()).toBeGreaterThan(1);
    expect(mock.maxInFlight()).toBeLessThanOrEqual(3);
  });
});

describe("prepareMissingAnalysesForPlaylist — cancellation and resumability", () => {
  it("stops starting new tracks once aborted, and a second invocation over the same tracks completes only what's left", async () => {
    const tracks = Array.from({ length: 6 }, (_, i) => track(`t${i}`));
    const mock = makeEnsureMock();
    const controller = new AbortController();

    await prepareMissingAnalysesForPlaylist(tracks, mock.fn, {
      signal: controller.signal,
      // Deterministic — abort synchronously the instant the first track
      // finishes, never a wall-clock guess.
      onProgress: () => controller.abort(),
    });

    const completedAfterCancel = mock.decodedTrackIds.length;
    expect(completedAfterCancel).toBeGreaterThan(0);
    expect(completedAfterCancel).toBeLessThan(6);

    // Resume: re-invoke over the SAME track list with no signal. Already-
    // prepared tracks resolve instantly via the mock's own cache; only the
    // remaining ones get real work.
    await prepareMissingAnalysesForPlaylist(tracks, mock.fn);

    expect(mock.store.size).toBe(6);
    expect(mock.decodedTrackIds.length).toBe(6);
  });
});

describe("prepareMissingAnalysesForPlaylist — one track fully processed at a time within the concurrency window", () => {
  it("with the default concurrency, no second track begins real work before the first finishes", async () => {
    const tracks = Array.from({ length: 5 }, (_, i) => track(`t${i}`));
    const mock = makeEnsureMock();
    const order: string[] = [];
    const wrapped: EnsureSongAnalysisReadyFn = async (t, buf, opts) => {
      order.push(`start:${t.trackId}`);
      const result = await mock.fn(t, buf, opts);
      order.push(`end:${t.trackId}`);
      return result;
    };

    await prepareMissingAnalysesForPlaylist(tracks, wrapped);

    // Every start/end pair is adjacent — a "start" never appears before the
    // previous track's "end".
    for (let i = 0; i < tracks.length; i++) {
      expect(order[i * 2]).toBe(`start:${tracks[i].trackId}`);
      expect(order[i * 2 + 1]).toBe(`end:${tracks[i].trackId}`);
    }
  });
});
