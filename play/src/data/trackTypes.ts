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
  tempoFamily?: string;
  energyScore?: number;
  energyLevel?: string | number;
  loudness?: number;
  rmsMean?: number;
  rmsPeak?: number;
  dynamicRange?: number;
  onsetDensity?: number;
  transientDensity?: number;
  spectralCentroid?: number;
  spectralRolloff?: number;
  zeroCrossingRate?: number;
  brightness?: number;
  density?: number;
  sampleRate?: number;
  channels?: number;
  beatsDetected?: number;
  analysisVersion?: string;
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

// Analysis status (0701C): tracks the pipeline state of derived fields
export type AnalysisStatus = "not_analyzed" | "partial" | "analyzed" | "stale" | "failed";

export type AnalysisSource = "import" | "manual" | "mixxx" | "play_analyzer" | "external_tool";

export type MechanicalAnalysisSource = "catalog_import" | "play_catalog_analyzer" | "manual_correction";

export type AnalyzerJobStatus = "idle" | "queued" | "running" | "complete" | "failed" | "not_connected";

export type Track = {
  trackId: string;
  title: string;
  artist: string;
  bpm: number;
  camelotKey: CamelotKey;
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
  mechanicalMoodConfidence?: Record<string, number>;
  // Source safety (0630C / 0701C)
  sourceLibrary?: string;
  catalogId?: string;
  sunoId?: string;
  platformUse?: PlatformUse[];
  // Analysis pipeline (0701C)
  analysisStatus?: AnalysisStatus;
  analysisSources?: AnalysisSource[];
  analysisUpdatedAt?: string;
  analysisVersion?: string;
  analysisErrors?: string[];
  // Mechanical mood analysis (0701D)
  mechanicalAnalysisStatus?: AnalysisStatus;
  mechanicalAnalysisSources?: MechanicalAnalysisSource[];
  mechanicalAnalysisNotes?: string[];
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
};
