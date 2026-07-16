// Beat Map Confidence Calibration (0714_MUSIC_Beat_Map_Confidence_Calibration
// v1.0.0) — data model. Mirrors the spec's interfaces exactly.

import type { BeatMapWarningCode, TempoSegment, MixRegion } from "./beatMapTypes";

export interface BeatMapConfidenceComponents {
  onsetStrength: number;
  onsetRegularity: number;

  beatPhaseFit: number;
  beatCoverage: number;
  beatContinuity: number;

  downbeatRecurrence: number;
  barAlignment: number;

  tempoStability: number;
  segmentConsistency: number;

  introRegionConfidence: number;
  outroRegionConfidence: number;

  priorAgreement: number;
  warningPenalty: number;

  total: number;
}

export interface BeatMapConfidenceWeights {
  onsetStrength: number;
  onsetRegularity: number;
  beatPhaseFit: number;
  beatCoverage: number;
  beatContinuity: number;
  downbeatRecurrence: number;
  barAlignment: number;
  tempoStability: number;
  segmentConsistency: number;
  introRegionConfidence: number;
  outroRegionConfidence: number;
  priorAgreement: number;
}

// §6 — separate confidence axes; a weak downbeat must not erase a useful
// beat grid.
export interface BeatMapConfidenceAxes {
  beatGridConfidence: number;
  downbeatConfidence: number;
  barGridConfidence: number;
  mixRegionConfidence: number;
  totalConfidence: number;
}

export type BeatMapTrackClass =
  | "stable_electronic"
  | "ambient_pulse"
  | "broken_beat"
  | "half_time"
  | "double_time"
  | "live_drum"
  | "tempo_drift"
  | "tempo_change"
  | "sparse_intro"
  | "fade_in"
  | "fade_out"
  | "irregular_meter"
  | "percussion_only"
  | "low_onset_density"
  | "noise_heavy";

export type BeatMapCalibrationStatus = "trusted" | "partial" | "uncertain" | "unusable";

export interface BeatMapAccuracyMetrics {
  beatPrecision: number;
  beatRecall: number;
  beatFMeasure: number;

  meanBeatOffsetMs?: number;
  medianBeatOffsetMs?: number;
  p95BeatOffsetMs?: number;

  downbeatAccuracy?: number;
  barStartAccuracy?: number;

  bpmErrorPercent?: number;
  firstBeatErrorMs?: number;
  firstDownbeatErrorMs?: number;

  tempoSegmentAccuracy?: number;
  introRegionOverlap?: number;
  outroRegionOverlap?: number;
}

export interface BeatMapCalibrationDiagnostic {
  trackId: string;
  trackClass: BeatMapTrackClass;

  confidence: BeatMapConfidenceComponents;
  trusted: boolean;
  status: BeatMapCalibrationStatus;

  warnings: BeatMapWarningCode[];
  dominantFailureCauses: string[];

  estimatedBpm?: number;
  priorBpm?: number;

  beatCount: number;
  barCount: number;

  firstBeatSeconds?: number;
  firstDownbeatSeconds?: number;
  tempoStabilityScore: number;

  accuracy?: BeatMapAccuracyMetrics;
}

export interface BeatMapGroundTruth {
  fixtureId: string;
  trackClass: BeatMapTrackClass;
  durationSeconds: number;

  bpm?: number;
  firstBeatSeconds?: number;
  firstDownbeatSeconds?: number;

  beatTimesSeconds?: number[];
  barStartTimesSeconds?: number[];

  tempoStable?: boolean;
  tempoSegments?: TempoSegment[];

  introRegion?: MixRegion;
  outroRegion?: MixRegion;

  annotationConfidence: number;
  notes?: string;
}

export type BeatMapPriorRelationship = "direct" | "half_time" | "double_time" | "disagreement" | "unknown";

export interface BeatMapPriorAgreement {
  bpmPrior?: number;
  gridBpm?: number;

  directErrorPercent?: number;
  halfTimeErrorPercent?: number;
  doubleTimeErrorPercent?: number;

  relationship: BeatMapPriorRelationship;
}

export interface BeatMapCalibrationSummary {
  trustedCount: number;
  partialCount: number;
  uncertainCount: number;
  unusableCount: number;

  trustedAccurateCount: number;
  trustedWrongCount: number;

  falseTrustRate: number;
  falseRejectionRate: number;
}
