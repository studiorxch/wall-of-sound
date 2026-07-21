import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { validateEncodedCore } from "./radioEncodedAudioValidator";
import { encodeOpusToFile } from "./radioOpusEncoder";
import { encodePcmWav } from "../../src/logic/loops/wavEncoder";

function makeFixtureWav(dir: string, durationSeconds: number, sampleRate: number): string {
  const numFrames = Math.round(durationSeconds * sampleRate);
  const left = new Float32Array(numFrames);
  const right = new Float32Array(numFrames);
  for (let i = 0; i < numFrames; i++) left[i] = right[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.5;
  const wav = encodePcmWav({ channelData: [left, right], sampleRate, bitDepth: 24 });
  const wavPath = path.join(dir, "fixture.wav");
  fs.writeFileSync(wavPath, Buffer.from(wav));
  return wavPath;
}

describe("validateEncodedCore (real ffmpeg round trip)", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "radio-encoded-validator-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("passes both probe and decode-verify for a real valid encode", async () => {
    const wavPath = makeFixtureWav(dir, 1.0, 48000);
    const opusPath = path.join(dir, "core.opus");
    await encodeOpusToFile(wavPath, opusPath);

    const result = await validateEncodedCore(opusPath, wavPath, dir);
    expect(result.ok).toBe(true);
    expect(result.probe.ok).toBe(true);
    expect(result.decodeVerify.ok).toBe(true);
    expect(result.issues).toEqual([]);
  }, 20_000);

  it("fails when the encoded file does not exist", async () => {
    const wavPath = makeFixtureWav(dir, 1.0, 48000);
    const result = await validateEncodedCore(path.join(dir, "missing.opus"), wavPath, dir);
    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  }, 20_000);
});
