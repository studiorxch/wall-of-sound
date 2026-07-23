// 0722C_MUSIC_Production_Stem_Export — spawns Demucs against the staged
// canonical WAV (never raw PCM, never the arbitrary original source
// container). Node-only. Argument array only, never a shell string.
// `spawn(..., {detached:true})` (not execFile) so a real process-group id
// exists for cancellation.

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { STEM_MODEL_CACHE_DIR } from "./stemEngineCheck";
import type { StemSeparationDevice } from "../../src/data/trackStemTypes";

const MODEL = "htdemucs";
const STDERR_TAIL_CHARS = 4000;
const STDERR_BUFFER_CAP_CHARS = 20000;

// Pure — exported for argument-contract tests. `stagedWavPath` is the
// canonical decode from stemIdentity.ts (44100Hz/stereo/pcm_s24le WAV) —
// the same file Demucs and the fingerprint hash both derive from. No
// --mp3/--flac: Demucs' own default output is WAV.
export function buildDemucsArgs(stagingDir: string, stagedWavPath: string, device: StemSeparationDevice): string[] {
  return ["-m", "demucs.separate", "-n", MODEL, "-d", device, "-o", stagingDir, stagedWavPath];
}

export function demucsOutputDir(stagingDir: string, stagedWavPath: string): string {
  const base = path.basename(stagedWavPath, path.extname(stagedWavPath));
  return path.join(stagingDir, MODEL, base);
}

export interface SeparationRunResult {
  ok: boolean;
  device: StemSeparationDevice;
  exitCode: number | null;
  stderrTail: string;
  outputDir: string | null;
}

function runOnce(
  pythonPath: string,
  stagingDir: string,
  stagedWavPath: string,
  device: StemSeparationDevice,
  onSpawned?: (child: ChildProcess) => void,
): Promise<SeparationRunResult> {
  return new Promise((resolve) => {
    const args = buildDemucsArgs(stagingDir, stagedWavPath, device);
    let child: ChildProcess;
    try {
      child = spawn(pythonPath, args, {
        detached: true,
        env: { ...process.env, TORCH_HOME: STEM_MODEL_CACHE_DIR, HF_HOME: STEM_MODEL_CACHE_DIR },
      });
    } catch {
      resolve({ ok: false, device, exitCode: null, stderrTail: "failed to spawn subprocess", outputDir: null });
      return;
    }
    onSpawned?.(child);

    let stderr = "";
    child.stderr?.on("data", (d: Buffer) => {
      stderr += d.toString();
      if (stderr.length > STDERR_BUFFER_CAP_CHARS) stderr = stderr.slice(-STDERR_BUFFER_CAP_CHARS);
    });
    child.on("error", () => resolve({ ok: false, device, exitCode: null, stderrTail: stderr.slice(-STDERR_TAIL_CHARS), outputDir: null }));
    child.on("close", (code) => {
      const outputDir = demucsOutputDir(stagingDir, stagedWavPath);
      const ok = code === 0 && fs.existsSync(outputDir);
      resolve({ ok, device, exitCode: code, stderrTail: stderr.slice(-STDERR_TAIL_CHARS), outputDir: ok ? outputDir : null });
    });
  });
}

// A device is never hardcoded — the caller resolves `preferredDevice` from
// a fresh stemEngineCheck().mpsAvailable at job-start time. If MPS is
// attempted and fails with an MPS-specific error signature, this restarts
// the ENTIRE job cleanly on CPU (discarding any partial MPS output first —
// never merging/reusing it). A non-MPS-specific failure is NOT retried on
// CPU, since CPU would almost certainly hit the same real problem and
// silently retrying would mask it.
function looksLikeMpsFailure(stderrTail: string): boolean {
  return /\bmps\b|MPS backend|Cannot copy out of meta tensor|NotImplementedError.*mps/i.test(stderrTail);
}

export async function runDemucsSeparationWithFallback(
  pythonPath: string,
  stagingDir: string,
  stagedWavPath: string,
  preferredDevice: StemSeparationDevice,
  onSpawned?: (child: ChildProcess) => void,
): Promise<SeparationRunResult> {
  const first = await runOnce(pythonPath, stagingDir, stagedWavPath, preferredDevice, onSpawned);
  if (first.ok || preferredDevice === "cpu") return first;
  if (!looksLikeMpsFailure(first.stderrTail)) return first;

  const partialOutputDir = path.join(stagingDir, MODEL);
  if (fs.existsSync(partialOutputDir)) fs.rmSync(partialOutputDir, { recursive: true, force: true });

  return runOnce(pythonPath, stagingDir, stagedWavPath, "cpu", onSpawned);
}
