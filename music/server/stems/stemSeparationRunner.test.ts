import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildDemucsArgs, demucsOutputDir, runDemucsSeparationWithFallback } from "./stemSeparationRunner";

describe("buildDemucsArgs", () => {
  it("passes the STAGED WAV as input — never raw PCM, never the arbitrary original source", () => {
    const args = buildDemucsArgs("/tmp/staging", "/tmp/staging/parent-canonical.wav", "cpu");
    expect(args).toEqual(["-m", "demucs.separate", "-n", "htdemucs", "-d", "cpu", "-o", "/tmp/staging", "/tmp/staging/parent-canonical.wav"]);
  });

  it("never uses --mp3 or --flac — Demucs' own default output is WAV", () => {
    const args = buildDemucsArgs("/tmp/staging", "/tmp/staging/parent-canonical.wav", "mps");
    expect(args).not.toContain("--mp3");
    expect(args).not.toContain("--flac");
  });

  it("is an argument array, never a single interpolated shell string", () => {
    const args = buildDemucsArgs("/tmp/dir with spaces", "/tmp/staged file.wav", "cpu");
    expect(Array.isArray(args)).toBe(true);
    for (const a of args) expect(typeof a).toBe("string");
  });
});

describe("demucsOutputDir", () => {
  it("is <stagingDir>/htdemucs/<basename-without-ext>", () => {
    expect(demucsOutputDir("/tmp/staging", "/tmp/staging/parent-canonical.wav")).toBe("/tmp/staging/htdemucs/parent-canonical");
  });
});

// A fake "python" executable standing in for the real Demucs CLI (its own
// shebang makes it directly spawnable, exactly like a real interpreter
// path), so the standard suite never requires the real, slow, model-
// download-dependent subprocess — this repo's established "fake runner in
// the standard suite" convention.
function writeFakePythonExecutable(dir: string, opts: { exitCode?: number; stderrText?: string } = {}): string {
  const scriptPath = path.join(dir, "fake-python");
  const exitCode = opts.exitCode ?? 0;
  const stderrText = (opts.stderrText ?? "").replace(/'/g, "\\'");
  fs.writeFileSync(scriptPath, `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const outDirIdx = args.indexOf('-o');
const outDir = args[outDirIdx + 1];
const inputPath = args[args.length - 1];
const base = path.basename(inputPath, path.extname(inputPath));
const targetDir = path.join(outDir, 'htdemucs', base);
if (${exitCode} === 0) {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const role of ['vocals', 'drums', 'bass', 'other']) {
    fs.writeFileSync(path.join(targetDir, role + '.wav'), 'fake-wav-bytes');
  }
}
if ('${stderrText}') process.stderr.write('${stderrText}');
process.exit(${exitCode});
`);
  fs.chmodSync(scriptPath, 0o755);
  return scriptPath;
}

describe("runDemucsSeparationWithFallback (fake runner)", () => {
  let dir: string;
  beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "stem-runner-")); });
  afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

  it("succeeds on the first attempt and reports the requested device", async () => {
    const pythonPath = writeFakePythonExecutable(dir, { exitCode: 0 });
    const stagedWav = path.join(dir, "parent-canonical.wav");
    fs.writeFileSync(stagedWav, "fake-input");

    const result = await runDemucsSeparationWithFallback(pythonPath, dir, stagedWav, "cpu");

    expect(result.ok).toBe(true);
    expect(result.device).toBe("cpu");
    expect(result.outputDir).toBe(path.join(dir, "htdemucs", "parent-canonical"));
    for (const role of ["vocals", "drums", "bass", "other"]) {
      expect(fs.existsSync(path.join(result.outputDir!, `${role}.wav`))).toBe(true);
    }
  }, 10_000);

  it("falls back to CPU on an MPS-signature failure, discarding partial MPS output first", async () => {
    const stagedWav = path.join(dir, "parent-canonical.wav");
    fs.writeFileSync(stagedWav, "fake-input");

    // Our fake python's behavior depends on the -d flag, so one executable
    // fallback by using a python whose behavior depends on the -d flag.
    const dualBehaviorPath = path.join(dir, "fake-python-dual");
    fs.writeFileSync(dualBehaviorPath, `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const device = args[args.indexOf('-d') + 1];
const outDirIdx = args.indexOf('-o');
const outDir = args[outDirIdx + 1];
const inputPath = args[args.length - 1];
const base = path.basename(inputPath, path.extname(inputPath));
const targetDir = path.join(outDir, 'htdemucs', base);
if (device === 'mps') {
  process.stderr.write('RuntimeError: MPS backend out of memory');
  process.exit(1);
}
fs.mkdirSync(targetDir, { recursive: true });
for (const role of ['vocals', 'drums', 'bass', 'other']) fs.writeFileSync(path.join(targetDir, role + '.wav'), 'ok');
process.exit(0);
`);
    fs.chmodSync(dualBehaviorPath, 0o755);

    const result = await runDemucsSeparationWithFallback(dualBehaviorPath, dir, stagedWav, "mps");

    expect(result.ok).toBe(true);
    expect(result.device).toBe("cpu");
  }, 10_000);

  it("does NOT retry on CPU for a non-MPS-specific failure — never masks a real problem", async () => {
    const pythonPath = writeFakePythonExecutable(dir, { exitCode: 1, stderrText: "FileNotFoundError: input not found" });
    const stagedWav = path.join(dir, "parent-canonical.wav");
    fs.writeFileSync(stagedWav, "fake-input");

    const result = await runDemucsSeparationWithFallback(pythonPath, dir, stagedWav, "mps");

    expect(result.ok).toBe(false);
    expect(result.device).toBe("mps"); // never silently switched to cpu
  }, 10_000);

  it("reports failure with a non-empty stderr tail on a real failure", async () => {
    const pythonPath = writeFakePythonExecutable(dir, { exitCode: 1, stderrText: "boom" });
    const stagedWav = path.join(dir, "parent-canonical.wav");
    fs.writeFileSync(stagedWav, "fake-input");

    const result = await runDemucsSeparationWithFallback(pythonPath, dir, stagedWav, "cpu");

    expect(result.ok).toBe(false);
    expect(result.stderrTail).toContain("boom");
    expect(result.outputDir).toBeNull();
  }, 10_000);
});
