// 0722C_MUSIC_Production_Stem_Export — resolves the local Demucs
// environment DIRECTLY from the repo-owned venv (never whichever python/
// demucs/ffmpeg happens to be on the shell's PATH). Node-only.

import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const STEM_SEPARATOR_TOOL_DIR = path.resolve(process.cwd(), "tools/stem-separator");
export const STEM_SEPARATOR_VENV_PYTHON = path.join(STEM_SEPARATOR_TOOL_DIR, ".venv", "bin", "python");
export const STEM_MODEL_CACHE_DIR = path.join(STEM_SEPARATOR_TOOL_DIR, "model-cache");
export const STEM_SETUP_COMMAND = "cd music/tools/stem-separator && ./setup.sh";

export interface StemEngineCheckResult {
  ok: boolean;
  pythonPath: string;
  pythonVersion: string | null;
  demucsVersion: string | null;
  torchVersion: string | null;
  torchaudioVersion: string | null;
  mpsAvailable: boolean;
  ffmpegVersion: string | null;
  modelCached: boolean;
  missing: string[];
  setupCommand: string;
}

function runPythonJson(pythonPath: string, script: string): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    execFile(pythonPath, ["-c", script], { maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) return resolve(null);
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch {
        resolve(null);
      }
    });
  });
}

function resolveFfmpegVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile("ffmpeg", ["-version"], { maxBuffer: 1024 * 1024 }, (error, stdout) => {
      if (error) return resolve(null);
      const firstLine = (stdout ?? "").split("\n")[0] ?? "";
      const match = /ffmpeg version (\S+)/.exec(firstLine);
      resolve(match?.[1] ?? null);
    });
  });
}

const PROBE_SCRIPT = `
import json, sys
info = {"python": sys.version.split()[0], "demucs": None, "torch": None, "torchaudio": None, "mps": False}
try:
    import demucs
    info["demucs"] = demucs.__version__
except Exception:
    pass
try:
    import torch
    info["torch"] = torch.__version__
    info["mps"] = bool(torch.backends.mps.is_available())
except Exception:
    pass
try:
    import torchaudio
    info["torchaudio"] = torchaudio.__version__
except Exception:
    pass
print(json.dumps(info))
`;

export async function checkStemEngine(): Promise<StemEngineCheckResult> {
  const missing: string[] = [];

  if (!fs.existsSync(STEM_SEPARATOR_VENV_PYTHON)) {
    missing.push(`Python virtual environment not found at ${STEM_SEPARATOR_VENV_PYTHON}`);
    return {
      ok: false, pythonPath: STEM_SEPARATOR_VENV_PYTHON, pythonVersion: null, demucsVersion: null,
      torchVersion: null, torchaudioVersion: null, mpsAvailable: false, ffmpegVersion: null,
      modelCached: false, missing, setupCommand: STEM_SETUP_COMMAND,
    };
  }

  const [probe, ffmpegVersion] = await Promise.all([
    runPythonJson(STEM_SEPARATOR_VENV_PYTHON, PROBE_SCRIPT),
    resolveFfmpegVersion(),
  ]);

  const pythonVersion = (probe?.python as string) ?? null;
  const demucsVersion = (probe?.demucs as string | null) ?? null;
  const torchVersion = (probe?.torch as string | null) ?? null;
  const torchaudioVersion = (probe?.torchaudio as string | null) ?? null;
  const mpsAvailable = Boolean(probe?.mps);

  if (!demucsVersion) missing.push("demucs is not importable in the venv");
  if (!torchVersion) missing.push("torch is not importable in the venv");
  if (!ffmpegVersion) missing.push("ffmpeg was not found on PATH");

  const modelCached = fs.existsSync(STEM_MODEL_CACHE_DIR) && fs.readdirSync(STEM_MODEL_CACHE_DIR).length > 0;

  return {
    ok: missing.length === 0,
    pythonPath: STEM_SEPARATOR_VENV_PYTHON,
    pythonVersion,
    demucsVersion,
    torchVersion,
    torchaudioVersion,
    mpsAvailable,
    ffmpegVersion,
    modelCached,
    missing,
    setupCommand: STEM_SETUP_COMMAND,
  };
}
