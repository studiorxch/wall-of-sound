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
