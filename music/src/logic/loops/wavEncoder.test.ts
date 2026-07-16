import { describe, it, expect } from "vitest";
import { encodePcmWav } from "./wavEncoder";
import { parseWavHeader } from "./loopRenderValidation";

function readAscii(view: DataView, offset: number, length: number): string {
  let s = "";
  for (let i = 0; i < length; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s;
}

describe("encodePcmWav", () => {
  it("produces a valid RIFF/WAVE header", () => {
    const buf = encodePcmWav({ channelData: [new Float32Array([0, 0.5, -0.5])], sampleRate: 44100, bitDepth: 16 });
    const view = new DataView(buf);
    expect(readAscii(view, 0, 4)).toBe("RIFF");
    expect(readAscii(view, 8, 4)).toBe("WAVE");
    expect(readAscii(view, 12, 4)).toBe("fmt ");
    expect(readAscii(view, 36, 4)).toBe("data");
  });

  it("produces a valid format chunk (channels, sample rate, byte rate, block align)", () => {
    const buf = encodePcmWav({ channelData: [new Float32Array([0, 0, 0]), new Float32Array([0, 0, 0])], sampleRate: 48000, bitDepth: 24 });
    const view = new DataView(buf);
    const numChannels = view.getUint16(22, true);
    const sampleRate = view.getUint32(24, true);
    const byteRate = view.getUint32(28, true);
    const blockAlign = view.getUint16(32, true);
    const bitsPerSample = view.getUint16(34, true);
    expect(numChannels).toBe(2);
    expect(sampleRate).toBe(48000);
    expect(blockAlign).toBe(6); // 2 channels * 3 bytes
    expect(byteRate).toBe(48000 * 6);
    expect(bitsPerSample).toBe(24);
  });

  it("computes exact data chunk size and total file length", () => {
    const frames = 100;
    const buf = encodePcmWav({ channelData: [new Float32Array(frames), new Float32Array(frames)], sampleRate: 44100, bitDepth: 24 });
    const view = new DataView(buf);
    const dataSize = view.getUint32(40, true);
    expect(dataSize).toBe(frames * 2 * 3);
    expect(buf.byteLength).toBe(44 + dataSize);
  });

  it("round-trips silence, full-scale positive, and full-scale negative for 24-bit", () => {
    const buf = encodePcmWav({ channelData: [new Float32Array([0, 1, -1])], sampleRate: 44100, bitDepth: 24 });
    const view = new DataView(buf);
    function read24(offset: number): number {
      const b0 = view.getUint8(offset), b1 = view.getUint8(offset + 1), b2 = view.getUint8(offset + 2);
      let v = b0 | (b1 << 8) | (b2 << 16);
      if (v & 0x800000) v -= 0x1000000;
      return v;
    }
    expect(read24(44)).toBe(0);
    expect(read24(47)).toBe(8388607);
    expect(read24(50)).toBe(-8388607);
  });

  it("interleaves stereo channels correctly", () => {
    const left = new Float32Array([1, 1]);
    const right = new Float32Array([-1, -1]);
    const buf = encodePcmWav({ channelData: [left, right], sampleRate: 44100, bitDepth: 16 });
    const view = new DataView(buf);
    // frame 0: L then R, each 2 bytes
    expect(view.getInt16(44, true)).toBe(32767);
    expect(view.getInt16(46, true)).toBe(-32767);
    expect(view.getInt16(48, true)).toBe(32767);
    expect(view.getInt16(50, true)).toBe(-32767);
  });

  it("clamps out-of-range (non-clipping test still validates clamp path)", () => {
    const buf = encodePcmWav({ channelData: [new Float32Array([2, -2])], sampleRate: 44100, bitDepth: 16 });
    const view = new DataView(buf);
    expect(view.getInt16(44, true)).toBe(32767);
    expect(view.getInt16(46, true)).toBe(-32767);
  });

  it("produces a header that loopRenderValidation.parseWavHeader accepts", () => {
    const buf = encodePcmWav({ channelData: [new Float32Array(10), new Float32Array(10)], sampleRate: 44100, bitDepth: 24 });
    const parsed = parseWavHeader(buf);
    expect(parsed.valid).toBe(true);
    expect(parsed.numChannels).toBe(2);
    expect(parsed.sampleRate).toBe(44100);
    expect(parsed.bitDepth).toBe(24);
    expect(parsed.dataSize).toBe(10 * 2 * 3);
  });
});
