// RadioLoop Library Foundation (0716B_MUSIC_RadioLoop_Library_Foundation_
// v1.0.0_BUILD) — canonical data model for promoting an approved LoopAsset
// into a validated RadioLoop package. Governed by 0716_RADIO_Doctrine_v1.0.0
// and 0716_RADIO_RadioLoop_Library_README_v1.0.0; this file only models the
// package/manifest contract those documents define, it does not implement
// promotion logic. Pure — no DOM, no Node — importable from both the
// browser logic layer (src/logic/radio) and the Node-only server layer
// (server/radio).

export type RadioLoopId = string; // "rloop_000001"
export type RadioPackageVersion = number; // 1, 2, 3...

// Doctrine §7 — the fixed state enum. No state outside this list is ever
// introduced (see radioPackageWriter.ts's finalize-rollback behavior, which
// deliberately avoids inventing a "manifest pending" state).
export type RadioPromotionState = "CANDIDATE" | "VALIDATING" | "RADIO_READY" | "PUBLISHED" | "RETIRED";

// Local-only — resolves a package back to its MUSIC source. Never published
// (README §5 "Source reference"); must never contain a personal absolute
// path in the portable package metadata.
export interface RadioLoopSourceReference {
  trackId: string;
  loopId: string;
  loopRevisionId?: string;
  audioRelPath?: string;
  startSeconds: number;
  endSeconds: number;
  resolvedAt: string;
}

export interface RadioDeliveryAsset {
  codec: "opus";
  container: "ogg";
  mimeType: "audio/ogg; codecs=opus";
  relativePath: string;
  bitrateKbps: number;
  channels: number;
  durationSeconds: number;
}

export interface RadioStemAsset {
  name: string;
  relativePath: string;
  channels: number;
  durationSeconds: number;
}

export interface RadioMusicalMetadata {
  bpm?: number;
  key?: string;
  bars?: number;
}

// 0717A — the closed RADIO arrangement-role vocabulary. `RadioArrangementMetadata.roles`
// stays `string[]` at rest (schema stability for already-written 0716B
// packages, some of which contain the pre-0717A free-text suggestion
// "atmosphere" — a legacy value, never silently translated or dropped, see
// src/logic/radio/radioLoopQuery.ts) but every NEW write path validates
// against this enum before writing.
export type RadioArrangementRole = "foundation" | "motion" | "detail" | "event" | "bridge" | "recovery";

export const RADIO_ARRANGEMENT_ROLES: readonly RadioArrangementRole[] = ["foundation", "motion", "detail", "event", "bridge", "recovery"];

export function isValidRadioArrangementRole(value: string): value is RadioArrangementRole {
  return (RADIO_ARRANGEMENT_ROLES as readonly string[]).includes(value);
}

export interface RadioArrangementMetadata {
  roles: string[];
  // 0717C_MUSIC_Complete_Song_Intelligence_and_Section_Map §3.4 — no
  // "Compatibility Family" concept exists going forward. Kept optional,
  // never required/suggested/displayed, purely so metadata.json files
  // written before 0717C still parse. No write path in this codebase
  // populates this field anymore — do not resurrect a family-selection UI
  // against it. Compatibility is computed between assets, not manually
  // assigned; use source-song/section-variation/stem-set/Crate/Mood
  // relationships instead.
  /** @deprecated Legacy read-compatibility only — never written. */
  familyIds?: string[];
  energy?: number;
  density?: number;
  stability?: number;
  maximumConsecutiveRepeats?: number;
  minimumRestCycles?: number;
  transitionIn?: string[];
  transitionOut?: string[];
}

export interface RadioApprovalMetadata {
  publicUseApproved: boolean;
  approvedAt: string;
}

// The full portable metadata.json contract for one package version
// (README §5).
export interface RadioLoopPackageManifest {
  schemaVersion: string;
  radioLoopId: RadioLoopId;
  packageVersion: RadioPackageVersion;
  status: RadioPromotionState;
  // 0717A §6.3/§9.6 — a second necessary, minimal schema extension
  // alongside `retirement` below: 0716B's schema had no title concept at
  // all, and the workspace's metadata-edit flow needs somewhere structural
  // to round-trip a working title. Extended in place rather than forking a
  // workspace-only authority, same principle as `retirement`.
  title?: string;
  source: { trackId: string; loopId: string };
  audio: { primary: RadioDeliveryAsset; variants: RadioDeliveryAsset[] };
  stems?: RadioStemAsset[];
  musical: RadioMusicalMetadata;
  arrangement: RadioArrangementMetadata;
  approval: RadioApprovalMetadata;
  // 0717A §7.7 — the one schema extension retirement needs. Retirement
  // creates a NEW immutable version with this set; it never rewrites an
  // existing version's metadata.json in place (see
  // server/radio/radioRetirementOrchestrator.ts).
  retirement?: { reason: string; retiredAt: string };
}

// One deterministically-sorted entry in the aggregate local catalog
// manifest (catalog/local-manifest.json). Never contains a local absolute
// path — relativePackagePath is relative to radioLibraryRoot.
export interface RadioCatalogManifestEntry {
  radioLoopId: RadioLoopId;
  packageVersion: RadioPackageVersion;
  status: RadioPromotionState;
  source: { trackId: string; loopId: string };
  relativePackagePath: string;
}

export interface RadioCatalogManifest {
  schemaVersion: string;
  generatedAt: string;
  entries: RadioCatalogManifestEntry[];
}

export interface RadioValidationIssue {
  code: string;
  message: string;
  severity: "error" | "warning";
}

export interface RadioPromotionReport {
  operationId: string;
  radioLoopId: RadioLoopId;
  packageVersion: RadioPackageVersion;
  finalStatus: RadioPromotionState | "FAILED";
  issues: RadioValidationIssue[];
  startedAt: string;
  completedAt: string;
  // §5.6/decision 6 — the core may succeed even when every stem was
  // omitted for a duration mismatch; this must be surfaced as a visible
  // warning in the interface, not buried only in this report.
  stemsOmitted?: boolean;
  stemsOmittedReason?: string;
}

// Required + optional promotion-form inputs (build spec §6). Not one of
// the 13 §4.1 types, but the natural shared shape between the dialog and
// the orchestrator.
export interface RadioPromotionFormInput {
  arrangementRole: string;
  publicUseApproved: boolean;
  energy?: number;
  density?: number;
  stability?: number;
  maximumConsecutiveRepeats?: number;
  minimumRestCycles?: number;
}

// §5.4 — fixed encoding policy, argument-array only, never an interpolated
// shell string (see server/radio/radioOpusEncoder.ts).
export const RADIO_OPUS_ENCODING_POLICY = {
  codec: "libopus",
  application: "audio",
  bitrateKbps: 128,
  vbr: "on",
  compressionLevel: 10,
  metadataStripped: true,
  container: "ogg",
  extension: ".opus",
  mimeType: "audio/ogg; codecs=opus",
} as const;

// Correction: Opus always decodes at a fixed 48kHz internally. Duration/
// integrity validation is frame-exact at THIS rate, never a seconds-based
// tolerance — see radioOpusDecodeVerify.ts.
export const RADIO_OPUS_DECODE_SAMPLE_RATE = 48000;
// ~42 microseconds at 48kHz — accounts only for the unavoidable resample
// round-trip when the source isn't already 48kHz, not for loose matching.
export const RADIO_OPUS_FRAME_TOLERANCE = 2;

export const RADIO_ID_PREFIX = "rloop_";
export const RADIO_ID_PATTERN = /^rloop_(\d{6})$/;

export function formatRadioLoopId(sequence: number): RadioLoopId {
  return `${RADIO_ID_PREFIX}${String(sequence).padStart(6, "0")}`;
}

// Returns null for a malformed/foreign id rather than throwing — callers
// scanning a directory of mixed/legacy content must be able to skip
// non-conforming entries.
export function parseRadioLoopIdSequence(id: string): number | null {
  const m = RADIO_ID_PATTERN.exec(id);
  if (!m) return null;
  return Number(m[1]);
}

// §4.2 — the only legal forward transitions. No automatic "failed" state
// exists; a failed VALIDATING attempt simply never reaches RADIO_READY and
// is reported as an ordinary failed promotion (see radioPromotionOrchestrator.ts).
const RADIO_STATE_TRANSITIONS: Record<RadioPromotionState, RadioPromotionState[]> = {
  CANDIDATE: ["VALIDATING"],
  VALIDATING: ["RADIO_READY"],
  RADIO_READY: ["PUBLISHED", "RETIRED"],
  PUBLISHED: ["RETIRED"],
  RETIRED: [],
};

export function isLegalRadioStateTransition(from: RadioPromotionState, to: RadioPromotionState): boolean {
  return RADIO_STATE_TRANSITIONS[from]?.includes(to) ?? false;
}
