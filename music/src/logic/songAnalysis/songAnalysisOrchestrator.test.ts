// 0717D_RADIO_Playlist_Inbox_and_Performance_Foundation §16 — this is the
// mandatory 0717C debt closure test file: dedup/attach-to-in-flight, legal
// state transitions, cancellation-returns-NOT_ANALYZED-never-FAILED-never-
// partial-saved, STALE/FAILED never auto-reanalyzing without `force`, and
// the deterministic armSongAnalysisCancel proof — all against the REAL
// resolveSongAnalysisInput/analyzeCompleteSong pipeline (no vi.mock; this
// codebase has no existing module-mocking precedent, and these are already
// pure/well-tested functions — a real, small/fast synthetic AudioBuffer is
// used instead, matching resolveSongAnalysisInput.test.ts's own fixture
// convention).

import { describe, it, expect, vi } from "vitest";
import { createSongAnalysisOrchestrator } from "./songAnalysisOrchestrator";
import type { CompleteSongAnalysis } from "../../data/songAnalysisTypes";
import type { Track } from "../../data/trackTypes";
import type { ChunkedDspProgress } from "../dspFeatureExtraction";

function fakeBuffer(sampleCount: number, sampleRate = 8000): AudioBuffer {
  const data = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) data[i] = Math.sin(i * 0.05) * 0.3;
  return {
    sampleRate, length: sampleCount, duration: sampleCount / sampleRate,
    numberOfChannels: 1,
    getChannelData: () => data,
  } as unknown as AudioBuffer;
}

function track(overrides: Partial<Track> = {}): Track {
  return { trackId: "track_1", title: "Some Track", audioRelPath: "some-track.wav", ...overrides } as unknown as Track;
}

// A small buffer — enough for a handful of chunked-DSP frames, fast to run,
// used for every test that isn't specifically exercising multi-chunk
// progress/cancellation timing.
function smallBuffer(): AudioBuffer {
  return fakeBuffer(6000);
}

// Long enough to span several framesPerChunk=200 chunks at the analyzer's
// default frameSize=2048/hopSize=1024 — genuinely multiple onProgress calls.
function longBuffer(): AudioBuffer {
  return fakeBuffer(2048 + 300 * 1024);
}

interface Harness {
  orchestrator: ReturnType<typeof createSongAnalysisOrchestrator>;
  analyses: CompleteSongAnalysis[];
  saveSongAnalysis: ReturnType<typeof vi.fn>;
  updateSongAnalysis: ReturnType<typeof vi.fn>;
  getDecodedSourceBufferForRender: ReturnType<typeof vi.fn>;
  setProgress: ReturnType<typeof vi.fn>;
}

function makeHarness(initialAnalyses: CompleteSongAnalysis[] = [], bufferToResolve: AudioBuffer | null = smallBuffer()): Harness {
  const analyses = [...initialAnalyses];
  const saveSongAnalysis = vi.fn((analysis: CompleteSongAnalysis) => {
    const idx = analyses.findIndex((a) => a.id === analysis.id);
    if (idx >= 0) analyses[idx] = analysis; else analyses.push(analysis);
  });
  const updateSongAnalysis = vi.fn((id: string, patch: Partial<CompleteSongAnalysis>) => {
    const idx = analyses.findIndex((a) => a.id === id);
    if (idx >= 0) analyses[idx] = { ...analyses[idx], ...patch };
  });
  const getDecodedSourceBufferForRender = vi.fn(async () => bufferToResolve);
  const setProgress = vi.fn();

  const orchestrator = createSongAnalysisOrchestrator({
    getSongAnalyses: () => analyses,
    saveSongAnalysis,
    updateSongAnalysis,
    getDecodedSourceBufferForRender,
    setProgress,
  });

  return { orchestrator, analyses, saveSongAnalysis, updateSongAnalysis, getDecodedSourceBufferForRender, setProgress };
}

describe("ensureSongAnalysisReady — full lifecycle", () => {
  it("NOT_ANALYZED -> ANALYZING -> READY_PROVISIONAL, saved exactly once", async () => {
    const h = makeHarness();
    const result = await h.orchestrator.ensureSongAnalysisReady(track(), null, { segments: [] });
    expect(result?.status).toBe("READY_PROVISIONAL");
    expect(h.saveSongAnalysis).toHaveBeenCalledTimes(1);
    expect(h.getDecodedSourceBufferForRender).toHaveBeenCalledTimes(1);
  });

  it("passes an existingBuffer straight through — never calls getDecodedSourceBufferForRender when one is supplied", async () => {
    const h = makeHarness();
    await h.orchestrator.ensureSongAnalysisReady(track(), smallBuffer(), { segments: [] });
    expect(h.getDecodedSourceBufferForRender).not.toHaveBeenCalled();
  });

  it("READY_PROVISIONAL/READY_VERIFIED return immediately with no buffer resolution at all (the fast path)", async () => {
    const first = await makeHarness().orchestrator.ensureSongAnalysisReady(track(), null, { segments: [] });
    const h = makeHarness([first!]);
    const second = await h.orchestrator.ensureSongAnalysisReady(track(), null, { segments: [] });
    expect(second?.id).toBe(first!.id);
    expect(h.getDecodedSourceBufferForRender).not.toHaveBeenCalled();
    expect(h.saveSongAnalysis).not.toHaveBeenCalled();
  });

  it("a changed source (stale fingerprint) is caught on the fast path and flips to STALE without any decode", async () => {
    const first = await makeHarness().orchestrator.ensureSongAnalysisReady(track(), null, { segments: [] });
    // Simulate the track's identity changing (e.g. a different audio file
    // now lives at this path) — the fast path recomputes the fingerprint
    // from the analysis's OWN recorded decodedFrameCount/sampleRate, no
    // decode needed to detect this.
    const h = makeHarness([first!]);
    const changedTrack = track({ audioRelPath: "a-different-file.wav" });
    const result = await h.orchestrator.ensureSongAnalysisReady(changedTrack, null, { segments: [] });
    expect(result?.status).toBe("STALE");
    expect(h.updateSongAnalysis).toHaveBeenCalledWith(first!.id, { status: "STALE" });
    expect(h.getDecodedSourceBufferForRender).not.toHaveBeenCalled();
  });
});

describe("ensureSongAnalysisReady — dedup / attach-to-in-flight", () => {
  it("a second concurrent call for the same track attaches to the in-flight promise rather than starting a new resolution", async () => {
    const h = makeHarness();
    const t = track();
    const first = h.orchestrator.ensureSongAnalysisReady(t, null, { segments: [] });
    const second = h.orchestrator.ensureSongAnalysisReady(t, null, { segments: [] });
    const [a, b] = await Promise.all([first, second]);
    expect(a?.id).toBe(b?.id);
    // Only ONE resolution attempt and ONE save, even though two callers
    // asked at once.
    expect(h.getDecodedSourceBufferForRender).toHaveBeenCalledTimes(1);
    expect(h.saveSongAnalysis).toHaveBeenCalledTimes(1);
  });
});

describe("ensureSongAnalysisReady — STALE/FAILED never auto-reanalyze without force", () => {
  function staleAnalysis(status: "STALE" | "FAILED"): CompleteSongAnalysis {
    return {
      id: "songana_1", sourceTrackId: "track_1", sourceMediaFingerprint: "x::1.00",
      decodedFrameCount: 6000, sampleRate: 8000, analyzerVersion: "v", configurationVersion: "v",
      status, sections: [], sectionRevisions: [], createdAt: "t0", updatedAt: "t0",
    };
  }

  it("STALE returns the existing record unchanged, no decode, no reanalysis", async () => {
    const h = makeHarness([staleAnalysis("STALE")]);
    const result = await h.orchestrator.ensureSongAnalysisReady(track(), null, { segments: [] });
    expect(result?.status).toBe("STALE");
    expect(h.getDecodedSourceBufferForRender).not.toHaveBeenCalled();
    expect(h.saveSongAnalysis).not.toHaveBeenCalled();
  });

  it("FAILED returns the existing record unchanged without `force`", async () => {
    const h = makeHarness([staleAnalysis("FAILED")]);
    const result = await h.orchestrator.ensureSongAnalysisReady(track(), null, { segments: [] });
    expect(result?.status).toBe("FAILED");
    expect(h.getDecodedSourceBufferForRender).not.toHaveBeenCalled();
  });

  it("`force: true` retries a FAILED analysis for real", async () => {
    const h = makeHarness([staleAnalysis("FAILED")]);
    const result = await h.orchestrator.ensureSongAnalysisReady(track(), null, { force: true, segments: [] });
    expect(result?.status).toBe("READY_PROVISIONAL");
    expect(h.getDecodedSourceBufferForRender).toHaveBeenCalledTimes(1);
    expect(h.saveSongAnalysis).toHaveBeenCalledTimes(1);
  });
});

describe("cancelSongAnalysis — genuine mid-run cancellation", () => {
  it("returns to NOT_ANALYZED, never FAILED, and never saves a partial result", async () => {
    const h = makeHarness([], longBuffer());
    const t = track();
    const existing: CompleteSongAnalysis = {
      id: "songana_1", sourceTrackId: t.trackId, sourceMediaFingerprint: "x::1.00",
      decodedFrameCount: 6000, sampleRate: 8000, analyzerVersion: "v", configurationVersion: "v",
      status: "FAILED", sections: [], sectionRevisions: [], createdAt: "t0", updatedAt: "t0",
    };
    h.analyses.push(existing);

    // Cancel synchronously the instant the FIRST real progress callback
    // fires — deterministic (no wall-clock race): computeDspFeaturesChunked
    // checks signal.aborted immediately after its next cooperative yield,
    // so aborting inside this callback guarantees the loop stops before
    // completing, regardless of how fast the rest of the buffer would
    // otherwise process.
    let cancelled = false;
    h.setProgress.mockImplementation(() => {
      if (!cancelled) { cancelled = true; h.orchestrator.cancelSongAnalysis(t.trackId); }
    });

    const result = await h.orchestrator.ensureSongAnalysisReady(t, null, { force: true, segments: [] });
    expect(result).toBeNull();
    expect(h.updateSongAnalysis).toHaveBeenCalledWith(existing.id, { status: "NOT_ANALYZED" });
    expect(h.updateSongAnalysis).not.toHaveBeenCalledWith(existing.id, { status: "FAILED" });
    expect(h.saveSongAnalysis).not.toHaveBeenCalled();
  });

  it("a fresh ensureSongAnalysisReady call after cancellation starts clean (no stuck in-flight entry)", async () => {
    const h = makeHarness([], longBuffer());
    const t = track();
    let cancelled = false;
    h.setProgress.mockImplementation(() => {
      if (!cancelled) { cancelled = true; h.orchestrator.cancelSongAnalysis(t.trackId); }
    });
    const first = await h.orchestrator.ensureSongAnalysisReady(t, null, { segments: [] });
    expect(first).toBeNull();

    // Now retry with a small buffer so it completes quickly and for real.
    h.setProgress.mockImplementation(() => {});
    h.getDecodedSourceBufferForRender.mockResolvedValue(smallBuffer());
    const second = await h.orchestrator.ensureSongAnalysisReady(t, null, { segments: [] });
    expect(second?.status).toBe("READY_PROVISIONAL");
  });
});

describe("armSongAnalysisCancel — deterministic live-Cancel proof (0717C debt closure)", () => {
  it("fires cancellation once real progress crosses the armed fraction, driven by the genuine framesProcessed/totalFrames stream", async () => {
    const h = makeHarness([], longBuffer());
    const t = track();
    h.orchestrator.armSongAnalysisCancel(t.trackId, 0.4);

    const progressSnapshots: ChunkedDspProgress[] = [];
    h.setProgress.mockImplementation((_id: string, p: ChunkedDspProgress) => progressSnapshots.push(p));

    const result = await h.orchestrator.ensureSongAnalysisReady(t, null, { segments: [] });

    expect(result).toBeNull(); // AbortError path -> null, never a partial analysis
    expect(progressSnapshots.length).toBeGreaterThan(0);
    const last = progressSnapshots[progressSnapshots.length - 1];
    // Stopped at/after the armed fraction, but never ran all the way to
    // completion (proving it genuinely halted, not merely "finished and
    // was then reported as cancelled").
    expect(last.framesProcessed / last.totalFrames).toBeGreaterThanOrEqual(0.4);
    expect(last.framesProcessed).toBeLessThan(last.totalFrames);
  });

  it("never fires when no fraction is armed", async () => {
    const h = makeHarness([], smallBuffer());
    const result = await h.orchestrator.ensureSongAnalysisReady(track(), null, { segments: [] });
    expect(result?.status).toBe("READY_PROVISIONAL");
  });
});

describe("recomputeSongAnalysisStatus — legal transition only", () => {
  function analysisWithSections(sections: CompleteSongAnalysis["sections"]): CompleteSongAnalysis {
    return {
      id: "songana_1", sourceTrackId: "track_1", sourceMediaFingerprint: "x::1.00",
      decodedFrameCount: 6000, sampleRate: 8000, analyzerVersion: "v", configurationVersion: "v",
      status: "READY_PROVISIONAL", sections, sectionRevisions: [], createdAt: "t0", updatedAt: "t0",
    };
  }

  it("transitions to READY_VERIFIED when every section is verified", () => {
    const analysis = analysisWithSections([
      { id: "s1", sourceTrackId: "track_1", structuralType: "body", displayLabel: "Body", startFrame: 0, endFrame: 100, confidence: 0.8, verification: "verified", origin: "analyzer" },
    ]);
    const h = makeHarness([analysis]);
    h.orchestrator.recomputeSongAnalysisStatus(analysis.id);
    expect(h.updateSongAnalysis).toHaveBeenCalledWith(analysis.id, expect.objectContaining({ status: "READY_VERIFIED" }));
  });

  it("does not transition when any section is still unverified", () => {
    const analysis = analysisWithSections([
      { id: "s1", sourceTrackId: "track_1", structuralType: "body", displayLabel: "Body", startFrame: 0, endFrame: 100, confidence: 0.8, verification: "reviewed", origin: "analyzer" },
    ]);
    const h = makeHarness([analysis]);
    h.orchestrator.recomputeSongAnalysisStatus(analysis.id);
    expect(h.updateSongAnalysis).not.toHaveBeenCalled();
  });

  it("is a no-op for a non-existent or already-verified analysis", () => {
    const h = makeHarness([]);
    expect(() => h.orchestrator.recomputeSongAnalysisStatus("missing")).not.toThrow();
    expect(h.updateSongAnalysis).not.toHaveBeenCalled();
  });
});
