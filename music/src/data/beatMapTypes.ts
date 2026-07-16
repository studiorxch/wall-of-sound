// Track Beat Map Foundation (0713_MUSIC_Track_Beat_Map_Foundation_v1.0.0) —
// canonical machine-readable beat map data model (§4).

export interface TempoSegment {
  startSeconds: number;
  endSeconds: number;
  bpm: number;
  confidence: number;
}

export interface MixRegion {
  startSeconds: number;
  endSeconds: number;
  cleanBars: number;
  confidence: number;
  reasons: string[];
}

export interface PhraseCandidate {
  startSeconds: number;
  endSeconds: number;
  bars: number;
  confidence: number;
}

export type BeatMapSource = "detected" | "manual" | "metadata" | "imported";

export type BeatMapWarningCode =
  | "BEAT_MAP_MISSING"
  | "BEAT_MAP_LOW_CONFIDENCE"
  | "BEAT_MAP_FIRST_BEAT_UNCERTAIN"
  | "BEAT_MAP_DOWNBEAT_UNCERTAIN"
  | "BEAT_MAP_BAR_ALIGNMENT_UNCERTAIN"
  | "BEAT_MAP_TEMPO_DRIFT"
  | "BEAT_MAP_TEMPO_CHANGE"
  | "BEAT_MAP_IRREGULAR_METER"
  | "BEAT_MAP_SPARSE_INTRO"
  | "BEAT_MAP_NO_CLEAN_INTRO"
  | "BEAT_MAP_NO_CLEAN_OUTRO"
  | "BEAT_MAP_AUDIO_TOO_SHORT"
  | "BEAT_MAP_INSUFFICIENT_ONSETS"
  | "BEAT_MAP_DETECTOR_STALE"
  // 0714_MUSIC_Downbeat_And_Bar_Grid_Calibration §10
  | "BEAT_MAP_DOWNBEAT_PHASE_AMBIGUOUS"
  | "BEAT_MAP_BAR_PHASE_AMBIGUOUS"
  | "BEAT_MAP_DOWNBEAT_EVIDENCE_CONFLICT"
  | "BEAT_MAP_BAR_PHASE_UNSTABLE"
  | "BEAT_MAP_METER_UNCERTAIN";

export interface TrackBeatMap {
  version: string;

  bpm?: number;

  firstBeatSeconds?: number;
  firstDownbeatSeconds?: number;

  beatTimesSeconds: number[];
  barStartTimesSeconds: number[];

  timeSignature?: {
    numerator: number;
    denominator: number;
    confidence: number;
  };

  tempoStable: boolean;
  tempoStabilityScore: number;

  tempoSegments: TempoSegment[];

  introRegion?: MixRegion;
  outroRegion?: MixRegion;

  phraseCandidates?: PhraseCandidate[];

  confidence: number;
  source: BeatMapSource;
  detectorVersion: string;

  analyzedAt: string;
  warnings: BeatMapWarningCode[];

  // Beat Map Confidence Calibration (0714_MUSIC_Beat_Map_Confidence_
  // Calibration §4) — the named decomposition `confidence` (total) was
  // composed from. Optional so a "manual"/"metadata"/"imported" source
  // beat map (no detector run) can omit it; `detected` maps always carry
  // it, since composeConfidenceComponents is what produces `confidence`.
  confidenceComponents?: import("./beatMapCalibrationTypes").BeatMapConfidenceComponents;
}

// Playlist Repair integration (§19) — optional, neutral-by-default scoring
// evidence. Not wired into candidate ranking weights by this build.
export interface BeatMapRepairFit {
  beatAlignmentFit: number;
  barCompatibilityFit: number;
  tempoStabilityFit: number;
  introOutroFit: number;
  confidence: number;
}

// v1 → v2: 0714_MUSIC_Beat_Map_Confidence_Calibration (confidence formula +
// trust thresholds materially changed).
// v2 → v3: 0714_MUSIC_Downbeat_And_Bar_Grid_Calibration — production
// downbeat/bar SELECTION logic materially changed (multi-candidate-phase
// evaluation with low-band/broadband/recurrence/structural/harmonic/
// phrase evidence, replacing the old "first 4 beats, low-band-only" method;
// §19 requires the bump whenever downbeat/bar selection or confidence
// logic changes materially). Any beat map persisted under an earlier
// version is automatically treated as stale by
// isBeatMapTrustedForAnalysis's detector-version check; no separate
// migration step is needed, it will simply be recomputed on next analysis.
// This build does NOT also change tempo-segmentation architecture (§19:
// "do not combine this change with the separate variable-tempo
// architecture unless both are implemented together" — that remains a
// documented, separate, not-yet-implemented limitation).
export const BEAT_MAP_DETECTOR_VERSION = "beat-map-v3";
