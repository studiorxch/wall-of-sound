// Track Beat Map Foundation — intro/outro usable mix-region estimation
// (§12, §13). Finds the longest run of consecutive bars near the start/end
// whose beat spacing stays close to the track's dominant period and whose
// onset envelope shows sufficient activity (rejects silence/fades). Result
// rounds DOWN to the nearest recommended clean-bar count {4, 8, 16, 32}.

import { computeOnsetEnvelope, meanAt } from "./onsetEnvelope";
import type { MixRegion } from "../../data/beatMapTypes";

const CLEAN_BAR_STEPS = [32, 16, 8, 4];
const BAR_PERIOD_TOLERANCE = 0.08; // 8% deviation from expected bar length
const MIN_ONSET_ACTIVITY_RATIO = 0.4; // relative to the track's own onset mean

function roundDownToStep(bars: number): number {
  for (const step of CLEAN_BAR_STEPS) if (bars >= step) return step;
  return 0;
}

function evaluateRegion(
  barStartTimesSeconds: number[],
  startIdx: number,
  direction: 1 | -1,
  expectedBarSeconds: number,
  mono: Float32Array,
  sampleRate: number,
): { bars: number; endIdx: number; reasons: string[] } {
  const { envelope, hopSeconds } = computeOnsetEnvelope(mono, sampleRate);
  const trackMeanOnset = envelope.reduce((a, b) => a + b, 0) / Math.max(1, envelope.length);

  let bars = 0;
  let idx = startIdx;
  const reasons: string[] = [];

  while (idx + direction >= 0 && idx + direction < barStartTimesSeconds.length) {
    const a = barStartTimesSeconds[idx];
    const b = barStartTimesSeconds[idx + direction];
    const barLen = Math.abs(b - a);
    const deviates = Math.abs(barLen - expectedBarSeconds) / expectedBarSeconds > BAR_PERIOD_TOLERANCE;
    if (deviates) { reasons.push("bar spacing deviates beyond tolerance"); break; }

    const activity = meanAt(envelope, hopSeconds, (a + b) / 2, expectedBarSeconds / 2);
    if (activity < trackMeanOnset * MIN_ONSET_ACTIVITY_RATIO) { reasons.push("onset activity below track baseline"); break; }

    bars++;
    idx += direction;
  }

  return { bars, endIdx: idx, reasons };
}

export function detectIntroRegion(
  mono: Float32Array,
  sampleRate: number,
  barStartTimesSeconds: number[],
  expectedBarSeconds: number,
  barConfidence: number,
): MixRegion | undefined {
  if (barStartTimesSeconds.length < 2 || !(expectedBarSeconds > 0)) return undefined;
  const { bars, endIdx, reasons } = evaluateRegion(barStartTimesSeconds, 0, 1, expectedBarSeconds, mono, sampleRate);
  const cleanBars = roundDownToStep(bars);
  if (cleanBars === 0) return undefined;

  return {
    startSeconds: barStartTimesSeconds[0],
    endSeconds: barStartTimesSeconds[Math.min(endIdx, barStartTimesSeconds.length - 1)],
    cleanBars,
    confidence: +Math.max(0, Math.min(1, barConfidence * (bars > 0 ? Math.min(1, cleanBars / bars) : 0))).toFixed(3),
    reasons,
  };
}

export function detectOutroRegion(
  mono: Float32Array,
  sampleRate: number,
  barStartTimesSeconds: number[],
  expectedBarSeconds: number,
  barConfidence: number,
): MixRegion | undefined {
  if (barStartTimesSeconds.length < 2 || !(expectedBarSeconds > 0)) return undefined;
  const lastIdx = barStartTimesSeconds.length - 1;
  const { bars, endIdx, reasons } = evaluateRegion(barStartTimesSeconds, lastIdx, -1, expectedBarSeconds, mono, sampleRate);
  const cleanBars = roundDownToStep(bars);
  if (cleanBars === 0) return undefined;

  return {
    startSeconds: barStartTimesSeconds[Math.max(endIdx, 0)],
    endSeconds: barStartTimesSeconds[lastIdx],
    cleanBars,
    confidence: +Math.max(0, Math.min(1, barConfidence * (bars > 0 ? Math.min(1, cleanBars / bars) : 0))).toFixed(3),
    reasons,
  };
}
