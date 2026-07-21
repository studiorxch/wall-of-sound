// 0718B_RADIO_Web_Publication_Asset_Export_Bridge — canonical data model
// for the RadioTrackPackage: a complete-song Opus package used as the
// REQUIRED baseline web asset (spec §Product decision). Distinct from
// RadioLoopPackage (optional performance asset — see radioLoopTypes.ts);
// complete songs are never disguised as RadioLoops. Pure — no DOM, no
// Node — importable from both the browser logic layer (src/logic/radio)
// and the Node-only server layer (server/radio).

import type { RadioPromotionState, RadioValidationIssue } from "./radioLoopTypes";

export type RadioTrackId = string; // "rtrack_000001"

export const RADIO_TRACK_ID_PREFIX = "rtrack_";
export const RADIO_TRACK_ID_PATTERN = /^rtrack_(\d{6})$/;

export function formatRadioTrackId(sequence: number): RadioTrackId {
  return `${RADIO_TRACK_ID_PREFIX}${String(sequence).padStart(6, "0")}`;
}

// Returns null for a malformed/foreign id rather than throwing — callers
// scanning mixed directories must be able to skip non-conforming entries
// (same contract as parseRadioLoopIdSequence).
export function parseRadioTrackIdSequence(id: string): number | null {
  const m = RADIO_TRACK_ID_PATTERN.exec(id);
  if (!m) return null;
  return Number(m[1]);
}

// Spec §Audio defaults — ONE centralized, documented, deterministic Opus
// policy for full-track web music playback. Constrained VBR at 160kbps
// (vs the loop policy's 128k unconstrained VBR — loops are short
// performance material; complete songs are the baseline listening asset).
// Channel policy: preserve source layout up to stereo; sources with more
// than 2 channels are downmixed to stereo at the staging-decode step
// (never here — ffmpeg args live in server/radio, built FROM this policy,
// never scattered through UI code). No normalization, EQ, limiting,
// trimming, time-stretching, or any other remastering anywhere.
export const RADIO_TRACK_OPUS_ENCODING_POLICY = {
  codec: "libopus",
  application: "audio",
  bitrateKbps: 160,
  vbr: "constrained",
  compressionLevel: 10,
  metadataStripped: true,
  container: "ogg",
  extension: ".opus",
  mimeType: "audio/ogg; codecs=opus",
  // Staging decode fidelity: the canonical staged PCM baseline is 24-bit
  // integer (pcm_s24le) — never a 16-bit bottleneck before the Opus
  // encode. maxChannels documents the downmix boundary.
  stagingPcmCodec: "pcm_s24le",
  maxChannels: 2,
} as const;

// The delivery asset for a full track — extends the loop asset shape with
// the integrity fields 0718B requires (byteSize + content hash + exact
// 48kHz decoded frame count + sample rate + VBR mode).
export interface RadioTrackDeliveryAsset {
  codec: "opus";
  container: "ogg";
  mimeType: "audio/ogg; codecs=opus";
  relativePath: string; // always "audio.opus"
  bitrateKbps: number;
  vbrMode: string;
  channels: number;
  sampleRate: number;
  durationSeconds: number;
  decodedFrameCount48k: number;
  byteSize: number;
  sha256: string;
}

// Curator approval evidence, embedded verbatim in the package manifest —
// explicit, persisted, attributable to the exact source bytes
// (sourceAssetHash) and Complete Song Intelligence revision
// (songIntelligenceRevision = CompleteSongAnalysis.updatedAt; no monotonic
// revision counter exists on the analysis record — disclosed deviation).
export interface RadioTrackApprovalEvidence {
  approved: true;
  approvedAt: string;
  sourceAssetHash: string;
  songIntelligenceRevision?: string;
}

// The Section Map snapshot a static web player needs — resolved active
// sections only, copied at package time (packages are immutable; later
// section edits in MUSIC never mutate a written package).
export interface RadioTrackSectionSnapshot {
  label: string;
  structuralType: string;
  startSeconds: number;
  endSeconds: number;
  verified: boolean;
}

export interface RadioTrackSongIntelligence {
  revision?: string; // CompleteSongAnalysis.updatedAt at package time
  analyzerVersion?: string;
  configurationVersion?: string;
  status?: string;
  sections: RadioTrackSectionSnapshot[];
}

// The full portable metadata.json contract for one RadioTrack package
// version. Same doctrine as RadioLoopPackageManifest: no absolute paths,
// immutable once written, disk is source of truth. source.audioRelPath is
// relative to the MUSIC library root and lives here (not only in
// source-reference.json) because re-verification of source currency needs
// it — it is still a relative path and never leaves the internal library
// (the web-bundle exporter never copies metadata.json into a bundle).
export interface RadioTrackPackageManifest {
  schemaVersion: string;
  radioTrackId: RadioTrackId;
  packageVersion: number;
  status: RadioPromotionState; // written as "RADIO_READY"
  source: { trackId: string; audioRelPath: string };
  sourceAssetHash: string; // sha256 of the ORIGINAL source file bytes
  audio: { primary: RadioTrackDeliveryAsset };
  display: { title: string; artist: string };
  musical: { bpm?: number; key?: string; moods?: string[]; genres?: string[] };
  songIntelligence: RadioTrackSongIntelligence;
  approval: RadioTrackApprovalEvidence;
  verification: {
    probeOk: boolean;
    decodeVerifyOk: boolean;
    deltaFrames: number | null;
    verifiedAt: string;
  };
  createdAt: string;
  retirement?: { reason: string; retiredAt: string };
}

// Aggregate track catalog manifest (catalog/local-manifest.json under the
// RadioTrackLibrary root) — mirrors RadioCatalogManifest for loops.
export interface RadioTrackCatalogManifestEntry {
  radioTrackId: RadioTrackId;
  packageVersion: number;
  status: RadioPromotionState;
  source: { trackId: string; audioRelPath: string };
  sourceAssetHash: string;
  relativePackagePath: string;
}

export interface RadioTrackCatalogManifest {
  schemaVersion: string;
  generatedAt: string;
  entries: RadioTrackCatalogManifestEntry[];
}

// ── Route request/response contracts ────────────────────────────────────

export interface RadioTrackPrepareRequest {
  sourceTrackId: string;
  audioRelPath: string;
  display: { title: string; artist: string };
  musical: { bpm?: number; key?: string; moods?: string[]; genres?: string[] };
  songIntelligence: RadioTrackSongIntelligence;
  approval: RadioTrackApprovalEvidence;
  forceNewVersion?: boolean;
}

export interface RadioTrackPrepareResponse {
  ok: boolean;
  reused: boolean;
  radioTrackId?: RadioTrackId;
  packageVersion?: number;
  sourceAssetHash?: string;
  packageManifestHash?: string;
  durationSeconds?: number;
  byteSize?: number;
  issues: RadioValidationIssue[];
}

// Structured integrity + currency check for one exact package binding.
// Never regenerates or rebinds — STALE is a reported state with an
// explicit user action (spec §Staleness rules).
export interface RadioTrackVerifyResult {
  ok: boolean;
  packageExists: boolean;
  manifestValid: boolean;
  manifestHashMatches: boolean;
  audioAssetIntact: boolean;
  decodeVerificationRecorded: boolean;
  sourceHashCurrent: boolean;
  currentSourceAssetHash: string | null;
  issues: RadioValidationIssue[];
}
