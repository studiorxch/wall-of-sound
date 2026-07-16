// Loop Rendering and External Handoff — the real render pipeline (§8, §19,
// §20, §21, §22, §38). Uses Web Audio decode + fetch, unavailable in this
// project's node test environment (no jsdom) — covered by live browser
// verification instead, same convention as loopSeamlessnessAudio.ts. Every
// pure step it calls into (extraction, processing, encoding, validation,
// naming) IS unit-tested; this module only wires them together against
// real audio.
//
// §26 — this is a browser (Vite) app with no Electron/native filesystem
// access. There is no configurable arbitrary output folder and no real
// "Show in Finder." The closest honest equivalent available is triggering
// the browser's own file download (an <a download> click on an object
// URL) — the file lands whatever the browser/OS resolves the user's
// downloads location to be. This is documented plainly, not represented as
// a real output-folder picker.

import type { LoopAsset } from "../../data/loopTypes";
import type { LoopRenderRecord, LoopRenderSettings, LoopRenderProgress } from "../../data/loopRenderTypes";
import { computeFrameRange, extractChannelRange } from "./loopRenderExtraction";
import { applyNormalization, applyBoundaryCrossfade } from "./loopRenderProcessing";
import { encodePcmWav } from "./wavEncoder";
import { validateRenderedWav, hasNaNSamples } from "./loopRenderValidation";
import { resolveCollisionFreeFileName } from "./loopRenderNaming";
import { buildLoopFileName } from "./loopNaming";

export interface RenderLoopParams {
  loop: LoopAsset;
  sourceBuffer: AudioBuffer;
  settings: LoopRenderSettings;
  existingFileNames: ReadonlySet<string>;
  onProgress?: (p: LoopRenderProgress) => void;
}

export interface RenderLoopResult {
  record: LoopRenderRecord;
  wavBuffer: ArrayBuffer;
  filename: string;
}

function report(loopId: string, phase: LoopRenderProgress["phase"], progress: number, cb?: (p: LoopRenderProgress) => void) {
  cb?.({ loopId, phase, progress });
}

// §8, §9, §11, §21, §22 — the full pipeline: extract → process → encode →
// validate → (decode-back validate) → name.
export async function renderLoopToWav(params: RenderLoopParams): Promise<RenderLoopResult> {
  const { loop, sourceBuffer, settings, existingFileNames, onProgress } = params;

  report(loop.id, "extracting", 0.2, onProgress);
  const range = computeFrameRange(loop.startSeconds, loop.endSeconds, sourceBuffer.sampleRate, sourceBuffer.length);
  const sourceChannels: Float32Array[] = [];
  for (let ch = 0; ch < Math.min(sourceBuffer.numberOfChannels, settings.channels); ch++) {
    sourceChannels.push(sourceBuffer.getChannelData(ch));
  }
  let channelData = extractChannelRange(sourceChannels, range);

  report(loop.id, "processing", 0.4, onProgress);
  if (settings.bakeBoundaryCrossfade) {
    channelData = applyBoundaryCrossfade(channelData, {
      enabled: true, durationMs: settings.boundaryCrossfadeMs ?? 20, curve: "equal_power",
    }, settings.sampleRate);
  }
  if (settings.normalize) {
    channelData = applyNormalization(channelData, { enabled: true, targetDbfs: settings.normalizeTargetDbfs ?? -1 });
  }
  if (hasNaNSamples(channelData)) {
    throw new Error("render_failed: NaN samples in extracted audio");
  }

  report(loop.id, "encoding", 0.7, onProgress);
  const wavBuffer = encodePcmWav({ channelData, sampleRate: settings.sampleRate, bitDepth: settings.bitDepth === 32 ? 24 : settings.bitDepth });

  report(loop.id, "validating", 0.9, onProgress);
  const durationSeconds = loop.endSeconds - loop.startSeconds;
  const validation = validateRenderedWav(wavBuffer, {
    sampleRate: settings.sampleRate, bitDepth: settings.bitDepth === 32 ? 24 : settings.bitDepth,
    channels: channelData.length, expectedDurationSeconds: durationSeconds,
  });
  if (!validation.ok) {
    throw new Error(`render_failed: ${validation.reasons.join(", ")}`);
  }

  // §17 — loop.title is already the fully-composed canonical display name
  // ("<Artist> - <Track> - <Section> - <Bars>bar - <BPM>bpm", built once at
  // approval time by buildLoopFileName); sanitize and use it directly
  // rather than re-composing it from parts (which duplicated artist/track
  // into the filename — caught live during render verification).
  const desiredName = buildLoopFileName({ trackTitle: loop.title, sectionLabel: "" });
  const filename = resolveCollisionFreeFileName(desiredName, existingFileNames);

  report(loop.id, "complete", 1, onProgress);

  const now = new Date().toISOString();
  const record: LoopRenderRecord = {
    id: `render_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    loopId: loop.id,
    status: "rendered",
    settings,
    filename,
    outputPath: filename, // §26 — no real filesystem path is exposed by the browser; filename stands in, documented explicitly.
    sourceFingerprint: loop.sourceFingerprint ?? "",
    sourceStartSeconds: loop.startSeconds,
    sourceEndSeconds: loop.endSeconds,
    renderedDurationSeconds: durationSeconds,
    renderedSampleCount: range.endFrame - range.startFrame,
    renderedChannelCount: channelData.length,
    fileSizeBytes: wavBuffer.byteLength,
    renderedAt: now,
  };

  return { record, wavBuffer, filename };
}

// §26 — triggers the browser's native download (the honest substitute for
// a real output-folder write in a sandboxed browser app).
export function downloadWavBuffer(wavBuffer: ArrayBuffer, filename: string): void {
  const blob = new Blob([wavBuffer], { type: "audio/wav" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// §22 — audio integrity test: decode the rendered WAV back and compare
// against what was requested. Never claim render success only because a
// file was written.
export async function verifyRenderedAudioIntegrity(
  wavBuffer: ArrayBuffer,
  expected: { sampleRate: number; channels: number; durationSeconds: number },
): Promise<{ ok: boolean; reasons: string[] }> {
  const reasons: string[] = [];
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const decoded = await ctx.decodeAudioData(wavBuffer.slice(0));
    await ctx.close();
    if (decoded.numberOfChannels !== expected.channels) reasons.push("decoded_channel_mismatch");
    if (Math.abs(decoded.duration - expected.durationSeconds) > 1 / expected.sampleRate + 0.001) reasons.push("decoded_duration_mismatch");
    for (let ch = 0; ch < decoded.numberOfChannels; ch++) {
      const data = decoded.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        if (Number.isNaN(data[i])) { reasons.push("decoded_nan_sample"); break; }
      }
    }
  } catch {
    reasons.push("decode_back_failed");
  }
  return { ok: reasons.length === 0, reasons };
}
