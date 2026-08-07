// RADIO / DJ Mode Dock (0724B_RADIO numbering; MUSIC build 0724C) —
// resolves whether a real, approved DjTransitionPlan for a track adjacency
// may be baked into the public web bundle as a RadioWebTransitionHint.
//
// This reuses the existing active-mode authority gate
// (djTransitionAuthorityGate.ts's evaluateDjTransitionAuthority) rather than
// re-implementing any of its checks — the exact same rule that governs
// whether a plan may drive live in-app playback governs whether it may be
// baked into a public export. Deck-readiness (outgoing/incoming deck state)
// is a live dual-deck-session concept with no meaning at publish time; two
// neutral, always-passing deck states are supplied here because the real
// equivalent check for a static sequential web player is re-verified later,
// at actual playback time, by the listener's own track-start readiness
// check (radioPlayback.ts's confirmPlaybackReadiness) — never skipped, just
// performed by a different, already-correct layer.

import { evaluateDjTransitionAuthority } from "../djTransitionAuthorityGate";
import type { DjTransitionPlan } from "../../data/djTransitionTypes";
import type { TransitionRegionCandidate } from "../djTransitionRegions";
import type { RadioWebTransitionHint } from "../../data/radioWebBundleTypes";
import {
  validateTransitionPreparationLineage,
  type TransitionPreparationLineageContext,
} from "../djTransitionPreparationLineage";

export interface TransitionHintResolutionContext {
  djTransitionMode: "off" | "shadow" | "active";
  plan: DjTransitionPlan | undefined;
  currentOutgoingTrackId: string | null;
  currentIncomingTrackId: string | null;
  currentOutgoingSourceFingerprint: string;
  currentIncomingSourceFingerprint: string;
  currentAnalysisRevisionKey: string;
  // Real, freshly-resolved region candidates for both sides (see
  // djTransitionRegions.ts) — the same inputs evaluateDjTransitionAuthority
  // itself requires. An empty array correctly fails a region-bound plan;
  // pass real candidates when the plan's timeBasis actually references one.
  outgoingRegionsNow: TransitionRegionCandidate[];
  incomingRegionsNow: TransitionRegionCandidate[];
  activeStemSetLostCurrency: boolean;
  preparationLineageContext?: TransitionPreparationLineageContext;
}

export function resolveTransitionHintForAdjacency(context: TransitionHintResolutionContext): RadioWebTransitionHint | null {
  const preparationLineageValidation = context.plan
    ? validateTransitionPreparationLineage(context.plan, context.preparationLineageContext)
    : undefined;
  const result = evaluateDjTransitionAuthority({
    djTransitionMode: context.djTransitionMode,
    plan: context.plan,
    currentOutgoingTrackId: context.currentOutgoingTrackId,
    currentIncomingTrackId: context.currentIncomingTrackId,
    currentOutgoingSourceFingerprint: context.currentOutgoingSourceFingerprint,
    currentIncomingSourceFingerprint: context.currentIncomingSourceFingerprint,
    currentAnalysisRevisionKey: context.currentAnalysisRevisionKey,
    outgoingRegionsNow: context.outgoingRegionsNow,
    incomingRegionsNow: context.incomingRegionsNow,
    activeStemSetLostCurrency: context.activeStemSetLostCurrency,
    preparationLineageValidation,
    // Publish-time has no live decks. These two states are the neutral,
    // always-passing values for isOutgoingDeckReadyForCleanCut /
    // isIncomingDeckReadyToStart — real playback readiness is re-verified
    // later, at actual track-start time, by the Sites listener itself
    // (radioPlayback.ts's confirmPlaybackReadiness), never skipped.
    outgoingDeckState: "ended",
    incomingDeckState: "ready",
  });

  if (!result.authorized) return null;
  // evaluateDjTransitionAuthority's own unsupported_family gate already
  // restricts this to SUPPORTED_ACTIVE_TRANSITION_FAMILIES (today: only
  // "clean_cut") — reaching here with result.authorized true means the plan
  // really is clean_cut. This still asserts it explicitly rather than
  // trusting the gate's family silently, so a future family added to that
  // set could never produce a public hint without an matching, deliberate
  // update here.
  if (context.plan?.family !== "clean_cut") return null;

  return { family: "clean_cut", strategy: "clean_cut_hard_cut" };
}
