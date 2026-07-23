// 0722C_MUSIC_Production_Stem_Export_And_Long_Term_Stem_Archive
//
// A TrackStemSet is a versioned, immutable CHILD of the exact decoded parent
// audio it was made from — never a top-level Library track (that's the
// unrelated, deprecated `Track.derivedKind === "stem"` system in
// trackTypes.ts; see logic/stems/legacyStemMigration.ts for the bridge
// between the two). Records here are never the source of truth — the
// filesystem is (server/stems/stemSetIndex.ts scans stem-manifest.json on
// every request, mirroring server/radio/radioLibraryIndex.ts). These types
// exist only to give that scanned data a stable shape.

export type StemRole = "vocals" | "drums" | "bass" | "other";

export const STEM_ROLES: readonly StemRole[] = ["vocals", "drums", "bass", "other"];

// Lifecycle of a REGISTERED (promoted) stem set only. An abandoned/never-
// promoted job is a StemJobStatus concern ("interrupted"), never a
// StemSetLifecycle value — an interrupted job was never a registered set.
export type StemSetLifecycle = "current" | "outdated" | "orphaned" | "unavailable" | "archived";

export type StemSetOrigin = "demucs" | "registered_existing";

export type StemJobStatus =
  | "queued"
  | "preparing"
  | "separating"
  | "validating"
  | "archiving"
  | "complete"
  | "failed"
  | "cancelled"
  // Startup reconciliation only (server/stems/stemStartupReconciliation.ts):
  // staging left behind by a Vite dev-server restart mid-job. Never
  // transitions to "complete" — the only way out is a fresh export.
  | "interrupted";

export type StemSeparationDevice = "mps" | "cpu";

// The ONLY fields ever compared for "is this the same parent audio."
// Decoder/tool identity is provenance (below), never part of this.
export interface DecodedAudioIdentity {
  fingerprint: string;
  fingerprintAlgorithm: string; // versions the hashing POLICY (e.g. "pcm-sha256"), never the ffmpeg binary
  fingerprintVersion: number;
  sampleRateHz: number; // canonical decode policy: fixed 44100 Hz (see stemIdentity.ts CANONICAL_SAMPLE_RATE_HZ)
  normalizedChannels: number; // canonical decode policy: fixed 2 (stereo)
  durationFrames: number;
}

// Diagnostic only. Never compared for equality; never invalidates a set by
// itself — a decoder-version change alone can never mark a set OUTDATED.
export interface DecodedAudioProvenance {
  decoderTool: "ffmpeg";
  decoderVersion: string;
  computedAt: string;
}

// Cheap filesystem evidence used as the fast-path revalidation cache key —
// see stemIdentity.ts's three-tier revalidation (stat -> raw-hash -> full
// decode). Never itself proof of identity; only proof "nothing about this
// file looks different since we last checked."
export interface SourceFileStatSnapshot {
  sizeBytes: number;
  mtimeMs: number;
  inode: number | null; // null when the filesystem doesn't expose one (fail-closed to the raw-hash tier)
}

export interface TrackStemFile {
  role: StemRole;
  relativeArchivePath: string;
  fileName: string;
  durationFrames: number;
  durationSeconds: number;
  sampleRateHz: number;
  channels: number;
  bitDepth: number | null;
  codec: "pcm_s16le" | "pcm_s24le" | "pcm_s32le" | "pcm_f32le" | string;
  sizeBytes: number;
  contentHash: string;
}

export interface TrackStemSet {
  id: string;
  sourceTrackId: string;
  sourceAudioPathAtCreation: string;
  sourceAudioIdentity: DecodedAudioIdentity;
  // Internal-only additions (not in the spec's literal type) — fast-path
  // revalidation evidence. See stemIdentity.ts.
  sourceRawFileHashAtCreation: string;
  sourceStatAtCreation: SourceFileStatSnapshot;
  sourceAudioProvenance: DecodedAudioProvenance;
  origin: StemSetOrigin;
  engine: "demucs" | "external";
  model: "htdemucs" | string;
  engineVersion: string;
  // Only meaningful for origin:"demucs" — which device actually ran the
  // separation (runtime-resolved, see stemSeparationRunner.ts; never
  // hardcoded, never a partial-MPS-then-reused-on-CPU result).
  engineDevice?: StemSeparationDevice;
  archiveDirectory: string;
  manifestVersion: 1;
  stems: Record<StemRole, TrackStemFile>;
  createdAt: string;
  completedAt: string;
}

export interface StemSetLifecycleResult {
  lifecycle: StemSetLifecycle;
  reason: string;
}

export interface StemJob {
  jobId: string;
  sourceTrackId: string;
  model: string;
  status: StemJobStatus;
  phase: "preparing" | "separating" | "validating" | "archiving" | null;
  startedAt: string;
  updatedAt: string;
  elapsedMs: number;
  error?: string;
  stderrTail?: string;
  resultStemSetId?: string;
}

// A stem-role reference into the archive, used wherever a downstream
// destination needs to point at a specific stem WITHOUT ever duplicating
// the master WAV or promoting it to a top-level Track. This is the ONLY
// shape persisted for a downstream stem reference (e.g. AudioExperimentRecord
// .stemSourceRef, TrackSlot.stemReference, RadioPlaylistEntry.stemReference)
// — never a synthetic Track object.
export interface StemSourceReference {
  stemSetId: string;
  role: StemRole;
}
