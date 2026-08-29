import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import type { SpeechProviderDescriptor, SpeechProviderVoiceOption } from "../../src/data/voiceLibraryTypes";

const SAY_BINARY = "/usr/bin/say";
const PROVIDER_ID = "macos-say";

function execFileAsync(file: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { encoding: "utf-8", maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(Object.assign(error, { stdout, stderr }));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

function isAvailable(): boolean {
  return process.platform === "darwin" && fs.existsSync(SAY_BINARY);
}

export function getMacOsSayProviderDescriptor(): SpeechProviderDescriptor {
  return {
    id: PROVIDER_ID,
    displayName: "macOS Say",
    available: isAvailable(),
    reasonUnavailable: isAvailable() ? null : "Built-in speech is available only on macOS.",
  };
}

export async function listMacOsSayVoices(): Promise<SpeechProviderVoiceOption[]> {
  if (!isAvailable()) return [];
  const { stdout } = await execFileAsync(SAY_BINARY, ["-v", "?"]);
  const voices: SpeechProviderVoiceOption[] = [];
  for (const rawLine of stdout.split("\n")) {
    const match = rawLine.trim().match(/^(.+?)\s{2,}([a-z]{2}_[A-Z]{2})\s+#/);
    if (!match) continue;
    voices.push({
      id: match[1],
      label: match[1],
      language: match[2],
    });
  }
  return voices;
}

export async function generateMacOsSpeech(
  text: string,
  providerVoiceId: string | null,
): Promise<{ mimeType: string; data: Buffer; providerVoiceId: string | null; model: string | null }> {
  if (!isAvailable()) throw new Error("Built-in speech is unavailable on this platform.");
  const tmpPath = path.join(os.tmpdir(), `voice-preview-${Date.now().toString(36)}.wav`);
  const args = ["-o", tmpPath, "--file-format=WAVE", "--data-format=LEI16@22050"];
  if (providerVoiceId) {
    args.push("-v", providerVoiceId);
  }
  args.push(text);
  await execFileAsync(SAY_BINARY, args);
  try {
    return {
      mimeType: "audio/wav",
      data: fs.readFileSync(tmpPath),
      providerVoiceId,
      model: "macos-say",
    };
  } finally {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // Best-effort cleanup for preview temp files.
    }
  }
}
