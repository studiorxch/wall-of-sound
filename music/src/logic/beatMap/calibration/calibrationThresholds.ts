// Beat Map Confidence Calibration — centralized weights, status bands, and
// the trust rule (§5, §14, §15, §16). ONE configuration source — nothing
// scattered across modules.

import type { BeatMapConfidenceWeights, BeatMapConfidenceComponents, BeatMapCalibrationStatus } from "../../../data/beatMapCalibrationTypes";
import type { BeatMapWarningCode } from "../../../data/beatMapTypes";

// §5 — initial conceptual allocation: beat placement 45%, downbeat/bar 25%,
// tempo consistency 15%, mix-region 10%, BPM-prior agreement 5%. Split
// evenly across the components that make up each bucket.
export const BEAT_MAP_CONFIDENCE_WEIGHTS: BeatMapConfidenceWeights = {
  onsetStrength: 0.09,
  onsetRegularity: 0.09,
  beatPhaseFit: 0.09,
  beatCoverage: 0.09,
  beatContinuity: 0.09,
  downbeatRecurrence: 0.125,
  barAlignment: 0.125,
  tempoStability: 0.10,
  segmentConsistency: 0.05,
  introRegionConfidence: 0.05,
  outroRegionConfidence: 0.05,
  priorAgreement: 0.05,
};

// §14 — starting bands, kept as-measured after the calibration run in this
// build (see the calibration report for the accuracy evidence backing this
// decision).
export const STATUS_THRESHOLDS: { status: BeatMapCalibrationStatus; min: number }[] = [
  { status: "trusted", min: 0.75 },
  { status: "partial", min: 0.50 },
  { status: "uncertain", min: 0.25 },
  { status: "unusable", min: 0 },
];

export function classifyStatus(total: number): BeatMapCalibrationStatus {
  for (const band of STATUS_THRESHOLDS) if (total >= band.min) return band.status;
  return "unusable";
}

// §15 — total score alone is insufficient; critical component minimums
// must also clear, so a high composite can't hide a critical beat/bar
// failure.
export const TRUST_THRESHOLD = 0.75;
export const MIN_PHASE_FIT = 0.5;
export const MIN_BEAT_COVERAGE = 0.5;
export const MIN_BAR_ALIGNMENT = 0.4;

// §16 — blocking vs. potentially-non-blocking warning classification.
export const BLOCKING_WARNING_CODES: ReadonlySet<BeatMapWarningCode> = new Set([
  "BEAT_MAP_MISSING",
  "BEAT_MAP_LOW_CONFIDENCE",
  "BEAT_MAP_BAR_ALIGNMENT_UNCERTAIN",
  "BEAT_MAP_INSUFFICIENT_ONSETS",
  "BEAT_MAP_DETECTOR_STALE",
]);

export const NON_BLOCKING_WARNING_CODES: ReadonlySet<BeatMapWarningCode> = new Set([
  "BEAT_MAP_SPARSE_INTRO",
  "BEAT_MAP_NO_CLEAN_INTRO",
  "BEAT_MAP_NO_CLEAN_OUTRO",
  "BEAT_MAP_TEMPO_DRIFT",
  "BEAT_MAP_TEMPO_CHANGE",
]);

export function hasBlockingWarning(warnings: BeatMapWarningCode[]): boolean {
  return warnings.some((w) => BLOCKING_WARNING_CODES.has(w));
}

// §15 trust rule — a high composite score must not hide a critical beat or
// bar failure. This is the ONE place that decides trust from components;
// isBeatMapTrustedForAnalysis (beatMapTrust.ts) calls this.
export function evaluateTrust(components: BeatMapConfidenceComponents, warnings: BeatMapWarningCode[]): boolean {
  return (
    components.total >= TRUST_THRESHOLD &&
    components.beatPhaseFit >= MIN_PHASE_FIT &&
    components.beatCoverage >= MIN_BEAT_COVERAGE &&
    components.barAlignment >= MIN_BAR_ALIGNMENT &&
    !hasBlockingWarning(warnings)
  );
}
