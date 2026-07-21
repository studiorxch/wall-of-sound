// Complete Song Intelligence and Section Map (0717C) — the canonical,
// song-owned analysis record. Consumed by Sectional Looper (display/edit),
// the 0717B RADIO bridge (readiness gate + curation suggestions), and a
// future DJ transition system. One analyzer, one record — never a
// parallel Radio-only or DJ-only copy. Pure — no DOM, no Node.
//
// No "Compatibility Family" concept exists anywhere in this file or is
// derived from anything here (spec §3.4) — grouping is expressed only via
// source-song/section-variation/stem-set relationships already modeled
// below, or via existing Crate/Mood membership elsewhere in MUSIC.

import type { RadioArrangementRole } from "./radioLoopTypes";
import type { MoodScore } from "../logic/MoodAnalyzer";

// spec §4.3 — the fixed state enum, following the same closed-enum +
// explicit-transition-table doctrine as RadioPromotionState
// (radioLoopTypes.ts) rather than Track.analysisStatus's lower_snake_case
// convention, since the spec's own literal values already match it.
export type SongAnalysisStatus =
  | "NOT_ANALYZED"
  | "QUEUED"
  | "ANALYZING"
  | "READY_PROVISIONAL"
  | "READY_VERIFIED"
  | "STALE"
  | "FAILED";

const SONG_ANALYSIS_STATE_TRANSITIONS: Record<SongAnalysisStatus, SongAnalysisStatus[]> = {
  NOT_ANALYZED: ["QUEUED"],
  QUEUED: ["ANALYZING", "NOT_ANALYZED"], // NOT_ANALYZED — an explicit cancel, not a failure
  ANALYZING: ["READY_PROVISIONAL", "FAILED", "NOT_ANALYZED"],
  READY_PROVISIONAL: ["READY_VERIFIED", "STALE", "QUEUED"],
  READY_VERIFIED: ["STALE", "QUEUED"],
  STALE: ["QUEUED"],
  FAILED: ["QUEUED"],
};

export function isLegalSongAnalysisStateTransition(from: SongAnalysisStatus, to: SongAnalysisStatus): boolean {
  return SONG_ANALYSIS_STATE_TRANSITIONS[from]?.includes(to) ?? false;
}

// spec §3.1 — the source-arrangement vocabulary. Distinct name from
// StructuralSectionBand's StructuralSectionLabel ("intro"|"body"|"outro"|
// "section") and TrackSegment's label union — no collision.
export type SongStructuralType =
  | "intro"
  | "body"
  | "verse"
  | "chorus"
  | "breakdown"
  | "bridge"
  | "interlude"
  | "outro"
  | "full_composition"
  | "independent"
  | "unknown";

export type SongSectionVerification = "provisional" | "reviewed" | "verified";

// spec §5 — half-open [startFrame, endFrame) frame ranges throughout.
// `id` is assigned ONCE at creation and never recomputed from bounds —
// these records are persisted and mutated in place via drag, unlike the
// read-only, wholesale-recomputed-every-render StructuralSectionBand this
// build derives its first pass from (see songSectionMapper.ts).
export interface SongSection {
  id: string;
  sourceTrackId: string;
  structuralType: SongStructuralType;
  displayLabel: string;
  variationGroupId?: string;
  variationOrdinal?: number;
  startFrame: number;
  endFrame: number;
  barCount?: number;
  confidence: number;
  verification: SongSectionVerification;
  origin: "analyzer" | "user";
  // The LoopAsset.activeRevisionId pattern applied per-section (loopRevisions.ts)
  // — each section is corrected independently, not as one atomic set.
  // undefined = no revision yet; null (on a revision's own parentRevisionId)
  // denotes the implicit original, per the existing 0715E convention.
  activeRevisionId?: string;
}

// Mirrors LoopRevision (loopTypes.ts) exactly: append-only, never mutates
// the section it revises. Every field the user can change is optional here
// — only the ones actually edited are set; resolveActiveSongSection merges
// forward from the section's own analyzer-origin values.
export interface SongSectionRevision {
  id: string;
  sectionId: string;
  parentRevisionId?: string;
  structuralType?: SongStructuralType;
  displayLabel?: string;
  startFrame?: number;
  endFrame?: number;
  variationGroupId?: string;
  variationOrdinal?: number;
  verification?: SongSectionVerification;
  createdAt: string;
  createdBy: "user";
}

// A fixed number of evenly-spaced windowed-mean samples spanning the full
// decoded duration — 128 samples by default (coarser than the 768-bin
// full-track waveform envelope, since these are lower-frequency-of-change
// activity curves for Section-Map-aligned visualization, not audio-detail
// peaks).
export interface NumericProfile {
  sampleCount: number;
  windowSeconds: number;
  values: number[];
}

// 0717D — a compact min/max peak-bin waveform overview, ~640 bins by
// default (see songWaveformSummary.ts's DEFAULT_WAVEFORM_SAMPLE_COUNT).
// Distinct from NumericProfile (a single windowed-mean curve) since a
// waveform overview needs both the min AND max sample extreme per bin to
// read as a real waveform, not a single averaged line.
export interface SongWaveformSummary {
  sampleCount: number;
  minValues: number[];
  maxValues: number[];
}

export interface SongRoleSuggestionEntry {
  role: RadioArrangementRole;
  confidence: number;
  reason?: string;
}

export type SongRoleSuggestion = SongRoleSuggestionEntry[];

// spec §5 — the versioned complete-song analysis record.
export interface CompleteSongAnalysis {
  id: string;
  sourceTrackId: string;
  sourceMediaFingerprint: string;
  decodedFrameCount: number;
  sampleRate: number;
  analyzerVersion: string;
  configurationVersion: string;
  status: SongAnalysisStatus;

  bpm?: number;
  musicalKey?: string;
  beatGridConfidence?: number;

  sections: SongSection[];
  sectionRevisions: SongSectionRevision[];

  // spec §4.5/§11 — set only on a rerun that found sections with active
  // human corrections; the new analyzer output for those specific sections
  // is preserved here as a comparison candidate rather than silently
  // replacing verified work in `sections`.
  previousSections?: SongSection[];

  energyProfile?: NumericProfile;
  densityProfile?: NumericProfile;
  brightnessProfile?: NumericProfile;
  bassWeightProfile?: NumericProfile;
  percussiveProfile?: NumericProfile;
  // Deliberately left unset by this build's analyzer — no honest,
  // non-fabricated technique exists in a browser-JS FFT-only pipeline for
  // true harmonic/percussive source separation or vocal/formant detection.
  // Stem separation (the natural correct path to both) is an explicit
  // non-goal (spec §10/§15). Disclosed, not silently "coming soon."
  harmonicProfile?: NumericProfile;
  vocalPresenceProfile?: NumericProfile;

  suggestedRoles?: SongRoleSuggestion;
  suggestedMoods?: MoodScore[];

  // 0717D_RADIO_Playlist_Inbox_and_Performance_Foundation — a compact,
  // source-versioned waveform overview (~640 min/max peak bins), computed
  // as a side effect of the SAME chunked/abortable decode pass this record
  // already runs (never a second full-buffer scan — see
  // computeDspFeaturesChunked's per-frame minValues/maxValues in
  // dspFeatureExtraction.ts). Validated by this record's OWN cache identity
  // (sourceMediaFingerprint/decodedFrameCount/sampleRate/analyzerVersion/
  // configurationVersion) — no second identity system. Reused everywhere a
  // waveform overview is needed: the standalone Looper, RADIO playlist
  // rows, and any future consumer.
  waveformSummary?: SongWaveformSummary;

  createdAt: string;
  updatedAt: string;
  verifiedAt?: string;
}

// 0717D — bumped: CompleteSongAnalysis gained `waveformSummary`, a real
// analyzer-output shape change. Every record computed before this build
// lacks the field; the version bump means isSongAnalysisCacheValid
// correctly treats those older records as needing reanalysis, with zero
// special-casing.
export const CURRENT_SONG_ANALYZER_VERSION = "song-analyzer-v1.1.0";
export const CURRENT_SONG_ANALYSIS_CONFIG_VERSION = "song-analysis-config-v1.0.0";
