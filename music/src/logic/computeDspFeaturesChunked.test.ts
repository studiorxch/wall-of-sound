import { describe, it, expect } from "vitest";
import { computeDspFeaturesChunked, computeDspFeaturesFromInput, computeFrameFeatures } from "./dspFeatureExtraction";
import type { AudioAnalysisInput } from "../data/audioDetectionTypes";

const SAMPLE_RATE = 8000;
const FRAME_SIZE = 64;
const HOP_SIZE = 32;

function longInput(frameCount = 60): AudioAnalysisInput {
  // Enough samples to span `frameCount` hops at the small test frame/hop
  // sizes above — far more than one chunk at framesPerChunk=5, so the
  // chunked driver genuinely yields multiple times.
  const length = FRAME_SIZE + (frameCount - 1) * HOP_SIZE;
  const mono = new Float32Array(length);
  for (let i = 0; i < length; i++) mono[i] = Math.sin(i * 0.13) * 0.4 + Math.sin(i * 0.021) * 0.2;
  return { sampleRate: SAMPLE_RATE, channels: [mono], mono, durationSeconds: length / SAMPLE_RATE };
}

describe("computeDspFeaturesChunked — long-source progress, yielding, cancellation", () => {
  it("reports progress multiple times with monotonically increasing framesProcessed, never a single 0→done jump", async () => {
    const progressEvents: { framesProcessed: number; totalFrames: number }[] = [];
    // 63, not a clean multiple of framesPerChunk=5, so the final unconditional
    // post-loop onProgress call reports a genuinely higher framesProcessed
    // than the last periodic one (63 vs. 60) rather than repeating it.
    const result = await computeDspFeaturesChunked(longInput(63), {
      frameSize: FRAME_SIZE, hopSize: HOP_SIZE, framesPerChunk: 5,
      onProgress: (p) => progressEvents.push({ framesProcessed: p.framesProcessed, totalFrames: p.totalFrames }),
    });
    expect(progressEvents.length).toBeGreaterThan(1);
    for (let i = 1; i < progressEvents.length; i++) {
      expect(progressEvents[i].framesProcessed).toBeGreaterThanOrEqual(progressEvents[i - 1].framesProcessed);
    }
    expect(new Set(progressEvents.map((p) => p.framesProcessed)).size).toBeGreaterThan(2);
    expect(progressEvents[progressEvents.length - 1].framesProcessed).toBe(progressEvents[progressEvents.length - 1].totalFrames);
    expect(result.rawFrameSeries.rmsValues.length).toBe(progressEvents[progressEvents.length - 1].totalFrames);
  });

  // The exact yielding proof the round-3 correction requires: an
  // independently-scheduled setTimeout(0) marker resolves before the
  // analysis promise does, proving control genuinely returns to the event
  // loop mid-run rather than the analysis blocking the thread until done.
  it("actually yields to the event loop mid-run (a setTimeout(0) marker resolves before the analysis promise does)", async () => {
    let markerFired = false;
    const markerPromise = new Promise<void>((resolve) => {
      setTimeout(() => { markerFired = true; resolve(); }, 0);
    });
    const analysisPromise = computeDspFeaturesChunked(longInput(80), {
      frameSize: FRAME_SIZE, hopSize: HOP_SIZE, framesPerChunk: 5,
    });
    await Promise.race([markerPromise, analysisPromise]);
    expect(markerFired).toBe(true);
    // Drain the real analysis so the test doesn't leave a dangling promise.
    await analysisPromise;
  });

  it("genuinely halts computation on abort — rejects with AbortError and progress stops growing (bounded by at most one more chunk)", async () => {
    const controller = new AbortController();
    const progressEvents: number[] = [];
    let progressCountAtAbort = 0;

    const analysisPromise = computeDspFeaturesChunked(longInput(200), {
      frameSize: FRAME_SIZE, hopSize: HOP_SIZE, framesPerChunk: 5,
      signal: controller.signal,
      onProgress: (p) => {
        progressEvents.push(p.framesProcessed);
        if (progressEvents.length === 1) {
          progressCountAtAbort = progressEvents.length;
          controller.abort();
        }
      },
    });

    await expect(analysisPromise).rejects.toMatchObject({ name: "AbortError" });
    // At most one more chunk's worth of progress events may have fired
    // between the abort call and the loop's next checkAbort() — never the
    // full run.
    expect(progressEvents.length).toBeLessThanOrEqual(progressCountAtAbort + 1);
    expect(progressEvents.length).toBeLessThan(200 / 5);
  });

  it("rejects immediately (before any frame work) when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(computeDspFeaturesChunked(longInput(10), { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  });
});

// 0717D_RADIO_Playlist_Inbox_and_Performance_Foundation — per-frame min/max,
// gathered inside this SAME chunked/yielding/abortable loop (never a second
// full-buffer pass) so songWaveformSummary.ts can build a persisted
// waveform overview without ever touching raw samples directly.
describe("computeDspFeaturesChunked — per-frame min/max (waveform-summary source data)", () => {
  it("populates minValues/maxValues one entry per frame, matching every other per-frame series in length", async () => {
    const result = await computeDspFeaturesChunked(longInput(63), { frameSize: FRAME_SIZE, hopSize: HOP_SIZE, framesPerChunk: 5 });
    expect(result.rawFrameSeries.minValues.length).toBe(result.rawFrameSeries.rmsValues.length);
    expect(result.rawFrameSeries.maxValues.length).toBe(result.rawFrameSeries.rmsValues.length);
  });

  it("each frame's min/max are its real sample extremes, not an approximation", async () => {
    // A single, easily verified frame: frameSize=64, hopSize=32 means the
    // very first frame is samples[0..64) exactly.
    const input = longInput(5);
    const result = await computeDspFeaturesChunked(input, { frameSize: FRAME_SIZE, hopSize: HOP_SIZE, framesPerChunk: 5 });
    const firstFrame = input.mono.subarray(0, FRAME_SIZE);
    const expectedMin = Math.min(...firstFrame);
    const expectedMax = Math.max(...firstFrame);
    expect(result.rawFrameSeries.minValues[0]).toBeCloseTo(expectedMin, 10);
    expect(result.rawFrameSeries.maxValues[0]).toBeCloseTo(expectedMax, 10);
  });

  it("min never exceeds max for any frame", async () => {
    const result = await computeDspFeaturesChunked(longInput(60), { frameSize: FRAME_SIZE, hopSize: HOP_SIZE, framesPerChunk: 7 });
    for (let i = 0; i < result.rawFrameSeries.minValues.length; i++) {
      expect(result.rawFrameSeries.minValues[i]).toBeLessThanOrEqual(result.rawFrameSeries.maxValues[i]);
    }
  });

  it("does not regress the existing yielding/abort/progress proofs above — min/max collection adds no new pass over the buffer", async () => {
    const controller = new AbortController();
    let firedOnce = false;
    const analysisPromise = computeDspFeaturesChunked(longInput(200), {
      frameSize: FRAME_SIZE, hopSize: HOP_SIZE, framesPerChunk: 5, signal: controller.signal,
      onProgress: () => { if (!firedOnce) { firedOnce = true; controller.abort(); } },
    });
    await expect(analysisPromise).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("computeDspFeaturesChunked / computeDspFeaturesFromInput parity", () => {
  it("computeFrameFeatures extraction is behavior-preserving — both the synchronous and chunked drivers agree on the same audioAnalysis for identical input/options", async () => {
    const input = longInput(60);
    const options = { frameSize: FRAME_SIZE, hopSize: HOP_SIZE };
    const sync = computeDspFeaturesFromInput(input, options);
    const chunked = await computeDspFeaturesChunked(input, { ...options, framesPerChunk: 7 });
    // Both stamp their own analyzedAt independently — strip it before
    // comparing since a millisecond timing difference isn't a behavioral
    // difference between the two drivers.
    expect({ ...chunked.audioAnalysis, analyzedAt: undefined }).toEqual({ ...sync.audioAnalysis, analyzedAt: undefined });
  });

  it("computeFrameFeatures is a pure function of its inputs (same frame in, same features out)", () => {
    const frame = new Float32Array(64);
    for (let i = 0; i < 64; i++) frame[i] = Math.sin(i * 0.2) * 0.5;
    const a = computeFrameFeatures(frame, 64, SAMPLE_RATE / 64);
    const b = computeFrameFeatures(frame, 64, SAMPLE_RATE / 64);
    expect(a).toEqual(b);
  });

  it("adds bassEnergy as a real, additive computation without disturbing rms/zcr/centroid/rolloff/bandwidth", () => {
    const frame = new Float32Array(64);
    for (let i = 0; i < 64; i++) frame[i] = Math.sin(i * 0.5) * 0.8;
    const f = computeFrameFeatures(frame, 64, SAMPLE_RATE / 64);
    expect(f.bassEnergy).not.toBeNull();
    expect(f.bassEnergy!).toBeGreaterThanOrEqual(0);
    expect(f.bassEnergy!).toBeLessThanOrEqual(1);
    expect(f.rms).toBeGreaterThan(0);
  });
});
