// MUSIC P0 Clean Library Foundation — Step B: multi-format asset model
// (0813_MUSIC_P0_Clean_Library_Foundation_StepB).
//
// Additive, not a Track-model rewrite: a Track remains one logical
// recording, existing single-file fields (filePath/audioRelPath/
// audioFileName/fileExtension) keep meaning exactly what they always have —
// the currently-linked/playable file. `assets` is a new, optional array
// alongside them, letting one logical recording carry additional known
// physical files (a FLAC and an MP3 of the same WAV, for example) without
// splintering into unrelated Track rows. See trackAssetReconciliation.ts
// for the classification logic that decides when a newly-imported file
// belongs in an existing Track's `assets` versus becoming a new Track.

export type TrackAssetFormat =
  | "wav"
  | "flac"
  | "aiff"
  | "mp3"
  | "m4a"
  | "aac"
  | "ogg"
  | "opus"
  | "other";

export interface TrackAsset {
  assetId: string;
  format: TrackAssetFormat;
  fileName: string;
  /** Portable path relative to library/music/, same convention as Track.audioRelPath. */
  filePath: string;
  /**
   * SHA-256 hex digest of the file's bytes. Content-identity evidence for
   * EXACT duplicates only — a WAV, FLAC, and MP3 of the same underlying
   * recording will normally hash differently from each other, so checksum
   * equality across assets on the SAME track is expected to be rare (only
   * when two entries really are byte-identical), not the mechanism that put
   * them together in the first place. Null only for assets synthesized from
   * legacy Track data that predates checksum computation.
   */
  checksum: string | null;
  fileSizeBytes?: number;
  durationSeconds?: number;
  sourceOwner: "studiorich" | "external" | "reference" | "unknown";
  addedAt: string;
  /** Marks the one asset (if any) that mirrors the Track's own legacy single-file fields. */
  isPrimary?: boolean;
}

// The four identity classes a newly-encountered file can fall into relative
// to the existing library, per spec: exact byte-identical duplicate, the
// same recording captured in a different container, a related-but-distinct
// version (edit/master/alternate render), or a genuinely separate recording.
export type AssetReconciliationClass =
  | "exact_asset_duplicate"
  | "same_recording_different_format"
  | "related_version"
  | "distinct_recording";

export interface AssetReconciliationEvidence {
  checksumMatch: boolean;
  normalizedTitleArtistMatch: boolean;
  durationDeltaSeconds: number | null;
  filenameVersionHint: string | null;
  sameFormatAlreadyPresent: boolean;
}

export interface AssetReconciliationResult {
  classification: AssetReconciliationClass;
  matchedTrackId: string | null;
  matchedAssetId: string | null;
  evidence: AssetReconciliationEvidence;
  confidence: "high" | "medium" | "low";
}

// Read-only evidence surfaced from the EXISTING SunoCanonicalRecording
// authority (sunoLibraryTypes.ts / canonicalIdentity.ts) — never a second
// recording-identity system. The general MUSIC Track model stays entirely
// provider-independent: this is purely an optional, informational hint
// ("this downloaded file's title/duration matches a known Suno recording"),
// never a required input to classifyIncomingAsset, and never itself
// resolved into a Track attachment — no Track↔SunoCanonicalRecording bridge
// exists today (a real open question, not solved here).
export interface SunoCanonicalEvidenceMatch {
  canonicalRecordingId: string;
  primaryTitleGuess: string | null;
  sunoUuid: string | null;
  workspaceSlugs: string[];
  durationDeltaSeconds: number | null;
}
