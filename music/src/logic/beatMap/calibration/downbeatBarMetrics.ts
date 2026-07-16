// Downbeat and Bar Grid Calibration — downbeat/bar-specific accuracy
// metrics (§13). Centralized tolerances, separate from beat-timing
// accuracy (accuracyMetrics.ts covers that).

import type { DownbeatBarAccuracyMetrics, DownbeatBarGroundTruth } from "../../../data/downbeatBarTypes";
import type { TrackBeatMap } from "../../../data/beatMapTypes";

export const DOWNBEAT_MATCH_TOLERANCE_MS = 100;
export const BAR_START_MATCH_TOLERANCE_MS = 120;

function matchSet(detected: number[], truth: number[], toleranceSeconds: number): { matches: number } {
  const used = new Set<number>();
  let matches = 0;
  for (const d of detected) {
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < truth.length; i++) {
      if (used.has(i)) continue;
      const dist = Math.abs(truth[i] - d);
      if (dist < bestDist) { bestDist = dist; bestIdx = i; }
    }
    if (bestIdx >= 0 && bestDist <= toleranceSeconds) { used.add(bestIdx); matches++; }
  }
  return { matches };
}

export function computeDownbeatBarAccuracy(detected: TrackBeatMap, truth: DownbeatBarGroundTruth): DownbeatBarAccuracyMetrics {
  const detectedDownbeats = detected.firstDownbeatSeconds != null ? [detected.firstDownbeatSeconds] : [];
  const truthDownbeats = truth.firstDownbeatSeconds != null ? [truth.firstDownbeatSeconds] : [];
  const { matches: downbeatMatches } = matchSet(detectedDownbeats, truthDownbeats, DOWNBEAT_MATCH_TOLERANCE_MS / 1000);

  const downbeatPrecision = detectedDownbeats.length > 0 ? downbeatMatches / detectedDownbeats.length : 0;
  const downbeatRecall = truthDownbeats.length > 0 ? downbeatMatches / truthDownbeats.length : 0;
  const downbeatFMeasure = (downbeatPrecision + downbeatRecall) > 0 ? (2 * downbeatPrecision * downbeatRecall) / (downbeatPrecision + downbeatRecall) : 0;

  const truthBars = truth.barStartTimesSeconds ?? [];
  const { matches: barMatches } = matchSet(detected.barStartTimesSeconds, truthBars, BAR_START_MATCH_TOLERANCE_MS / 1000);
  const barStartPrecision = detected.barStartTimesSeconds.length > 0 ? barMatches / detected.barStartTimesSeconds.length : 0;
  const barStartRecall = truthBars.length > 0 ? barMatches / truthBars.length : 0;
  const barStartFMeasure = (barStartPrecision + barStartRecall) > 0 ? (2 * barStartPrecision * barStartRecall) / (barStartPrecision + barStartRecall) : 0;

  const firstDownbeatErrorMs = truth.firstDownbeatSeconds != null && detected.firstDownbeatSeconds != null
    ? Math.abs(detected.firstDownbeatSeconds - truth.firstDownbeatSeconds) * 1000
    : undefined;

  const offsets: number[] = [];
  for (const b of detected.barStartTimesSeconds) {
    let best = Infinity;
    for (const t of truthBars) best = Math.min(best, Math.abs(t - b));
    if (best !== Infinity) offsets.push(best * 1000);
  }
  offsets.sort((a, b) => a - b);
  const medianBarOffsetMs = offsets.length > 0 ? offsets[Math.floor(offsets.length / 2)] : undefined;
  const p95BarOffsetMs = offsets.length > 0 ? offsets[Math.min(offsets.length - 1, Math.floor(offsets.length * 0.95))] : undefined;

  return {
    downbeatPrecision: +downbeatPrecision.toFixed(3),
    downbeatRecall: +downbeatRecall.toFixed(3),
    downbeatFMeasure: +downbeatFMeasure.toFixed(3),
    barStartPrecision: +barStartPrecision.toFixed(3),
    barStartRecall: +barStartRecall.toFixed(3),
    barStartFMeasure: +barStartFMeasure.toFixed(3),
    firstDownbeatErrorMs: firstDownbeatErrorMs != null ? +firstDownbeatErrorMs.toFixed(1) : undefined,
    medianBarOffsetMs: medianBarOffsetMs != null ? +medianBarOffsetMs.toFixed(1) : undefined,
    p95BarOffsetMs: p95BarOffsetMs != null ? +p95BarOffsetMs.toFixed(1) : undefined,
  };
}
