import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  computeExpectedDecodedFrames,
  framesMatchWithinTolerance,
  decodeAndVerifyCoreFrames,
  decodeOpusFrameCount,
} from "./radioOpusDecodeVerify";
import { encodeOpusToFile } from "./radioOpusEncoder";
import { encodePcmWav } from "../../src/logic/loops/wavEncoder";
import { RADIO_OPUS_FRAME_TOLERANCE } from "../../src/data/radioLoopTypes";

describe("computeExpectedDecodedFrames", () => {
  it("is a no-op projection when the source is already 48kHz", () => {
    expect(computeExpectedDecodedFrames(48000, 48000)).toBe(48000);
  });

  it("projects a 44.1kHz source frame count forward to 48kHz", () => {
    // 44100 frames at 44100Hz = 1.000s; at 48000Hz that's 48000 frames.
    expect(computeExpectedDecodedFrames(44100, 44100)).toBe(48000);
  });

  it("rounds rather than truncates", () => {
    expect(computeExpectedDecodedFrames(1, 44100)).toBe(Math.round(48000 / 44100));
  });
});

describe("framesMatchWithinTolerance", () => {
  it("accepts exact matches and small deltas up to the tolerance", () => {
    expect(framesMatchWithinTolerance(1000, 1000)).toBe(true);
    expect(framesMatchWithinTolerance(1000, 1000 + RADIO_OPUS_FRAME_TOLERANCE)).toBe(true);
  });

  it("rejects deltas beyond the tolerance", () => {
    expect(framesMatchWithinTolerance(1000, 1000 + RADIO_OPUS_FRAME_TOLERANCE + 1)).toBe(false);
  });
});

function makeFixtureWav(dir: string, durationSeconds: number, sampleRate: number): string {
  const numFrames = Math.round(durationSeconds * sampleRate);
  const left = new Float32Array(numFrames);
  const right = new Float32Array(numFrames);
  for (let i = 0; i < numFrames; i++) left[i] = right[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.5;
  const wav = encodePcmWav({ channelData: [left, right], sampleRate, bitDepth: 24 });
  const wavPath = path.join(dir, `fixture-${sampleRate}.wav`);
  fs.writeFileSync(wavPath, Buffer.from(wav));
  return wavPath;
}

describe("decodeAndVerifyCoreFrames (real ffmpeg round trip)", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "radio-decode-verify-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("passes for a 48kHz source encoded then decoded back", async () => {
    const wavPath = makeFixtureWav(dir, 1.0, 48000);
    const opusPath = path.join(dir, "core.opus");
    await encodeOpusToFile(wavPath, opusPath);

    const result = await decodeAndVerifyCoreFrames(opusPath, wavPath, dir);
    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
    expect(result.deltaFrames).not.toBeNull();
    expect(result.deltaFrames as number).toBeLessThanOrEqual(RADIO_OPUS_FRAME_TOLERANCE);
  }, 20_000);

  it("passes for a 44.1kHz source (rate-normalized comparison, not raw frame counts)", async () => {
    const wavPath = makeFixtureWav(dir, 1.0, 44100);
    const opusPath = path.join(dir, "core.opus");
    await encodeOpusToFile(wavPath, opusPath);

    const result = await decodeAndVerifyCoreFrames(opusPath, wavPath, dir);
    expect(result.ok).toBe(true);
    // Raw frame counts (44100 source vs ~48000 decoded) would look like a
    // gross mismatch if compared directly — proves normalization is real.
    expect(result.expectedFrameCount).toBeGreaterThan(47000);
    expect(result.decodedFrameCount).toBeGreaterThan(47000);
  }, 20_000);

  it("fails structurally when the encoded file cannot be decoded", async () => {
    const wavPath = makeFixtureWav(dir, 1.0, 48000);
    const bogusOpusPath = path.join(dir, "bogus.opus");
    fs.writeFileSync(bogusOpusPath, Buffer.from("not a real opus file"));

    const result = await decodeAndVerifyCoreFrames(bogusOpusPath, wavPath, dir);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "RADIO_DECODE_FAILED")).toBe(true);
  }, 20_000);
});

describe("decodeOpusFrameCount", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "radio-decode-frame-count-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("returns matching decoded frame counts for two identical encodes (core vs stem stand-in)", async () => {
    const wavPath = makeFixtureWav(dir, 0.75, 48000);
    const coreOpusPath = path.join(dir, "core.opus");
    const stemOpusPath = path.join(dir, "stem.opus");
    await encodeOpusToFile(wavPath, coreOpusPath);
    await encodeOpusToFile(wavPath, stemOpusPath);

    const core = await decodeOpusFrameCount(coreOpusPath, dir);
    const stem = await decodeOpusFrameCount(stemOpusPath, dir);
    expect(core.ok).toBe(true);
    expect(stem.ok).toBe(true);
    expect(Math.abs((core.frameCount as number) - (stem.frameCount as number))).toBeLessThanOrEqual(RADIO_OPUS_FRAME_TOLERANCE);
  }, 20_000);
});
