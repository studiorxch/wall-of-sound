// Loop Rendering and External Handoff — WAV encoding (§11, §12). Pure,
// real PCM WAV encoding — no Web Audio dependency, fully unit-testable.
// Little-endian RIFF/WAVE, `fmt ` + `data` chunks, correct byte rate and
// block alignment.

export interface PcmEncodeInput {
  channelData: Float32Array[]; // one Float32Array per channel, interleaved by the encoder
  sampleRate: number;
  bitDepth: 16 | 24;
}

const RIFF_HEADER_SIZE = 44; // 12 (RIFF) + 24 (fmt ) + 8 (data chunk header)

function clampSample(v: number): number {
  return Math.max(-1, Math.min(1, v));
}

// §12 — 24-bit PCM: clamp → scale to signed 24-bit integer → little-endian
// 3-byte sample.
function write24BitSample(view: DataView, offset: number, sample: number): void {
  const clamped = clampSample(sample);
  const intVal = Math.round(clamped * 8388607); // 2^23 - 1
  view.setUint8(offset, intVal & 0xff);
  view.setUint8(offset + 1, (intVal >> 8) & 0xff);
  view.setUint8(offset + 2, (intVal >> 16) & 0xff);
}

function write16BitSample(view: DataView, offset: number, sample: number): void {
  const clamped = clampSample(sample);
  const intVal = Math.round(clamped * 32767);
  view.setInt16(offset, intVal, true);
}

export function encodePcmWav({ channelData, sampleRate, bitDepth }: PcmEncodeInput): ArrayBuffer {
  const numChannels = channelData.length;
  const numFrames = channelData[0]?.length ?? 0;
  const bytesPerSample = bitDepth === 24 ? 3 : 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numFrames * blockAlign;
  const buffer = new ArrayBuffer(RIFF_HEADER_SIZE + dataSize);
  const view = new DataView(buffer);

  let offset = 0;
  function writeString(s: string) {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
    offset += s.length;
  }
  function writeUint32(v: number) { view.setUint32(offset, v, true); offset += 4; }
  function writeUint16(v: number) { view.setUint16(offset, v, true); offset += 2; }

  writeString("RIFF");
  writeUint32(36 + dataSize);
  writeString("WAVE");

  writeString("fmt ");
  writeUint32(16); // fmt chunk size (PCM)
  writeUint16(1); // PCM format
  writeUint16(numChannels);
  writeUint32(sampleRate);
  writeUint32(byteRate);
  writeUint16(blockAlign);
  writeUint16(bitDepth);

  writeString("data");
  writeUint32(dataSize);

  let sampleOffset = RIFF_HEADER_SIZE;
  for (let frame = 0; frame < numFrames; frame++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = channelData[ch][frame] ?? 0;
      if (bitDepth === 24) {
        write24BitSample(view, sampleOffset, sample);
      } else {
        write16BitSample(view, sampleOffset, sample);
      }
      sampleOffset += bytesPerSample;
    }
  }

  return buffer;
}
