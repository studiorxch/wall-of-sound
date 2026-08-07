// Glyph Notes — detected-anchor phase alignment
// (docs/glyph-audio/0804_GLYPH_NOTES_Full_Canvas_Pulse_Truth_Drum_Layer_Spec_v0.1.0.md §6.5-6.6).
// Detected beats only ever refine the grid's phase and individual pulse
// timing within a bounded tolerance — they never determine how many pulses
// exist (pulseTruth.ts owns that, from duration + confirmed BPM alone).

// §6.5 — circular mean of detected timestamps modulo secondsPerPulse. A
// circular mean (rather than a literal arithmetic median) correctly
// handles phase wraparound near 0/secondsPerPulse, and is fully
// deterministic for a fixed anchor set.
export function computePhaseOffset(detectedAnchorSeconds: number[], secondsPerPulse: number): number {
  if (detectedAnchorSeconds.length === 0 || !(secondsPerPulse > 0)) return 0;

  let sinSum = 0;
  let cosSum = 0;
  for (const t of detectedAnchorSeconds) {
    const phase = ((t % secondsPerPulse) + secondsPerPulse) % secondsPerPulse;
    const angle = (phase / secondsPerPulse) * 2 * Math.PI;
    sinSum += Math.sin(angle);
    cosSum += Math.cos(angle);
  }

  if (sinSum === 0 && cosSum === 0) return 0; // anchors perfectly cancel (e.g. uniformly spread) — no dominant phase

  const meanAngle = Math.atan2(sinSum, cosSum);
  const normalizedAngle = meanAngle < 0 ? meanAngle + 2 * Math.PI : meanAngle;
  return (normalizedAngle / (2 * Math.PI)) * secondsPerPulse;
}

// §6.6 — nudges a grid pulse toward the nearest detected anchor, only when
// that anchor sits within maxAdjustmentSeconds. Never reorders, collapses,
// or drops a pulse — a pulse with no sufficiently-close anchor simply keeps
// its original grid time (source: "synthesized", decided by the caller).
export function alignPulseToAnchor(
  gridTimeSeconds: number,
  sortedAnchorSeconds: number[],
  maxAdjustmentSeconds: number,
): { timeSeconds: number; matchedAnchorSeconds: number | null } {
  // A plain linear scan — anchor lists are at most a few hundred entries
  // for any real track, so no binary search is warranted for this cost.
  let nearest: number | null = null;
  let nearestDistance = Infinity;
  for (const anchor of sortedAnchorSeconds) {
    const distance = Math.abs(anchor - gridTimeSeconds);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = anchor;
    }
  }

  if (nearest !== null && nearestDistance <= maxAdjustmentSeconds) {
    return { timeSeconds: nearest, matchedAnchorSeconds: nearest };
  }
  return { timeSeconds: gridTimeSeconds, matchedAnchorSeconds: null };
}
