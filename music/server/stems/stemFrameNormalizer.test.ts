import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { normalizeStemFrameCount, STEM_FRAME_ALIGNMENT_TOLERANCE_FRAMES } from "./stemFrameNormalizer";
import { readWavStreamInfoFromFile } from "../radio/radioWavFrameCounter";
import { encodePcmWav } from "../../src/logic/loops/wavEncoder";

function sineWav(dir: string, name: string, frames: number, sampleRate = 44100): string {
  const left = new Float32Array(frames);
  const right = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    left[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.5;
    right[i] = left[i];
  }
  const wav = encodePcmWav({ channelData: [left, right], sampleRate, bitDepth: 16 });
  const p = path.join(dir, name);
  fs.writeFileSync(p, Buffer.from(wav));
  return p;
}

describe("normalizeStemFrameCount", () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "stem-frame-norm-")); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it("is a no-op when frame count already matches", () => {
    const p = sineWav(dir, "a.wav", 1000);
    const result = normalizeStemFrameCount(p, 1000);
    expect(result).toEqual({ ok: true, appliedFrames: 0 });
    expect(readWavStreamInfoFromFile(p).frameCount).toBe(1000);
  });

  it("trims trailing frames when the file is longer than target, within tolerance", () => {
    const p = sineWav(dir, "a.wav", 1010);
    const result = normalizeStemFrameCount(p, 1000);
    expect(result.ok).toBe(true);
    expect(result.appliedFrames).toBe(10);
    const info = readWavStreamInfoFromFile(p);
    expect(info.valid).toBe(true);
    expect(info.frameCount).toBe(1000);
  });

  it("zero-pads trailing frames when the file is shorter than target, within tolerance", () => {
    const p = sineWav(dir, "a.wav", 995);
    const result = normalizeStemFrameCount(p, 1000);
    expect(result.ok).toBe(true);
    expect(result.appliedFrames).toBe(-5);
    const info = readWavStreamInfoFromFile(p);
    expect(info.valid).toBe(true);
    expect(info.frameCount).toBe(1000);
  });

  it("the padded tail is genuinely silent (zero bytes), never garbage", () => {
    const p = sineWav(dir, "a.wav", 995);
    normalizeStemFrameCount(p, 1000);
    const buf = fs.readFileSync(p);
    const info = readWavStreamInfoFromFile(p);
    const blockAlign = (info.numChannels ?? 2) * ((info.bitsPerSample ?? 16) / 8);
    const tailStart = info.dataOffset! + 995 * blockAlign;
    const tail = buf.subarray(tailStart, info.dataOffset! + info.dataSize!);
    expect(tail.every((b) => b === 0)).toBe(true);
  });

  it("fails (never silently forces) a discrepancy beyond tolerance", () => {
    const p = sineWav(dir, "a.wav", 1000 + STEM_FRAME_ALIGNMENT_TOLERANCE_FRAMES + 1000);
    const result = normalizeStemFrameCount(p, 1000);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("exceeds tolerance");
    // Untouched — still its original frame count.
    expect(readWavStreamInfoFromFile(p).frameCount).toBe(1000 + STEM_FRAME_ALIGNMENT_TOLERANCE_FRAMES + 1000);
  });

  it("reports failure for an unreadable file", () => {
    const p = path.join(dir, "does-not-exist.wav");
    const result = normalizeStemFrameCount(p, 1000);
    expect(result.ok).toBe(false);
  });
});
