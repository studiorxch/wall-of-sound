// Track Beat Map Foundation — tempo stability + segmentation (§10, §11).
// Centralizes the stability-score thresholds (§10: "exact thresholds should
// be centralized") and produces tempo segments only when a BPM change
// exceeds threshold, persists long enough, and is confident — avoiding
// noisy micro-segments.
//
// KNOWN LIMITATION (found during 0714_MUSIC_Beat_Map_Confidence_Calibration
// — see that build's calibration report, "Unresolved Limitations"): the
// beat grid this function receives is a single fixed-period arithmetic
// extrapolation from computeTrackBeatMap (by design — it phase-locks ONE
// grid to the BPM detector's period, per 0713D §6/§16, and does not
// re-track per-window). That means windowed-BPM variance computed here is
// measuring the rigidity of the EXTRAPOLATED grid, which is always ~0 by
// construction — it cannot detect a genuine mid-track tempo change in the
// underlying audio. What currently makes tempoStabilityScore respond to
// real drift/change at all is the `beatConfidence` scaling term below (a
// real tempo shift degrades beatPhaseFit/coverage since the fixed grid
// stops explaining the actual audio), which is an indirect proxy, not
// direct measurement. A genuine fix would require per-window local
// re-tracking against the onset envelope (a real-time-budget beat-map-v3
// candidate), which this calibration build intentionally did not attempt —
// it is out of scope to rewrite core beat-tracking architecture here.

import type { TempoSegment } from "../../data/beatMapTypes";

// §10 — centralized interpretation thresholds.
export const TEMPO_STABILITY_BANDS = [
  { min: 0.90, label: "very_stable" },
  { min: 0.75, label: "stable" },
  { min: 0.50, label: "moderate_drift" },
  { min: 0.25, label: "unstable" },
  { min: 0.00, label: "highly_irregular" },
] as const;

const SEGMENT_BPM_DELTA_THRESHOLD = 3; // BPM
const SEGMENT_MIN_DURATION_SECONDS = 20;
const SEGMENT_MIN_CONFIDENCE = 0.4;
const WINDOW_BEATS = 8;

interface StabilityResult {
  tempoStable: boolean;
  tempoStabilityScore: number;
  tempoSegments: TempoSegment[];
}

export function computeTempoStability(beatTimesSeconds: number[], beatConfidence: number): StabilityResult {
  if (beatTimesSeconds.length < WINDOW_BEATS + 1) {
    return { tempoStable: false, tempoStabilityScore: 0, tempoSegments: [] };
  }

  // Instantaneous BPM per windowed group of beats.
  const windowBpms: { startSeconds: number; endSeconds: number; bpm: number }[] = [];
  for (let i = 0; i + WINDOW_BEATS < beatTimesSeconds.length; i += WINDOW_BEATS) {
    const start = beatTimesSeconds[i];
    const end = beatTimesSeconds[i + WINDOW_BEATS];
    const bpm = (60 * WINDOW_BEATS) / (end - start);
    windowBpms.push({ startSeconds: start, endSeconds: end, bpm });
  }
  if (windowBpms.length === 0) {
    return { tempoStable: false, tempoStabilityScore: 0, tempoSegments: [] };
  }

  const bpms = windowBpms.map((w) => w.bpm);
  const mean = bpms.reduce((a, b) => a + b, 0) / bpms.length;
  const std = Math.sqrt(bpms.reduce((a, b) => a + (b - mean) ** 2, 0) / bpms.length);
  const coefficientOfVariation = mean > 0 ? std / mean : 1;

  // Stability score: 1.0 at zero drift, decaying with relative BPM variance,
  // scaled down further by weak beat-tracking confidence (an unstable-
  // LOOKING result from a low-confidence grid isn't trustworthy evidence of
  // real tempo drift).
  const varianceScore = Math.max(0, 1 - coefficientOfVariation * 12);
  const tempoStabilityScore = +Math.max(0, Math.min(1, varianceScore * (0.5 + 0.5 * beatConfidence))).toFixed(3);
  const tempoStable = tempoStabilityScore >= 0.75;

  // Segment merge — walk windows, start a new segment only when the BPM
  // change from the current segment's running average exceeds threshold AND
  // persists for at least SEGMENT_MIN_DURATION_SECONDS.
  const segments: TempoSegment[] = [];
  let segStart = windowBpms[0].startSeconds;
  let segBpms: number[] = [windowBpms[0].bpm];
  let segEnd = windowBpms[0].endSeconds;

  for (let i = 1; i < windowBpms.length; i++) {
    const w = windowBpms[i];
    const runningAvg = segBpms.reduce((a, b) => a + b, 0) / segBpms.length;
    if (Math.abs(w.bpm - runningAvg) > SEGMENT_BPM_DELTA_THRESHOLD && (w.startSeconds - segStart) >= SEGMENT_MIN_DURATION_SECONDS) {
      segments.push({
        startSeconds: +segStart.toFixed(2), endSeconds: +segEnd.toFixed(2),
        bpm: +runningAvg.toFixed(2), confidence: +Math.max(SEGMENT_MIN_CONFIDENCE, beatConfidence).toFixed(3),
      });
      segStart = w.startSeconds;
      segBpms = [w.bpm];
    } else {
      segBpms.push(w.bpm);
    }
    segEnd = w.endSeconds;
  }
  const finalAvg = segBpms.reduce((a, b) => a + b, 0) / segBpms.length;
  segments.push({
    startSeconds: +segStart.toFixed(2), endSeconds: +segEnd.toFixed(2),
    bpm: +finalAvg.toFixed(2), confidence: +Math.max(SEGMENT_MIN_CONFIDENCE, beatConfidence).toFixed(3),
  });

  return { tempoStable, tempoStabilityScore, tempoSegments: segments };
}
