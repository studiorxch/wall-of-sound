// DJ Transition Engine (0722_MUSIC_0722D_DJ_Transition_Engine_v1.0.0_BUILD) —
// canonical transition data model (§5.1), governed by
// 0722_MUSIC_DJ_Doctrine_v1.1.0. A DjTransitionPlan is keyed by playlist
// adjacency (playlistId + outgoingSlotId + incomingSlotId), never by track
// ids alone — the same song may need a different transition in different
// slot positions. Mirrors PlaylistTransitionPlan's fromSlotId/toSlotId
// addressing convention (playlistTransitionTypes.ts) exactly.
//
// This build introduces DjTransitionPlan alongside — not in place of —
// PlaylistTransitionPlan, behind the djTransitionMode capability gate
// (playProjectTypes.ts). See djTransitionAutomationGate.ts for the explicit
// automation-authority rule that decides whether a given plan is ever
// allowed to actually drive playback in "active" mode.

import type { StemRole } from "./trackStemTypes";

export type TransitionTimeBasis = "phrase" | "bar" | "beat" | "seconds";

// 9 members — the 9th, free_time_perceptual_handoff, is a v1.1.0 doctrine
// addition (§13.9) not present in the build spec's own literal union.
// Author strictly in seconds + perceptual events for this family; never
// invent bars. A `0` bpm anywhere in evidence feeding this family means "no
// useful rhythmic tempo was established," never a literal measurement.
export type TransitionFamily =
  | "phrase_eq_blend"
  | "short_rhythmic_blend"
  | "loop_assisted_handoff"
  | "stem_assisted_transition"
  | "effect_handoff"
  | "clean_cut"
  | "reset_bridge"
  | "do_not_place_adjacent"
  | "free_time_perceptual_handoff";

export type TransitionTrust = "trusted_rhythmic" | "manually_authored" | "partially_trusted" | "free_time_or_incompatible";

export type TransitionEvidenceSource = "manual" | "decoded_analysis" | "imported_metadata" | "legacy" | "derived" | "missing";

// Doctrine §14.2 — Observed/Inferred/Proposed/Manually-confirmed is a
// distinct axis from `source` above: `source` says WHERE a value came from,
// `claim` says HOW STRONGLY it should be believed. A value can be
// source:"decoded_analysis" and still only claim:"inferred" (e.g. a
// phrase boundary synthesized from bar-count heuristics, never actually
// measured against the audio the way a beat position is).
export type TransitionClaimProvenance = "observed" | "inferred" | "proposed" | "manually_confirmed";

export interface TransitionEvidenceValue<T> {
  value: T | null;
  confidence: number;
  source: TransitionEvidenceSource;
  claim: TransitionClaimProvenance;
  analyzedAt: string | null;
}

export interface TransitionCue {
  seconds: number;
  beatIndex: number | null;
  barIndex: number | null;
  phraseIndex: number | null;
  regionId: string | null;
  manuallyAdjusted: boolean;
}

export interface EqPoint {
  progress: number;
  lowDb: number;
  midDb: number;
  highDb: number;
}

export interface GainPoint {
  progress: number;
  gainDb: number;
}

export interface TransitionAutomationLane {
  outgoingGain: GainPoint[];
  incomingGain: GainPoint[];
  outgoingEq: EqPoint[];
  incomingEq: EqPoint[];
  bassTransferProgress: number | null;
}

export type TransitionWarning =
  | "missing_beat_grid"
  | "untrusted_downbeat"
  | "untrusted_phrase"
  | "tempo_drift"
  | "tempo_adjustment_excessive"
  | "non_mathematical_tempo_jump"
  | "bass_collision"
  | "foreground_collision"
  | "vocal_collision"
  | "melodic_collision"
  | "harmonic_risk"
  | "loudness_jump"
  | "energy_discontinuity"
  | "short_mix_region"
  | "source_changed"
  | "analysis_changed"
  | "stem_set_unavailable";

// Doctrine §14.1 — Transition Evidence Lifecycle. Distinct from `origin`
// (automatic vs. manual authorship) — this is what actually gates
// automation authority in "active" mode (djTransitionAutomationGate.ts).
// A migrated legacy plan or a freshly-resolved automatic plan both start
// life as "proposed" and are inert for playback purposes until they earn
// a stronger state.
export type TransitionEvidenceState = "proposed" | "rehearsed" | "revised" | "approved" | "rejected";

// Doctrine §18 — the ten fields a bounded rehearsal must record.
export interface TransitionRehearsalRecord {
  id: string;
  recordedAt: string;
  outgoingSourceFingerprint: string;
  incomingSourceFingerprint: string;
  actualOutgoingCueSeconds: number;
  actualIncomingCueSeconds: number;
  familyAttempted: TransitionFamily;
  intendedOverlapSeconds: number;
  observedOverlapSeconds: number;
  automationChanges: string[];
  bassTransferMomentSeconds: number | null;
  heardCollision: string | null;
  firstCorrectiveAction: string | null;
  listeningEnvironment: "club" | "headphones" | "ambient" | "broadcast" | "unspecified";
  outcome: "pass" | "revise" | "reject";
}

// Doctrine §19 — listening context changes automation defaults (bass
// ownership brevity, midrange/vocal protection, perceptual continuity,
// loudness consistency). Optional: never required to resolve a plan.
export type TransitionListeningContext = "club" | "headphones" | "ambient" | "broadcast";

export interface DjTransitionPlan {
  id: string;
  playlistId: string;
  outgoingSlotId: string;
  incomingSlotId: string;
  outgoingTrackId: string;
  incomingTrackId: string;
  outgoingSourceFingerprint: string;
  incomingSourceFingerprint: string;
  analysisRevisionKey: string;
  family: TransitionFamily;
  trust: TransitionTrust;
  timeBasis: TransitionTimeBasis;
  outgoingCue: TransitionCue;
  incomingCue: TransitionCue;
  overlapBars: number | null;
  overlapSeconds: number;
  tempoAdjustmentPercentA: number;
  tempoAdjustmentPercentB: number;
  pulseRatio: 0.5 | 1 | 2 | null;
  automation: TransitionAutomationLane;
  doNotLayer: boolean;
  warnings: TransitionWarning[];
  explanation: string[];
  origin: "automatic" | "manual";
  evidenceState: TransitionEvidenceState;
  rehearsals: TransitionRehearsalRecord[];
  listeningContext: TransitionListeningContext | null;
  // Set only for family:"stem_assisted_transition" — the exact CURRENT
  // stem set the resolver validated against at resolution time. Playback
  // must re-validate this is still CURRENT before use (doctrine §17); a
  // stale/missing set falls the plan back per djTransitionAutomationGate.ts.
  activeStemSetId: string | null;
  activeStemRoles: StemRole[];
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export const DJ_TRANSITION_DETECTOR_VERSION = "dj-transition-v1";
