// Loop Rendering and External Handoff — file validation (§21, §22). Pure
// binary parsing of a WAV ArrayBuffer — never claims render success only
// because a file was written; actually parses and checks the encoded data.

export interface ParsedWavHeader {
  valid: boolean;
  numChannels?: number;
  sampleRate?: number;
  bitDepth?: number;
  dataSize?: number;
  error?: string;
}

function readAscii(view: DataView, offset: number, length: number): string {
  let s = "";
  for (let i = 0; i < length; i++) s += String.fromCharCode(view.getUint8(offset + i));
  return s;
}

export function parseWavHeader(buffer: ArrayBuffer): ParsedWavHeader {
  if (buffer.byteLength < 44) return { valid: false, error: "file_too_small" };
  const view = new DataView(buffer);
  if (readAscii(view, 0, 4) !== "RIFF") return { valid: false, error: "missing_riff_signature" };
  if (readAscii(view, 8, 4) !== "WAVE") return { valid: false, error: "missing_wave_signature" };
  if (readAscii(view, 12, 4) !== "fmt ") return { valid: false, error: "missing_fmt_chunk" };
  const numChannels = view.getUint16(22, true);
  const sampleRate = view.getUint32(24, true);
  const bitDepth = view.getUint16(34, true);
  if (readAscii(view, 36, 4) !== "data") return { valid: false, error: "missing_data_chunk" };
  const dataSize = view.getUint32(40, true);
  if (buffer.byteLength < 44 + dataSize) return { valid: false, error: "truncated_data_chunk" };
  return { valid: true, numChannels, sampleRate, bitDepth, dataSize };
}

export interface RenderValidationExpectation {
  sampleRate: number;
  bitDepth: number;
  channels: number;
  expectedDurationSeconds: number;
  toleranceSeconds?: number;
}

export interface RenderValidationResult {
  ok: boolean;
  reasons: string[];
  header: ParsedWavHeader;
}

// §21 — recommended duration tolerance: <= 1 sample frame.
export function validateRenderedWav(buffer: ArrayBuffer, expectation: RenderValidationExpectation): RenderValidationResult {
  const header = parseWavHeader(buffer);
  const reasons: string[] = [];
  if (!header.valid) {
    reasons.push(header.error ?? "invalid_header");
    return { ok: false, reasons, header };
  }
  if (header.sampleRate !== expectation.sampleRate) reasons.push("sample_rate_mismatch");
  if (header.bitDepth !== expectation.bitDepth) reasons.push("bit_depth_mismatch");
  if (header.numChannels !== expectation.channels) reasons.push("channel_count_mismatch");
  if (!header.dataSize || header.dataSize <= 0) reasons.push("empty_data");

  const bytesPerSample = expectation.bitDepth === 24 ? 3 : 2;
  const blockAlign = expectation.channels * bytesPerSample;
  const frameCount = blockAlign > 0 ? (header.dataSize ?? 0) / blockAlign : 0;
  const actualDuration = frameCount / expectation.sampleRate;
  const tolerance = expectation.toleranceSeconds ?? 1 / expectation.sampleRate;
  if (Math.abs(actualDuration - expectation.expectedDurationSeconds) > tolerance) {
    reasons.push("duration_mismatch");
  }

  return { ok: reasons.length === 0, reasons, header };
}

// §12 — NaN-sample check, run against the ORIGINAL float samples before
// encoding (encoding an already-NaN sample would silently produce garbage
// PCM bytes rather than a detectable header-level defect).
export function hasNaNSamples(channelData: Float32Array[]): boolean {
  for (const ch of channelData) {
    for (let i = 0; i < ch.length; i++) {
      if (Number.isNaN(ch[i])) return true;
    }
  }
  return false;
}
