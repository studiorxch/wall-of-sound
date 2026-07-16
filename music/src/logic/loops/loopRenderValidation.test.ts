import { describe, it, expect } from "vitest";
import { encodePcmWav } from "./wavEncoder";
import { parseWavHeader, validateRenderedWav, hasNaNSamples } from "./loopRenderValidation";

describe("parseWavHeader", () => {
  it("accepts a valid header", () => {
    const buf = encodePcmWav({ channelData: [new Float32Array(10)], sampleRate: 44100, bitDepth: 16 });
    expect(parseWavHeader(buf).valid).toBe(true);
  });

  it("rejects a file too small to contain a header", () => {
    expect(parseWavHeader(new ArrayBuffer(10)).valid).toBe(false);
  });

  it("rejects a truncated data chunk", () => {
    const buf = encodePcmWav({ channelData: [new Float32Array(100)], sampleRate: 44100, bitDepth: 16 });
    const truncated = buf.slice(0, buf.byteLength - 50);
    const parsed = parseWavHeader(truncated);
    expect(parsed.valid).toBe(false);
    expect(parsed.error).toBe("truncated_data_chunk");
  });

  it("rejects bad RIFF/WAVE signatures", () => {
    const buf = encodePcmWav({ channelData: [new Float32Array(10)], sampleRate: 44100, bitDepth: 16 });
    const view = new DataView(buf);
    view.setUint8(0, 0); // corrupt "R" of "RIFF"
    expect(parseWavHeader(buf).valid).toBe(false);
  });
});

describe("validateRenderedWav", () => {
  it("passes a valid render", () => {
    const sampleRate = 44100;
    const durationSeconds = 1;
    const frames = sampleRate * durationSeconds;
    const buf = encodePcmWav({ channelData: [new Float32Array(frames), new Float32Array(frames)], sampleRate, bitDepth: 24 });
    const result = validateRenderedWav(buf, { sampleRate, bitDepth: 24, channels: 2, expectedDurationSeconds: durationSeconds });
    expect(result.ok).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it("fails a truncated file", () => {
    const buf = encodePcmWav({ channelData: [new Float32Array(1000)], sampleRate: 44100, bitDepth: 16 });
    const truncated = buf.slice(0, 40);
    const result = validateRenderedWav(truncated, { sampleRate: 44100, bitDepth: 16, channels: 1, expectedDurationSeconds: 1000 / 44100 });
    expect(result.ok).toBe(false);
  });

  it("fails when sample rate does not match expectation", () => {
    const buf = encodePcmWav({ channelData: [new Float32Array(1000)], sampleRate: 44100, bitDepth: 16 });
    const result = validateRenderedWav(buf, { sampleRate: 48000, bitDepth: 16, channels: 1, expectedDurationSeconds: 1000 / 44100 });
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain("sample_rate_mismatch");
  });

  it("fails when duration does not match expectation", () => {
    const buf = encodePcmWav({ channelData: [new Float32Array(1000)], sampleRate: 44100, bitDepth: 16 });
    const result = validateRenderedWav(buf, { sampleRate: 44100, bitDepth: 16, channels: 1, expectedDurationSeconds: 10 });
    expect(result.ok).toBe(false);
    expect(result.reasons).toContain("duration_mismatch");
  });

  it("fails empty data", () => {
    const buf = encodePcmWav({ channelData: [new Float32Array(0)], sampleRate: 44100, bitDepth: 16 });
    const result = validateRenderedWav(buf, { sampleRate: 44100, bitDepth: 16, channels: 1, expectedDurationSeconds: 0 });
    expect(result.reasons).toContain("empty_data");
  });
});

describe("hasNaNSamples", () => {
  it("detects NaN samples", () => {
    expect(hasNaNSamples([new Float32Array([0, NaN, 1])])).toBe(true);
  });
  it("passes clean samples", () => {
    expect(hasNaNSamples([new Float32Array([0, 0.5, -0.5])])).toBe(false);
  });
});
