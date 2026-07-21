// RadioLoop Library Foundation — encoded-audio metadata probing (build spec
// §5.5, first half — the second half, decode-back frame verification, is
// radioOpusDecodeVerify.ts; §11 correction: probe metadata alone is
// necessary but not sufficient for RADIO_READY). Node-only, argument-array
// subprocess only.

import { execFile } from "node:child_process";
import type { RadioValidationIssue } from "../../src/data/radioLoopTypes";

export interface ProbeResult {
  ok: boolean;
  codec: string | null;
  container: string | null;
  channels: number | null;
  sampleRate: number | null;
  durationSeconds: number | null;
  issues: RadioValidationIssue[];
  stderrTail: string;
}

const STDERR_TAIL_CHARS = 2000;

export function buildProbeArgs(filePath: string): string[] {
  return ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", filePath];
}

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  channels?: number;
  sample_rate?: string;
}

interface FfprobeOutput {
  format?: { format_name?: string; duration?: string };
  streams?: FfprobeStream[];
}

// Pure — parses ffprobe's own JSON output and validates it against the
// spec's required checks (codec is Opus, container is Ogg). Exported
// separately so probe-result validation is unit-testable without running
// ffprobe.
export function parseProbeOutput(jsonText: string): ProbeResult {
  const issues: RadioValidationIssue[] = [];
  let parsed: FfprobeOutput;
  try {
    parsed = JSON.parse(jsonText) as FfprobeOutput;
  } catch {
    return {
      ok: false, codec: null, container: null, channels: null, sampleRate: null, durationSeconds: null,
      issues: [{ code: "RADIO_PROBE_UNPARSEABLE", message: "ffprobe output was not valid JSON", severity: "error" }],
      stderrTail: "",
    };
  }

  const audioStream = parsed.streams?.find((s) => s.codec_type === "audio");
  const codec = audioStream?.codec_name ?? null;
  const container = parsed.format?.format_name ?? null;
  const channels = audioStream?.channels ?? null;
  const sampleRate = audioStream?.sample_rate ? Number(audioStream.sample_rate) : null;
  const durationSeconds = parsed.format?.duration ? Number(parsed.format.duration) : null;

  if (!audioStream) issues.push({ code: "RADIO_PROBE_NO_AUDIO_STREAM", message: "No audio stream found", severity: "error" });
  if (codec !== "opus") issues.push({ code: "RADIO_PROBE_CODEC_MISMATCH", message: `Expected codec opus, got ${codec ?? "none"}`, severity: "error" });
  if (!container || !container.includes("ogg")) issues.push({ code: "RADIO_PROBE_CONTAINER_MISMATCH", message: `Expected ogg container, got ${container ?? "none"}`, severity: "error" });
  if (channels == null) issues.push({ code: "RADIO_PROBE_CHANNELS_UNKNOWN", message: "Channel count could not be determined", severity: "error" });
  if (sampleRate == null) issues.push({ code: "RADIO_PROBE_SAMPLE_RATE_UNKNOWN", message: "Sample rate could not be determined", severity: "error" });
  if (durationSeconds == null) issues.push({ code: "RADIO_PROBE_DURATION_UNKNOWN", message: "Duration could not be determined", severity: "error" });

  return { ok: issues.length === 0, codec, container, channels, sampleRate, durationSeconds, issues, stderrTail: "" };
}

export function probeOpusFile(filePath: string): Promise<ProbeResult> {
  const args = buildProbeArgs(filePath);
  return new Promise((resolve) => {
    execFile("ffprobe", args, { maxBuffer: 1024 * 1024 * 16 }, (error, stdout, stderr) => {
      if (error) {
        resolve({
          ok: false, codec: null, container: null, channels: null, sampleRate: null, durationSeconds: null,
          issues: [{ code: "RADIO_PROBE_FAILED", message: error.message, severity: "error" }],
          stderrTail: (stderr ?? "").slice(-STDERR_TAIL_CHARS),
        });
        return;
      }
      resolve({ ...parseProbeOutput(stdout), stderrTail: (stderr ?? "").slice(-STDERR_TAIL_CHARS) });
    });
  });
}
