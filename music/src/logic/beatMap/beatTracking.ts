// Track Beat Map Foundation — beat timestamp tracking (§6, §7). Reuses the
// existing BPM detector's period estimate where available (never re-derives
// tempo independently — "should reuse the existing BPM result where
// appropriate" §6) and phase-locks a beat grid against the onset envelope,
// rather than blindly assuming every BPM estimate produces a valid grid.
//
// 0714_MUSIC_Beat_Map_Confidence_Calibration §4 — also returns the raw
// per-component evidence (onsetStrength, onsetRegularity, beatCoverage,
// beatContinuity) that calibration/confidenceComponents.ts composes into
// the named confidence decomposition. This module computes evidence; it
// does not decide trust or weight anything.

import { computeOnsetEnvelope, meanAt, sumAt } from "./onsetEnvelope";

export interface BeatTrackingResult {
  beatTimesSeconds: number[];
  firstBeatSeconds?: number;
  beatConfidence: number; // legacy alias, == beatPhaseFit
  perBeatStrength: number[];
  onsetStrength: number;
  onsetRegularity: number;
  beatPhaseFit: number;
  beatCoverage: number;
  beatContinuity: number;
}

const MIN_FIRST_BEAT_STRENGTH_RATIO = 0.3; // relative to the envelope's own mean+std

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function percentile(sorted: Float32Array, p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))));
  return sorted[idx];
}

function emptyResult(): BeatTrackingResult {
  return {
    beatTimesSeconds: [], beatConfidence: 0, perBeatStrength: [],
    onsetStrength: 0, onsetRegularity: 0, beatPhaseFit: 0, beatCoverage: 0, beatContinuity: 0,
  };
}

export function trackBeats(
  mono: Float32Array,
  sampleRate: number,
  beatPeriodSeconds: number,
  durationSeconds: number,
): BeatTrackingResult {
  if (!(beatPeriodSeconds > 0) || durationSeconds <= 0) return emptyResult();

  const { envelope, hopSeconds } = computeOnsetEnvelope(mono, sampleRate);
  if (envelope.length < 8) return emptyResult();

  const mean = envelope.reduce((a, b) => a + b, 0) / envelope.length;
  const std = Math.sqrt(envelope.reduce((a, b) => a + (b - mean) ** 2, 0) / envelope.length) || 1e-9;

  // onsetStrength — is there strong percussive/transient evidence in the
  // signal at all, independent of periodicity. Compares the 95th-percentile
  // excursion against the MEDIAN (not mean/std) — for a sparse impulse
  // train the median is ~0 (most frames are silence between transients)
  // while p95 captures the transient peaks, so the ratio saturates toward 1
  // for genuinely percussive material and toward 0 for flat/noisy signal
  // where percentiles converge. A mean/std-based ratio was tried first and
  // measured near-zero even on a perfectly clean synthetic click track
  // (std is dominated by the sparse spikes themselves) — this calibration
  // build's own fixture testing caught that miscalibration.
  const sortedEnvelope = Float32Array.from(envelope).sort();
  const p95 = percentile(sortedEnvelope, 0.95);
  const median = percentile(sortedEnvelope, 0.5);
  const onsetStrength = clamp01((p95 - median) / (p95 + 1e-9));

  // Phase search — try candidate offsets across one beat period, score each
  // by how well a grid at that phase aligns with onset-envelope peaks. Grid
  // positions are evaluated in continuous seconds (not an integer frame
  // stride) since beatPeriodSeconds rarely divides evenly into hopSeconds —
  // an integer-frame grid would silently drift out of phase with the real
  // beat over the course of the track (the bug caught and fixed in 0713D).
  const periodFrames = Math.max(1, beatPeriodSeconds / hopSeconds);
  const phaseSteps = Math.min(Math.max(8, Math.round(periodFrames)), 64);
  const phaseScores: number[] = [];
  let bestPhaseSeconds = 0;
  let bestScore = -Infinity;
  for (let step = 0; step < phaseSteps; step++) {
    const offsetSeconds = (step / phaseSteps) * beatPeriodSeconds;
    let score = 0;
    let count = 0;
    for (let t = offsetSeconds; t < durationSeconds; t += beatPeriodSeconds) {
      score += meanAt(envelope, hopSeconds, t);
      count++;
    }
    const avg = count > 0 ? score / count : 0;
    phaseScores.push(avg);
    if (avg > bestScore) { bestScore = avg; bestPhaseSeconds = offsetSeconds; }
  }

  // onsetRegularity — how sharply the winning phase outranks the average
  // phase tested (a genuinely periodic signal has one clear winner; noise
  // scores all phases about equally).
  const phaseMean = phaseScores.reduce((a, b) => a + b, 0) / Math.max(1, phaseScores.length);
  const phaseStd = Math.sqrt(phaseScores.reduce((a, b) => a + (b - phaseMean) ** 2, 0) / Math.max(1, phaseScores.length)) || 1e-9;
  const onsetRegularity = clamp01((bestScore - phaseMean) / (phaseStd * 3));

  // The winning phase is only known modulo one period — its very first grid
  // point can land before any real evidence exists (e.g. a pickup silence).
  // If so, the next grid point (one period later, same phase) carries the
  // same periodic evidence and is the more honest "first reliable beat."
  let firstBeatCandidate = bestPhaseSeconds;
  let firstBeatStrength = meanAt(envelope, hopSeconds, firstBeatCandidate);
  const strengthFloor = mean + std * MIN_FIRST_BEAT_STRENGTH_RATIO;
  if (firstBeatStrength <= strengthFloor && firstBeatCandidate + beatPeriodSeconds < durationSeconds) {
    const nextCandidate = firstBeatCandidate + beatPeriodSeconds;
    const nextStrength = meanAt(envelope, hopSeconds, nextCandidate);
    if (nextStrength > firstBeatStrength) { firstBeatCandidate = nextCandidate; firstBeatStrength = nextStrength; }
  }
  // §7 — never force 0; only report a first beat when the phase-search
  // winner clears a minimum evidence bar relative to the envelope's own
  // noise floor. Below that, uncertainty is preserved as `undefined`.
  const firstBeatSeconds = firstBeatStrength > strengthFloor
    ? +firstBeatCandidate.toFixed(3)
    : undefined;

  const beatTimesSeconds: number[] = [];
  const perBeatStrength: number[] = [];
  for (let t = firstBeatCandidate; t < durationSeconds; t += beatPeriodSeconds) {
    beatTimesSeconds.push(+t.toFixed(3));
    perBeatStrength.push(meanAt(envelope, hopSeconds, t));
  }

  // beatPhaseFit — what fraction of the track's total onset energy is
  // explained by energy sitting at grid positions (a small window around
  // each beat) vs. everywhere else. Robust to a small number of very large
  // onset spikes (which would blow up a mean/std-based z-score), and
  // naturally bounded 0-1. (This was previously the module's only
  // confidence value — "beatConfidence" — now one named component among
  // several.)
  const totalEnvelopeEnergy = envelope.reduce((a, b) => a + b, 0);
  const gridEnergy = beatTimesSeconds.reduce((sum, t) => sum + sumAt(envelope, hopSeconds, t), 0);
  const beatPhaseFit = totalEnvelopeEnergy > 0 ? clamp01(gridEnergy / totalEnvelopeEnergy) : 0;

  // beatCoverage — fraction of grid beats that individually clear the
  // evidence floor (as opposed to beatPhaseFit, which is a track-wide
  // energy ratio that a few very strong beats could dominate).
  const strongBeats = perBeatStrength.filter((s) => s > strengthFloor).length;
  const beatCoverage = perBeatStrength.length > 0 ? strongBeats / perBeatStrength.length : 0;

  // beatContinuity — 1 minus the longest consecutive run of weak beats as a
  // fraction of the track, i.e. penalizes a long silent/noisy stretch even
  // if the rest of the track has excellent coverage.
  let longestWeakRun = 0;
  let currentRun = 0;
  for (const s of perBeatStrength) {
    if (s <= strengthFloor) { currentRun++; longestWeakRun = Math.max(longestWeakRun, currentRun); }
    else currentRun = 0;
  }
  const beatContinuity = perBeatStrength.length > 0 ? clamp01(1 - longestWeakRun / perBeatStrength.length) : 0;

  return {
    beatTimesSeconds, firstBeatSeconds, beatConfidence: beatPhaseFit, perBeatStrength,
    onsetStrength: +onsetStrength.toFixed(3),
    onsetRegularity: +onsetRegularity.toFixed(3),
    beatPhaseFit: +beatPhaseFit.toFixed(3),
    beatCoverage: +beatCoverage.toFixed(3),
    beatContinuity: +beatContinuity.toFixed(3),
  };
}
