// Shared audio decode (0712_MUSIC_BPM_Key_Detection_Engine §5).
// Decode once per canonical analysis run — DSP, BPM, and key detection all
// consume the same AudioAnalysisInput instead of each fetching/decoding the
// file separately.

import type { Track } from "../data/trackTypes";
import type { AudioAnalysisInput } from "../data/audioDetectionTypes";

// Resolution order: objectUrl → audioUrl → audioRelPath → filePath → path
// For bare filenames in audioRelPath/filePath, prefix with catalog/audio/ since
// /media?path=filename resolves relative to CWD (not LIBRARY_ROOT) and will 404.
export function resolveAudioUrl(track: Track): string | null {
  const r = track as Record<string, unknown>;
  if (track.objectUrl) return track.objectUrl;
  const audioUrl = typeof r.audioUrl === "string" ? r.audioUrl : null;
  if (audioUrl) return audioUrl;
  if (track.audioRelPath) {
    const rel = track.audioRelPath.includes("/") ? track.audioRelPath : `catalog/audio/${track.audioRelPath}`;
    return `/music-audio/${rel}`;
  }
  if (track.filePath) {
    if (track.filePath.startsWith("/")) return `/media?path=${encodeURIComponent(track.filePath)}`;
    const basename = track.filePath.split("/").pop() ?? track.filePath;
    return `/music-audio/catalog/audio/${basename}`;
  }
  const pathField = typeof r.path === "string" ? r.path : null;
  if (pathField) {
    return pathField.startsWith("/")
      ? `/media?path=${encodeURIComponent(pathField)}`
      : `/music-audio/catalog/audio/${(pathField.split("/").pop() ?? pathField)}`;
  }
  return null;
}

// Returns which field provided the URL — used by the audit helper.
export function resolveAudioUrlSource(track: Track): "objectUrl" | "audioUrl" | "audioRelPath" | "filePath" | "path" | null {
  const r = track as Record<string, unknown>;
  if (track.objectUrl) return "objectUrl";
  if (typeof r.audioUrl === "string") return "audioUrl";
  if (track.audioRelPath) return "audioRelPath";
  if (track.filePath) return "filePath";
  if (typeof r.path === "string") return "path";
  return null;
}

function toMono(buffer: AudioBuffer, mode: "mono" | "left" | "right"): Float32Array {
  if (mode === "left" || buffer.numberOfChannels === 1) return buffer.getChannelData(0);
  if (mode === "right") return buffer.getChannelData(Math.min(1, buffer.numberOfChannels - 1));
  const len = buffer.length;
  const out = new Float32Array(len);
  const nCh = buffer.numberOfChannels;
  for (let ch = 0; ch < nCh; ch++) {
    const chData = buffer.getChannelData(ch);
    for (let i = 0; i < len; i++) out[i] += chData[i] / nCh;
  }
  return out;
}

export interface DecodeOptions {
  maxDurationSec?: number;
  channelMode?: "mono" | "left" | "right";
}

// 0717C_MUSIC_Complete_Song_Intelligence_and_Section_Map — extracted from
// decodeAudioAnalysisInput's own mono-mixdown + truncation + per-channel
// logic, so an ALREADY-decoded AudioBuffer (Sectional Looper's own
// audioBufferRef.current, or App.tsx's canonical getDecodedSourceBufferForRender
// cache) can be converted to the same AudioAnalysisInput shape without a
// second fetch+decode. decodeAudioAnalysisInput below now delegates to
// this after its own fetch+decodeAudioData step — its own behavior/
// signature is unchanged for every existing caller.
export function audioBufferToAnalysisInput(buffer: AudioBuffer, opts: DecodeOptions = {}): AudioAnalysisInput {
  const { maxDurationSec, channelMode = "mono" } = opts;
  const sampleRate = buffer.sampleRate;
  const maxSamples = maxDurationSec != null ? Math.floor(maxDurationSec * sampleRate) : Infinity;

  const monoFull = toMono(buffer, channelMode);
  const mono = monoFull.length <= maxSamples ? monoFull : monoFull.subarray(0, maxSamples);

  const channels: Float32Array[] = [];
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const full = buffer.getChannelData(ch);
    channels.push(full.length <= maxSamples ? full : full.subarray(0, maxSamples));
  }

  return {
    sampleRate,
    channels,
    mono,
    durationSeconds: mono.length / sampleRate,
  };
}

/**
 * Fetch + decode a track's audio once. HTTP errors are thrown as
 * `DSP_HTTP_<status>` (unchanged contract from the pre-split
 * extractDspFeatures) so batch callers can classify them; other failures
 * throw a plain Error with a descriptive message.
 */
export async function decodeAudioAnalysisInput(
  track: Track,
  opts: DecodeOptions = {},
): Promise<AudioAnalysisInput> {
  const { maxDurationSec = 120, channelMode = "mono" } = opts;

  const url = resolveAudioUrl(track);
  if (!url) throw new Error("audio source unavailable for analysis");

  let arrayBuf: ArrayBuffer;
  const resp = await fetch(url, { headers: { Range: "bytes=0-" } });
  if (!resp.ok) throw new Error(`DSP_HTTP_${resp.status}`);
  arrayBuf = await resp.arrayBuffer();

  let buffer: AudioBuffer;
  try {
    const ctx = new AudioContext();
    buffer = await ctx.decodeAudioData(arrayBuf);
    ctx.close();
  } catch (e) {
    throw new Error(`AUDIO_DECODE_FAILED: ${String(e)}`);
  }

  return audioBufferToAnalysisInput(buffer, { maxDurationSec, channelMode });
}
