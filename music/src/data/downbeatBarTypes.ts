// Downbeat and Bar Grid Calibration (0714_MUSIC_Downbeat_And_Bar_Grid_
// Calibration_v1.0.0) — data model. Mirrors the spec's interfaces exactly.

export interface DownbeatPhaseCandidate {
  phaseIndex: number;
  beatsPerBar: number;

  lowBandAccentScore: number;
  broadbandAccentScore: number;
  recurrenceScore: number;
  structuralChangeScore: number;
  harmonicChangeScore: number;
  phraseBoundaryScore: number;
  consistencyScore: number;

  ambiguityPenalty: number;
  totalScore: number;
}

export interface BarRecurrenceEvidence {
  periodicityScore: number;
  candidatePhaseConsistency: number;
  missingBarPenalty: number;
  falseResetPenalty: number;
}

export interface BarGridConfidence {
  bestPhaseScore: number;
  secondBestPhaseScore: number;
  margin: number;
  phaseStability: number;
  fullTrackCoverage: number;
  ambiguity: number;
  total: number;
}

export interface DownbeatConfidence {
  selectedPhase?: number;
  accentEvidence: number;
  recurrenceEvidence: number;
  structuralEvidence: number;
  harmonicEvidence: number;
  phraseEvidence: number;
  ambiguityPenalty: number;
  total: number;
}

export type MeterCandidate = "4/4" | "3/4" | "6/8" | "unknown";

export interface MeterEvidence {
  meter: MeterCandidate;
  meterConfidence: number;
  // Per-beats-per-bar aggregate recurrence, for transparency/diagnostics.
  candidateScoresByMeter: Record<number, number>;
}

export interface DownbeatBarResult {
  beatsPerBar: number;
  phaseCandidates: DownbeatPhaseCandidate[];
  selectedPhaseIndex?: number;
  downbeatConfidence: DownbeatConfidence;
  barGridConfidence: BarGridConfidence;
  meter: MeterEvidence;
}

// §13 — ground truth and accuracy metrics.
export interface DownbeatBarGroundTruth {
  beatsPerBar?: number;
  firstDownbeatSeconds?: number;
  downbeatBeatIndex?: number;
  barStartTimesSeconds?: number[];
  meter?: string;
  annotationConfidence: number;
}

export interface DownbeatBarAccuracyMetrics {
  downbeatPrecision: number;
  downbeatRecall: number;
  downbeatFMeasure: number;

  barStartPrecision: number;
  barStartRecall: number;
  barStartFMeasure: number;

  selectedPhaseCorrect?: boolean;
  phaseMargin?: number;
  firstDownbeatErrorMs?: number;
  medianBarOffsetMs?: number;
  p95BarOffsetMs?: number;
}
