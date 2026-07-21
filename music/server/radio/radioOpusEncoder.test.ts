import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildOpusEncodeArgs, encodeOpusToFile } from "./radioOpusEncoder";
import { encodePcmWav } from "../../src/logic/loops/wavEncoder";

describe("buildOpusEncodeArgs", () => {
  it("matches the spec's documented ffmpeg command shape, as an argument array", () => {
    const args = buildOpusEncodeArgs("/tmp/in.wav", "/tmp/out.opus");
    expect(args).toEqual([
      "-y",
      "-i", "/tmp/in.wav",
      "-map_metadata", "-1",
      "-c:a", "libopus",
      "-application", "audio",
      "-b:a", "128k",
      "-vbr", "on",
      "-compression_level", "10",
      "/tmp/out.opus",
    ]);
  });

  it("never produces a single interpolated shell string", () => {
    const args = buildOpusEncodeArgs("in with spaces.wav", "out.opus");
    expect(Array.isArray(args)).toBe(true);
    for (const arg of args) expect(typeof arg).toBe("string");
  });
});

describe("encodeOpusToFile (real ffmpeg subprocess)", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "radio-opus-encoder-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function makeFixtureWav(durationSeconds = 0.5, sampleRate = 44100): string {
    const numFrames = Math.round(durationSeconds * sampleRate);
    const left = new Float32Array(numFrames);
    const right = new Float32Array(numFrames);
    for (let i = 0; i < numFrames; i++) {
      left[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.5;
      right[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.5;
    }
    const wav = encodePcmWav({ channelData: [left, right], sampleRate, bitDepth: 24 });
    const wavPath = path.join(dir, "fixture.wav");
    fs.writeFileSync(wavPath, Buffer.from(wav));
    return wavPath;
  }

  it("encodes a real WAV fixture to a non-empty .opus file", async () => {
    const inputWavPath = makeFixtureWav();
    const outputOpusPath = path.join(dir, "core.opus");

    const result = await encodeOpusToFile(inputWavPath, outputOpusPath);

    expect(result.ok).toBe(true);
    expect(result.byteSize).toBeGreaterThan(0);
    expect(fs.existsSync(outputOpusPath)).toBe(true);
    expect(result.encodingPolicy.codec).toBe("libopus");
  }, 20_000);

  it("controlled-overwrites its own prior attempt at the same staged path", async () => {
    const inputWavPath = makeFixtureWav();
    const outputOpusPath = path.join(dir, "core.opus");
    const first = await encodeOpusToFile(inputWavPath, outputOpusPath);
    const second = await encodeOpusToFile(inputWavPath, outputOpusPath);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
  }, 20_000);

  it("reports failure with a non-empty stderr tail for a missing input", async () => {
    const outputOpusPath = path.join(dir, "core.opus");
    const result = await encodeOpusToFile(path.join(dir, "does-not-exist.wav"), outputOpusPath);
    expect(result.ok).toBe(false);
    expect(result.stderrTail.length).toBeGreaterThan(0);
    expect(fs.existsSync(outputOpusPath)).toBe(false);
  }, 20_000);
});
