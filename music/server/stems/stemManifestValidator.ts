// 0722C_MUSIC_Production_Stem_Export — the "no loose seconds tolerance"
// validator. Node-only.
//
// A completed stem set requires all 4 roles to be readable, structurally
// valid, non-zero/finite, mutually sample-aligned, full-length LOSSLESS PCM
// WAV. That last requirement is enforced structurally, not by a separate
// codec-name check: readWavStreamInfoFromFile only ever succeeds for a real
// RIFF/WAVE file, so an MP3 (or any other lossy container) fails the very
// first structural check and can never reach a completed TrackStemFile —
// this is exactly why the pre-existing tools/stem-separator/output/
// htdemucs/.../*.mp3 scratch files can never be promoted to an active set.

import fs from "node:fs";
import { readWavStreamInfoFromFile } from "../radio/radioWavFrameCounter";
import { sha256File } from "../radio/radioVersionCloneHelper";
import { STEM_ROLES, type StemRole, type TrackStemFile } from "../../src/data/trackStemTypes";

export interface StemValidationIssue {
  code: string;
  message: string;
  role?: StemRole;
}

export interface StemManifestValidationSuccess {
  ok: true;
  stems: Record<StemRole, TrackStemFile>;
}
export interface StemManifestValidationFailure {
  ok: false;
  issues: StemValidationIssue[];
}
export type StemManifestValidationResult = StemManifestValidationSuccess | StemManifestValidationFailure;

const SAMPLE_SCAN_CHUNK_BYTES = 1024 * 1024;

// Reads the PCM data in bounded chunks (never the whole file into memory at
// once) to confirm the samples aren't silently all-zero (a strong signal of
// a failed/empty separation output) and, for float PCM, contain no
// NaN/Infinity bit patterns.
function scanSamplesNonZeroAndFinite(filePath: string, dataOffset: number, dataSize: number, isFloat: boolean, bitsPerSample: number): { nonZero: boolean; finite: boolean } {
  const fd = fs.openSync(filePath, "r");
  try {
    let nonZero = false;
    let finite = true;
    const buf = Buffer.alloc(SAMPLE_SCAN_CHUNK_BYTES);
    let offset = 0;
    while (offset < dataSize) {
      const toRead = Math.min(SAMPLE_SCAN_CHUNK_BYTES, dataSize - offset);
      const bytesRead = fs.readSync(fd, buf, 0, toRead, dataOffset + offset);
      if (bytesRead <= 0) break;
      for (let i = 0; i < bytesRead; i++) {
        if (buf[i] !== 0) { nonZero = true; break; }
      }
      if (isFloat && bitsPerSample === 32) {
        const floatCount = Math.floor(bytesRead / 4);
        for (let i = 0; i < floatCount; i++) {
          const v = buf.readFloatLE(i * 4);
          if (!Number.isFinite(v)) { finite = false; break; }
        }
      }
      offset += bytesRead;
      if (nonZero && (!isFloat || finite)) break; // early exit once both answers are known
    }
    return { nonZero, finite };
  } finally {
    fs.closeSync(fd);
  }
}

function codecFor(formatTag: number, bitsPerSample: number): TrackStemFile["codec"] {
  if (formatTag === 3) return "pcm_f32le";
  if (bitsPerSample === 16) return "pcm_s16le";
  if (bitsPerSample === 24) return "pcm_s24le";
  if (bitsPerSample === 32) return "pcm_s32le";
  return `pcm_${bitsPerSample}le`;
}

export interface ValidateStemSetInput {
  files: Record<StemRole, string>; // role -> absolute staged WAV path
  targetFrameCount: number;
  targetSampleRateHz: number;
  targetChannels: number;
}

export function validateStemSet(input: ValidateStemSetInput): StemManifestValidationResult {
  const issues: StemValidationIssue[] = [];
  const stems: Partial<Record<StemRole, TrackStemFile>> = {};

  for (const role of STEM_ROLES) {
    const filePath = input.files[role];
    if (!filePath || !fs.existsSync(filePath)) {
      issues.push({ code: "STEM_FILE_MISSING", message: `${role} stem file is missing`, role });
      continue;
    }
    const info = readWavStreamInfoFromFile(filePath);
    if (!info.valid || info.frameCount == null || info.dataOffset == null || info.dataSize == null || !info.sampleRate || !info.numChannels || !info.bitsPerSample || info.formatTag == null) {
      issues.push({ code: "STEM_WAV_INVALID", message: `${role}: not a structurally valid lossless PCM WAV (${info.error ?? "unknown"})`, role });
      continue;
    }
    if (info.sampleRate !== input.targetSampleRateHz) {
      issues.push({ code: "STEM_SAMPLE_RATE_MISMATCH", message: `${role}: sample rate ${info.sampleRate} != expected ${input.targetSampleRateHz}`, role });
    }
    if (info.numChannels !== input.targetChannels) {
      issues.push({ code: "STEM_CHANNEL_MISMATCH", message: `${role}: channels ${info.numChannels} != expected ${input.targetChannels}`, role });
    }
    if (info.frameCount !== input.targetFrameCount) {
      issues.push({ code: "STEM_FRAME_COUNT_MISMATCH", message: `${role}: frame count ${info.frameCount} != expected ${input.targetFrameCount} (normalize before validating)`, role });
    }
    const isFloat = info.formatTag === 3;
    const { nonZero, finite } = scanSamplesNonZeroAndFinite(filePath, info.dataOffset, info.dataSize, isFloat, info.bitsPerSample);
    if (!nonZero) issues.push({ code: "STEM_SILENT", message: `${role}: audio is entirely zero-valued`, role });
    if (!finite) issues.push({ code: "STEM_NON_FINITE", message: `${role}: contains non-finite (NaN/Infinity) samples`, role });

    if (nonZero && finite && info.sampleRate === input.targetSampleRateHz && info.numChannels === input.targetChannels && info.frameCount === input.targetFrameCount) {
      const sizeBytes = fs.statSync(filePath).size;
      stems[role] = {
        role,
        relativeArchivePath: "", // filled in by stemSetWriter once the final archive path is known
        fileName: filePath.split("/").pop() ?? `${role}.wav`,
        durationFrames: info.frameCount,
        durationSeconds: info.frameCount / info.sampleRate,
        sampleRateHz: info.sampleRate,
        channels: info.numChannels,
        bitDepth: info.bitsPerSample,
        codec: codecFor(info.formatTag, info.bitsPerSample),
        sizeBytes,
        contentHash: sha256File(filePath),
      };
    }
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, stems: stems as Record<StemRole, TrackStemFile> };
}
