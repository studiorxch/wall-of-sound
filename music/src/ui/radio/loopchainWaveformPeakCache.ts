// 0722A_RADIOOS_Loopchain_Player_Web_Demo §1.2/§4.3 — session peak cache
// for the Loopchain Player's Canvas waveform views, modeled directly on
// waveformCache.ts's existing pattern. Keyed by source-offset/duration
// tuple (not occurrenceId) so repeated occurrences of the same block share
// one computed peak set instead of recomputing identical peaks per repeat —
// this is what makes "redraw the canvas only when peaks change, never
// every frame" cheap: peaks are computed once and reused across repeats
// and across re-renders. Session-only (in-memory Map), same convention as
// every other decoded-audio-derived cache in this app.

import type { WaveformPeak } from "../../data/loopTypes";
import { computePeaksForRange } from "../sectionalLooper/waveformPeaks";

export function buildLoopchainPeakCacheKey(
  sourceKey: string, // trackId (or a real fingerprint if one is available on Track)
  startSeconds: number,
  endSeconds: number,
  binCount: number,
): string {
  return `${sourceKey}|${startSeconds.toFixed(3)}|${endSeconds.toFixed(3)}|${binCount}`;
}

const cache = new Map<string, WaveformPeak[]>();

export function getOrComputeLoopchainPeaks(
  sourceKey: string,
  buffer: AudioBuffer,
  startSeconds: number,
  endSeconds: number,
  binCount: number,
): WaveformPeak[] {
  const key = buildLoopchainPeakCacheKey(sourceKey, startSeconds, endSeconds, binCount);
  const cached = cache.get(key);
  if (cached) return cached;
  const peaks = computePeaksForRange(buffer, startSeconds, endSeconds, binCount);
  cache.set(key, peaks);
  return peaks;
}

export function clearLoopchainPeakCache(): void {
  cache.clear();
}
