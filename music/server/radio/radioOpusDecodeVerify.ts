// RadioLoop Library Foundation — mandatory decode-back verification (build
// spec §5.5; plan corrections #1/#2). ffprobe metadata (radioAudioProbe.ts)
// proves the container LOOKS right; this module proves the file actually
// DECODES to the right number of samples. Both are required before
// RADIO_READY (see radioEncodedAudioValidator.ts).
//
// Frame comparison is normalized to Opus's fixed 48kHz internal decode
// rate — a 44.1kHz source WAV's raw frame count is never directly
// comparable to decoded-Opus frame counts. The encoded file is decoded at
// its NATIVE rate (no -ar resample flag, avoiding a second resample's own
// interpolation uncertainty); the source WAV's frame count is instead
// projected forward to what 48kHz would produce
// (`round(sourceFrames * 48000 / sourceSampleRate)`) and compared against
// the real decoded output. Tolerance is RADIO_OPUS_FRAME_TOLERANCE frames
// at 48kHz — never a seconds-based tolerance.

import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseWavHeader, type ParsedWavHeader } from "../../src/logic/loops/loopRenderValidation";
import {
  RADIO_OPUS_DECODE_SAMPLE_RATE,
  RADIO_OPUS_FRAME_TOLERANCE,
  type RadioValidationIssue,
} from "../../src/data/radioLoopTypes";

const STDERR_TAIL_CHARS = 4000;

export function buildDecodeArgs(inputOpusPath: string, outputWavPath: string): string[] {
  // No -ar: decode at Opus's native rate, whatever ffmpeg's libopus
  // decoder actually produces (always 48000 in practice).
  //
  // pcm_s16le (not 24-bit): frame COUNT — the only thing this module
  // measures — doesn't depend on bit depth, and ffmpeg's wav muxer writes
  // a plain 16-byte `fmt ` chunk for 16-bit stereo, whereas 24-bit trips
  // WAVE_FORMAT_EXTENSIBLE (a 40-byte `fmt ` chunk) — caught live via a
  // real ffmpeg round trip: the fixed-offset parseWavHeader (correctly
  // tested elsewhere against wavEncoder.ts's own always-16-byte-fmt
  // output) misreads an extensible header's chunk layout entirely.
  // +bitexact additionally suppresses ffmpeg's own `LIST/INFO/ISFT`
  // metadata chunk, which would otherwise sit between `fmt ` and `data`
  // and break the same fixed-offset assumption.
  return ["-y", "-i", inputOpusPath, "-c:a", "pcm_s16le", "-fflags", "+bitexact", "-f", "wav", outputWavPath];
}

interface DecodeToFileResult {
  ok: boolean;
  stderrTail: string;
}

function decodeOpusToWavFile(inputOpusPath: string, outputWavPath: string): Promise<DecodeToFileResult> {
  fs.mkdirSync(path.dirname(outputWavPath), { recursive: true });
  if (fs.existsSync(outputWavPath)) fs.rmSync(outputWavPath);
  const args = buildDecodeArgs(inputOpusPath, outputWavPath);
  return new Promise((resolve) => {
    execFile("ffmpeg", args, { maxBuffer: 1024 * 1024 * 64 }, (error, _stdout, stderr) => {
      const wrote = fs.existsSync(outputWavPath) && fs.statSync(outputWavPath).size > 0;
      resolve({ ok: !error && wrote, stderrTail: (stderr ?? "").slice(-STDERR_TAIL_CHARS) });
    });
  });
}

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

function frameCountFromHeader(header: ParsedWavHeader): number | null {
  if (!header.valid || !header.dataSize || !header.numChannels || !header.bitDepth) return null;
  const bytesPerSample = header.bitDepth === 24 ? 3 : 2;
  const blockAlign = header.numChannels * bytesPerSample;
  if (blockAlign <= 0) return null;
  return header.dataSize / blockAlign;
}

export function computeExpectedDecodedFrames(sourceFrames: number, sourceSampleRate: number, decodeSampleRate = RADIO_OPUS_DECODE_SAMPLE_RATE): number {
  return Math.round((sourceFrames * decodeSampleRate) / sourceSampleRate);
}

export function framesMatchWithinTolerance(a: number, b: number, tolerance = RADIO_OPUS_FRAME_TOLERANCE): boolean {
  return Math.abs(a - b) <= tolerance;
}

// Decodes one Opus file (core or a stem) purely to get its actual decoded
// frame count — the shared primitive both the core check and the stem
// cross-check below build on.
export async function decodeOpusFrameCount(opusPath: string, workDir: string): Promise<{ ok: boolean; frameCount: number | null; stderrTail: string }> {
  const decodedWavPath = path.join(workDir, `decode-check-${path.basename(opusPath)}-${Date.now()}-${Math.round(Math.random() * 1e6)}.wav`);
  const decodeResult = await decodeOpusToWavFile(opusPath, decodedWavPath);
  if (!decodeResult.ok) {
    fs.rmSync(decodedWavPath, { force: true });
    return { ok: false, frameCount: null, stderrTail: decodeResult.stderrTail };
  }
  const header = parseWavHeader(toArrayBuffer(fs.readFileSync(decodedWavPath)));
  fs.rmSync(decodedWavPath, { force: true });
  const frameCount = frameCountFromHeader(header);
  return { ok: frameCount != null, frameCount, stderrTail: decodeResult.stderrTail };
}

export interface DecodeVerifyResult {
  ok: boolean;
  decodedFrameCount: number | null;
  expectedFrameCount: number | null;
  deltaFrames: number | null;
  decodeSampleRate: number;
  issues: RadioValidationIssue[];
  stderrTail: string;
}

// The core check: decode core.opus, project the lossless intermediate's
// own (server-parsed, never client-trusted) frame count forward to 48kHz,
// compare with a tight frame tolerance.
export async function decodeAndVerifyCoreFrames(opusPath: string, sourceWavPath: string, workDir: string): Promise<DecodeVerifyResult> {
  const sourceHeader = parseWavHeader(toArrayBuffer(fs.readFileSync(sourceWavPath)));
  const sourceFrameCount = frameCountFromHeader(sourceHeader);
  if (sourceFrameCount == null || !sourceHeader.sampleRate) {
    return {
      ok: false, decodedFrameCount: null, expectedFrameCount: null, deltaFrames: null,
      decodeSampleRate: RADIO_OPUS_DECODE_SAMPLE_RATE, stderrTail: "",
      issues: [{ code: "RADIO_DECODE_SOURCE_HEADER_INVALID", message: sourceHeader.error ?? "invalid lossless intermediate WAV header", severity: "error" }],
    };
  }
  const expectedFrameCount = computeExpectedDecodedFrames(sourceFrameCount, sourceHeader.sampleRate);

  const decoded = await decodeOpusFrameCount(opusPath, workDir);
  if (!decoded.ok || decoded.frameCount == null) {
    return {
      ok: false, decodedFrameCount: null, expectedFrameCount, deltaFrames: null,
      decodeSampleRate: RADIO_OPUS_DECODE_SAMPLE_RATE, stderrTail: decoded.stderrTail,
      issues: [{ code: "RADIO_DECODE_FAILED", message: "ffmpeg failed to decode the encoded output back to PCM", severity: "error" }],
    };
  }

  const deltaFrames = Math.abs(decoded.frameCount - expectedFrameCount);
  const ok = deltaFrames <= RADIO_OPUS_FRAME_TOLERANCE;
  return {
    ok, decodedFrameCount: decoded.frameCount, expectedFrameCount, deltaFrames,
    decodeSampleRate: RADIO_OPUS_DECODE_SAMPLE_RATE, stderrTail: decoded.stderrTail,
    issues: ok ? [] : [{
      code: "RADIO_DECODE_FRAME_MISMATCH",
      message: `Decoded ${decoded.frameCount} frames at ${RADIO_OPUS_DECODE_SAMPLE_RATE}Hz, expected ${expectedFrameCount} (Δ${deltaFrames}, tolerance ${RADIO_OPUS_FRAME_TOLERANCE})`,
      severity: "error",
    }],
  };
}
