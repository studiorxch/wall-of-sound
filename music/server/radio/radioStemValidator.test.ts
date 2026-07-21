import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { validateStems } from "./radioStemValidator";
import { decodeOpusFrameCount } from "./radioOpusDecodeVerify";
import { encodeOpusToFile } from "./radioOpusEncoder";
import { encodePcmWav } from "../../src/logic/loops/wavEncoder";

function makeFixtureWav(dir: string, name: string, durationSeconds: number, sampleRate: number): string {
  const numFrames = Math.round(durationSeconds * sampleRate);
  const left = new Float32Array(numFrames);
  const right = new Float32Array(numFrames);
  for (let i = 0; i < numFrames; i++) left[i] = right[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.5;
  const wav = encodePcmWav({ channelData: [left, right], sampleRate, bitDepth: 24 });
  const wavPath = path.join(dir, name);
  fs.writeFileSync(wavPath, Buffer.from(wav));
  return wavPath;
}

describe("validateStems (real ffmpeg round trip)", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "radio-stem-validator-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("returns an empty, non-omitted result when there are no stems", async () => {
    const result = await validateStems([], 48000, dir);
    expect(result).toEqual({ includedStems: [], omitted: false, issues: [] });
  });

  it("includes stems whose decoded duration matches the core", async () => {
    const coreWav = makeFixtureWav(dir, "core.wav", 1.0, 48000);
    const corePath = path.join(dir, "core.opus");
    await encodeOpusToFile(coreWav, corePath);
    const core = await decodeOpusFrameCount(corePath, dir);

    const drumsWav = makeFixtureWav(dir, "drums.wav", 1.0, 48000);
    const drumsPath = path.join(dir, "drums.opus");
    await encodeOpusToFile(drumsWav, drumsPath);

    const result = await validateStems([{ name: "drums", opusPath: drumsPath }], core.frameCount as number, dir);
    expect(result.omitted).toBe(false);
    expect(result.includedStems).toHaveLength(1);
    expect(result.issues).toEqual([]);
  }, 30_000);

  it("omits ALL stems when even one mismatches the core's duration, with a visible-warning-worthy issue", async () => {
    const coreWav = makeFixtureWav(dir, "core.wav", 1.0, 48000);
    const corePath = path.join(dir, "core.opus");
    await encodeOpusToFile(coreWav, corePath);
    const core = await decodeOpusFrameCount(corePath, dir);

    const goodStemWav = makeFixtureWav(dir, "drums.wav", 1.0, 48000);
    const goodStemPath = path.join(dir, "drums.opus");
    await encodeOpusToFile(goodStemWav, goodStemPath);

    const badStemWav = makeFixtureWav(dir, "bass.wav", 1.5, 48000); // different duration
    const badStemPath = path.join(dir, "bass.opus");
    await encodeOpusToFile(badStemWav, badStemPath);

    const result = await validateStems(
      [{ name: "drums", opusPath: goodStemPath }, { name: "bass", opusPath: badStemPath }],
      core.frameCount as number,
      dir,
    );
    expect(result.omitted).toBe(true);
    expect(result.includedStems).toEqual([]);
    expect(result.issues.some((i) => i.code === "RADIO_STEM_DURATION_MISMATCH")).toBe(true);
    expect(result.issues.some((i) => i.code === "RADIO_STEMS_OMITTED")).toBe(true);
  }, 30_000);
});
