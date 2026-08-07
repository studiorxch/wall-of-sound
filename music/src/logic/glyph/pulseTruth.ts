// Glyph Notes — Pulse Truth
// (docs/glyph-audio/0804_GLYPH_NOTES_Full_Canvas_Pulse_Truth_Drum_Layer_Spec_v0.1.0.md §6-8).
//
// Core rule (§6.1): confirmedBpm + durationSeconds alone determine the
// complete pulse grid. detectedAnchorSeconds only ever refine phase and
// individual pulse timing (pulsePhaseAlignment.ts) — they never determine
// whether a pulse exists. This directly replaces the prior build's
// dependence on an already-complete Track.beatMap.beatTimesSeconds (empty
// on every real track checked in 0804B's live verification) with a grid
// that always covers the full track, with or without any detected beats.
//
// Whether confirmedBpm is trustworthy enough to use at all (§6.4: trusted
// manual BPM / accepted candidate / trusted beat map / explicit user
// confirmation) is resolved by the caller (GlyphWorkspace.tsx) BEFORE this
// function is ever called — computePulseTruth only guards against invalid
// numeric input defensively; it does not itself judge provenance.

import type { PulseTruthResult, PulseTruthUnit, PulseTruthWarning, PulseSource } from "../../data/glyphPulseTruthTypes";
import { computePhaseOffset, alignPulseToAnchor } from "./pulsePhaseAlignment";

export const PULSE_TRUTH_VERSION = "pulse-truth-v1";

// §6.6 recommended default.
export const DEFAULT_ANCHOR_ADJUSTMENT_RATIO = 0.15;

// A pulse whose grid time and matched anchor differ by less than this is
// "detected" (already exactly on-grid); anything nudged further (but still
// within tolerance) is "aligned".
const EXACT_MATCH_EPSILON_SECONDS = 0.001;

export type ComputePulseTruthInput = {
  durationSeconds: number;
  confirmedBpm: number;
  detectedAnchorSeconds: number[];
  beatsPerBar: number;
  sectionId?: string | null;
  anchorAdjustmentRatio?: number;
  energyAt?: (timeSeconds: number, index: number) => number;
};

function emptyResult(durationSeconds: number, confirmedBpm: number, warnings: PulseTruthWarning[]): PulseTruthResult {
  return {
    durationSeconds, confirmedBpm,
    secondsPerPulse: 0, phaseOffsetSeconds: 0, expectedPulseCount: 0,
    detectedAnchorCount: 0, alignedPulseCount: 0, synthesizedPulseCount: 0,
    coverageStartSeconds: 0, coverageEndSeconds: 0, coveragePercent: 0,
    pulses: [], warnings,
  };
}

export function computePulseTruth(input: ComputePulseTruthInput): PulseTruthResult {
  const { durationSeconds, confirmedBpm } = input;

  if (!(confirmedBpm > 0) || !Number.isFinite(confirmedBpm)) {
    return emptyResult(durationSeconds, confirmedBpm, ["unconfirmedBpm"]);
  }
  if (!(durationSeconds > 0)) {
    return emptyResult(durationSeconds, confirmedBpm, []);
  }

  const secondsPerPulse = 60 / confirmedBpm;
  const expectedPulseCount = Math.floor((durationSeconds * confirmedBpm) / 60);
  const safeBeatsPerBar = Math.max(1, Math.round(input.beatsPerBar));
  const anchorAdjustmentRatio = input.anchorAdjustmentRatio ?? DEFAULT_ANCHOR_ADJUSTMENT_RATIO;
  const maxAnchorAdjustmentSeconds = secondsPerPulse * anchorAdjustmentRatio;

  const sortedAnchors = [...input.detectedAnchorSeconds].filter((t) => Number.isFinite(t) && t >= 0).sort((a, b) => a - b);
  const phaseOffsetSeconds = computePhaseOffset(sortedAnchors, secondsPerPulse);

  const pulses: PulseTruthUnit[] = [];
  let alignedPulseCount = 0;
  let synthesizedPulseCount = 0;

  // Bounded to exactly expectedPulseCount iterations — NOT an open
  // "while gridTime < duration" loop. The two are subtly different: with
  // phaseOffsetSeconds near 0 (the common case when there are no detected
  // anchors, e.g. the empty beat maps found on every real track checked in
  // 0804B), an open while-loop generates expectedPulseCount+1 pulses
  // whenever duration isn't an exact multiple of secondsPerPulse —
  // discovered live on a real 3:55 track (482 expected vs 483 generated).
  // Bounding the loop to expectedPulseCount guarantees the required
  // invariant "expected = generated = placed = visible" (§8/§24/§28.12) by
  // construction, while coverage still lands within one pulse interval of
  // track end (proven: duration - coverageEnd always falls inside
  // (-phaseOffsetSeconds, secondsPerPulse - phaseOffsetSeconds), i.e.
  // strictly less than secondsPerPulse — see the completion report for the
  // full derivation).
  for (let n = 0; n < expectedPulseCount; n++) {
    const gridTime = phaseOffsetSeconds + n * secondsPerPulse;

    const { timeSeconds, matchedAnchorSeconds } = alignPulseToAnchor(gridTime, sortedAnchors, maxAnchorAdjustmentSeconds);
    let source: PulseSource;
    if (matchedAnchorSeconds === null) {
      source = "synthesized";
      synthesizedPulseCount++;
    } else if (Math.abs(matchedAnchorSeconds - gridTime) < EXACT_MATCH_EPSILON_SECONDS) {
      source = "detected";
    } else {
      source = "aligned";
      alignedPulseCount++;
    }

    pulses.push({
      id: `pulse-${n}`,
      index: n,
      timeSeconds,
      durationSeconds: secondsPerPulse,
      barIndex: Math.floor(n / safeBeatsPerBar),
      beatInBar: n % safeBeatsPerBar,
      sectionId: input.sectionId ?? null,
      phraseId: null,
      source,
      energy: input.energyAt ? input.energyAt(timeSeconds, n) : 0.5,
      attack: 0.5,
      confidence: matchedAnchorSeconds !== null ? 0.9 : 0.3,
    });
  }

  const coverageStartSeconds = pulses.length ? pulses[0].timeSeconds : 0;
  const lastPulse = pulses[pulses.length - 1];
  const coverageEndSeconds = lastPulse ? lastPulse.timeSeconds + lastPulse.durationSeconds : 0;
  const coveragePercent = durationSeconds > 0 ? Math.min(100, (coverageEndSeconds / durationSeconds) * 100) : 0;

  const warnings: PulseTruthWarning[] = [];
  if (sortedAnchors.length === 0) warnings.push("noDetectedAnchors");
  const matchedCount = pulses.length - synthesizedPulseCount;
  if (sortedAnchors.length > 0 && pulses.length > 0 && matchedCount / pulses.length < 0.2) warnings.push("weakPhaseAlignment");
  if (pulses.length > 0 && synthesizedPulseCount / pulses.length > 0.5) warnings.push("synthesizedPulseMajority");
  if (pulses.length !== expectedPulseCount) warnings.push("pulseCountMismatch");
  // §8 — coverage counts as complete when within one pulse interval of
  // track end, not only at a literal 100.000%.
  if (durationSeconds - coverageEndSeconds > secondsPerPulse) warnings.push("coverageBelow100");

  return {
    durationSeconds, confirmedBpm, secondsPerPulse, phaseOffsetSeconds, expectedPulseCount,
    detectedAnchorCount: sortedAnchors.length, alignedPulseCount, synthesizedPulseCount,
    coverageStartSeconds, coverageEndSeconds, coveragePercent,
    pulses, warnings,
  };
}
