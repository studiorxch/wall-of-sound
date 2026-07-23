// 0721_MUSIC_RADIO_Sectional_Loopchain_Player — a listening instrument for
// authoring/auditioning a linear chain of real song sections, entirely
// separate from RADIO export/publication. See the build spec for the full
// product model. Pure — no DOM, no Node.

// §5 — one discriminated union, no second competing repeat model anywhere.
export type LoopchainRepeatMode =
  | { mode: "repeatCount"; count: number }
  | { mode: "targetResidenceSeconds"; seconds: number };

// A reference into a real, already-persisted song section — never a copy
// of its audio. `crossfadeDurationSeconds` governs this block's OWN
// self-loop repeats (occurrence N's tail overlapping occurrence N+1's
// head); it is distinct from a LoopchainJunction, which governs movement
// INTO the next, different block.
export interface LoopchainBlock {
  id: string;
  sourceTrackId: string;
  sectionId: string;
  repeatMode: LoopchainRepeatMode;
  crossfadeDurationSeconds: number;
  // §2.2 — absent means "custom" (repeatMode was hand-edited via the
  // advanced disclosure, or this is an intro/outro block, which never has
  // a preference at all). Purely a UI label; resolveRepeatPreference()
  // recomputes what repeatMode SHOULD be for a given role+preference, and
  // the interface layer compares against the stored repeatMode at render
  // time rather than trusting this field blindly.
  repeatPreference?: LoopchainRepeatPreference;
}

// §6 — first-class, independently identified and adjustable. Keyed by the
// adjacent block-id pair, never by array position.
export interface LoopchainJunction {
  id: string;
  outgoingBlockId: string;
  incomingBlockId: string;
  crossfadeDurationSeconds: number;
  auditionPreRollSeconds?: number;
  auditionPostRollSeconds?: number;
  // §2.3 — persisted author intent for the hybrid transition resolver.
  // Absent means {kind:"auto"} — backward compatible with every junction
  // saved before this field existed. The RESOLVED decision (bar vs seconds,
  // actual duration, confidence) is never stored here or anywhere else —
  // see LoopchainTransitionRequest's own doc comment above.
  transitionRequest?: LoopchainTransitionRequest;
}

export interface LoopchainDraft {
  id: string;
  title?: string;
  blocks: LoopchainBlock[];
  junctions: LoopchainJunction[];
  defaultCrossfadeDurationSeconds: number;
  createdAt: string;
  updatedAt: string;
}

// 0722A_RADIOOS_Loopchain_Player_Web_Demo §2.3/§1.3 — hybrid bar-vs-seconds
// transition timing. `LoopchainTransitionRequest` is the ONLY part of this
// that's ever persisted (on LoopchainJunction below) — pure author intent,
// same as every other field on LoopchainDraft. The resolved decision
// (radioLoopchainTransitionResolver.ts's `LoopchainResolvedTransitionDecision`)
// is deliberately NOT declared as a persisted field anywhere — it is always
// derived fresh from the request plus each side's live beat-grid trust,
// playback bounds, and resolved section bounds, so it can never go stale.
export type LoopchainTransitionRequest =
  | { kind: "auto" }
  | { kind: "bars"; bars: 1 | 2 | 4 | 8 }
  | { kind: "seconds"; seconds: 2 | 4 | 8 | 12 };

// What was ACTUALLY achieved, never what was requested. An untrusted grid
// can never resolve to "bar_aligned" — see radioLoopchainTransitionResolver.ts.
export type LoopchainTransitionAlignment = "bar_aligned" | "time_aligned" | "manual_override";

// §2.2 — the simplified taste control. Never applicable to an intro/outro
// block, which has no editable repeat state at all (see
// radioLoopchainEditor.ts's structuralType-aware guards).
export type LoopchainRepeatPreference = "low" | "medium" | "high";

// DERIVED playback state, built by radioLoopchainTransitionResolver.ts's
// resolveTransitionTiming(). Declared here (alongside the request type it
// resolves) purely as a shared shape for the resolver's return value,
// player session state, and a point-in-time snapshot inside
// LoopchainListenerFeedback — it is NEVER itself a field on LoopchainDraft/
// LoopchainJunction/anything persisted as canonical chain state. Recompute
// via useMemo on every render keyed off the request plus both tracks' live
// beatMap/playbackBounds/resolved section bounds, so it can never go stale.
export interface LoopchainResolvedTransitionDecision {
  junctionId: string;
  request: LoopchainTransitionRequest;
  alignment: LoopchainTransitionAlignment;
  computedDurationSeconds: number;
  // Only ever non-zero when the grid is actually trusted — never a
  // consolation score for an untrusted seconds fallback.
  confidence: number;
  reason: string;
  resolvedAt: string;
}

// §4 — region-bound acceptance identity. Never keyed by sectionId alone:
// if the section's current resolved bounds/revision no longer match this
// exact record, the acceptance no longer applies (though the record
// itself is never deleted — see resolveSectionPlayability).
export interface RadioLoopchainSectionAcceptance {
  id: string;
  sourceTrackId: string;
  sectionId: string;
  startFrame: number;
  endFrame: number;
  revisionId?: string;
  acceptedAt: string;
}

export type LoopchainSectionPlayability = "forward_only" | "review" | "loopable";

export type LoopchainObservationKind =
  | "chain_played"
  | "early_stop"
  | "occurrence_skip"
  | "junction_audition"
  | "endurance_completed"
  | "chain_accepted"
  | "chain_abandoned";

// A lightweight, project-local measurement log entry — stored for the
// operator's own reference, never dashboarded or surfaced as a system
// verdict (doctrine §6).
export interface LoopchainObservation {
  id: string;
  kind: LoopchainObservationKind;
  chainId: string;
  blockId?: string;
  junctionId?: string;
  plannedResidenceSeconds?: number;
  actualResidenceSeconds?: number;
  occurrenceCount?: number;
  note?: string;
  recordedAt: string;
}
