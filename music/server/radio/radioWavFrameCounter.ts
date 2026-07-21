// 0718B_RADIO_Web_Publication_Asset_Export_Bridge — a proper RIFF
// chunk-walking WAV reader for the staged canonical PCM baseline.
// Node-only.
//
// Why this exists instead of reusing parseWavHeader
// (src/logic/loops/loopRenderValidation): the staged WAV is produced BY
// ffmpeg at pcm_s24le, and ffmpeg's wav muxer emits WAVE_FORMAT_EXTENSIBLE
// (a 40-byte `fmt ` chunk) for 24-bit output — the fixed-offset
// parseWavHeader was proven live (0716B, documented in
// radioOpusDecodeVerify.ts) to misread exactly that layout. The loop
// pipeline never hit this because its 24-bit WAVs come from the browser's
// own wavEncoder (always a 16-byte `fmt `). This walker reads any
// PCM/extensible-PCM WAV by walking chunks, so the 24-bit staging policy
// (no 16-bit bottleneck before the Opus encode — 0718B plan correction)
// is safe. The decode-BACK side of verification keeps parseWavHeader and
// its 16-bit contract unchanged.

import fs from "node:fs";

export interface WavStreamInfo {
  valid: boolean;
  formatTag: number | null; // 1 = PCM, 3 = IEEE float, 0xFFFE = extensible
  numChannels: number | null;
  sampleRate: number | null;
  bitsPerSample: number | null;
  dataSize: number | null;
  frameCount: number | null;
  error?: string;
}

const WAVE_FORMAT_EXTENSIBLE = 0xfffe;

function invalid(error: string): WavStreamInfo {
  return { valid: false, formatTag: null, numChannels: null, sampleRate: null, bitsPerSample: null, dataSize: null, frameCount: null, error };
}

// Pure over a Buffer — exported for direct unit testing against real
// ffmpeg-produced files and synthetic malformed inputs.
export function readWavStreamInfo(buf: Buffer): WavStreamInfo {
  if (buf.length < 12) return invalid("file too small for a RIFF header");
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    return invalid("not a RIFF/WAVE file");
  }

  let formatTag: number | null = null;
  let numChannels: number | null = null;
  let sampleRate: number | null = null;
  let bitsPerSample: number | null = null;
  let dataSize: number | null = null;

  let offset = 12;
  while (offset + 8 <= buf.length) {
    const chunkId = buf.toString("ascii", offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;

    if (chunkId === "fmt ") {
      if (chunkStart + 16 > buf.length) return invalid("truncated fmt chunk");
      formatTag = buf.readUInt16LE(chunkStart);
      numChannels = buf.readUInt16LE(chunkStart + 2);
      sampleRate = buf.readUInt32LE(chunkStart + 4);
      bitsPerSample = buf.readUInt16LE(chunkStart + 14);
      // WAVE_FORMAT_EXTENSIBLE carries the real format tag in the
      // SubFormat GUID's first two bytes (after cbSize + validBits + mask).
      if (formatTag === WAVE_FORMAT_EXTENSIBLE && chunkStart + 26 <= buf.length) {
        formatTag = buf.readUInt16LE(chunkStart + 24);
      }
    } else if (chunkId === "data") {
      // The declared data size; for a well-formed file this is the PCM
      // payload length. Clamp to what is physically present.
      dataSize = Math.min(chunkSize, buf.length - chunkStart);
      // data is by convention the last chunk we need — keep walking anyway
      // in case of trailing metadata, but nothing after this changes state.
    }

    // Chunks are word-aligned: odd sizes are padded by one byte.
    offset = chunkStart + chunkSize + (chunkSize % 2);
  }

  if (formatTag == null || numChannels == null || sampleRate == null || bitsPerSample == null) {
    return invalid("missing fmt chunk");
  }
  if (dataSize == null) return invalid("missing data chunk");
  if (numChannels <= 0 || sampleRate <= 0 || bitsPerSample <= 0 || bitsPerSample % 8 !== 0) {
    return invalid(`implausible fmt values (channels=${numChannels}, rate=${sampleRate}, bits=${bitsPerSample})`);
  }

  const blockAlign = numChannels * (bitsPerSample / 8);
  const frameCount = Math.floor(dataSize / blockAlign);
  return { valid: true, formatTag, numChannels, sampleRate, bitsPerSample, dataSize, frameCount };
}

export function readWavStreamInfoFromFile(filePath: string): WavStreamInfo {
  try {
    return readWavStreamInfo(fs.readFileSync(filePath));
  } catch (e) {
    return invalid(`unreadable file: ${String(e)}`);
  }
}
