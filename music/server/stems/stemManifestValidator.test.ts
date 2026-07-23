import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { validateStemSet } from "./stemManifestValidator";
import { encodePcmWav } from "../../src/logic/loops/wavEncoder";
import { STEM_ROLES, type StemRole } from "../../src/data/trackStemTypes";

function sineWav(dir: string, name: string, frames: number, sampleRate = 44100, channels = 2, silent = false): string {
  const chans: Float32Array[] = [];
  for (let c = 0; c < channels; c++) {
    const buf = new Float32Array(frames);
    if (!silent) for (let i = 0; i < frames; i++) buf[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.5;
    chans.push(buf);
  }
  const wav = encodePcmWav({ channelData: chans, sampleRate, bitDepth: 16 });
  const p = path.join(dir, name);
  fs.writeFileSync(p, Buffer.from(wav));
  return p;
}

function validSet(dir: string, frames = 22050): Record<StemRole, string> {
  const files = {} as Record<StemRole, string>;
  for (const role of STEM_ROLES) files[role] = sineWav(dir, `${role}.wav`, frames);
  return files;
}

describe("validateStemSet", () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "stem-validator-")); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it("accepts 4 matching, non-silent, finite, aligned WAV files", () => {
    const files = validSet(dir);
    const result = validateStemSet({ files, targetFrameCount: 22050, targetSampleRateHz: 44100, targetChannels: 2 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    for (const role of STEM_ROLES) {
      expect(result.stems[role].durationFrames).toBe(22050);
      expect(result.stems[role].contentHash.length).toBe(64);
    }
  });

  it("rejects a missing role file", () => {
    const files = validSet(dir);
    delete (files as Partial<Record<StemRole, string>>).bass;
    const result = validateStemSet({ files, targetFrameCount: 22050, targetSampleRateHz: 44100, targetChannels: 2 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((i) => i.code === "STEM_FILE_MISSING" && i.role === "bass")).toBe(true);
  });

  it("rejects a frame-count mismatch", () => {
    const files = validSet(dir);
    files.drums = sineWav(dir, "drums-wrong.wav", 11025); // half length
    const result = validateStemSet({ files, targetFrameCount: 22050, targetSampleRateHz: 44100, targetChannels: 2 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((i) => i.code === "STEM_FRAME_COUNT_MISMATCH" && i.role === "drums")).toBe(true);
  });

  it("rejects a sample-rate mismatch", () => {
    const files = validSet(dir);
    files.other = sineWav(dir, "other-wrong-rate.wav", 22050, 48000);
    const result = validateStemSet({ files, targetFrameCount: 22050, targetSampleRateHz: 44100, targetChannels: 2 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((i) => i.code === "STEM_SAMPLE_RATE_MISMATCH" && i.role === "other")).toBe(true);
  });

  it("rejects a channel-count mismatch", () => {
    const files = validSet(dir);
    files.vocals = sineWav(dir, "vocals-mono.wav", 22050, 44100, 1);
    const result = validateStemSet({ files, targetFrameCount: 22050, targetSampleRateHz: 44100, targetChannels: 2 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((i) => i.code === "STEM_CHANNEL_MISMATCH" && i.role === "vocals")).toBe(true);
  });

  it("rejects a silent (all-zero) stem", () => {
    const files = validSet(dir);
    files.bass = sineWav(dir, "bass-silent.wav", 22050, 44100, 2, true);
    const result = validateStemSet({ files, targetFrameCount: 22050, targetSampleRateHz: 44100, targetChannels: 2 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((i) => i.code === "STEM_SILENT" && i.role === "bass")).toBe(true);
  });

  it("rejects a non-WAV (e.g. MP3-like) file outright — lossy input can never reach a completed set", () => {
    const files = validSet(dir);
    const fakeMp3 = path.join(dir, "drums.wav"); // same expected path, but not a real WAV
    fs.writeFileSync(fakeMp3, Buffer.from([0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00])); // MP3 frame sync bytes, not RIFF
    files.drums = fakeMp3;
    const result = validateStemSet({ files, targetFrameCount: 22050, targetSampleRateHz: 44100, targetChannels: 2 });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issues.some((i) => i.code === "STEM_WAV_INVALID" && i.role === "drums")).toBe(true);
  });
});
