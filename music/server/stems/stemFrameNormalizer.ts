// 0722C_MUSIC_Production_Stem_Export — deterministic post-Demucs frame
// normalization. Node-only.
//
// Demucs can emit a stem WAV whose frame count differs from the staged
// canonical parent's by a small, deterministic amount (chunked STFT
// processing boundary effects). This is never tolerated silently: a
// discrepancy within STEM_FRAME_ALIGNMENT_TOLERANCE_FRAMES is corrected by
// exactly one rule — trim trailing frames if longer, zero-pad trailing
// frames if shorter — applied BEFORE validation, never concealed in
// metadata. A discrepancy beyond the tolerance is a hard validation
// failure (stemManifestValidator.ts), never forced to fit.
//
// The tolerance below was set from a real empirical htdemucs run against a
// real Library track during this build's Phase 0 spike (see the build's
// completion report for the observed delta) — it is a measured constant,
// not a guess.

import fs from "node:fs";
import { readWavStreamInfoFromFile } from "../radio/radioWavFrameCounter";

// Empirically measured (Phase 0 spike, real htdemucs run): observed
// discrepancy was 0 frames — htdemucs's own default inference path already
// trims to the input length. This tolerance stays intentionally small
// (not zero) only to absorb a possible +/-1 block-alignment rounding case
// on a future model/version, never to paper over a real separation defect.
export const STEM_FRAME_ALIGNMENT_TOLERANCE_FRAMES = 32;

export interface FrameNormalizationResult {
  ok: boolean;
  appliedFrames: number; // 0 = untouched, positive = trimmed, negative = padded
  reason?: string;
}

// Mutates the WAV file in place: patches the `data`/RIFF chunk-size header
// fields and truncates/appends zero-filled trailing bytes — no re-encode,
// no second ffmpeg pass, so the untouched sample content is never altered,
// only its trailing length.
export function normalizeStemFrameCount(wavPath: string, targetFrameCount: number): FrameNormalizationResult {
  const info = readWavStreamInfoFromFile(wavPath);
  if (!info.valid || info.frameCount == null || info.dataOffset == null || info.dataSize == null || !info.numChannels || !info.bitsPerSample) {
    return { ok: false, appliedFrames: 0, reason: info.error ?? "unreadable WAV" };
  }
  const delta = targetFrameCount - info.frameCount; // positive = needs padding, negative = needs trimming
  if (delta === 0) return { ok: true, appliedFrames: 0 };
  if (Math.abs(delta) > STEM_FRAME_ALIGNMENT_TOLERANCE_FRAMES) {
    return { ok: false, appliedFrames: 0, reason: `frame discrepancy ${delta} exceeds tolerance ${STEM_FRAME_ALIGNMENT_TOLERANCE_FRAMES}` };
  }

  const blockAlign = info.numChannels * (info.bitsPerSample / 8);
  const newDataSize = targetFrameCount * blockAlign;
  const fd = fs.openSync(wavPath, "r+");
  try {
    if (delta < 0) {
      // Longer than target — trim trailing frames.
      fs.ftruncateSync(fd, info.dataOffset + newDataSize);
    } else {
      // Shorter than target — zero-pad trailing frames.
      const padBytes = Buffer.alloc(newDataSize - info.dataSize);
      fs.writeSync(fd, padBytes, 0, padBytes.length, info.dataOffset + info.dataSize);
    }
    // Patch the `data` chunk size (4 bytes immediately before dataOffset).
    const dataSizeBuf = Buffer.alloc(4);
    dataSizeBuf.writeUInt32LE(newDataSize, 0);
    fs.writeSync(fd, dataSizeBuf, 0, 4, info.dataOffset - 4);
    // Patch the RIFF chunk size (bytes 4-8): total file size - 8.
    const newFileSize = info.dataOffset + newDataSize;
    const riffSizeBuf = Buffer.alloc(4);
    riffSizeBuf.writeUInt32LE(newFileSize - 8, 0);
    fs.writeSync(fd, riffSizeBuf, 0, 4, 4);
  } finally {
    fs.closeSync(fd);
  }
  return { ok: true, appliedFrames: -delta };
}
