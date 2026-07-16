// Downbeat and Bar Grid Calibration — evidence primitives (§7). Reuses the
// existing onset-envelope primitives (onsetEnvelope.ts) — no new decode, no
// parallel feature-extraction pipeline. Low-frequency accent evidence
// continues to use the same crude moving-average low-pass proxy the
// original downbeat detector (0713D §8) used, rather than building real
// bandpass FFT filtering — this build calibrates evidence WEIGHTING and
// MULTI-PHASE comparison, not the underlying signal primitives.

import { meanAt } from "./onsetEnvelope";

export interface EnvelopeHandle {
  envelope: Float32Array;
  hopSeconds: number;
}

// Raw (non-normalized) accent evidence for one candidate phase — summed
// across every bar in the track, not just the first, per §6 "evaluate the
// full stable region."
export function rawAccentForPhase(
  env: EnvelopeHandle,
  beatTimesSeconds: number[],
  phaseIndex: number,
  beatsPerBar: number,
): number[] {
  const perBarValues: number[] = [];
  for (let i = phaseIndex; i < beatTimesSeconds.length; i += beatsPerBar) {
    perBarValues.push(meanAt(env.envelope, env.hopSeconds, beatTimesSeconds[i]));
  }
  return perBarValues;
}

// recurrenceScore + consistencyScore — how reliably the phase's accent
// shows up bar after bar (not just once), and how stable that reliability
// is when the track is split into quarters (guards against one loud event
// dominating the whole result, §6).
export function computeRecurrenceAndConsistency(perBarValues: number[]): { recurrenceScore: number; consistencyScore: number } {
  if (perBarValues.length < 2) return { recurrenceScore: 0, consistencyScore: 0 };
  const mean = perBarValues.reduce((a, b) => a + b, 0) / perBarValues.length;
  const std = Math.sqrt(perBarValues.reduce((a, b) => a + (b - mean) ** 2, 0) / perBarValues.length);
  const coefficientOfVariation = mean > 0 ? std / mean : 1;
  const recurrenceScore = Math.max(0, Math.min(1, 1 - coefficientOfVariation));

  // Consistency — split into up to 4 quarters, check the phase's average
  // stays reasonably close to the overall mean in every quarter (a phase
  // that's only strong in one quarter isn't a reliable bar anchor).
  const quarters = Math.min(4, Math.max(1, Math.floor(perBarValues.length / 2)));
  const quarterSize = Math.max(1, Math.floor(perBarValues.length / quarters));
  let consistentQuarters = 0;
  for (let q = 0; q < quarters; q++) {
    const slice = perBarValues.slice(q * quarterSize, (q + 1) * quarterSize);
    if (slice.length === 0) continue;
    const qMean = slice.reduce((a, b) => a + b, 0) / slice.length;
    if (mean > 0 && qMean >= mean * 0.4) consistentQuarters++;
  }
  const consistencyScore = quarters > 0 ? consistentQuarters / quarters : 0;

  return { recurrenceScore, consistencyScore };
}

// structuralChangeScore — a lightweight spectral-flux-style proxy reused
// from the SAME onset envelope: local moving-average change points (large
// jumps in the envelope's own smoothed trend, not a new FFT pass) are
// treated as "structural change" evidence, then scored by how many fall
// near this phase's beat positions vs. off-grid.
export function computeStructuralChangePoints(env: EnvelopeHandle): number[] {
  const WINDOW = 20; // frames either side (~0.5s at hop=512/22050)
  const trend = new Float32Array(env.envelope.length);
  for (let i = 0; i < env.envelope.length; i++) {
    let sum = 0;
    let count = 0;
    for (let f = Math.max(0, i - WINDOW); f <= Math.min(env.envelope.length - 1, i + WINDOW); f++) { sum += env.envelope[f]; count++; }
    trend[i] = sum / count;
  }
  const changePoints: number[] = [];
  for (let i = WINDOW * 2; i < trend.length - WINDOW * 2; i++) {
    const before = trend[i - WINDOW];
    const after = trend[i + WINDOW];
    if (before > 0 && Math.abs(after - before) / before > 0.6) changePoints.push(i * env.hopSeconds);
  }
  return changePoints;
}

export function computeStructuralChangeScore(changePoints: number[], beatTimesSeconds: number[], phaseIndex: number, beatsPerBar: number, toleranceSeconds = 0.15): number {
  if (changePoints.length === 0) return 0.5; // no structural evidence either way — neutral, not penalizing
  const phaseBeats = beatTimesSeconds.filter((_, i) => i % beatsPerBar === phaseIndex);
  let nearMatches = 0;
  for (const cp of changePoints) {
    if (phaseBeats.some((b) => Math.abs(b - cp) <= toleranceSeconds)) nearMatches++;
  }
  return Math.max(0, Math.min(1, nearMatches / changePoints.length));
}

// harmonicChangeScore — no per-frame chroma/harmonic contour is exposed by
// the existing key detector (it analyzes the whole decoded buffer at once,
// §7 "do not create a second key-analysis pipeline"). Remains neutral,
// exactly as the spec's own required test list expects ("missing harmonic
// evidence remains neutral").
export function computeHarmonicChangeScore(): number {
  return 0.5;
}

// phraseBoundaryScore — soft heuristic: does this phase's bar length
// project a phrase boundary (4/8/16/32 bars) close to the track's actual
// duration? A supporting signal only (§7), not the phrase-candidate
// product itself.
export function computePhraseBoundaryScore(barCount: number): number {
  if (barCount < 4) return 0.5;
  const PHRASE_LENGTHS = [4, 8, 16, 32];
  let best = 0;
  for (const p of PHRASE_LENGTHS) {
    const remainder = barCount % p;
    const closeness = 1 - Math.min(remainder, p - remainder) / p;
    best = Math.max(best, closeness);
  }
  return best;
}
