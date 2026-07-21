import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { parseProbeOutput, probeOpusFile, buildProbeArgs } from "./radioAudioProbe";
import { encodeOpusToFile } from "./radioOpusEncoder";
import { encodePcmWav } from "../../src/logic/loops/wavEncoder";

describe("buildProbeArgs", () => {
  it("is an argument array, never a shell string", () => {
    const args = buildProbeArgs("/tmp/core.opus");
    expect(args).toEqual(["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", "/tmp/core.opus"]);
  });
});

describe("parseProbeOutput", () => {
  it("accepts a valid opus/ogg probe result", () => {
    const json = JSON.stringify({
      format: { format_name: "ogg", duration: "1.500000" },
      streams: [{ codec_type: "audio", codec_name: "opus", channels: 2, sample_rate: "48000" }],
    });
    const result = parseProbeOutput(json);
    expect(result.ok).toBe(true);
    expect(result).toMatchObject({ codec: "opus", channels: 2, sampleRate: 48000, durationSeconds: 1.5 });
    expect(result.issues).toEqual([]);
  });

  it("flags a non-opus codec", () => {
    const json = JSON.stringify({
      format: { format_name: "ogg", duration: "1.0" },
      streams: [{ codec_type: "audio", codec_name: "vorbis", channels: 2, sample_rate: "48000" }],
    });
    const result = parseProbeOutput(json);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "RADIO_PROBE_CODEC_MISMATCH")).toBe(true);
  });

  it("flags a non-ogg container", () => {
    const json = JSON.stringify({
      format: { format_name: "matroska,webm", duration: "1.0" },
      streams: [{ codec_type: "audio", codec_name: "opus", channels: 2, sample_rate: "48000" }],
    });
    const result = parseProbeOutput(json);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "RADIO_PROBE_CONTAINER_MISMATCH")).toBe(true);
  });

  it("flags a missing audio stream", () => {
    const json = JSON.stringify({ format: { format_name: "ogg", duration: "1.0" }, streams: [] });
    const result = parseProbeOutput(json);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "RADIO_PROBE_NO_AUDIO_STREAM")).toBe(true);
  });

  it("returns a structured failure for unparseable JSON rather than throwing", () => {
    const result = parseProbeOutput("not json");
    expect(result.ok).toBe(false);
    expect(result.issues[0].code).toBe("RADIO_PROBE_UNPARSEABLE");
  });
});

describe("probeOpusFile (real ffprobe subprocess)", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "radio-audio-probe-"));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("confirms codec/container/channels/sampleRate for a real encoded file", async () => {
    const sampleRate = 44100;
    const numFrames = Math.round(0.5 * sampleRate);
    const left = new Float32Array(numFrames);
    const right = new Float32Array(numFrames);
    for (let i = 0; i < numFrames; i++) left[i] = right[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.5;
    const wav = encodePcmWav({ channelData: [left, right], sampleRate, bitDepth: 24 });
    const wavPath = path.join(dir, "fixture.wav");
    fs.writeFileSync(wavPath, Buffer.from(wav));
    const opusPath = path.join(dir, "core.opus");
    await encodeOpusToFile(wavPath, opusPath);

    const result = await probeOpusFile(opusPath);
    expect(result.ok).toBe(true);
    expect(result.codec).toBe("opus");
    expect(result.container).toContain("ogg");
    expect(result.channels).toBe(2);
    expect(result.sampleRate).toBe(48000);
  }, 20_000);

  it("fails structurally for a missing file", async () => {
    const result = await probeOpusFile(path.join(dir, "missing.opus"));
    expect(result.ok).toBe(false);
    expect(result.issues.length).toBeGreaterThan(0);
  }, 20_000);
});
