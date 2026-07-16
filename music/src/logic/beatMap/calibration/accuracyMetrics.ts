// Beat Map Confidence Calibration — accuracy metrics against ground truth
// (§9). Centralized tolerances (§9) — nothing scattered.

import type { BeatMapAccuracyMetrics, BeatMapGroundTruth } from "../../../data/beatMapCalibrationTypes";
import type { TrackBeatMap } from "../../../data/beatMapTypes";

export const BEAT_MATCH_TOLERANCE_MS = 70;
export const DOWNBEAT_MATCH_TOLERANCE_MS = 100;
export const BAR_MATCH_TOLERANCE_MS = 120;
export const FIRST_BEAT_TOLERANCE_MS = 100;
export const FIRST_DOWNBEAT_TOLERANCE_MS = 150;

function nearestMatch(times: number[], target: number, toleranceSeconds: number): number | undefined {
  let best: number | undefined;
  let bestDist = Infinity;
  for (const t of times) {
    const d = Math.abs(t - target);
    if (d < bestDist) { bestDist = d; best = t; }
  }
  return best != null && bestDist <= toleranceSeconds ? best : undefined;
}

// Greedy one-to-one matching between detected and ground-truth beat times
// within tolerance — standard beat-tracking precision/recall setup.
function matchBeats(detected: number[], truth: number[], toleranceSeconds: number): { matches: number; offsetsMs: number[] } {
  const usedTruth = new Set<number>();
  let matches = 0;
  const offsetsMs: number[] = [];
  for (const d of detected) {
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < truth.length; i++) {
      if (usedTruth.has(i)) continue;
      const dist = Math.abs(truth[i] - d);
      if (dist < bestDist) { bestDist = dist; bestIdx = i; }
    }
    if (bestIdx >= 0 && bestDist <= toleranceSeconds) {
      usedTruth.add(bestIdx);
      matches++;
      offsetsMs.push(bestDist * 1000);
    }
  }
  return { matches, offsetsMs };
}

function percentileOf(sorted: number[], p: number): number | undefined {
  if (sorted.length === 0) return undefined;
  const idx = Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)));
  return sorted[idx];
}

function regionOverlap(
  a?: { startSeconds: number; endSeconds: number },
  b?: { startSeconds: number; endSeconds: number },
): number | undefined {
  if (!a || !b) return undefined;
  const overlapStart = Math.max(a.startSeconds, b.startSeconds);
  const overlapEnd = Math.min(a.endSeconds, b.endSeconds);
  const overlap = Math.max(0, overlapEnd - overlapStart);
  const union = Math.max(a.endSeconds, b.endSeconds) - Math.min(a.startSeconds, b.startSeconds);
  return union > 0 ? overlap / union : 0;
}

export function computeBeatMapAccuracy(detected: TrackBeatMap, truth: BeatMapGroundTruth): BeatMapAccuracyMetrics {
  const truthBeats = truth.beatTimesSeconds ?? [];
  const { matches, offsetsMs } = matchBeats(detected.beatTimesSeconds, truthBeats, BEAT_MATCH_TOLERANCE_MS / 1000);

  const beatPrecision = detected.beatTimesSeconds.length > 0 ? matches / detected.beatTimesSeconds.length : 0;
  const beatRecall = truthBeats.length > 0 ? matches / truthBeats.length : 0;
  const beatFMeasure = (beatPrecision + beatRecall) > 0 ? (2 * beatPrecision * beatRecall) / (beatPrecision + beatRecall) : 0;

  const sortedOffsets = [...offsetsMs].sort((a, b) => a - b);
  const meanBeatOffsetMs = sortedOffsets.length > 0 ? sortedOffsets.reduce((a, b) => a + b, 0) / sortedOffsets.length : undefined;
  const medianBeatOffsetMs = percentileOf(sortedOffsets, 0.5);
  const p95BeatOffsetMs = percentileOf(sortedOffsets, 0.95);

  const downbeatAccuracy = truth.firstDownbeatSeconds != null && detected.firstDownbeatSeconds != null
    ? (Math.abs(detected.firstDownbeatSeconds - truth.firstDownbeatSeconds) * 1000 <= DOWNBEAT_MATCH_TOLERANCE_MS ? 1 : 0)
    : undefined;

  let barStartAccuracy: number | undefined;
  if (truth.barStartTimesSeconds && truth.barStartTimesSeconds.length > 0) {
    const barMatches = truth.barStartTimesSeconds.filter(
      (t) => nearestMatch(detected.barStartTimesSeconds, t, BAR_MATCH_TOLERANCE_MS / 1000) != null,
    ).length;
    barStartAccuracy = barMatches / truth.barStartTimesSeconds.length;
  }

  const bpmErrorPercent = truth.bpm != null && detected.bpm != null
    ? Math.abs(detected.bpm - truth.bpm) / truth.bpm * 100
    : undefined;

  const firstBeatErrorMs = truth.firstBeatSeconds != null && detected.firstBeatSeconds != null
    ? Math.abs(detected.firstBeatSeconds - truth.firstBeatSeconds) * 1000
    : undefined;

  const firstDownbeatErrorMs = truth.firstDownbeatSeconds != null && detected.firstDownbeatSeconds != null
    ? Math.abs(detected.firstDownbeatSeconds - truth.firstDownbeatSeconds) * 1000
    : undefined;

  let tempoSegmentAccuracy: number | undefined;
  if (truth.tempoSegments) {
    tempoSegmentAccuracy = truth.tempoSegments.length === detected.tempoSegments.length ? 1 : 0;
  }

  const introRegionOverlap = regionOverlap(detected.introRegion, truth.introRegion);
  const outroRegionOverlap = regionOverlap(detected.outroRegion, truth.outroRegion);

  return {
    beatPrecision: +beatPrecision.toFixed(3),
    beatRecall: +beatRecall.toFixed(3),
    beatFMeasure: +beatFMeasure.toFixed(3),
    meanBeatOffsetMs: meanBeatOffsetMs != null ? +meanBeatOffsetMs.toFixed(1) : undefined,
    medianBeatOffsetMs: medianBeatOffsetMs != null ? +medianBeatOffsetMs.toFixed(1) : undefined,
    p95BeatOffsetMs: p95BeatOffsetMs != null ? +p95BeatOffsetMs.toFixed(1) : undefined,
    downbeatAccuracy,
    barStartAccuracy: barStartAccuracy != null ? +barStartAccuracy.toFixed(3) : undefined,
    bpmErrorPercent: bpmErrorPercent != null ? +bpmErrorPercent.toFixed(2) : undefined,
    firstBeatErrorMs: firstBeatErrorMs != null ? +firstBeatErrorMs.toFixed(1) : undefined,
    firstDownbeatErrorMs: firstDownbeatErrorMs != null ? +firstDownbeatErrorMs.toFixed(1) : undefined,
    tempoSegmentAccuracy,
    introRegionOverlap: introRegionOverlap != null ? +introRegionOverlap.toFixed(3) : undefined,
    outroRegionOverlap: outroRegionOverlap != null ? +outroRegionOverlap.toFixed(3) : undefined,
  };
}
