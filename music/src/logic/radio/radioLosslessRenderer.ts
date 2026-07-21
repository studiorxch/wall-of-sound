// RadioLoop Library Foundation — the lossless intermediate (build spec
// §5.3). Reuses the same pure extraction/encoding modules the existing
// loopRenderService.ts uses for WAV export — no new extraction logic.
//
// Deliberately skips loopRenderProcessing.ts's applyBoundaryCrossfade/
// applyNormalization: §5.3 forbids new silence trimming or bound
// adjustments beyond the approved selection — that processing step is a
// playback/export choice, not appropriate for a radio source-of-truth
// encode. Bounds are resolved via resolveActiveLoopBoundsFrames, the same
// helper App.tsx's handleRenderLoop already uses, so an edited (revisioned)
// approved loop promotes its CURRENT boundaries, not stale original ones.

import type { LoopAsset, LoopRevision } from "../../data/loopTypes";
import { resolveActiveLoopBoundsFrames } from "../loops/loopRevisions";
import { extractChannelRange } from "../loops/loopRenderExtraction";
import { encodePcmWav } from "../loops/wavEncoder";

export interface RadioLosslessRenderResult {
  wavBuffer: ArrayBuffer;
  startSeconds: number;
  endSeconds: number;
  sampleRate: number;
  channels: number;
}

// Frame-range validation duplicated (not reused from loopRenderExtraction's
// computeFrameRange) deliberately: computeFrameRange takes seconds and
// re-derives frames via its own rounding, which would double-round bounds
// already resolved to frames by resolveActiveLoopBoundsFrames.
function assertValidFrameRange(startFrame: number, endFrame: number, sourceFrameCount: number): void {
  if (!(startFrame >= 0 && startFrame < endFrame && endFrame <= sourceFrameCount)) {
    throw new Error(`invalid_frame_range: start=${startFrame} end=${endFrame} sourceFrames=${sourceFrameCount}`);
  }
}

export function renderLosslessIntermediate(loop: LoopAsset, revisions: LoopRevision[], sourceBuffer: AudioBuffer): RadioLosslessRenderResult {
  const activeBounds = resolveActiveLoopBoundsFrames(loop, revisions, sourceBuffer.sampleRate);
  assertValidFrameRange(activeBounds.startFrame, activeBounds.endFrame, sourceBuffer.length);

  const sourceChannels: Float32Array[] = [];
  for (let ch = 0; ch < sourceBuffer.numberOfChannels; ch++) sourceChannels.push(sourceBuffer.getChannelData(ch));
  const channelData = extractChannelRange(sourceChannels, { startFrame: activeBounds.startFrame, endFrame: activeBounds.endFrame });

  const wavBuffer = encodePcmWav({ channelData, sampleRate: sourceBuffer.sampleRate, bitDepth: 24 });

  return {
    wavBuffer,
    startSeconds: activeBounds.startFrame / sourceBuffer.sampleRate,
    endSeconds: activeBounds.endFrame / sourceBuffer.sampleRate,
    sampleRate: sourceBuffer.sampleRate,
    channels: channelData.length,
  };
}
