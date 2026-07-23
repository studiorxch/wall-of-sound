// 0722A_RADIOOS_Loopchain_Player_Web_Demo §3 — listener-facing feedback
// (Save / Less like this / Comment), replacing star ratings inside the
// Loopchain Player specifically. Deliberately a SEPARATE top-level type
// from LoopchainObservation (radioLoopchainTypes.ts): that type's own
// doctrine is "never dashboarded, never a system verdict" — operator-only
// telemetry — which is the wrong semantics for feedback that's meant to be
// visible and eventually account-linked. Also unrelated to Track.rating/
// TrackRating (the private internal "Editorial Rating" star system,
// untouched by this build) and to Track.notes (the private curator Comments
// field used by the MUSIC Library grid) — this is a third, distinct
// concept: public-facing listener reaction, not internal metadata.

export type LoopchainFeedbackKind = "save" | "less_like_this" | "comment";

// "less_like_this" requires a real target (§3); "save"/"comment" default to
// {scope:"overall_chain"} unless the listener was focused on a specific
// occurrence/junction when giving feedback.
export type LoopchainFeedbackTarget =
  | { scope: "section"; blockId: string }
  | { scope: "repetition"; blockId: string; occurrenceIndexInBlock: number }
  | { scope: "transition"; junctionId: string }
  | { scope: "overall_chain" };

export interface LoopchainListenerFeedback {
  id: string;
  kind: LoopchainFeedbackKind;
  target: LoopchainFeedbackTarget;
  chainId: string;
  // draft.updatedAt at the moment feedback was given — reuses the field
  // that already changes on every edit rather than inventing a second
  // versioning scheme.
  chainVersion: string;
  playbackTimeSeconds?: number;
  // Point-in-time snapshot of what was resolved for the targeted junction,
  // if any — a historical record of what the feedback was ABOUT, never a
  // cache that needs to stay fresh.
  resolvedTransitionSettings?: import("./radioLoopchainTypes").LoopchainResolvedTransitionDecision;
  commentText?: string;
  // Forward-compatible with a future member-account build: identity is
  // optional and anonymous-safe today (no account system exists per this
  // build's environmental assumptions); a later build fills memberId
  // without a schema migration.
  memberId?: string;
  sessionId: string;
  recordedAt: string;
}
