// DJ Transition Engine (0722D) §5.2 — staleness rules. Modeled directly on
// the existing playlistTransition/transitionStaleness.ts precedent. A plan
// goes stale on identity/structure changes only — never on metadata-only
// edits (title/artist/artwork/tags), per the spec's explicit instruction.

import type { DjTransitionPlan } from "../data/djTransitionTypes";

export interface DjTransitionStalenessInput {
  plan: DjTransitionPlan;
  currentOutgoingTrackId: string | null;
  currentIncomingTrackId: string | null;
  currentOutgoingSourceFingerprint: string;
  currentIncomingSourceFingerprint: string;
  currentAnalysisRevisionKey: string;
  // True when the plan's selected candidate region (outgoingCue.regionId /
  // incomingCue.regionId) no longer appears among the freshly re-selected
  // candidates for this pair — caller resolves this by re-running
  // djTransitionRegions.ts and checking, since region selection needs
  // evidence this module deliberately doesn't depend on.
  selectedRegionsStillExist: boolean;
  // True when family === "stem_assisted_transition" and activeStemSetId is
  // no longer the CURRENT lifecycle set for the parent — caller resolves
  // via the same /stem-sets check the evidence layer uses. Always false
  // for non-stem-assisted families.
  activeStemSetLostCurrency: boolean;
}

export function isDjTransitionPlanStale(input: DjTransitionStalenessInput): boolean {
  const { plan, currentOutgoingTrackId, currentIncomingTrackId, currentOutgoingSourceFingerprint, currentIncomingSourceFingerprint, currentAnalysisRevisionKey, selectedRegionsStillExist, activeStemSetLostCurrency } = input;

  // Either slot points to a different track.
  if (currentOutgoingTrackId !== plan.outgoingTrackId) return true;
  if (currentIncomingTrackId !== plan.incomingTrackId) return true;

  // Either decoded source identity changes. An empty stored/current
  // fingerprint means "identity unknown" and fails closed (treated as
  // changed) rather than silently assumed unchanged.
  if (!plan.outgoingSourceFingerprint || !currentOutgoingSourceFingerprint || plan.outgoingSourceFingerprint !== currentOutgoingSourceFingerprint) return true;
  if (!plan.incomingSourceFingerprint || !currentIncomingSourceFingerprint || plan.incomingSourceFingerprint !== currentIncomingSourceFingerprint) return true;

  // The relevant beat/downbeat/phrase grid revision changed (folded into
  // the single analysisRevisionKey, same pattern as
  // PlaylistPlaybackPreparation.sourceTrackRevisionMap).
  if (!plan.analysisRevisionKey || plan.analysisRevisionKey !== currentAnalysisRevisionKey) return true;

  // The selected candidate region disappeared or changed materially.
  if (!selectedRegionsStillExist) return true;

  // An active stem-assisted plan lost its exact current stem set.
  if (plan.family === "stem_assisted_transition" && activeStemSetLostCurrency) return true;

  return false;
}
