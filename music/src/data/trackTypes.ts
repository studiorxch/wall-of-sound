// ── Music Library field map ───────────────────────────────────────────────────
//
// SHARED (all sources):
//   trackId, title, artist, sourceOwner, sourceLibrary, sourceGroupId,
//   filePath, objectUrl, audioLinked, audioMissing,
//   durationSeconds, bpm, camelotKey, energy, energySource,
//   rating, playCount, lastPlayedAt, archiveStatus,
//   moodTags, moodSuggestions, mechanicalMoodTags,
//   createdAt, updatedAt, analysisStatus, analysisSources
//
// MUSIC TRACKS (sourceOwner = "studiorich" | "external"):
//   genre, genres, grouping, albumTitle, trackNumber,
//   platformUse, audioAnalysis, comment, cuePoints,
//   startTimeSeconds, endTimeSeconds
//
// REFERENCE CLIPS (sourceOwner = "reference"):
//   genre (used as category, e.g. "SFX", "Ambience"),
//   grouping (scene/environment label),
//   filePath / objectUrl mandatory for sampler playback
//   — music-specific fields (BPM, Camelot, energy) are stored but
//     not displayed in the Reference view and ignored by Flow Curve
//
// ─────────────────────────────────────────────────────────────────────────────

// Archive status (0624F): controls whether a track is curated for programming
export type TrackArchiveStatus =
  | "library"       // imported but not yet curated
  | "archive"       // approved for programming
  | "needs_review"  // needs metadata/audio/mood attention
  | "rejected";     // keep but avoid programming

export type TrackAudioAnalysis = {
  actualBpm?: number;
  bpmConfidence?: number;
  actualKey?: string;
  keyConfidence?: number;
  camelot?: string;
  // BPM/key detection engine (0712_MUSIC_BPM_Key_Detection_Engine) — detailed
  // provenance alongside the actualBpm/actualKey/camelot/*Confidence fields
  // above, which hold the accepted values themselves.
  tonic?: string;
  mode?: "major" | "minor";
  halfTimeCandidate?: number;
  doubleTimeCandidate?: number;
  beatPeriodSeconds?: number;
  bpmDetectorVersion?: string;
  keyDetectorVersion?: string;
  alternateKeyCandidates?: Array<{ tonic: string; mode: "major" | "minor"; camelotKey: string; confidence: number }>;
  bpmWarningCodes?: string[];
  keyWarningCodes?: string[];
  // Multi-dimension confidence breakdown (0712_MUSIC_BPM_Key_Detector_
  // Calibration §5.1/§14) — bpmConfidence/keyConfidence above hold the
  // conservative overall aggregate; these hold the full breakdown for
  // Analyzer Review's expanded detail view.
  bpmConfidenceDetail?: import("./audioDetectionTypes").BpmDetectionConfidence;
  keyConfidenceDetail?: import("./audioDetectionTypes").KeyDetectionConfidence;
  tempoFamily?: string;
  energyScore?: number;
  energyLevel?: string | number;
  loudness?: number;
  rmsMean?: number;         // 0–1 RMS mean across frames
  rmsEnergy?: number;       // 0–1 normalized energy (rmsMean * scale)
  rmsPeak?: number;
  dynamicRange?: number;
  onsetDensity?: number;    // 0–1 normalized onset density
  onsetDensityRaw?: number; // raw onsets/sec before normalization
  transientDensity?: number;
  spectralCentroid?: number;      // Hz
  spectralCentroidNorm?: number;  // 0–1
  spectralRolloff?: number;       // Hz
  spectralRolloffNorm?: number;   // 0–1
  spectralBandwidth?: number;     // Hz
  spectralBandwidthNorm?: number; // 0–1
  zeroCrossingRate?: number;      // 0–1 normalized ZCR
  zeroCrossingRateRaw?: number;   // raw mean ZCR before normalization
  brightness?: number;            // 0–1 (alias for spectralCentroidNorm when set by DSP)
  density?: number;
  sampleRate?: number;
  channels?: number;
  beatsDetected?: number;
  analysisVersion?: string;
  analyzedAt?: string;
  warnings?: string[];
};

export type CamelotLetter = "A" | "B";

export type CamelotKey = `${number}${CamelotLetter}`;

export type TrackEnergySource = "manual" | "estimated";

export type TrackRating = 0 | 1 | 2 | 3 | 4 | 5;

export type TrackSourceOwner = "studiorich" | "external" | "reference" | "unknown";

export type PlatformUse =
  | "internal"
  | "studiorich_stream"
  | "mixcloud"
  | "reference_only"
  | "do_not_publish";

// Mechanical mood describes what a track DOES in a mix flow (0701C)
export type MechanicalMoodTag =
  | "opener" | "closer" | "bridge" | "reset" | "lift" | "drop"
  | "hold" | "drift" | "pulse" | "tension" | "release" | "build"
  | "plateau" | "recovery" | "transition" | "anchor" | "disruptor"
  | "deepener" | "brightener" | "shadow";

export type ArtworkStatus = "missing" | "linked" | "embedded" | "generated" | "unknown";

export type TransitionUse = "opener" | "bridge" | "hold" | "reset" | "closer" | "unknown";

export type CuePoint = {
  id: string;
  timeSeconds: number;
  label?: string;
  type?: "cue" | "loop" | "hotcue" | "marker";
};

// Analysis status (0701C + 0708): tracks the pipeline state of derived fields
export type AnalysisStatus = "not_analyzed" | "partial" | "analyzed" | "stale" | "failed" | "queued" | "analyzing" | "review_needed";

export type AnalysisSource = "import" | "manual" | "mixxx" | "play_analyzer" | "external_tool";

export type MechanicalAnalysisSource = "catalog_import" | "play_catalog_analyzer" | "manual_correction";

export type AnalyzerJobStatus = "idle" | "queued" | "running" | "complete" | "failed" | "not_connected";

// Analysis trust (0705Q)
export type AnalysisTrust = "trusted" | "low_confidence" | "untrusted" | "missing";

// Track identity status (0705Q)
export type TrackIdentityStatus =
  | "clean"
  | "needs_review"
  | "artist_missing"
  | "title_missing"
  | "track_number_detected"
  | "title_artist_fused"
  | "filename_only"
  | "manual_override";

export type TrackIdentitySource = "tag" | "filename" | "manual" | "import" | "hybrid";

// Intake readiness grade (0705Q)
export type IntakeReadinessGrade = "EXCELLENT" | "GOOD" | "REVIEW" | "BLOCKED";

export type Track = {
  trackId: string;
  title: string;
  artist: string;
  // 0712_MUSIC_BPM_Key_Persistence_Repair: optional — no beat-tracking or key-
  // detection algorithm exists in this codebase, so a real value is only ever
  // known when imported from CSV/metadata. Missing must stay missing, not a
  // fabricated 0 / "1A" placeholder (see isValidBpm/isValidCamelotKey).
  bpm?: number;
  camelotKey?: CamelotKey;
  durationSeconds: number;
  energy: number;
  energySource: TrackEnergySource;
  filePath?: string;
  genre?: string;
  sourcePlaylist?: string;
  // Source-group isolation (0621E)
  sourceGroupId?: string;
  // Identity metadata (0701C)
  trackNumber?: number;
  comment?: string;
  // Catalog fields (0623C + 0624C)
  audioFilename?: string;
  fileName?: string;
  fileExtension?: string;
  albumTitle?: string;
  albumArtist?: string;
  albumGroupId?: string;
  year?: number;
  composer?: string;
  grouping?: string;
  key?: string;
  musicalKey?: string;  // e.g. "Eb major"
  genres?: string[];
  sourceOwner?: TrackSourceOwner;
  sourcePoolIds?: string[];
  // Archive status (0624F)
  archiveStatus?: TrackArchiveStatus;
  // Audio analysis bridge (0624E / 0701C)
  audioAnalysis?: TrackAudioAnalysis;
  // Track Beat Map Foundation (0713_MUSIC_Track_Beat_Map_Foundation) —
  // migration-safe optional field; absent/undefined means "not yet
  // analyzed," never a fabricated empty grid.
  beatMap?: import("./beatMapTypes").TrackBeatMap;
  // Track Playback Bounds (0714_MUSIC_Track_Playback_Bounds) — non-
  // destructive playback-instructions layer; the source file itself is
  // never modified. Migration-safe optional field.
  playbackBounds?: import("./playbackBoundsTypes").TrackPlaybackBounds;
  moodSuggestions?: string[];
  // Mood catalog (0624C)
  moodTags?: string[];
  primaryMood?: string;
  moodConfidence?: number;
  moodCoordX?: number;
  moodCoordY?: number;
  moodCoordZ?: number;
  moodCoverage?: number;
  // Album art (0624C / 0701C)
  albumArtUrl?: string;
  albumArtDataUrl?: string;
  artworkStatus?: ArtworkStatus;
  coverImagePath?: string;
  // Music-shape fields (0624C)
  groove?: string;
  rhythmDensity?: string;
  phraseLength?: string;
  percussiveShape?: string;
  energyLevel?: string | number;
  // Flow Curve / playlist shape (0701C)
  vocalPresence?: number;
  introStrength?: number;
  outroStrength?: number;
  transitionUse?: TransitionUse;
  density?: number;
  brightness?: number;
  focusCategory?: string;
  // Mechanical mood (0701C) — what the track DOES in flow
  mechanicalMoodTags?: MechanicalMoodTag[];
  // Sonic mechanism — how the track is constructed (field-recording, granular-processing, etc.)
  mechanismTags?: string[];
  suggestedMechanismTags?: string[];  // DSP-inferred candidates, not yet approved
  mechanicalMoodConfidence?: Record<string, number>;
  // Source safety (0630C / 0701C)
  sourceLibrary?: string;
  catalogId?: string;
  sunoId?: string;
  platformUse?: PlatformUse[];
  // Analysis pipeline (0701C + 0708)
  analysisStatus?: AnalysisStatus;
  analysisSources?: AnalysisSource[];
  analysisUpdatedAt?: string;
  analysisVersion?: string;
  analysisErrors?: string[];
  // Mood vector scoring results (0708_MUSIC_AnalyzableMoodVectorScoring)
  moodScores?: Record<string, number>;     // mood → confidence 0–1
  analysisConfidence?: number;             // overall 0–1 confidence for this analysis pass
  analysisWarnings?: string[];             // per-field fallback notes
  // Mechanical mood analysis (0701D)
  mechanicalAnalysisStatus?: AnalysisStatus;
  mechanicalAnalysisSources?: MechanicalAnalysisSource[];
  mechanicalAnalysisNotes?: string[];
  // Portable audio path (0707_PortableAudioPathResolver)
  audioRelPath?: string;        // portable path relative to library/music/ root
  audioCategory?: "catalog" | "external" | "reference";
  audioFileName?: string;       // just the filename, no directory
  audioStatus?: "linked" | "missing" | "unresolved" | "external_url";
  // Audio folder linking (0701F / 0701G)
  audioLinked?: boolean;
  audioMissing?: boolean;
  audioLastScannedAt?: string;
  objectUrl?: string;           // ephemeral blob URL — session-only, not persisted
  // Preserved import mood tags (0701G) — set once at CSV import, read-only reference
  importedMoodTags?: string[];
  // Raw import passthrough for unmapped CSV columns (0701D)
  importMetadata?: Record<string, string | number | boolean | null>;
  // Cue points (0701C)
  cuePoints?: CuePoint[];
  // DJ metadata
  style?: string;
  // Notes
  notes?: string;
  // Audition memory
  rating?: TrackRating;
  playCount?: number;
  lastPlayedAt?: string;
  lastPlayedSlotIndex?: number;
  // Metadata provenance (0705D) — per-field source/confidence tracking
  metadataSources?: Record<string, import("./metadataSourceTypes").TrackMetadataSource>;
  // Intake identity (0705Q)
  identityStatus?: TrackIdentityStatus;
  identityConfidence?: number;
  identitySource?: TrackIdentitySource;
  // Analysis trust (0705Q)
  bpmTrust?: AnalysisTrust;
  keyTrust?: AnalysisTrust;
  // BPM/key value provenance (0712_MUSIC_BPM_Key_Detection_Engine §8) — who
  // last set the canonical `bpm`/`camelotKey` fields above, so the detector
  // never silently overwrites a manual edit or a trusted import.
  bpmSource?: import("./audioDetectionTypes").AnalysisValueSource;
  keySource?: import("./audioDetectionTypes").AnalysisValueSource;
  energyTrust?: AnalysisTrust;
  analysisTrustWarnings?: string[];
  // Cluster tags (0705Q) — suggested grouping hints
  clusterTags?: string[];
  // Intake readiness (0705Q)
  intakeReadiness?: IntakeReadinessGrade;
  intakeIssues?: string[];
  // Derived-audio lineage (0715E_MUSIC_Loop_Revision_Activation_And_Stem_Source_Entry)
  // — `derivedKind` is the ONLY field any logic may test to decide "is this a
  // stem"; `parentTrackId` is a generic lineage pointer that may describe some
  // other derived-audio relationship in the future, and must never by itself
  // imply stem-ness. `stemRole` is display-only detail — a stem with an unknown
  // role is still a stem via `derivedKind` alone.
  derivedKind?: "stem";
  parentTrackId?: string;
  stemRole?: "vocals" | "drums" | "bass" | "other";
};
