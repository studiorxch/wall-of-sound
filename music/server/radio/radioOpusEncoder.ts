// RadioLoop Library Foundation — Opus encoding (build spec §5.4). Node-only.
// Argument-array subprocess API only — never an interpolated shell string.

import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { RADIO_OPUS_ENCODING_POLICY } from "../../src/data/radioLoopTypes";

// 0718B — the encoder is shared between RadioLoop packaging (default
// policy below, unchanged) and RadioTrack packaging (which passes
// RADIO_TRACK_OPUS_ENCODING_POLICY). `codec` is carried through only so
// callers can report which codec ran (both real policies are libopus);
// the ffmpeg argument array itself always hardcodes "-c:a libopus".
export interface OpusEncodePolicy {
  codec: string;
  application: string;
  bitrateKbps: number;
  vbr: string;
  compressionLevel: number;
}

export interface OpusEncodeResult {
  ok: boolean;
  exitCode: number | string | null;
  stderrTail: string;
  byteSize: number;
  startedAt: string;
  completedAt: string;
  inputPath: string;
  outputPath: string;
  encodingPolicy: OpusEncodePolicy;
}

const STDERR_TAIL_CHARS = 4000;

// Pure — exported separately so the exact argument array can be asserted
// against spec §5.4/§6 (README's documented ffmpeg command) without
// actually running ffmpeg.
export function buildOpusEncodeArgs(
  inputWavPath: string,
  outputOpusPath: string,
  policy: OpusEncodePolicy = RADIO_OPUS_ENCODING_POLICY,
): string[] {
  return [
    "-y",
    "-i", inputWavPath,
    "-map_metadata", "-1",
    "-c:a", "libopus",
    "-application", policy.application,
    "-b:a", `${policy.bitrateKbps}k`,
    "-vbr", policy.vbr,
    "-compression_level", String(policy.compressionLevel),
    outputOpusPath,
  ];
}

// §5.4 — capture exit status, encoder stderr, input identity, output path,
// output byte size, effective policy, operation timestamps.
export function encodeOpusToFile(
  inputWavPath: string,
  outputOpusPath: string,
  policy: OpusEncodePolicy = RADIO_OPUS_ENCODING_POLICY,
): Promise<OpusEncodeResult> {
  const startedAt = new Date().toISOString();
  fs.mkdirSync(path.dirname(outputOpusPath), { recursive: true });
  // Deliberate, controlled overwrite of OUR OWN prior attempt at this
  // staged path (e.g. a client retry) — not ffmpeg's interactive prompt.
  if (fs.existsSync(outputOpusPath)) fs.rmSync(outputOpusPath);
  const args = buildOpusEncodeArgs(inputWavPath, outputOpusPath, policy);

  return new Promise((resolve) => {
    execFile("ffmpeg", args, { maxBuffer: 1024 * 1024 * 16 }, (error, _stdout, stderr) => {
      const completedAt = new Date().toISOString();
      const wrote = fs.existsSync(outputOpusPath) && fs.statSync(outputOpusPath).size > 0;
      const ok = !error && wrote;
      resolve({
        ok,
        exitCode: error ? ((error as NodeJS.ErrnoException).code ?? null) : 0,
        stderrTail: (stderr ?? "").slice(-STDERR_TAIL_CHARS),
        byteSize: wrote ? fs.statSync(outputOpusPath).size : 0,
        startedAt,
        completedAt,
        inputPath: inputWavPath,
        outputPath: outputOpusPath,
        encodingPolicy: policy,
      });
    });
  });
}
