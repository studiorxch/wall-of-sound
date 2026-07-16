import type { FlowCurve } from "../data/flowCurveTypes";

export function sampleCurveEnergy(curve: FlowCurve, timePercent: number): number {
  const t = Math.max(0, Math.min(1, timePercent));
  const sorted = [...curve.points].sort((a, b) => a.timePercent - b.timePercent);

  if (sorted.length === 0) return 0.5;
  if (sorted.length === 1) return sorted[0].energy;
  if (t <= sorted[0].timePercent) return sorted[0].energy;
  if (t >= sorted[sorted.length - 1].timePercent) return sorted[sorted.length - 1].energy;

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    if (t >= a.timePercent && t <= b.timePercent) {
      const span = b.timePercent - a.timePercent;
      if (span === 0) return a.energy;
      const frac = (t - a.timePercent) / span;
      return a.energy + frac * (b.energy - a.energy);
    }
  }

  return sorted[sorted.length - 1].energy;
}
