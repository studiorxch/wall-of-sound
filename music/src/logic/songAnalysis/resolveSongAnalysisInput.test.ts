import { describe, it, expect, vi } from "vitest";
import { resolveSongAnalysisInput } from "./resolveSongAnalysisInput";
import { audioBufferToAnalysisInput } from "../audioAnalysisInput";
import type { Track } from "../../data/trackTypes";

// Minimal AudioBuffer stand-in — matches this project's existing convention
// (sectionalLooperWaveform.test.ts) of not unit-testing Web-Audio-dependent
// code directly, only the pure numeric conversion.
function fakeBuffer(channels: number[][], sampleRate = 44100): AudioBuffer {
  const length = channels[0]?.length ?? 0;
  return {
    sampleRate, length, duration: length / sampleRate,
    numberOfChannels: channels.length,
    getChannelData: (ch: number) => Float32Array.from(channels[ch]),
  } as unknown as AudioBuffer;
}

function track(): Track {
  return { trackId: "track_1", title: "Some Track" } as unknown as Track;
}

describe("resolveSongAnalysisInput", () => {
  // The exact test the plan-review correction requires: "opening an
  // already-decoded track does not decode it again."
  it("never calls getCachedOrDecode when an existingBuffer is already provided", async () => {
    const buffer = fakeBuffer([[0.1, 0.2, 0.3, 0.4]]);
    const getCachedOrDecode = vi.fn().mockResolvedValue(null);
    const result = await resolveSongAnalysisInput(buffer, getCachedOrDecode, track());
    expect(getCachedOrDecode).not.toHaveBeenCalled();
    expect(result).not.toBeNull();
    expect(result!.mono).toHaveLength(4);
  });

  it("calls getCachedOrDecode exactly once, and converts its result, when existingBuffer is null", async () => {
    const buffer = fakeBuffer([[0.5, 0.6, 0.7]]);
    const getCachedOrDecode = vi.fn().mockResolvedValue(buffer);
    const result = await resolveSongAnalysisInput(null, getCachedOrDecode, track());
    expect(getCachedOrDecode).toHaveBeenCalledTimes(1);
    expect(getCachedOrDecode).toHaveBeenCalledWith(track());
    expect(result!.mono).toEqual(Float32Array.from([0.5, 0.6, 0.7]));
  });

  it("returns null (without throwing) when no buffer can be resolved at all", async () => {
    const getCachedOrDecode = vi.fn().mockResolvedValue(null);
    const result = await resolveSongAnalysisInput(null, getCachedOrDecode, track());
    expect(result).toBeNull();
    expect(getCachedOrDecode).toHaveBeenCalledTimes(1);
  });

  it("converts with no maxDurationSec cap — both buffer sources are already full, untruncated decodes", async () => {
    const longBuffer = fakeBuffer([new Array(500000).fill(0.1)]);
    const result = await resolveSongAnalysisInput(longBuffer, vi.fn(), track());
    expect(result!.mono).toHaveLength(500000);
  });
});

describe("audioBufferToAnalysisInput output matches decodeAudioAnalysisInput's own mono-mixdown", () => {
  it("produces an identical mono mixdown for the same buffer content (proving the extraction didn't change behavior)", () => {
    const left = [0.2, 0.4, 0.6, 0.8];
    const right = [0.0, 0.1, 0.2, 0.3];
    const buffer = fakeBuffer([left, right]);
    const result = audioBufferToAnalysisInput(buffer);
    const expectedMono = left.map((l, i) => (l + right[i]) / 2);
    result.mono.forEach((v, i) => expect(v).toBeCloseTo(expectedMono[i], 5));
    expect(result.sampleRate).toBe(44100);
    expect(result.channels).toHaveLength(2);
  });

  it("respects an explicit maxDurationSec cap when one is passed (unlike the uncapped song-analysis call path)", () => {
    const buffer = fakeBuffer([[0.1, 0.2, 0.3, 0.4, 0.5, 0.6]], 2);
    const result = audioBufferToAnalysisInput(buffer, { maxDurationSec: 2 });
    expect(result.mono).toHaveLength(4);
  });

  it("honors channelMode 'left'/'right' the same way the fetch-based decode path does", () => {
    const buffer = fakeBuffer([[1, 2, 3], [9, 9, 9]]);
    expect(Array.from(audioBufferToAnalysisInput(buffer, { channelMode: "left" }).mono)).toEqual([1, 2, 3]);
    expect(Array.from(audioBufferToAnalysisInput(buffer, { channelMode: "right" }).mono)).toEqual([9, 9, 9]);
  });
});
