// 0715C_MUSIC_Loop_Workspace_Editing_And_Revision_Completion §7, §8, §9 —
// zero-crossing snap. Takes plain, ALREADY-DECODED channel data (callers
// pass `audioBuffer.getChannelData(n)` from the buffer the workspace has
// already decoded for waveform/preview/approve) — this module never
// decodes audio itself, so no second decode pipeline is introduced. Also
// never invoked per drag-move by its callers — only at commit time
// (pointerup / blur / keyboard-commit), since a windowed sample scan is too
// expensive to repeat on every pointermove.

import type { ZeroCrossingSnapResult, ZeroCrossingWarningCode } from "../../data/loopTypes";

// §7 — recommended search window is ±5-20ms; default sits in that band.
export const DEFAULT_ZERO_CROSSING_WINDOW_MS = 10;
const FAR_FROM_BOUNDARY_MS = 15;
const LOW_CONFIDENCE_SCORE_THRESHOLD = 0.05;

// §8 — stereo score: abs(left) + abs(right) + inter-channel discontinuity
// penalty. For mono sources this reduces to abs(sample) with no penalty
// term. Never snaps using only one channel of a stereo source without this
// combined score (§8's explicit warning against doing so silently).
function discontinuityScore(channelData: Float32Array[], frame: number): number {
  let score = 0;
  const samples: number[] = [];
  for (const channel of channelData) {
    const s = frame >= 0 && frame < channel.length ? channel[frame] : 0;
    samples.push(s);
    score += Math.abs(s);
  }
  for (let i = 1; i < samples.length; i++) {
    score += Math.abs(samples[i] - samples[0]);
  }
  return score;
}

export function findZeroCrossing(
  rawFrame: number,
  channelData: Float32Array[],
  sampleRate: number,
  windowMs: number = DEFAULT_ZERO_CROSSING_WINDOW_MS,
): ZeroCrossingSnapResult {
  if (!channelData.length || !channelData[0].length) {
    return { frame: rawFrame, offsetSeconds: 0, warning: "ZERO_CROSSING_NOT_FOUND" };
  }

  const sourceLength = channelData[0].length;
  const windowFrames = Math.max(1, Math.round((windowMs / 1000) * sampleRate));
  const lo = Math.max(0, rawFrame - windowFrames);
  const hi = Math.min(sourceLength - 1, rawFrame + windowFrames);

  if (rawFrame < 0 || rawFrame > sourceLength - 1 || lo > hi) {
    return { frame: rawFrame, offsetSeconds: 0, warning: "ZERO_CROSSING_NOT_FOUND" };
  }

  let bestFrame = rawFrame;
  let bestScore = Infinity;
  for (let f = lo; f <= hi; f++) {
    const score = discontinuityScore(channelData, f);
    if (score < bestScore) {
      bestScore = score;
      bestFrame = f;
    }
  }

  const offsetSeconds = (bestFrame - rawFrame) / sampleRate;
  const offsetMs = Math.abs(offsetSeconds) * 1000;

  let warning: ZeroCrossingWarningCode | undefined;
  if (offsetMs > FAR_FROM_BOUNDARY_MS) {
    warning = "ZERO_CROSSING_FAR_FROM_BOUNDARY";
  } else if (bestScore > LOW_CONFIDENCE_SCORE_THRESHOLD) {
    // §8 — "do not claim perfect click-free behavior": a nonzero combined
    // discontinuity score at the best-available frame is disclosed as
    // low-confidence, not silently treated as a clean crossing.
    warning = "ZERO_CROSSING_LOW_CONFIDENCE";
  }

  return { frame: bestFrame, offsetSeconds, warning };
}
