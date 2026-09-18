// MUSIC Catalog Technical Format Verification — foundation
// (0827_MUSIC_CatalogTechnicalFormatVerification). Generic, read-only
// ffprobe wrapper. Unlike radio/radioAudioProbe.ts's probeOpusFile, this
// makes no assumption about what codec/container a file SHOULD be — it
// reports exactly what ffprobe found, for the caller (see
// src/logic/trackAssetVerification.ts) to normalize. Never writes,
// renames, or moves the probed file.

import { execFile } from "node:child_process";
import { buildProbeArgs } from "./radio/radioAudioProbe";

export interface RawAudioProbeResult {
  ok: boolean;
  containerFormat: string | null;
  audioCodec: string | null;
  sampleRate: number | null;
  bitDepth: number | null;
  channelCount: number | null;
  byteSize: number | null;
  error: string | null;
}

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  channels?: number;
  sample_rate?: string;
  bits_per_raw_sample?: string;
  sample_fmt?: string;
}
interface FfprobeFormat {
  format_name?: string;
  size?: string;
}
interface FfprobeOutput {
  format?: FfprobeFormat;
  streams?: FfprobeStream[];
}

// ffprobe reports bit depth two ways depending on codec: PCM streams carry
// bits_per_raw_sample directly (most authoritative when present); lossy
// codecs instead carry sample_fmt (an internal decode format, e.g. "fltp"),
// which this table maps to the bit width that name implies.
const SAMPLE_FMT_BIT_DEPTH: Record<string, number> = {
  u8: 8, u8p: 8,
  s16: 16, s16p: 16,
  s32: 32, s32p: 32,
  flt: 32, fltp: 32,
  dbl: 64, dblp: 64,
};

export function parseAudioProbeJson(jsonText: string): RawAudioProbeResult {
  let parsed: FfprobeOutput;
  try {
    parsed = JSON.parse(jsonText) as FfprobeOutput;
  } catch {
    return {
      ok: false, containerFormat: null, audioCodec: null, sampleRate: null,
      bitDepth: null, channelCount: null, byteSize: null,
      error: "ffprobe output was not valid JSON",
    };
  }

  const byteSize = parsed.format?.size ? Number(parsed.format.size) : null;
  const containerFormat = parsed.format?.format_name ?? null;
  const audioStream = parsed.streams?.find((s) => s.codec_type === "audio");
  if (!audioStream) {
    return {
      ok: false, containerFormat, audioCodec: null, sampleRate: null,
      bitDepth: null, channelCount: null, byteSize,
      error: "No audio stream found",
    };
  }

  const bitDepth = audioStream.bits_per_raw_sample
    ? Number(audioStream.bits_per_raw_sample)
    : audioStream.sample_fmt
      ? (SAMPLE_FMT_BIT_DEPTH[audioStream.sample_fmt] ?? null)
      : null;

  return {
    ok: true,
    containerFormat,
    audioCodec: audioStream.codec_name ?? null,
    sampleRate: audioStream.sample_rate ? Number(audioStream.sample_rate) : null,
    bitDepth,
    channelCount: audioStream.channels ?? null,
    byteSize,
    error: null,
  };
}

export function probeAudioFile(absoluteFilePath: string): Promise<RawAudioProbeResult> {
  const args = buildProbeArgs(absoluteFilePath);
  return new Promise((resolve) => {
    execFile("ffprobe", args, { maxBuffer: 1024 * 1024 * 16 }, (error, stdout) => {
      if (error) {
        resolve({
          ok: false, containerFormat: null, audioCodec: null, sampleRate: null,
          bitDepth: null, channelCount: null, byteSize: null,
          error: error.message,
        });
        return;
      }
      resolve(parseAudioProbeJson(stdout));
    });
  });
}
