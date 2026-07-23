// DJ Transition Engine (0722D) — active-mode authority gate. Pure,
// synchronous, no I/O. This is the ONE place that decides whether an
// approved DjTransitionPlan is allowed to actually drive playback right
// now. Every condition is checked explicitly and in order; the first
// failing condition is the reported gate — a migrated, proposed,
// incomplete, rejected, stale, or unsupported plan can never pass.
//
// Deliberately synchronous: by the time this runs (on the live playback
// tick, see usePreparedPlaybackController.ts), there is no time budget for
// a fresh async stem-lookup round-trip. The plan's own evidence/trust was
// already validated when it was resolved and approved (see
// djTransitionShadowResolve.ts / the "Approve for Active Execution"
// action) — this gate re-checks only what can change cheaply and
// synchronously since then: track identity, source fingerprints, analysis
// revision, region availability, and family support.

import type { DjTransitionPlan, TransitionFamily } from "../data/djTransitionTypes";
import type { DeckPlaybackState } from "../audio/dualDeckTypes";
import { isDjTransitionPlanStale } from "./djTransitionStaleness";
import type { TransitionRegionCandidate } from "./djTransitionRegions";

// §5 — initial executable scope. Only a family the engine can ACTUALLY run
// today belongs here; adding a family to this set without a real compiled
// execution path in djTransitionPlayback.ts would be exactly the "partial
// fake wiring" this build must not do.
export const SUPPORTED_ACTIVE_TRANSITION_FAMILIES: ReadonlySet<TransitionFamily> = new Set(["clean_cut"]);

// Deck-specific readiness predicates — deliberately NOT a single shared
// gate. The outgoing and incoming decks have genuinely different
// definitions of "ready" for a hard-cut-shaped transition, and collapsing
// them into one predicate is exactly the mistake this build already made
// once (see task #43's live-verification history): broadening the shared
// check to tolerate the outgoing deck's legitimate "ended" state silently
// also tolerated an "ended" INCOMING deck, which is never valid — handing
// control to a deck that has already finished playing is not a real
// transition, it's silence.

// Clean Cut's trigger condition (the scheduled cue crossing, or the media
// `ended` event) means the outgoing deck reaching its natural end is the
// expected, common case, not a failure.
export function isOutgoingDeckReadyForCleanCut(state: DeckPlaybackState): boolean {
  return state === "ready" || state === "playing" || state === "ended";
}

// The incoming deck must be able to actually BEGIN audible playback at the
// compiled incoming region right now. "ended" (already finished playing
// something else earlier), "error" (failed/missing source), "empty"
// (never loaded), and "loading" (not yet ready) all correctly fail this —
// there is no state other than "ready" or "playing" from which a deck can
// receive control.
export function isIncomingDeckReadyToStart(state: DeckPlaybackState): boolean {
  return state === "ready" || state === "playing";
}

export type DjTransitionAuthorityGateName =
  | "mode_not_active"
  | "no_plan_for_pair"
  | "not_approved"
  | "stale"
  | "unsupported_family"
  | "regions_invalid"
  | "outgoing_deck_not_ready"
  | "incoming_deck_not_ready"
  | "authorized";

export interface DjTransitionAuthorityContext {
  djTransitionMode: "off" | "shadow" | "active";
  plan: DjTransitionPlan | undefined;
  currentOutgoingTrackId: string | null;
  currentIncomingTrackId: string | null;
  currentOutgoingSourceFingerprint: string;
  currentIncomingSourceFingerprint: string;
  currentAnalysisRevisionKey: string;
  // Freshly (synchronously) recomputed regions for both sides — used only
  // to confirm the plan's own selected region ids still exist, never to
  // re-resolve a whole new plan.
  outgoingRegionsNow: TransitionRegionCandidate[];
  incomingRegionsNow: TransitionRegionCandidate[];
  activeStemSetLostCurrency: boolean;
  outgoingDeckState: DeckPlaybackState;
  incomingDeckState: DeckPlaybackState;
}

export interface DjTransitionAuthorityResult {
  authorized: boolean;
  gate: DjTransitionAuthorityGateName;
  reason: string;
}

function regionStillExists(regionId: string | null, regions: TransitionRegionCandidate[]): boolean {
  if (regionId == null) return true; // a plan with no region reference (e.g. pure-seconds free-time) has nothing to invalidate here
  return regions.some((r) => r.regionId === regionId);
}

export function evaluateDjTransitionAuthority(ctx: DjTransitionAuthorityContext): DjTransitionAuthorityResult {
  if (ctx.djTransitionMode !== "active") {
    return { authorized: false, gate: "mode_not_active", reason: `djTransitionMode is "${ctx.djTransitionMode}", not "active".` };
  }

  const { plan } = ctx;
  if (!plan) {
    return { authorized: false, gate: "no_plan_for_pair", reason: "No DjTransitionPlan exists for this exact slot adjacency." };
  }

  // Doctrine §14.1: only APPROVED evidence state may drive saved/unattended
  // playback. Proposed, rehearsed, revised, and rejected plans never pass
  // this gate regardless of how they were produced (automatic resolution
  // or migration) — manual approval is the one thing that grants authority.
  if (plan.evidenceState !== "approved") {
    return { authorized: false, gate: "not_approved", reason: `Plan evidenceState is "${plan.evidenceState}", not "approved".` };
  }

  const selectedRegionsStillExist =
    regionStillExists(plan.outgoingCue.regionId, ctx.outgoingRegionsNow) && regionStillExists(plan.incomingCue.regionId, ctx.incomingRegionsNow);

  const stale = isDjTransitionPlanStale({
    plan,
    currentOutgoingTrackId: ctx.currentOutgoingTrackId,
    currentIncomingTrackId: ctx.currentIncomingTrackId,
    currentOutgoingSourceFingerprint: ctx.currentOutgoingSourceFingerprint,
    currentIncomingSourceFingerprint: ctx.currentIncomingSourceFingerprint,
    currentAnalysisRevisionKey: ctx.currentAnalysisRevisionKey,
    selectedRegionsStillExist,
    activeStemSetLostCurrency: ctx.activeStemSetLostCurrency,
  });
  if (stale) {
    return { authorized: false, gate: "stale", reason: "Plan is stale relative to current track/source/analysis/region state." };
  }

  if (!selectedRegionsStillExist) {
    return { authorized: false, gate: "regions_invalid", reason: "One or both of the plan's selected regions no longer exist for the current source audio." };
  }

  if (!SUPPORTED_ACTIVE_TRANSITION_FAMILIES.has(plan.family)) {
    return { authorized: false, gate: "unsupported_family", reason: `Family "${plan.family}" has no implemented active-mode execution path yet.` };
  }

  // Checked with two distinct predicates, not one shared gate — see the
  // header comment on isOutgoingDeckReadyForCleanCut/isIncomingDeckReadyToStart.
  if (!isOutgoingDeckReadyForCleanCut(ctx.outgoingDeckState)) {
    return { authorized: false, gate: "outgoing_deck_not_ready", reason: `Outgoing deck state is "${ctx.outgoingDeckState}" — not ready, playing, or naturally ended.` };
  }
  if (!isIncomingDeckReadyToStart(ctx.incomingDeckState)) {
    return {
      authorized: false,
      gate: "incoming_deck_not_ready",
      reason: `Incoming deck state is "${ctx.incomingDeckState}" — cannot begin playback at the compiled incoming region (must be "ready" or "playing").`,
    };
  }

  return { authorized: true, gate: "authorized", reason: "All authority conditions passed." };
}
