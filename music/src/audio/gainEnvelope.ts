// Dual-Deck Playback — gain-envelope math (§11). Pure functions only; no
// AudioNode access here so the curve math is independently testable.

import type { CrossfadeCurve, GainEnvelope } from "./dualDeckTypes";

// Clamps t to [0,1] before applying the curve — callers may pass
// out-of-range context times (e.g. before start / after end).
function progress(env: GainEnvelope, contextTimeSeconds: number): number {
  const span = env.endTimeContextSeconds - env.startTimeContextSeconds;
  if (span <= 0) return 1;
  const raw = (contextTimeSeconds - env.startTimeContextSeconds) / span;
  return Math.max(0, Math.min(1, raw));
}

// `ascending` distinguishes a fade-IN (0→1) from a fade-OUT (1→0) so
// equal_power can use complementary sin/cos quarter-waves whose squares sum
// to a constant — a true constant-perceived-power crossfade, not just a
// symmetric shape applied to both ends independently.
function applyCurve(t: number, curve: CrossfadeCurve, ascending: boolean): number {
  switch (curve) {
    case "linear":
      return t;
    case "equal_power":
      return ascending ? Math.sin((t * Math.PI) / 2) : Math.cos((t * Math.PI) / 2);
    case "constant_power":
      return ascending ? Math.sqrt(t) : Math.sqrt(1 - t);
  }
}

export function gainAtContextTime(env: GainEnvelope, contextTimeSeconds: number): number {
  const t = progress(env, contextTimeSeconds);
  const ascending = env.endGain >= env.startGain;
  const shaped = applyCurve(t, env.curve, ascending);
  return ascending
    ? env.startGain + (env.endGain - env.startGain) * shaped
    : env.endGain + (env.startGain - env.endGain) * shaped;
}

export function makeFadeOutEnvelope(
  startTimeContextSeconds: number,
  durationSeconds: number,
  curve: CrossfadeCurve = "equal_power",
): GainEnvelope {
  return {
    startTimeContextSeconds,
    endTimeContextSeconds: startTimeContextSeconds + durationSeconds,
    startGain: 1,
    endGain: 0,
    curve,
  };
}

export function makeFadeInEnvelope(
  startTimeContextSeconds: number,
  durationSeconds: number,
  curve: CrossfadeCurve = "equal_power",
): GainEnvelope {
  return {
    startTimeContextSeconds,
    endTimeContextSeconds: startTimeContextSeconds + durationSeconds,
    startGain: 0,
    endGain: 1,
    curve,
  };
}
