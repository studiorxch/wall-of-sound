// BPM / key detection engine — data layer (0712_MUSIC_BPM_Key_Detection_Engine).

export interface AudioAnalysisInput {
  sampleRate: number;
  channels: Float32Array[];
  mono: Float32Array;
  durationSeconds: number;
}

// Calibration (0712_MUSIC_BPM_Key_Detector_Calibration §5.1) — one overloaded
// confidence number can't distinguish "strong periodic signal but wrong
// octave" from "no periodic signal at all." Each dimension answers a
// different question; overallConfidence is the conservative aggregate that
// persistence/UI actually gate on.
export interface BpmDetectionConfidence {
  /** How strongly the audio contains usable periodic evidence at all. */
  signalConfidence: number;
  /** How strongly the selected lag outranks an unrelated (non-metrical) rival. */
  candidateConfidence: number;
  /** How confidently the half/double/triple metrical level was resolved. */
  metricalConfidence: number;
  /** Conservative aggregate — never 1.0 while metrical ambiguity remains. */
  overallConfidence: number;
}

export interface BpmDetectionResult {
  bpm?: number;
  /** @deprecated use confidence.overallConfidence — kept for back-compat call sites. */
  confidence: number;
  confidenceDetail: BpmDetectionConfidence;
  halfTimeCandidate?: number;
  doubleTimeCandidate?: number;
  beatPeriodSeconds?: number;
  source: "detected";
  detectorVersion: string;
  warningCodes: string[];
}

export interface KeyCandidate {
  tonic: string;
  mode: "major" | "minor";
  camelotKey: string;
  confidence: number;
}

// Calibration §14 — same rationale as BPM: a clear tonic with an ambiguous
// mode (the classic relative major/minor confusion) must not read as a
// single high overall number.
export interface KeyDetectionConfidence {
  /** Enough stable harmonic content exists to trust any tonal read at all. */
  tonalSignalConfidence: number;
  /** Selected pitch-class set outranks a genuinely different rival. */
  tonicConfidence: number;
  /** Major/minor distinction is clear — low when the relative-key rival is close. */
  modeConfidence: number;
  /** Conservative aggregate — never high while mode remains ambiguous. */
  overallConfidence: number;
}

export interface KeyDetectionResult {
  tonic?: string;
  mode?: "major" | "minor";
  camelotKey?: string;
  /** @deprecated use confidence.overallConfidence — kept for back-compat call sites. */
  confidence: number;
  confidenceDetail: KeyDetectionConfidence;
  source: "detected";
  detectorVersion: string;
  alternateCandidates: KeyCandidate[];
  warningCodes: string[];
}

// Metadata precedence (0712_MUSIC_BPM_Key_Detector_Calibration §17/§18) — who
// last set bpm/camelotKey, so detected values never silently clobber a manual
// edit or trusted import. `legacy_unknown` is a track whose value predates
// provenance tracking: it might be genuine CSV-sourced data, or it might be
// the historic fabricated "1A"/"0" default — it is NOT assumed trusted, but
// it is also not discarded; only a confident new detection may replace it.
export type AnalysisValueSource =
  | "manual"
  | "embedded_metadata"
  | "csv_metadata"
  | "detected"
  | "legacy_unknown";

export interface TrackTempoMetadata {
  bpm?: number;
  confidence?: number;
  source?: AnalysisValueSource;
  detectorVersion?: string;
}

export interface TrackKeyMetadata {
  tonic?: string;
  mode?: "major" | "minor";
  camelotKey?: string;
  confidence?: number;
  source?: AnalysisValueSource;
  detectorVersion?: string;
}

export interface AudioDetectorVersions {
  dspVersion: string;
  bpmDetectorVersion: string;
  keyDetectorVersion: string;
}

export type AudioDetectionWarningCode =
  | "BPM_DETECTION_FAILED"
  | "BPM_DETECTION_LOW_CONFIDENCE"
  | "BPM_HALF_DOUBLE_AMBIGUITY"
  | "BPM_OUT_OF_RANGE"
  | "KEY_DETECTION_FAILED"
  | "KEY_DETECTION_LOW_CONFIDENCE"
  | "KEY_MODE_AMBIGUITY"
  | "KEY_MULTIPLE_CANDIDATES"
  | "DETECTOR_VERSION_STALE"
  | "AUDIO_DECODE_FAILED";
